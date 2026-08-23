import {
  onChildAdded,
  onChildRemoved,
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  set,
} from "firebase/database";
import { db } from "./firebase";

export const rtcIceServers: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// "room" is the signal root path, e.g. `signaling/${channelId}` or `dmSignaling/${dmThreadId}`.
// A serverId is only recorded for server voice channels; null for DM calls.

export function joinSignalRoom(room: string, serverId: string | null, uid: string) {
  if (serverId) void set(ref(db, `${room}/serverId`), serverId);
  const participant = ref(db, `${room}/participants/${uid}`);
  void set(participant, { joinedAt: Date.now() });
  void onDisconnect(participant).remove();
  return () => void remove(participant);
}

export function listenForParticipants(
  room: string,
  callback: (uid: string, added: boolean) => void
) {
  const participantsRef = ref(db, `${room}/participants`);
  const added = onChildAdded(participantsRef, (snap) => {
    callback(snap.key as string, true);
  });
  const removed = onChildRemoved(participantsRef, (snap) => {
    callback(snap.key as string, false);
  });
  return () => {
    added();
    removed();
  };
}

export function listenForCandidates(room: string, fromUid: string, toUid: string, callback: (candidate: RTCIceCandidateInit) => void) {
  return onChildAdded(ref(db, `${room}/candidates/${fromUid}/${toUid}`), (snapshot) => {
    callback(snapshot.val() as RTCIceCandidateInit);
  });
}

export function publishCandidate(room: string, fromUid: string, toUid: string, candidate: RTCIceCandidate) {
  const candidateRef = push(ref(db, `${room}/candidates/${fromUid}/${toUid}`));
  // ts: eski oturumlardan kalan candidate'ların dinleyicide yok sayılması için
  return set(candidateRef, { ...candidate.toJSON(), ts: Date.now() });
}

export function publishOffer(room: string, fromUid: string, toUid: string, offer: RTCSessionDescriptionInit & { ts?: number }) {
  return set(ref(db, `${room}/offers/${toUid}/${fromUid}`), offer);
}

export function publishAnswer(room: string, fromUid: string, toUid: string, answer: RTCSessionDescriptionInit & { ts?: number }) {
  return set(ref(db, `${room}/answers/${toUid}/${fromUid}`), answer);
}

export function listenForOffers(room: string, toUid: string, callback: (fromUid: string, offer: RTCSessionDescriptionInit) => void) {
  return onChildAdded(ref(db, `${room}/offers/${toUid}`), (snap) => {
    const fromUid = snap.key as string;
    const offer = snap.val() as RTCSessionDescriptionInit;
    callback(fromUid, offer);
  });
}

export function listenForAnswers(room: string, toUid: string, callback: (fromUid: string, answer: RTCSessionDescriptionInit) => void) {
  return onChildAdded(ref(db, `${room}/answers/${toUid}`), (snap) => {
    const fromUid = snap.key as string;
    const answer = snap.val() as RTCSessionDescriptionInit;
    callback(fromUid, answer);
  });
}

export function deterministicInitiator(localUid: string, remoteUid: string) {
  return localUid < remoteUid;
}

export function cleanupSignalRoom(room: string, uid: string) {
  void remove(ref(db, `${room}/participants/${uid}`));
}

// ---- DM Call invitation flow ----
export function ringDmCall(threadId: string, payload: Record<string, unknown>) {
  return set(ref(db, `dmCalls/${threadId}`), { ...payload, startedAt: Date.now() });
}

export function acceptDmCall(threadId: string, acceptedBy: string) {
  return set(ref(db, `dmCalls/${threadId}/acceptedBy`), acceptedBy);
}

export function endDmCall(threadId: string, endedBy: string) {
  return set(ref(db, `dmCalls/${threadId}`), { endedBy, endedAt: Date.now() });
}

export function listenDmCall(threadId: string, callback: (snapshot: Record<string, unknown> | null) => void) {
  return onValue(ref(db, `dmCalls/${threadId}`), (snap) => {
    callback(snap.exists() ? snap.val() : null);
  });
}
