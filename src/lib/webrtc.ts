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

export function joinSignalRoom(channelId: string, serverId: string, uid: string) {
  void set(ref(db, `signaling/${channelId}/serverId`), serverId);
  const participant = ref(db, `signaling/${channelId}/participants/${uid}`);
  void set(participant, { joinedAt: Date.now() });
  void onDisconnect(participant).remove();
  return () => void remove(participant);
}

export function listenForParticipants(
  channelId: string,
  callback: (uid: string, added: boolean) => void
) {
  const participantsRef = ref(db, `signaling/${channelId}/participants`);
  const added = onChildAdded(participantsRef, (snap) => {
    callback(snap.key as string, true);
  });
  const removed = onChildRemoved(participantsRef, (snap) => {
    callback(snap.key as string, false);
  });
  // also get existing
  onValue(participantsRef, (snap) => {
    if (!snap.exists()) return;
    // handled by child_added for initial, but we also need to catch existing that were already there
  }, { onlyOnce: true });
  return () => {
    added();
    removed();
  };
}

export function listenForCandidates(channelId: string, fromUid: string, toUid: string, callback: (candidate: RTCIceCandidateInit) => void) {
  return onChildAdded(ref(db, `signaling/${channelId}/candidates/${fromUid}/${toUid}`), (snapshot) => {
    callback(snapshot.val() as RTCIceCandidateInit);
  });
}

export function publishCandidate(channelId: string, fromUid: string, toUid: string, candidate: RTCIceCandidate) {
  const candidateRef = push(ref(db, `signaling/${channelId}/candidates/${fromUid}/${toUid}`));
  return set(candidateRef, candidate.toJSON());
}

export function publishOffer(channelId: string, fromUid: string, toUid: string, offer: RTCSessionDescriptionInit) {
  return set(ref(db, `signaling/${channelId}/offers/${toUid}/${fromUid}`), offer);
}

export function publishAnswer(channelId: string, fromUid: string, toUid: string, answer: RTCSessionDescriptionInit) {
  return set(ref(db, `signaling/${channelId}/answers/${toUid}/${fromUid}`), answer);
}

export function listenForOffers(channelId: string, toUid: string, callback: (fromUid: string, offer: RTCSessionDescriptionInit) => void) {
  return onChildAdded(ref(db, `signaling/${channelId}/offers/${toUid}`), (snap) => {
    const fromUid = snap.key as string;
    const offer = snap.val() as RTCSessionDescriptionInit;
    callback(fromUid, offer);
  });
}

export function listenForAnswers(channelId: string, toUid: string, callback: (fromUid: string, answer: RTCSessionDescriptionInit) => void) {
  return onChildAdded(ref(db, `signaling/${channelId}/answers/${toUid}`), (snap) => {
    const fromUid = snap.key as string;
    const answer = snap.val() as RTCSessionDescriptionInit;
    callback(fromUid, answer);
  });
}

export function deterministicInitiator(localUid: string, remoteUid: string) {
  return localUid < remoteUid;
}

export function cleanupSignalRoom(channelId: string, uid: string) {
  void remove(ref(db, `signaling/${channelId}/participants/${uid}`));
  // Note: offers/answers/candidates cleanup is lazy, they will be overwritten or expire
}
