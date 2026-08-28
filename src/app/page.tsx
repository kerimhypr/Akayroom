"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, User } from "firebase/auth";
import { onValue, push, ref, serverTimestamp, set } from "firebase/database";
import { auth, db, firebaseConfigured } from "@/lib/firebase";
import { normalizeUsername, usernameEmail } from "@/lib/username";

const demoMessages = [
  { id: "1", author: "Akay", text: "AkayRoom v1.5 online.", time: "19:42" },
  { id: "2", author: "System", text: "Frontend tamamen yenilendi. Backend aynı kalıyor.", time: "19:42" },
];

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [messages, setMessages] = useState(demoMessages);

  useEffect(() => {
    return onAuthStateChanged(auth, currentUser => {
      setUser(currentUser);
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    return onValue(ref(db, `users/${user.uid}/public`), () => undefined);
  }, [user]);

  const displayName = useMemo(() => user?.displayName || normalizeUsername(username) || "AkayUser", [user, username]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await signInWithEmailAndPassword(auth, usernameEmail(normalizeUsername(username)), password);
    } catch {
      setError("Giriş başarısız. Kullanıcı adı ve şifreni kontrol et.");
    }
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !user) return;
    const optimistic = { id: `local-${crypto.randomUUID()}`, author: displayName, text, time: new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) };
    setMessages(previous => [...previous, optimistic]);
    setDraft("");
    try {
      const messageRef = push(ref(db, "messages/demo/general"));
      await set(messageRef, {
        authorId: user.uid,
        authorName: displayName,
        content: text,
        createdAt: serverTimestamp(),
        serverId: "demo",
        channelId: "general",
      });
    } catch {
      setError("Mesaj gönderilemedi.");
    }
  }

  if (authLoading) return <main className="boot-screen">AKAYROOM // booting</main>;

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="eyebrow">AKAYROOM v1.5</div>
          <h1>Welcome back.</h1>
          <p>Mevcut Firebase backend'ine bağlanan yeni frontend.</p>
          <form onSubmit={handleLogin} className="auth-form">
            <label>KULLANICI ADI<input value={username} onChange={e => setUsername(e.target.value)} placeholder="kullanici" autoComplete="username" /></label>
            <label>ŞİFRE<input value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" type="password" autoComplete="current-password" /></label>
            <button type="submit">GİRİŞ YAP</button>
          </form>
          {!firebaseConfigured && <div className="notice">Firebase environment variables are missing.</div>}
          {error && <div className="error">{error}</div>}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="mobile-header">
        <button className="icon-button" onClick={() => setMobileNavOpen(open => !open)} aria-label="Menüyü aç">☰</button>
        <div><strong>AKAYROOM</strong><span>v1.5</span></div>
        <button className="icon-button" onClick={() => void signOut(auth)} aria-label="Çıkış">↗</button>
      </header>

      <aside className={`server-rail ${mobileNavOpen ? "open" : ""}`}>
        <div className="brand">AR</div>
        <button className="rail-item active">◈</button>
        <button className="rail-item">◎</button>
        <button className="rail-item">✦</button>
      </aside>

      <aside className={`channel-sidebar ${mobileNavOpen ? "open" : ""}`}>
        <div className="sidebar-head"><div><strong>GENERAL</strong><span>AKAYROOM</span></div><button onClick={() => setMobileNavOpen(false)}>×</button></div>
        <div className="nav-section"><span>CHANNELS</span><button>＋</button></div>
        <button className="channel active" onClick={() => setMobileNavOpen(false)}># <span>general</span></button>
        <button className="channel" onClick={() => setMobileNavOpen(false)}># <span>lobby</span></button>
        <button className="channel" onClick={() => setMobileNavOpen(false)}>◉ <span>voice</span></button>
        <div className="nav-section"><span>DIRECT MESSAGES</span><button>＋</button></div>
        <div className="dm-placeholder">Henüz DM yok</div>
        <div className="user-card"><div className="avatar">{displayName.slice(0, 1).toUpperCase()}</div><div><strong>{displayName}</strong><span>online</span></div><button onClick={() => void signOut(auth)}>⋯</button></div>
      </aside>

      <section className="chat-panel">
        <div className="chat-topbar"><div><span className="channel-symbol">#</span><strong>general</strong><span className="topic">AKAYROOM v1.5</span></div><button onClick={() => setMobileNavOpen(true)} className="mobile-channel-button">KANALLAR</button></div>
        <div className="message-list">
          <div className="welcome"><span>◈</span><h2>AkayRoom'a hoş geldin</h2><p>Yeni frontend burada başlıyor.</p></div>
          {messages.map(message => (
            <article key={message.id} className="message">
              <div className="avatar">{message.author.slice(0, 1).toUpperCase()}</div>
              <div className="message-body"><div className="message-meta"><strong>{message.author}</strong><time>{message.time}</time></div><p>{message.text}</p></div>
            </article>
          ))}
        </div>
        <form className="composer" onSubmit={handleSend}>
          <button type="button" aria-label="Ek">＋</button>
          <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="#general kanalına mesaj gönder" />
          <button type="submit" disabled={!draft.trim()} aria-label="Gönder">➤</button>
        </form>
      </section>
    </main>
  );
}
