import { get, push, ref, serverTimestamp, set } from "firebase/database";
import { db } from "./firebase";

export async function createStarterServer(uid: string) {
  // Registration can be submitted more than once while the first request is settling.
  // Dedup via the user's own servers index: servers/.read requires this per-user
  // index, so a global orderByChild("ownerId") query would come back empty/denied.
  const idx = await get(ref(db, `users/${uid}/servers`));
  if (idx.exists()) {
    const first = Object.keys(idx.val() as Record<string, boolean>)[0];
    if (first) return first;
  }

  const serverRef = push(ref(db, "servers"));
  const generalRef = push(ref(db, `channels/${serverRef.key}`));
  const loungeRef = push(ref(db, `channels/${serverRef.key}`));
  if (!serverRef.key || !generalRef.key || !loungeRef.key) throw new Error("ID üretilemedi");

  const now = serverTimestamp();
  await set(serverRef, { name: "Akayroom Lounge", ownerId: uid, createdAt: now });
  await set(ref(db, `serverMembers/${serverRef.key}/${uid}`), { role: "owner", joinedAt: now });
  // servers/.read bu index'e bakıyor — yazılmazsa sunucu kullanıcıya görünmez.
  await set(ref(db, `users/${uid}/servers/${serverRef.key}`), true);
  await set(generalRef, { name: "genel", type: "text", position: 0, createdAt: now });
  await set(loungeRef, { name: "sesli-oda", type: "voice", position: 1, createdAt: now });
  return serverRef.key;
}
