import { push, ref, serverTimestamp, set } from "firebase/database";
import { db } from "./firebase";

export async function createStarterServer(uid: string) {
  const serverRef = push(ref(db, "servers"));
  const generalRef = push(ref(db, `channels/${serverRef.key}`));
  const loungeRef = push(ref(db, `channels/${serverRef.key}`));
  if (!serverRef.key || !generalRef.key || !loungeRef.key) throw new Error("ID üretilemedi");

  const now = serverTimestamp();
  await set(serverRef, { name: "Poseidon Lounge", ownerId: uid, createdAt: now });
  await set(ref(db, `serverMembers/${serverRef.key}/${uid}`), { role: "owner", joinedAt: now });
  await set(generalRef, { name: "genel", type: "text", position: 0, createdAt: now });
  await set(loungeRef, { name: "sesli-oda", type: "voice", position: 1, createdAt: now });
  return serverRef.key;
}
