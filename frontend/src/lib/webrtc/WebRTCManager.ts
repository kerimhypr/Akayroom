/**
 * WebRTCManager — Browser WebRTC abstraction
 * UI katmanından yalıtılmış: MediaStream, RTCPeerConnection, ICE, renegotiation
 * Her peer için ayrı PC, track lifecycle yönetimi.
 */
import type { SignalingClient } from '@/lib/signaling/SignalingClient'

export type WebRTCOptions = {
  iceServers?: RTCIceServer[]
  signaling: SignalingClient
}

type PeerConn = {
  pc: RTCPeerConnection
  stream?: MediaStream
  remoteStream?: MediaStream
}

export class WebRTCManager {
  private signaling: SignalingClient
  private iceServers: RTCIceServer[]
  private peers = new Map<string, PeerConn>()
  private localStream: MediaStream | null = null
  private screenStream: MediaStream | null = null
  private roomId: string | null = null
  private localPeerId: string | null = null

  // callbacks
  onRemoteStream?: (peerId: string, stream: MediaStream) => void
  onRemoteTrackRemoved?: (peerId: string) => void
  onConnectionState?: (peerId: string, state: RTCPeerConnectionState) => void
  onSpeakingChange?: (peerId: string, speaking: boolean) => void

  // audio analysis for speaking state
  private audioContext?: AudioContext
  private analysers = new Map<string, { analyser: AnalyserNode; interval: number }>()

  constructor(opts: WebRTCOptions) {
    this.signaling = opts.signaling
    this.iceServers = opts.iceServers ?? [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]
    this.bindSignaling()
  }

  private bindSignaling() {
    this.signaling.on('webrtc:offer', async ({ fromPeerId, sdp }: any) => {
      await this.handleOffer(fromPeerId, sdp)
    })
    this.signaling.on('webrtc:answer', async ({ fromPeerId, sdp }: any) => {
      await this.handleAnswer(fromPeerId, sdp)
    })
    this.signaling.on('webrtc:ice-candidate', async ({ fromPeerId, candidate, sdpMid, sdpMLineIndex }: any) => {
      await this.handleIceCandidate(fromPeerId, candidate, sdpMid, sdpMLineIndex)
    })
    this.signaling.on('webrtc:renegotiate', async ({ fromPeerId }: any) => {
      // peer requests renegotiation, create new offer
      if (fromPeerId) await this.createOffer(fromPeerId)
    })
    this.signaling.on('peer:left', ({ peerId }: any) => {
      this.removePeer(peerId)
    })
  }

  setRoom(roomId: string, localPeerId: string | null) {
    this.roomId = roomId
    this.localPeerId = localPeerId
  }

  async setLocalStream(stream: MediaStream | null) {
    this.localStream = stream
    // add tracks to all existing PCs
    for (const [peerId, conn] of this.peers.entries()) {
      if (stream) {
        // replace or add tracks
        for (const track of stream.getTracks()) {
          const sender = conn.pc.getSenders().find(s => s.track?.kind === track.kind)
          if (sender) await sender.replaceTrack(track).catch(()=>{})
          else conn.pc.addTrack(track, stream)
        }
        // renegotiate
        await this.createOffer(peerId).catch(()=>{})
      }
    }
  }

  getLocalStream() { return this.localStream }

