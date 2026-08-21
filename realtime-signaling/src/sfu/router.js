"use strict";

const { logger } = require("../utils/logger");

/**
 * SFU Router abstraction
 * ----------------------
 * This is a selective-forwarding (SFU) coordination layer.
 *
 * Two modes:
 *  1. "signaling" (default) – pure signaling router. No media relay, but
 *     maintains full SFU state (producers/consumers mapping, subscriptions)
 *     so that client mesh or future mediasoup can consume the same events.
 *     For small rooms (2-8 peers), clients can do mesh using the routed
 *     offers/answers. For larger rooms, this state is already correct for
 *     swapping in a media server.
 *
 *  2. "mediasoup" – delegates to mediasoup Worker/Router/Transport/Producer/Consumer.
 *     To enable, set SFU_MODE=mediasoup and ensure `mediasoup` is installed.
 *     The public API of this class stays identical; only the internals swap.
 *
 * Design decisions (why not custom SFU from scratch vs battle-tested):
 *  - Custom SFU media relay in Node without native worker would be TURN-like
 *    and unstable; we avoid reimplementing SRTP/ICE/DTLS.
 *  - mediasoup is the proven choice for Node SFU (C++ worker, simulcast, SVC).
 *  - LiveKit/Janus would require a separate Go/C deployment – overkill for
 *    this milestone. Our abstraction lets us add LiveKit later behind same API.
 */

class SFURouter {
  constructor(roomId) {
    this.roomId = roomId;
    this.mode = require("../config").sfu.mode; // signaling | mediasoup
    this.createdAt = Date.now();

    // Signaling-mode state:
    // producers: Map<trackId, { trackId, peerId, kind, consumers: Set<peerId> }>
    this.producers = new Map();
    // peerSubscriptions: Map<subscriberPeerId, Set<trackId>>
    this.peerSubscriptions = new Map();
    // peerProducers: Map<peerId, Set<trackId>>
    this.peerProducers = new Map();

    // mediasoup-mode handles (lazy init)
    this._mediasoup = null; // { worker, router, transports: Map }

    logger.info("sfu router created", { roomId, mode: this.mode });
  }

  // ── Producer lifecycle ──

  addProducer(peerId, track) {
    const entry = {
      trackId: track.trackId,
      peerId,
      kind: track.kind,
      track,
      consumers: new Set(),
      createdAt: Date.now(),
    };
    this.producers.set(track.trackId, entry);
    if (!this.peerProducers.has(peerId)) this.peerProducers.set(peerId, new Set());
    this.peerProducers.get(peerId).add(track.trackId);
    logger.debug("sfu producer added", { roomId: this.roomId, trackId: track.trackId, peerId, kind: track.kind });

    // In mediasoup mode, would create Producer via transport.produce()
    if (this.mode === "mediasoup") {
      // Placeholder – real impl would await transport.produce()
      logger.warn("mediasoup produce not yet wired – using signaling fallback", { roomId: this.roomId });
    }
    return entry;
  }

  removeProducer(trackId) {
    const entry = this.producers.get(trackId);
    if (!entry) return null;
    // Remove from peerProducers
    const set = this.peerProducers.get(entry.peerId);
    if (set) {
      set.delete(trackId);
      if (set.size === 0) this.peerProducers.delete(entry.peerId);
    }
    // Remove from all subscriber sets
    for (const [subPeerId, subSet] of this.peerSubscriptions.entries()) {
      if (subSet.has(trackId)) {
        subSet.delete(trackId);
        entry.consumers.delete(subPeerId);
      }
    }
    this.producers.delete(trackId);
    logger.debug("sfu producer removed", { roomId: this.roomId, trackId });
    return entry;
  }

  // ── Subscription (consumer) lifecycle ──

  subscribe(subscriberPeerId, trackId) {
    const producer = this.producers.get(trackId);
    if (!producer) return null;
    producer.consumers.add(subscriberPeerId);
    if (!this.peerSubscriptions.has(subscriberPeerId)) this.peerSubscriptions.set(subscriberPeerId, new Set());
    this.peerSubscriptions.get(subscriberPeerId).add(trackId);
    logger.debug("sfu subscribed", { roomId: this.roomId, subscriberPeerId, trackId });
    return producer;
  }

  unsubscribe(subscriberPeerId, trackId) {
    const producer = this.producers.get(trackId);
    if (producer) producer.consumers.delete(subscriberPeerId);
    const set = this.peerSubscriptions.get(subscriberPeerId);
    if (set) {
      set.delete(trackId);
      if (set.size === 0) this.peerSubscriptions.delete(subscriberPeerId);
    }
  }

  // Called when peer leaves/disconnects – clean all its state
  removePeer(peerId) {
    // Remove as producer
    const produced = this.peerProducers.get(peerId);
    if (produced) {
      for (const tid of [...produced]) this.removeProducer(tid);
    }
    // Remove as consumer
    const subs = this.peerSubscriptions.get(peerId);
    if (subs) {
      for (const tid of [...subs]) {
        const prod = this.producers.get(tid);
        if (prod) prod.consumers.delete(peerId);
      }
      this.peerSubscriptions.delete(peerId);
    }
    logger.debug("sfu peer removed", { roomId: this.roomId, peerId });
  }

  // ── Queries for signaling ──

  getProducer(trackId) {
    return this.producers.get(trackId) || null;
  }

  listProducers() {
    return [...this.producers.values()].map((p) => ({
      trackId: p.trackId,
      peerId: p.peerId,
      kind: p.kind,
      consumerCount: p.consumers.size,
      createdAt: p.createdAt,
    }));
  }

  listConsumersForTrack(trackId) {
    const p = this.producers.get(trackId);
    return p ? [...p.consumers] : [];
  }

  // Snapshot for room:joined – client needs to know all existing producers to subscribe
  getSnapshotForPeer(requestingPeerId) {
    // Return all producers except own, plus subscription state
    return [...this.producers.values()]
      .filter((p) => p.peerId !== requestingPeerId)
      .map((p) => ({
        trackId: p.trackId,
        peerId: p.peerId,
        kind: p.kind,
        muted: p.track?.muted ?? false,
      }));
  }

  stats() {
    return {
      roomId: this.roomId,
      mode: this.mode,
      producers: this.producers.size,
      subscriptions: [...this.peerSubscriptions.values()].reduce((a, s) => a + s.size, 0),
    };
  }

  // ── mediasoup lazy init (future) ──
  async ensureMediasoupRouter() {
    if (this.mode !== "mediasoup") return null;
    if (this._mediasoup) return this._mediasoup;
    try {
      const mediasoup = require("mediasoup");
      const worker = await mediasoup.createWorker({
        rtcMinPort: require("../config").sfu.rtcMinPort,
        rtcMaxPort: require("../config").sfu.rtcMaxPort,
      });
      const router = await worker.createRouter({
        mediaCodecs: [
          { kind: "audio", mimeType: "audio/opus", clockRate: 48000, channels: 2 },
          { kind: "video", mimeType: "video/VP8", clockRate: 90000 },
          { kind: "video", mimeType: "video/VP9", clockRate: 90000 },
          { kind: "video", mimeType: "video/H264", clockRate: 90000 },
        ],
      });
      this._mediasoup = { worker, router, transports: new Map() };
      logger.info("mediasoup router ready", { roomId: this.roomId });
      return this._mediasoup;
    } catch (e) {
      logger.error("mediasoup init failed – falling back to signaling", { roomId: this.roomId, error: e.message });
      this.mode = "signaling";
      return null;
    }
  }
}

module.exports = { SFURouter };
