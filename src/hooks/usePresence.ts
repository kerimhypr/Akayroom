import { useEffect, useState, useRef } from "react";
import { ref, onValue } from "firebase/database";
import { db } from "@/lib/firebase";

export interface TypingUser {
  uid: string;
  username: string;
  timestamp: number;
}

export function useTypingIndicators(serverId: string | null, channelId: string | null) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const cleanupRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!serverId || !channelId) {
      setTypingUsers([]);
      return;
    }

    const typingRef = ref(db, `typing/${serverId}/${channelId}`);

    const unsubscribe = onValue(typingRef, (snap) => {
      const data = snap.val() as Record<string, any> | null;
      if (!data) {
        setTypingUsers([]);
        return;
      }

      const now = Date.now();
      const typing = Object.entries(data)
        .map(([uid, user]) => ({
          uid,
          username: user.username || "Unknown",
          timestamp: user.timestamp || 0,
        }))
        .filter((u) => now - u.timestamp < 5000); // Expire after 5s

      setTypingUsers(typing);
    });

    return () => unsubscribe();
  }, [serverId, channelId]);

  return { typingUsers };
}

export function useOnlineUsers(serverId: string | null) {
  const [onlineUsers, setOnlineUsers] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!serverId) {
      setOnlineUsers(new Map());
      return;
    }

    const membersRef = ref(db, `serverMembers/${serverId}`);

    const unsubscribe = onValue(membersRef, async (snap) => {
      const members = snap.val() as Record<string, any> | null;
      if (!members) {
        setOnlineUsers(new Map());
        return;
      }

      const online = new Map<string, string>();
      const { get } = await import("firebase/database");

      for (const uid of Object.keys(members)) {
        try {
          const presenceSnap = await get(ref(db, `users/${uid}/presence/status`));
          const status = presenceSnap.val() as string | null;
          if (status && status !== "offline") {
            online.set(uid, status);
          }
        } catch (err) {
          // Silently fail
        }
      }

      setOnlineUsers(online);
    });

    return () => unsubscribe();
  }, [serverId]);

  return { onlineUsers };
}