  async getUserMedia(opts: MediaStreamConstraints): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia(opts)
    // merge with existing local stream if needed
    if (!this.localStream) {
      this.localStream = stream
    } else {
      // add new tracks to localStream
      for (const t of stream.getTracks()) this.localStream.addTrack(t)
    }
    await this.setLocalStream(this.localStream)
    return stream
  }

  async getDisplayMedia(): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
    this.screenStream = stream
    // handle stop sharing via browser UI
    stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      this.stopScreenShare().catch(()=>{})
      // emit event via signaling: screen:stop handled externally but we also notify
    })
    // Add screen track to peers with renegotiation
    for (const [peerId, conn] of this.peers.entries()) {
      for (const track of stream.getTracks()) {
        conn.pc.addTrack(track, stream)
      }
      await this.createOffer(peerId).catch(()=>{})
    }
    return stream
  }

  async stopScreenShare() {
    if (!this.screenStream) return
    for (const track of this.screenStream.getTracks()) track.stop()
    // remove screen senders from PCs
    for (const conn of this.peers.values()) {
      const senders = conn.pc.getSenders().filter(s => s.track && this.screenStream?.getTracks().includes(s.track as MediaStreamTrack))
      for (const s of senders) {
        try { conn.pc.removeTrack(s) } catch {}
      }
    }
    this.screenStream = null
    // renegotiate all
    for (const peerId of this.peers.keys()) await this.createOffer(peerId).catch(()=>{})
  }

  toggleMute(muted: boolean) {
    if (!this.localStream) return
    for (const track of this.localStream.getAudioTracks()) track.enabled = !muted
  }

  toggleCamera(enabled: boolean) {
    if (!this.localStream) return
    for (const track of this.localStream.getVideoTracks()) track.enabled = enabled
  }

  setDeafen(deafen: boolean, remoteAudioElements: Map<string, HTMLAudioElement>) {
    for (const el of remoteAudioElements.values()) el.muted = deafen
  }

  private getOrCreatePeer(peerId: string): PeerConn {
    if (this.peers.has(peerId)) return this.peers.get(peerId)!
    const pc = new RTCPeerConnection({ iceServers: this.iceServers })
    const conn: PeerConn = { pc }
    // handle ICE candidates
    pc.onicecandidate = (e) => {
      if (e.candidate && e.candidate.candidate) {
        this.signaling.sendIceCandidate(this.roomId, e.candidate.candidate, e.candidate.sdpMid, e.candidate.sdpMLineIndex ?? undefined, peerId).catch(()=>{})
      }
    }
    pc.onconnectionstatechange = () => {
      this.onConnectionState?.(peerId, pc.connectionState)
      if (pc.connectionState === 'failed') {
        // trigger ICE restart
        this.signaling.renegotiate(this.roomId, 'ice-failure').catch(()=>{})
        pc.restartIce?.()
      }
    }
    pc.ontrack = (e) => {
      if (!conn.remoteStream) conn.remoteStream = new MediaStream()
      for (const track of e.streams[0]?.getTracks() ?? e.track ? [e.track] : []) {
        conn.remoteStream.addTrack(track)
      }
      // also handle stream
      if (e.streams[0]) {
        conn.remoteStream = e.streams[0]
      }
      this.onRemoteStream?.(peerId, conn.remoteStream!)
      this.setupSpeakingDetection(peerId, conn.remoteStream!)
    }
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        this.signaling.renegotiate(this.roomId, 'ice-failure').catch(()=>{})
      }
    }
    // add local tracks if exists
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) pc.addTrack(track, this.localStream)
    }
    if (this.screenStream) {
      for (const track of this.screenStream.getTracks()) pc.addTrack(track, this.screenStream)
    }
    this.peers.set(peerId, conn)
    return conn
  }

  private setupSpeakingDetection(peerId: string, stream: MediaStream) {
    const audioTracks = stream.getAudioTracks()
    if (audioTracks.length === 0) return
    try {
      if (!this.audioContext) this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const ctx = this.audioContext
      const source = ctx.createMediaStreamSource(new MediaStream([audioTracks[0]]))
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      source.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      let speaking = false
      const interval = window.setInterval(() => {
        analyser.getByteFrequencyData(data)
        const avg = data.reduce((a,b)=>a+b,0)/data.length
        const isSpeaking = avg > 15
        if (isSpeaking !== speaking) {
          speaking = isSpeaking
          this.onSpeakingChange?.(peerId, speaking)
        }
      }, 200)
      this.analysers.set(peerId, { analyser, interval })
    } catch {}
  }

  async createOffer(peerId: string) {
    const conn = this.getOrCreatePeer(peerId)
    const offer = await conn.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
    await conn.pc.setLocalDescription(offer)
    await this.signaling.sendOffer(this.roomId, offer.sdp!, peerId)
  }

  async handleOffer(peerId: string, sdp: string) {
    const conn = this.getOrCreatePeer(peerId)
    await conn.pc.setRemoteDescription({ type: 'offer', sdp })
    const answer = await conn.pc.createAnswer()
    await conn.pc.setLocalDescription(answer)
    await this.signaling.sendAnswer(this.roomId, answer.sdp!, peerId)
  }

  async handleAnswer(peerId: string, sdp: string) {
    const conn = this.peers.get(peerId)
    if (!conn) return
    await conn.pc.setRemoteDescription({ type: 'answer', sdp }).catch(()=>{})
  }

  async handleIceCandidate(peerId: string, candidate: string, sdpMid: string | null, sdpMLineIndex: number | null) {
    const conn = this.peers.get(peerId)
    if (!conn) return
    try {
      await conn.pc.addIceCandidate({ candidate, sdpMid, sdpMLineIndex })
    } catch {}
  }

  async connectToPeers(peerIds: string[]) {
    for (const pid of peerIds) await this.createOffer(pid).catch(()=>{})
  }

  removePeer(peerId: string) {
    const conn = this.peers.get(peerId)
    if (conn) {
      conn.pc.close()
      this.peers.delete(peerId)
      const a = this.analysers.get(peerId)
      if (a) { clearInterval(a.interval); this.analysers.delete(peerId) }
      this.onRemoteTrackRemoved?.(peerId)
    }
  }

  cleanup() {
    for (const peerId of [...this.peers.keys()]) this.removePeer(peerId)
    if (this.localStream) {
      for (const t of this.localStream.getTracks()) t.stop()
      this.localStream = null
    }
    if (this.screenStream) {
      for (const t of this.screenStream.getTracks()) t.stop()
      this.screenStream = null
    }
    if (this.audioContext) {
      try { this.audioContext.close() } catch {}
      this.audioContext = undefined
    }
    this.roomId = null
    this.localPeerId = null
  }

  getPeerIds() { return [...this.peers.keys()] }
  getPeerConnection(peerId: string) { return this.peers.get(peerId)?.pc ?? null }
}
