"use client";

import { useEffect, useState } from "react";
import { signOut, type User } from "firebase/auth";
import { onValue, push, ref, serverTimestamp, set } from "firebase/database";
import { auth, db } from "@/lib/firebase";
import type { Channel, ChatMessage, Server } from "@/lib/types";

const fallback: Channel[] = [
  { id: "general", name: "general", type: "text", position: 0, topic: "Genel sohbet" },
  { id: "lobby", name: "lobby", type: "text", position: 1, topic: "Takılma alanı" },
  { id: "voice", name: "voice", type: "voice", position: 2 },
];

const initials = (s: string) => s.trim().split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase() || "U";
const time = (n: number) => new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(n || Date.now());

export default function Workspace({ user }: { user: User }) {
  const [servers, setServers] = useState<Server[]>([]), [serverId, setServerId] = useState("");
  const [channels, setChannels] = useState<Channel[]>(fallback), [channelId, setChannelId] = useState("general");
  const [messages, setMessages] = useState<ChatMessage[]>([]), [draft, setDraft] = useState("");
  const [navOpen, setNavOpen] = useState(false), [members, setMembers] = useState(false), [error, setError] = useState("");
  const name = user.displayName || user.email?.split("@")[0] || "User";

  useEffect(() => onValue(ref(db, `users/${user.uid}/servers`), snap => {
    const ids = Object.keys(snap.val() || {});
    if (!ids.length) { setServers([]); setServerId(""); return; }
    return onValue(ref(db, "servers"), allSnap => {
      const all = allSnap.val() || {};
      const next = ids.map(id => all[id] ? { ...all[id], id } : null).filter(Boolean) as Server[];
      setServers(next); setServerId(x => next.some(s => s.id === x) ? x : next[0]?.id || "");
    });
  }), [user.uid]);

  useEffect(() => {
    if (!serverId) { setChannels(fallback); setChannelId("general"); return; }
    return onValue(ref(db, `channels/${serverId}`), snap => {
      const raw = snap.val() || {};
      const next = Object.entries(raw).map(([id, value]) => ({ ...(value as Channel), id })).sort((a, b) => a.position - b.position);
      setChannels(next.length ? next : fallback); setChannelId(x => next.some(c => c.id === x) ? x : next.find(c => c.type === "text")?.id || "general");
    });
  }, [serverId]);

  useEffect(() => {
    if (!serverId || !channelId) { setMessages([]); return; }
    return onValue(ref(db, `messages/${serverId}/${channelId}`), snap => {
      const raw = snap.val() || {};
      setMessages(Object.entries(raw).map(([id, value]) => ({ ...(value as ChatMessage), id })).sort((a, b) => a.createdAt - b.createdAt).slice(-100));
    });
  }, [serverId, channelId]);

  async function send(e: React.FormEvent) {
    e.preventDefault(); const content = draft.trim(); if (!content || !serverId) return;
    setDraft(""); setError("");
    try { const r = push(ref(db, `messages/${serverId}/${channelId}`)); await set(r, { serverId, channelId, authorId: user.uid, authorName: name, content, createdAt: serverTimestamp() }); }
    catch { setDraft(content); setError("Mesaj gönderilemedi."); }
  }

  const active = channels.find(c => c.id === channelId) || channels[0];
  const server = servers.find(s => s.id === serverId);

  return <main className="v15-workspace">
    <aside className={`v15-servers ${navOpen ? "is-open" : ""}`}><div className="v15-brand">A</div>{servers.map(s => <button key={s.id} className={`v15-server ${s.id === serverId ? "active" : ""}`} onClick={() => { setServerId(s.id); setNavOpen(false); }}>{initials(s.name)}</button>)}<button className="v15-server-add">+</button></aside>
    <aside className={`v15-nav ${navOpen ? "is-open" : ""}`}><div className="v15-nav-head"><div><span>WORKSPACE</span><strong>{server?.name || "AkayRoom"}</strong></div><button onClick={() => setNavOpen(false)}>×</button></div><div className="v15-nav-scroll"><div className="v15-nav-label">CHANNELS</div>{channels.map(c => <button key={c.id} className={`v15-channel ${c.id === channelId ? "active" : ""}`} onClick={() => { setChannelId(c.id); setNavOpen(false); }}><b>{c.type === "voice" ? "◉" : "#"}</b>{c.name}</button>)}<div className="v15-nav-label v15-dm">DIRECT MESSAGES</div><div className="v15-empty">No conversations yet.</div></div><div className="v15-account"><div className="v15-avatar">{initials(name)}</div><div><strong>{name}</strong><span>Online</span></div><button onClick={() => void signOut(auth)}>↗</button></div></aside>
    {navOpen && <button className="v15-backdrop" onClick={() => setNavOpen(false)} aria-label="Close navigation" />}
    <section className="v15-chat"><header className="v15-header"><button className="v15-menu" onClick={() => setNavOpen(true)}>☰</button><div className="v15-title"><span>#</span><div><strong>{active?.name || "general"}</strong>{active?.topic && <small>{active.topic}</small>}</div></div><div className="v15-actions"><button onClick={() => setMembers(x => !x)}>{members ? "Hide" : "Members"}</button><button>⌕</button></div></header><div className="v15-messages"><div className="v15-intro"><div>#</div><h2>Welcome to #{active?.name || "general"}</h2><p>This is the beginning of the conversation.</p></div>{messages.map(m => <article className="v15-message" key={m.id}><div className="v15-avatar">{initials(m.authorName || "U")}</div><div><div className="v15-meta"><strong>{m.authorName || "User"}</strong><time>{time(m.createdAt)}</time></div><p>{m.content}</p></div></article>)}{error && <div className="v15-send-error">{error}</div>}</div><form className="v15-composer" onSubmit={send}><button type="button">+</button><input value={draft} onChange={e => setDraft(e.target.value)} placeholder={`Message #${active?.name || "general"}`} disabled={!serverId} /><button disabled={!draft.trim() || !serverId}>↑</button></form></section>
    {members && <aside className="v15-members"><span>MEMBERS</span><div className="v15-member"><div className="v15-avatar">{initials(name)}</div><div><strong>{name}</strong><small>Online</small></div></div></aside>}
  </main>;
}
