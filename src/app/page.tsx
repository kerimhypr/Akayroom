"use client";

import { useEffect, useState } from "react";
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, type User } from "firebase/auth";
import { ref, set } from "firebase/database";
import { auth, db, firebaseConfigured } from "@/lib/firebase";
import { createStarterServer } from "@/lib/seed";
import { normalizeUsername, usernameEmail, validUsername } from "@/lib/username";
import Workspace from "@/components/v15/Workspace";
import "./v15.css";

export default function Home(){
  const [user,setUser]=useState<User|null>(null),[ready,setReady]=useState(false),[register,setRegister]=useState(false),[username,setUsername]=useState(""),[displayName,setDisplayName]=useState(""),[password,setPassword]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  useEffect(()=>{
    if(!firebaseConfigured){setReady(true);return;}
    return onAuthStateChanged(auth,u=>{setUser(u);setReady(true)});
  },[]);
  async function submit(e:React.FormEvent){e.preventDefault();const name=normalizeUsername(username);setError("");if(!validUsername(name)){setError("Kullanıcı adı 3-24 karakter olmalı: a-z, 0-9, _ veya -.");return}if(password.length<6){setError("Şifre en az 6 karakter olmalı.");return}setBusy(true);try{
      if(register){
        const cred=await createUserWithEmailAndPassword(auth,usernameEmail(name),password);const now=Date.now();const shown=displayName.trim()||name;
        await set(ref(db,`users/${cred.user.uid}/public`),{username:name,usernameLower:name,displayName:shown,createdAt:now,status:"online",statusText:""});
        await set(ref(db,`usernameIndex/${name}`),cred.user.uid);
        await createStarterServer(cred.user.uid);
      }else{await signInWithEmailAndPassword(auth,usernameEmail(name),password)}
    }catch(err){const code=(err as {code?:string})?.code||"";setError(code.includes("email-already")?"Bu kullanıcı adı zaten alınmış.":code.includes("invalid-credential")||code.includes("wrong-password")?"Kullanıcı adı veya şifre hatalı.":code.includes("network")?"Bağlantı hatası.":"İşlem başarısız. Tekrar dene.");}finally{setBusy(false)}}
  if(!firebaseConfigured)return <State text="Firebase yapılandırması bulunamadı."/>;
  if(!ready)return <State text="AkayRoom bağlanıyor…"/>;
  if(user)return <Workspace user={user}/>;
  return <main className="v15-login"><section><div className="v15-login-brand"><span className="v15-logo-mark">A</span><b>AKAYROOM</b></div><span className="v15-kicker">V1.5 · REALTIME</span><h1>{register?"Create your account.":"Welcome back."}</h1><p>{register?"Yeni bir hesap oluştur ve ilk sunucun otomatik hazırlansın.":"Mevcut AkayRoom hesabınla devam et."}</p><form onSubmit={submit}><label>USERNAME<input value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" placeholder="kullanici_adi" required/></label>{register&&<label>DISPLAY NAME<input value={displayName} onChange={e=>setDisplayName(e.target.value)} autoComplete="name" placeholder="Görünen ad"/></label>}<label>PASSWORD<input value={password} onChange={e=>setPassword(e.target.value)} type="password" autoComplete={register?"new-password":"current-password"} placeholder="••••••••" minLength={6} required/></label>{error&&<div className="v15-error">{error}</div>}<button type="submit" disabled={busy}>{busy?(register?"CREATING…":"CONNECTING…"):(register?"CREATE ACCOUNT":"SIGN IN")}</button></form><button className="v15-link" type="button" onClick={()=>{setRegister(v=>!v);setError("")}}>{register?"Zaten hesabın var mı? Giriş yap":"Hesabın yok mu? Kayıt ol"}</button></section></main>;
}
function State({text}:{text:string}){return <main className="v15-state"><div><span className="v15-logo-mark">A</span><strong>AKAYROOM</strong><p>{text}</p></div></main>}
