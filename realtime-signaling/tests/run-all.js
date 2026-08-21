"use strict";

const { connectClient, sendAndWait, waitForEvent, authClient } = require("./helpers");

const WS_URL = process.env.WS_URL || "ws://localhost:3001/ws";

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

async function test(name, fn) {
  process.stdout.write(`\n[TEST] ${name} ... `);
  try {
    await fn();
    console.log("✓ PASS");
    passed++;
  } catch (e) {
    console.log(`✗ FAIL: ${e.message}`);
    console.error(e.stack?.split("\n").slice(0, 4).join("\n"));
    failed++;
  }
}

async function run() {
  console.log(`\n=== Realtime SFU Signaling Integration Tests ===`);
  console.log(`WS_URL=${WS_URL}`);

  // 1. connection:init
  await test("connection:init received", async () => {
    const ws = await connectClient(WS_URL);
    assert(ws.readyState === 1, "ws not open");
    ws.close();
  });

  // 2. auth success (dev token)
  await test("auth:authenticate success (dev token)", async () => {
    const ws = await connectClient(WS_URL);
    const resp = await sendAndWait(ws, "auth:authenticate", { token: "dev:user1" });
    assert(resp.event === "auth:success", `expected auth:success got ${resp.event}`);
    assert(resp.payload.success === true, "auth should succeed");
    assert(resp.payload.data.userId === "user1", "userId mismatch");
    ws.close();
  });

  // 3. auth fail (invalid token)
  await test("auth:authenticate failed (invalid token)", async () => {
    const ws = await connectClient(WS_URL);
    const resp = await sendAndWait(ws, "auth:authenticate", { token: "bad.invalid.token" });
    assert(resp.event === "auth:failed", `expected auth:failed got ${resp.event}`);
    assert(resp.payload.success === false, "should fail");
    ws.close();
  });

  // 4. room join success
  await test("room:join success", async () => {
    const ws = await connectClient(WS_URL);
    await authClient(ws, "dev:alice");
    const resp = await sendAndWait(ws, "room:join", { roomId: "test-room-1" });
    assert(resp.event === "room:joined", `expected room:joined got ${resp.event}`);
    assert(resp.payload.success === true, "join should succeed");
    assert(resp.payload.data.roomId === "test-room-1", "roomId mismatch");
    assert(typeof resp.payload.data.peerId === "string", "peerId missing");
    const leaveResp = await sendAndWait(ws, "room:leave", { roomId: "test-room-1" });
    assert(leaveResp.event === "room:left" || leaveResp.payload.success === true, "leave should succeed");
    ws.close();
  });

  // 5. multiple clients see peer:joined
  await test("multiple clients – peer:joined broadcast", async () => {
    const wsA = await connectClient(WS_URL);
    const wsB = await connectClient(WS_URL);
    await authClient(wsA, "dev:alice");
    await authClient(wsB, "dev:bob");
    const roomId = "multi-test-" + Date.now();
    await sendAndWait(wsA, "room:join", { roomId });
    // B joins, A should get peer:joined
    const peerJoinedPromise = waitForEvent(wsA, "peer:joined", (p) => p.peer && p.peer.userId === "bob");
    await sendAndWait(wsB, "room:join", { roomId });
    const msg = await peerJoinedPromise;
    assert(msg.payload.peer.userId === "bob", "peer userId mismatch");
    // Cleanup
    await sendAndWait(wsA, "room:leave", { roomId });
    await sendAndWait(wsB, "room:leave", { roomId });
    wsA.close(); wsB.close();
  });

  // 6. offer/answer routing
  await test("webrtc offer/answer routing", async () => {
    const wsA = await connectClient(WS_URL);
    const wsB = await connectClient(WS_URL);
    await authClient(wsA, "dev:alice");
    await authClient(wsB, "dev:bob");
    const roomId = "webrtc-test-" + Date.now();
    const rA = await sendAndWait(wsA, "room:join", { roomId });
    const rB = await sendAndWait(wsB, "room:join", { roomId });
    const peerIdB = rB.payload.data.peerId;
    const peerIdA = rA.payload.data.peerId;

    // A offers to B
    const offerPromise = waitForEvent(wsB, "webrtc:offer", (p) => p.fromPeerId === peerIdA);
    await sendAndWait(wsA, "webrtc:offer", { roomId, targetPeerId: peerIdB, sdp: "v=0 fake offer sdp" });
    const offer = await offerPromise;
    assert(offer.payload.sdp.includes("fake offer"), "sdp mismatch");

    // B answers to A
    const answerPromise = waitForEvent(wsA, "webrtc:answer", (p) => p.fromPeerId === peerIdB);
    await sendAndWait(wsB, "webrtc:answer", { roomId, targetPeerId: peerIdA, sdp: "v=0 fake answer sdp" });
    const answer = await answerPromise;
    assert(answer.payload.sdp.includes("fake answer"), "answer sdp mismatch");

    wsA.close(); wsB.close();
  });

  // 7. ICE candidate routing
  await test("webrtc ice-candidate routing", async () => {
    const wsA = await connectClient(WS_URL);
    const wsB = await connectClient(WS_URL);
    await authClient(wsA, "dev:alice");
    await authClient(wsB, "dev:bob");
    const roomId = "ice-test-" + Date.now();
    const rA = await sendAndWait(wsA, "room:join", { roomId });
    const rB = await sendAndWait(wsB, "room:join", { roomId });
    const peerIdB = rB.payload.data.peerId;

    const candPromise = waitForEvent(wsB, "webrtc:ice-candidate", (p) => p.candidate && p.candidate.includes("candidate"));
    await sendAndWait(wsA, "webrtc:ice-candidate", { roomId, targetPeerId: peerIdB, candidate: "candidate:0 1 UDP 123 1.2.3.4 5000 typ host", sdpMid: "0", sdpMLineIndex: 0 });
    const cand = await candPromise;
    assert(cand.payload.candidate.includes("candidate"), "candidate not forwarded");
    wsA.close(); wsB.close();
  });

  // 8. media publish + track-added broadcast + sfu snapshot
  await test("media publish / track-added & subscribe", async () => {
    const wsA = await connectClient(WS_URL);
    const wsB = await connectClient(WS_URL);
    await authClient(wsA, "dev:alice");
    await authClient(wsB, "dev:bob");
    const roomId = "media-test-" + Date.now();
    await sendAndWait(wsA, "room:join", { roomId });
    await sendAndWait(wsB, "room:join", { roomId });

    const trackAddedPromise = waitForEvent(wsB, "media:track-added", (p) => p.track && p.track.kind === "audio");
    const pubResp = await sendAndWait(wsA, "media:publish", { roomId, kind: "audio" });
    assert(pubResp.event === "media:published", "publish ack missing");
    assert(pubResp.payload.success === true, "publish should succeed");
    const trackId = pubResp.payload.data.track.trackId;
    assert(trackId, "trackId missing");

    const added = await trackAddedPromise;
    assert(added.payload.track.trackId === trackId, "trackId mismatch in broadcast");

    // B subscribes
    const subResp = await sendAndWait(wsB, "media:subscribe", { roomId, trackId });
    assert(subResp.event === "media:subscribed", "subscribe ack missing");
    assert(subResp.payload.success === true, "subscribe should succeed");

    // A unpublishes
    const trackRemovedPromise = waitForEvent(wsB, "media:track-removed", (p) => p.trackId === trackId);
    await sendAndWait(wsA, "media:unpublish", { roomId, trackId });
    await trackRemovedPromise;

    wsA.close(); wsB.close();
  });

  // 9. video publish + mute/unmute
  await test("video publish + mute flow", async () => {
    const wsA = await connectClient(WS_URL);
    const wsB = await connectClient(WS_URL);
    await authClient(wsA, "dev:alice");
    await authClient(wsB, "dev:bob");
    const roomId = "video-test-" + Date.now();
    await sendAndWait(wsA, "room:join", { roomId });
    await sendAndWait(wsB, "room:join", { roomId });

    const pubResp = await sendAndWait(wsA, "media:publish", { roomId, kind: "video" });
    const trackId = pubResp.payload.data.track.trackId;

    // mute
    const muteUpdatedPromise = waitForEvent(wsB, "media:track-updated", (p) => p.muted === true);
    const peerStatePromise = waitForEvent(wsB, "peer:state", (p) => p.mediaState && p.mediaState.camEnabled === false);
    await sendAndWait(wsA, "media:mute", { roomId, kind: "video", muted: true });
    await muteUpdatedPromise;
    await peerStatePromise;

    // unmute
    const unmutePromise = waitForEvent(wsB, "media:track-updated", (p) => p.muted === false);
    await sendAndWait(wsA, "media:unmute", { roomId, kind: "video" });
    await unmutePromise;

    wsA.close(); wsB.close();
  });

  // 10. screen share start/stop
  await test("screen share start/stop", async () => {
    const wsA = await connectClient(WS_URL);
    const wsB = await connectClient(WS_URL);
    await authClient(wsA, "dev:alice");
    await authClient(wsB, "dev:bob");
    const roomId = "screen-test-" + Date.now();
    await sendAndWait(wsA, "room:join", { roomId });
    await sendAndWait(wsB, "room:join", { roomId });

    const screenAdded = waitForEvent(wsB, "screen:track-added", (p) => p.track && p.track.kind === "screenshare");
    const pubResp = await sendAndWait(wsA, "screen:start", { roomId });
    const trackId = pubResp.payload.data.track.trackId;
    await screenAdded;

    const screenRemoved = waitForEvent(wsB, "screen:track-removed", (p) => p.trackId === trackId);
    await sendAndWait(wsA, "screen:stop", { roomId, trackId });
    await screenRemoved;

    wsA.close(); wsB.close();
  });

  // 11. mute via media:state bulk
  await test("bulk media:state", async () => {
    const wsA = await connectClient(WS_URL);
    const wsB = await connectClient(WS_URL);
    await authClient(wsA, "dev:alice");
    await authClient(wsB, "dev:bob");
    const roomId = "state-test-" + Date.now();
    await sendAndWait(wsA, "room:join", { roomId });
    await sendAndWait(wsB, "room:join", { roomId });
    const statePromise = waitForEvent(wsB, "peer:state");
    await sendAndWait(wsA, "media:state", { roomId, audio: false, video: true });
    const state = await statePromise;
    assert(state.payload.mediaState.micMuted === true || state.payload.mediaState.audioEnabled === false, "audio state not updated");
    wsA.close(); wsB.close();
  });

  // 12. invalid room join (unauthorized – not authenticated)
  await test("unauthorized room join (no auth)", async () => {
    const ws = await connectClient(WS_URL);
    const resp = await sendAndWait(ws, "room:join", { roomId: "should-fail" });
    // Server sends room:error with AUTH_REQUIRED
    assert(resp.event === "room:error" || resp.event === "connection:error", `expected error got ${resp.event}`);
    assert(resp.payload.success === false, "should be failure");
    ws.close();
  });

  // 13. invalid roomId
  await test("invalid roomId rejected", async () => {
    const ws = await connectClient(WS_URL);
    await authClient(ws, "dev:alice");
    const resp = await sendAndWait(ws, "room:join", { roomId: "bad room id with spaces!" });
    assert(resp.payload.success === false, "should fail");
    assert(resp.payload.error.code === "PAYLOAD_INVALID" || resp.payload.error.code === "ROOM_ID_INVALID", `unexpected code ${resp.payload.error.code}`);
    ws.close();
  });

  // 14. reconnect stale handling (disconnect then rejoin within window should see reconnectable)
  await test("reconnect window – stale + reclaim", async () => {
    const wsA = await connectClient(WS_URL);
    await authClient(wsA, "dev:alice");
    const roomId = "reconnect-" + Date.now();
    const joinResp = await sendAndWait(wsA, "room:join", { roomId });
    const peerId = joinResp.payload.data.peerId;

    // Simulate disconnect by closing ws abruptly
    const wsB = await connectClient(WS_URL);
    await authClient(wsB, "dev:bob");
    await sendAndWait(wsB, "room:join", { roomId });
    const peerLeftPromise = waitForEvent(wsB, "peer:left", (p) => p.peerId === peerId && p.reconnectable === true);
    wsA.close(); // disconnect
    const leftMsg = await peerLeftPromise;
    assert(leftMsg.payload.reconnectable === true, "should be reconnectable");

    // Reconnect as same user within window – should reclaim same peerId
    const wsA2 = await connectClient(WS_URL);
    await authClient(wsA2, "dev:alice");
    const rejoinResp = await sendAndWait(wsA2, "room:join", { roomId });
    assert(rejoinResp.payload.data.peerId === peerId, `expected reclaimed peerId ${peerId} got ${rejoinResp.payload.data.peerId}`);
    assert(rejoinResp.payload.data.isReconnected === true, "should be marked reconnected");

    // Others should see peer:joined with reconnected flag
    // Already tested via stale, but close
    wsB.close(); wsA2.close();
  });

  // 15. rate limiting – burst quickly (should not ban with normal usage but we test that server handles many events)
  await test("rate limit – normal burst not banned", async () => {
    const uniqueUser = "dev:ratelimit_" + Date.now();
    const ws = await connectClient(WS_URL);
    await authClient(ws, uniqueUser);
    // Send 20 pings quickly – should all succeed
    for (let i = 0; i < 20; i++) {
      const resp = await sendAndWait(ws, "ping", {});
      assert(resp.event === "pong", "expected pong");
    }
    ws.close();
  });

  // 16. room:list
  await test("room:list returns rooms", async () => {
    const uniqueUser = "dev:listuser_" + Date.now();
    const ws = await connectClient(WS_URL);
    await authClient(ws, uniqueUser);
    await sendAndWait(ws, "room:join", { roomId: "list-test-room" });
    const resp = await sendAndWait(ws, "room:list", {});
    assert(resp.event === "room:list_response", `expected list_response got ${resp.event}`);
    assert(Array.isArray(resp.payload.data.rooms), "rooms should be array");
    assert(resp.payload.data.rooms.some((r) => r.roomId === "list-test-room"), "room not in list");
    ws.close();
  });

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("fatal test runner error", e);
  process.exit(1);
});
