"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth, firebaseConfigured } from "@/lib/firebase";
import Workspace from "@/components/v15/Workspace";
import "./v15.css";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!firebaseConfigured) { setReady(true); return; }
    return onAuthStateChanged(auth, next => { setUser(next); setReady(true); });
  }, []);
  if (!firebaseConfigured) return <State text="Firebase configuration is missing." />;
  if (!ready) return <State text="Connecting to AkayRoom…" />;
  return user ? <Workspace user={user} /> : <Login />;
}
function State({ text }: { text: string }) { return <main className="v15-state"><div><span className="v15-logo-mark">A</span><strong>AKAYROOM</strong><p>{text}</p></div></main>; }
function Login() {
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) { e.preventDefault(); setBusy(true); setError(""); try { const { signInWithEmailAndPassword } = await import("firebase/auth"); await signInWithEmailAndPassword(auth, `${username.trim().toLowerCase()}@akayroom.local`, password); } catch { setError("Kullanıcı adı veya şifre hatalı."); } finally { setBusy(false); } }
  return <main className="v15-login"><section><div className="v15-login-brand"><span className="v15-logo-mark">A</span><b>AKAYROOM</b></div><span className="v15-kicker">V1.5</span><h1>Welcome back.</h1><p>Real-time communication, rebuilt.</p><form onSubmit={submit}><label>USERNAME<input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required /></label><label>PASSWORD<input value={password} onChange={e => setPassword(e.target.value)} type="password" autoComplete="current-password" required /></label>{error && <div className="v15-error">{error}</div>}<button disabled={busy}>{busy ? "CONNECTING…" : "SIGN IN"}</button></form></section></main>;
}
