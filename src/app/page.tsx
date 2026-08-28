"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  User,
} from "firebase/auth";
import {
  endAt,
  get,
  limitToLast,
  onChildAdded,
  onDisconnect,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  remove,
  runTransaction,
  serverTimestamp,
  set,
  startAt,
  update,
} from "firebase/database";
import { auth, db, firebaseConfigured } from "@/lib/firebase";
import { rtcIceServers, joinSignalRoom, listenForParticipants, listenForCandidates, publishCandidate, publishOffer, publishAnswer, listenForOffers, listenForAnswers, deterministicInitiator, cleanupSignalRoom, ringDmCall, acceptDmCall, endDmCall, listenDmCall } from "@/lib/webrtc";
import { createStarterServer } from "@/lib/seed";
import { normalizeUsername, usernameEmail, validUsername } from "@/lib/username";
import type { Channel, ChatMessage, Category, MessageAttachmentMeta, Server, UserConnections, UserProfile, GithubCard, MusicCard } from "@/lib/types";

function initials(v: string) { return (v?.trim()?.slice(0,2) || "??").toUpperCase(); }
function fmtSize(bytes: number){ if(!bytes && bytes!==0) return ""; if(bytes<1024) return bytes+" B"; if(bytes<1024*1024) return (bytes/1024).toFixed(0)+" KB"; return (bytes/1024/1024).toFixed(1)+" MB"; }
function fileToDataUrl(file: File): Promise<string>{ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result as string); r.onerror=()=>rej(new Error("okunamadı")); r.readAsDataURL(file); }); }
async function compressImage(file: File): Promise<string>{
  try{
    const bitmap = await createImageBitmap(file);
    const maxDim = 1600;
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bitmap.width*scale));
    c.height = Math.max(1, Math.round(bitmap.height*scale));
    const ctx = c.getContext("2d");
    if(!ctx) throw new Error("canvas yok");
    ctx.drawImage(bitmap, 0, 0, c.width, c.height);
    bitmap.close?.();
    return c.toDataURL("image/jpeg", 0.82);
  }catch{
    return fileToDataUrl(file);
  }
}
function attachmentKind(f: File): MessageAttachmentMeta["type"]{
  if(f.type.startsWith("image/")) return "image";
  if(f.type.startsWith("video/")) return "video";
  if(f.type.startsWith("audio/")) return "audio";
  return "file";
}
function fmtTime(ts: number) { try { return new Date(ts).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"});} catch{ return "--:--"; } }
function fmtDate(ts: number) { try{ return new Date(ts).toLocaleDateString("tr-TR",{day:"2-digit",month:"long",year:"numeric"});}catch{return "";} }

function SearchHighlight({ text, q }: { text: string, q: string }){
  const query = q.trim();
  if(!query) return <>{text}</>;
  const esc = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let parts: string[];
  try{ parts = text.split(new RegExp(`(${esc})`, "ig")); }catch{ return <>{text}</>; }
  return <>{parts.map((p,i)=> p.toLowerCase()===query.toLowerCase() ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>)}</>;
}

function Icon({name, size=14}: {name: string, size?: number}){
  const common = {width:size, height:size, viewBox:"0 0 24 24", fill:"none", stroke:"currentColor", strokeWidth:1.7, strokeLinecap:"round" as const, strokeLinejoin:"round" as const};
  const paths: Record<string, React.ReactNode> = {
    hash: <><line x1="8" y1="5" x2="8" y2="19"/><line x1="16" y1="5" x2="16" y2="19"/><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/></>,
    voice: <><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z"/><path d="M19 10a7 7 0 0 1-14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1-1.51V13a1.65 1.65 0 0 0 1-1.51 1.65 1.65 0 0 0 .33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 7.4 7.5 1.65 1.65 0 0 0 8.4 6H12a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 10.4 9a1.65 1.65 0 0 0-1 1.51V11a1.65 1.65 0 0 0 1 1.51z"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    inbox: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></>,
    search: <><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    dm: <><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 7.5 4.7 8.38 8.38 0 0 1 .9 3.8z"/></>,
    invite: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    grid: <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></>,
    send: <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    mic: <><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z"/><path d="M19 10a7 7 0 0 1-14 0"/><line x1="12" y1="19" x2="12" y2="22"/></>,
    micOff: <><line x1="1" x2="23" y1="1" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="22"/></>,
    phone: <><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.64.29 1.27.5 1.87a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.6.21 1.23.38 1.87.5A2 2 0 0 1 22 16.92z"/></>,
    phoneOff: <><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="22" x2="2" y1="2" y2="22"/></>,
    minimize: <><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></>,
    maximize: <><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></>,
    pip: <><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><rect x="10" y="8" width="8" height="6" rx="1"/><line x1="14" y1="10" x2="14" y2="12"/></>,
    cam: <><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></>,
    camOff: <><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/><line x1="1" x2="23" y1="1" y2="23"/></>,
    screen: <><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></>,
    user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    trash: <><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></>,
    check: <><polyline points="20 6 9 17 4 12"/></>,
    arrowLeft: <><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>,
    close: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    github: <><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></>,
    music: <><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></>,
    paperclip: <><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></>,
  };
  return <svg {...common}>{paths[name] ?? paths.hash}</svg>;
}
const EMOJIS = ["😀","😂","❤️","🔥","👍","👎","🎉","💀","👀","⚡","✅","❌","🤖","👾"];
const QUICK_REACTIONS = ["❤️","👍","😂"];
const DECORATIONS: {id:string, label:string, url:string}[] = [
  {id:"none", label:"YOK", url:""},
  {id:"1", label:"Alev Kılıcı", url:"https://images.weserv.nl/?url=https%3A%2F%2Fcdn.discordapp.com%2Favatar-decoration-presets%2Fa_0f5d6c4dd8ae74662ee9c40722a56cbd.png%3Fsize%3D240%26passthrough%3Dtrue&w=280&h=280&fit=contain"},
  {id:"2", label:"Sakura", url:"https://images.weserv.nl/?url=https%3A%2F%2Fcdn.discordapp.com%2Favatar-decoration-presets%2Fa_e132d6014f2075d9fc2a8ece507ef5cf.png%3Fsize%3D240%26passthrough%3Dtrue&w=280&h=280&fit=contain"},
  {id:"3", label:"Kalp Çiçeği", url:"https://images.weserv.nl/?url=https%3A%2F%2Fcdn.discordapp.com%2Favatar-decoration-presets%2Fa_3e1fc3c7ee2e34e8176f4737427e8f4f.png%3Fsize%3D240%26passthrough%3Dtrue&w=280&h=280&fit=contain"},
  {id:"4", label:"Kelebekler", url:"https://images.weserv.nl/?url=https%3A%2F%2Fcdn.discordapp.com%2Favatar-decoration-presets%2Fa_4cd9ae5a8d103c219eacd3674d7730cd.png%3Fsize%3D240%26passthrough%3Dtrue&w=280&h=280&fit=contain"},
  {id:"5", label:"Taç", url:"https://images.weserv.nl/?url=https%3A%2F%2Fcdn.discordapp.com%2Favatar-decoration-presets%2Fa_88f42fb7360d8224a670a50c3496f315.png%3Fsize%3D240%26passthrough%3Dtrue&w=280&h=280&fit=contain"},
  {id:"6", label:"Defne", url:"https://images.weserv.nl/?url=https%3A%2F%2Fcdn.discordapp.com%2Favatar-decoration-presets%2Fa_8ad98d25ee4e4512704f759476eeb294.png%3Fsize%3D240%26passthrough%3Dtrue&w=280&h=280&fit=contain"},
  {id:"7", label:"Şimşek", url:"https://images.weserv.nl/?url=https%3A%2F%2Fcdn.discordapp.com%2Favatar-decoration-presets%2Fa_d8d93c7a53c0dd07a4074b745210434d.png%3Fsize%3D240%26passthrough%3Dtrue&w=280&h=280&fit=contain"},
  {id:"8", label:"Gece Büyücüsü", url:"https://images.weserv.nl/?url=https%3A%2F%2Fcdn.discordapp.com%2Favatar-decoration-presets%2Fa_4430a4ee89b7fba456e765db21f38485.png%3Fsize%3D240%26passthrough%3Dtrue&w=280&h=280&fit=contain"},
  {id:"9", label:"Filiz", url:"https://images.weserv.nl/?url=https%3A%2F%2Fcdn.discordapp.com%2Favatar-decoration-presets%2Fa_3012fad396abbf24e325431800b51510.png%3Fsize%3D240%26passthrough%3Dtrue&w=280&h=280&fit=contain"},
  {id:"10", label:"Lovestruck", url:"https://images.weserv.nl/?url=https%3A%2F%2Fcdn.discordapp.com%2Favatar-decoration-presets%2Fa_7f44d538ec830f479605f7bf8720afda.png%3Fsize%3D240%26passthrough%3Dtrue&w=280&h=280&fit=contain"},
  {id:"11", label:"Valorant", url:"https://images.weserv.nl/?url=https%3A%2F%2Fcdn.discordapp.com%2Favatar-decoration-presets%2Fa_90e0dce3cc48c4a9607b6d41209c737e.png%3Fsize%3D240%26passthrough%3Dtrue&w=280&h=280&fit=contain"},
  {id:"12", label:"Samuray", url:"https://images.weserv.nl/?url=https%3A%2F%2Fcdn.discordapp.com%2Favatar-decoration-presets%2Fa_57807030ab60f7ac0c4a1998aa091bbf.png%3Fsize%3D240%26passthrough%3Dtrue&w=280&h=280&fit=contain"},
];
const PRONOUNS_LIST = ["he/him","she/her","they/them","he/they","she/they","they/them","it/its","any/all","ask me","he/him • tr","she/her • tr"];

function RenderContent({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const blockRegex = /```([\s\S]*?)```/g;
  let last = 0; let m: RegExpExecArray | null; let idx=0;
  const inline = (s: string) => {
    const tokens: React.ReactNode[] = [];
    const segs = s.split(/(`[^`]+`)/g);
    segs.forEach((seg, i) => {
      if (seg.startsWith("`") && seg.endsWith("`") && seg.length>1) {
        tokens.push(<code key={`c-${i}-${idx++}`}>{seg.slice(1,-1)}</code>);
        return;
      }
      const spoilerSplit = seg.split(/(\|\|[^|]+\|\|)/g);
      spoilerSplit.forEach((sp, j) => {
        if (sp.startsWith("||") && sp.endsWith("||")) {
          tokens.push(<span key={`sp-${i}-${j}`} className="spoiler" onClick={e=> (e.currentTarget.style.color = e.currentTarget.style.color ? "" : "#fff")}>{sp.slice(2,-2)}</span>);
          return;
        }
        const mentionSplit = sp.split(/(@\w+|#\w+)/g);
        mentionSplit.forEach((ms, k) => {
          if (/^@\w+/.test(ms) || /^#\w+/.test(ms)) {
            tokens.push(<span key={`mn-${i}-${j}-${k}`} className="mention">{ms}</span>);
            return;
          }
          const boldParts = ms.split(/(\*\*[^*]+\*\*)/g);
          boldParts.forEach((bp, b) => {
            if (bp.startsWith("**") && bp.endsWith("**")) {
              tokens.push(<strong key={`b-${i}-${j}-${k}-${b}`}>{bp.slice(2,-2)}</strong>);
              return;
            }
            const italicParts = bp.split(/(\*[^*]+\*|_[^_]+_)/g);
            italicParts.forEach((ip, c) => {
              if ((ip.startsWith("*") && ip.endsWith("*") && ip.length>2) || (ip.startsWith("_") && ip.endsWith("_") && ip.length>2)) {
                tokens.push(<em key={`it-${i}-${j}-${k}-${b}-${c}`}>{ip.slice(1,-1)}</em>);
                return;
              }
              const strikeParts = ip.split(/(~~[^~]+~~)/g);
              strikeParts.forEach((stp, d) => {
                if (stp.startsWith("~~") && stp.endsWith("~~")) {
                  tokens.push(<s key={`s-${i}-${j}-${k}-${b}-${c}-${d}`}>{stp.slice(2,-2)}</s>);
                  return;
                }
                const uParts = stp.split(/(__[^_]+__)/g);
                uParts.forEach((up, e) => {
                  if (up.startsWith("__") && up.endsWith("__")) {
                    tokens.push(<u key={`u-${i}-${j}-${k}-${b}-${c}-${d}-${e}`}>{up.slice(2,-2)}</u>);
                    return;
                  }
                  if (up.startsWith("> ")) {
                    tokens.push(<blockquote key={`q-${i}-${j}-${k}-${b}-${c}-${d}-${e}`}>{up.slice(2)}</blockquote>);
                    return;
                  }
                  if (up) {
                    const urlParts = up.split(/(https?:\/\/[^\s]+)/g);
                    urlParts.forEach((part, f) => {
                      if (/^https?:\/\//.test(part)) {
                        const isImage = /\.(gif|png|jpe?g|webp)(\?|$)/i.test(part) || /giphy\.com|tenor\.com|media\.giphy/i.test(part);
                        if (isImage) {
                          tokens.push(<img key={`img-${i}-${j}-${k}-${b}-${c}-${d}-${e}-${f}`} src={part} alt="gif" style={{maxWidth:"220px", maxHeight:"220px", border:"1px solid var(--border)", display:"block", margin:"6px 0"}} onClick={()=>window.open(part,"_blank")} />);
                        } else {
                          tokens.push(<a key={`lnk-${i}-${j}-${k}-${b}-${c}-${d}-${e}-${f}`} href={part} target="_blank" rel="noopener noreferrer" style={{color:"#fff", textDecoration:"underline", textUnderlineOffset:"3px"}}>{part}</a>);
                        }
                        return;
                      }
                      if (part) tokens.push(<span key={`t-${i}-${j}-${k}-${b}-${c}-${d}-${e}-${f}-${tokens.length}`}>{part}</span>);
                    });
                  }
                });
              });
            });
          });
        });
      });
    });
    return tokens;
  };
  const raw = text;
  let found=false;
  while ((m = blockRegex.exec(raw)) !== null) {
    found=true;
    const before = raw.slice(last, m.index);
    if (before) parts.push(<span key={`pre-b-${idx++}`}>{inline(before)}</span>);
    parts.push(<pre key={`pre-${idx++}`}><code>{m[1]}</code></pre>);
    last = m.index + m[0].length;
  }
  if (!found) return <>{inline(raw)}</>;
  const after = raw.slice(last);
  if (after) parts.push(<span key={`pre-a-${idx++}`}>{inline(after)}</span>);
  return <>{parts}</>;
}

const fallbackServers: Server[] = [{ id:"demo", name:"AKAYROOM // DEMO", ownerId:"demo", createdAt:0 }];
const fallbackChannels: Channel[] = [
  { id:"general", name:"genel", type:"text", position:0, topic:"genel sohbet" },
  { id:"voice", name:"sesli-oda", type:"voice", position:1 },
];
const fallbackCats: Category[] = [{ id:"cat1", name:"KANALLAR", position:0 }];

export default function Home(){
  const [user,setUser]=useState<User|null>(null);
  const [profile,setProfile]=useState<UserProfile|null>(null);
  const [authLoading,setAuthLoading]=useState(true);
  const [username,setUsername]=useState("");
  const [password,setPassword]=useState("");
  const [displayName,setDisplayName]=useState("");
  const [registerMode,setRegisterMode]=useState(false);
  const [authError,setAuthError]=useState("");

  const [servers,setServers]=useState<Server[]>([]);
  const [myServerIds,setMyServerIds]=useState<Record<string, boolean>>({});
  const [categories,setCategories]=useState<Category[]>(fallbackCats);
  const [channels,setChannels]=useState<Channel[]>(fallbackChannels);
  const [selectedServer,setSelectedServer]=useState("demo");
  const [selectedChannel,setSelectedChannel]=useState("general");
  const [activeView,setActiveView]=useState<"server"|"servers"|"friends"|"dms"|"inbox"|"profile">("server");
  const [friendsTab,setFriendsTab]=useState<"friends"|"inbox"|"dms">("friends");
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [draft,setDraft]=useState("");
  const [drafts,setDrafts]=useState<Record<string,string>>({});
  const [replyTo,setReplyTo]=useState<ChatMessage|null>(null);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [editContent,setEditContent]=useState("");
  const [search,setSearch]=useState("");
  const [dmHighlightId,setDmHighlightId]=useState<string|null>(null);
  const [typingUsers,setTypingUsers]=useState<Record<string,{username:string,timestamp:number}>>({});
  const [showEmoji,setShowEmoji]=useState(false);
  const [showGif,setShowGif]=useState(false);
  const [showPlusMenu,setShowPlusMenu]=useState(false);
  const [showPoll,setShowPoll]=useState(false);
  const [pollQ,setPollQ]=useState("");
  const [pollOpts,setPollOpts]=useState(["",""]);
  const [pollVotesMap,setPollVotesMap]=useState<Record<string, Record<string,string>>>({});
  const [helpOpen,setHelpOpen]=useState(false);
  const [connGithub,setConnGithub]=useState("");
  const [connSpotify,setConnSpotify]=useState("");
  const [connSite,setConnSite]=useState("");
  const [npSearch,setNpSearch]=useState("");
  const [npResults,setNpResults]=useState<MusicCard[]|null>(null);
  const [npLoading,setNpLoading]=useState(false);
  const [gifSearch,setGifSearch]=useState("");
  const [gifResults,setGifResults]=useState<string[]>([]);
  const [toast,setToast]=useState("");
  const [showCreateServer,setShowCreateServer]=useState(false);
  const [newServerName,setNewServerName]=useState("");
  const [creatingServer,setCreatingServer]=useState(false);
  const [newServerIcon,setNewServerIcon]=useState("");
  const [joiningInvite,setJoiningInvite]=useState(false);
  const [showJoinInvite,setShowJoinInvite]=useState(false);
  const [showCreateChannel,setShowCreateChannel]=useState(false);
  const [newChannelName,setNewChannelName]=useState("");
  const [newChannelType,setNewChannelType]=useState<Channel["type"]>("text");
  const [newChannelCat,setNewChannelCat]=useState<string>("");
  const [showInvite,setShowInvite]=useState(false);
  const [inviteCode,setInviteCode]=useState("");
  const [joinCode,setJoinCode]=useState("");
  const [showThread,setShowThread]=useState(false);
  const [threadParent,setThreadParent]=useState<ChatMessage|null>(null);
  const [threadMessages,setThreadMessages]=useState<Record<string, ChatMessage[]>>({});
  const [threadDraft,setThreadDraft]=useState("");
  const [showPalette,setShowPalette]=useState(false);
  const [paletteQ,setPaletteQ]=useState("");
  const [showUserSettings,setShowUserSettings]=useState(false);
  const [showAccountSettings,setShowAccountSettings]=useState(false);
  const [accountTab,setAccountTab]=useState<"hesabim"|"gorunum"|"gizlilik"|"cikis">("hesabim");
  const [cropTarget,setCropTarget]=useState<null|{type:"avatar"|"banner", file: File, url: string}>(null);
  const [cropPos,setCropPos]=useState({x:0,y:0});
  const [cropZoom,setCropZoom]=useState(1);
  const [dragging,setDragging]=useState(false);
  const [dragStart,setDragStart]=useState({x:0,y:0});
  const [showServerSettings,setShowServerSettings]=useState(false);
  const [channelMenu,setChannelMenu]=useState<{x:number,y:number, channel:Channel}|null>(null);
  const [editingChannel,setEditingChannel]=useState<Channel|null>(null);
  const [editChannelName,setEditChannelName]=useState("");
  const [editChannelTopic,setEditChannelTopic]=useState("");
  const [joinedVoice,setJoinedVoice]=useState<string|null>(null);
  const [micMuted,setMicMuted]=useState(false);
  const [deafen,setDeafen]=useState(false);
  const [camOn,setCamOn]=useState(false);
  const [screenSharing,setScreenSharing]=useState(false);
  const [screenSettings,setScreenSettings]=useState({w:1280, h:720, fps:30});
  const screenSettingsRef = useRef(screenSettings);
  screenSettingsRef.current = screenSettings;
  const [showScreenPanel,setShowScreenPanel]=useState(false);
  const [incomingCall,setIncomingCall]=useState<null|{threadId:string, fromUid:string, fromName?:string}>(null);
  const [callPip,setCallPip]=useState(false);
  const [callPipPos,setCallPipPos]=useState(()=>{
    if(typeof window!=="undefined"){ try{ const p=JSON.parse(localStorage.getItem("akayroom_callPipPos")||"null"); if(p&&typeof p.x==="number"&&typeof p.y==="number") return p; }catch{} }
    return {x:12,y:12};
  });
  const [voiceParticipants,setVoiceParticipants]=useState<Record<string, {profile: UserProfile|null, joinedAt:number}>>({});
  const [remoteStreams,setRemoteStreams]=useState<Record<string, MediaStream>>({});
  const localStreamRef = useRef<MediaStream|null>(null);
  const camStreamRef = useRef<MediaStream|null>(null);
  const screenStreamRef = useRef<MediaStream|null>(null);
  const screenCanvasRef = useRef<HTMLCanvasElement|null>(null);
  const screenCaptureActive = useRef(false);
  const pcsRef = useRef<Record<string, RTCPeerConnection>>({});
  const videoSendersRef = useRef<Record<string, RTCRtpSender>>({});
  const liveVideoTrackRef = useRef<MediaStreamTrack|null>(null);
  const mutedAvRef = useRef<{track: MediaStreamTrack, stream: MediaStream}|null>(null);
  const [remoteCamStatus,setRemoteCamStatus]=useState<Record<string,"on"|"screen">>({});
  const [pinnedIds,setPinnedIds]=useState<Set<string>>(new Set());
  const [reactionMap,setReactionMap]=useState<Record<string, Record<string,{count:number,me:boolean}>>>({});
  const [contextMenu,setContextMenu]=useState<{x:number,y:number,msg:ChatMessage}|null>(null);
  const [friendName,setFriendName]=useState("");
  const [members,setMembers]=useState<{uid:string, profile:UserProfile|null, role:string}[]>([]);
  const [dmThreads,setDmThreads]=useState<{id:string, otherUid:string, profile:UserProfile|null, lastAt:number}[]>([]);
  const [selectedDm,setSelectedDm]=useState<string|null>(null);
  const [dmMsgs,setDmMsgs]=useState<{id:string, authorId:string, content:string, createdAt:number, editedAt?:number, attachment?: MessageAttachmentMeta|null}[]>([]);
  const [dmDraft,setDmDraft]=useState("");
  const [dmEditingId,setDmEditingId]=useState<string|null>(null);
  const [dmEditContent,setDmEditContent]=useState("");
  const [dmPendingFile,setDmPendingFile]=useState<{file:File,preview?:string}|null>(null);
  const [dmAttachmentCache,setDmAttachmentCache]=useState<Record<string,{loading?:boolean,dataUrl?:string,error?:string}>>({});
  const [friends,setFriends]=useState<{uid:string, profile:UserProfile|null}[]>([]);
  const [friendRequests,setFriendRequests]=useState<Record<string,{fromName?:string, createdAt:number}>>({});
  const [sentRequests,setSentRequests]=useState<Record<string, number>>({});
  const [incomingServerInvites,setIncomingServerInvites]=useState<Record<string,{serverId:string, serverName:string, fromUid:string, fromName?:string, createdAt:number}>>({});
  const [inviteFriendTarget,setInviteFriendTarget]=useState<string|null>(null);
  const [inviteFriendServer,setInviteFriendServer]=useState<string>("");
  const [showServerInviteMenu,setShowServerInviteMenu]=useState(false);
  const [showServerFriendPicker,setShowServerFriendPicker]=useState(false);
  const [serverFriendInvites,setServerFriendInvites]=useState<Record<string,boolean>>({});
  const [showMembers,setShowMembers]=useState(false);
  const [mobileSidebarOpen,setMobileSidebarOpen]=useState(false);
  const [selectedProfileUid,setSelectedProfileUid]=useState<string|null>(null);
  const [selectedProfile,setSelectedProfile]=useState<UserProfile|null>(null);
  const [profileLoading,setProfileLoading]=useState(false);
  const [showLanding,setShowLanding]=useState(true);
  const [pendingFile,setPendingFile]=useState<{file:File,preview?:string}|null>(null);
  const [sendingAttachment,setSendingAttachment]=useState(false);
  const [attCache,setAttCache]=useState<Record<string,{loading:boolean,dataUrl?:string,mime?:string,type?:MessageAttachmentMeta["type"],error?:string}>>({});
  const [lightbox,setLightbox]=useState<{src:string,name:string}|null>(null);
  const [unread,setUnread]=useState<Record<string, number>>({});
  const [dmUnreadCount,setDmUnreadCount]=useState<Record<string, number>>({});
  const [toastFlash,setToastFlash]=useState<null|{id:string, text:string}>(null);
  const [lastRead,setLastRead]=useState<Record<string, number>>(()=>{
    if(typeof window!=="undefined"){ try{ return JSON.parse(localStorage.getItem("akayroom_lastRead")||"{}"); }catch{} }
    return {};
  });

  const messagesEndRef=useRef<HTMLDivElement>(null);
  const typingTimeout=useRef<NodeJS.Timeout | null>(null);
  const lastTypingSentRef=useRef<number>(0);
  const composerRef=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{ return ()=>{ if(typingTimeout.current) clearTimeout(typingTimeout.current); } },[selectedChannel]);
  // tek müzik çalma: bir preview çalarken diğerlerini durdur
  useEffect(()=>{
    const onPlay=(e:Event)=>{
      const cur=e.target as HTMLAudioElement;
      if(!(cur instanceof HTMLAudioElement) || cur.hasAttribute("data-voice")) return;
      document.querySelectorAll("audio").forEach(a=>{
        if(a!==cur && !a.hasAttribute("data-voice")){
          try{ (a as HTMLAudioElement).pause(); (a as HTMLAudioElement).currentTime=0; }catch{}
        }
      });
    };
    document.addEventListener("play", onPlay, true);
    return ()=>document.removeEventListener("play", onPlay, true);
  },[]);
  const doSignOut=async()=>{
    try{
      if(user){
        try{ onDisconnect(ref(db,`users/${user.uid}/presence/status`)).cancel(); }catch{}
        try{ onDisconnect(ref(db,`users/${user.uid}/presence/lastChanged`)).cancel(); }catch{}
        try{ onDisconnect(ref(db,`users/${user.uid}/presence/connections`)).cancel(); }catch{}
        await remove(ref(db,`users/${user.uid}/presence/connections`)).catch(()=>{});
        await set(ref(db,`users/${user.uid}/presence/status`),"offline").catch(()=>{});
        await set(ref(db,`users/${user.uid}/presence/lastChanged`),Date.now()).catch(()=>{});
      }
    }catch{}
    await signOut(auth);
  };

  const selectedServerData = useMemo(()=> servers.find(s=>s.id===selectedServer) ?? servers[0],[servers,selectedServer]);
  const selectedChannelData = useMemo(()=> channels.find(c=>c.id===selectedChannel) ?? channels[0],[channels,selectedChannel]);

  const callTitle = useMemo(()=>{
    if(!joinedVoice) return "";
    if(activeView==="dms"){
      return dmThreads.find(d=>d.id===joinedVoice)?.profile?.displayName || dmThreads.find(d=>d.id===selectedDm)?.profile?.displayName || "DM araması";
    }
    return channels.find(c=>c.id===joinedVoice)?.name || "Sesli oda";
  },[joinedVoice, activeView, dmThreads, channels, selectedDm]);

  function serverUnread(serverId: string): number {
    return Object.entries(unread).reduce((sum,[key,n])=> key.startsWith(serverId+"/") ? sum+n : sum, 0);
  }
  function dmUnread(threadId: string): number {
    return dmUnreadCount[threadId]||0;
  }

  const filteredChannels = useMemo(()=>{
    if(!search.trim()) return channels;
    const q=search.toLowerCase();
    return channels.filter(c=>c.name.toLowerCase().includes(q));
  },[channels,search]);
  const filteredMessages = useMemo(()=>{
    if(!search.trim()) return messages;
    const q=search.toLowerCase();
    return messages.filter(m=>m.content.toLowerCase().includes(q) || (m.authorName??"").toLowerCase().includes(q));
  },[messages,search]);
  const dmSearchResults = useMemo(()=>{
    if(!search.trim() || !selectedDm) return [];
    const q=search.toLowerCase();
    return dmMsgs.filter(m=> m.content?.toLowerCase().includes(q) || m.attachment?.name?.toLowerCase().includes(q));
  },[dmMsgs,search,selectedDm]);

  function jumpToDmMessage(id:string){
    setDmHighlightId(id);
    document.getElementById(`dm-msg-${id}`)?.scrollIntoView({behavior:"smooth", block:"center"});
    window.setTimeout(()=>setDmHighlightId(cur=> cur===id ? null : cur), 1800);
  }

  useEffect(()=>{
    if(!firebaseConfigured){ setAuthLoading(false); return; }
    return onAuthStateChanged(auth, async (u)=>{
      setUser(u); setAuthLoading(false);
      if(!u){ setProfile(null); return; }
      const snap=await get(ref(db,`users/${u.uid}/public`));
      if(snap.exists()) setProfile(snap.val());
      const connId=Date.now().toString();
      set(ref(db,`users/${u.uid}/presence/status`),"online").catch(()=>{});
      set(ref(db,`users/${u.uid}/presence/lastChanged`),Date.now()).catch(()=>{});
      set(ref(db,`users/${u.uid}/presence/connections/${connId}`),true).catch(()=>{});
      onDisconnect(ref(db,`users/${u.uid}/presence/status`)).set("offline").catch(()=>{});
      onDisconnect(ref(db,`users/${u.uid}/presence/lastChanged`)).set(Date.now()).catch(()=>{});
      onDisconnect(ref(db,`users/${u.uid}/presence/connections/${connId}`)).remove().catch(()=>{});
    });
  },[]);

  useEffect(()=>{
    if(!user) return;
    // Membership-driven: only load servers the user belongs to (users/{uid}/servers index)
    return onValue(ref(db,`users/${user.uid}/servers`), async (snap)=>{
      const ids = snap.exists() ? Object.keys(snap.val() as Record<string, boolean>) : [];
      const mine: Record<string, boolean> = {};
      ids.forEach(id=>{ mine[id]=true; });
      setMyServerIds(mine);
      const loaded: Server[] = [];
      await Promise.all(ids.map(async id=>{
        try{
          const s=await get(ref(db,`servers/${id}`));
          if(s.exists()) loaded.push({id, ...(s.val() as Omit<Server,"id">)});
        }catch{ /* not a member (or denormalized) */ }
      }));
      loaded.sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
      setServers(loaded.length ? loaded : []);
      setSelectedServer(prev=>{
        if(prev==="demo" || !mine[prev]){
          return Object.keys(mine)[0] ?? "demo";
        }
        return prev;
      });
    }, (err)=>{ console.warn("my servers load failed:", (err as any).code ?? err.message); });
  },[user]);

  useEffect(()=>{
    if(!user || selectedServer==="demo") { setCategories(fallbackCats); return; }
    return onValue(ref(db,`categories/${selectedServer}`),(snap)=>{
      if(!snap.exists()){ setCategories([]); return; }
      const next=Object.entries(snap.val()).map(([id,v])=>({id, ...(v as Omit<Category,"id">)}));
      next.sort((a,b)=>a.position-b.position);
      setCategories(next);
    });
  },[user,selectedServer]);

  useEffect(()=>{
    if(!user || selectedServer==="demo") { setChannels(fallbackChannels); return; }
    return onValue(ref(db,`channels/${selectedServer}`),(snap)=>{
      if(!snap.exists()){ setChannels([]); return; }
      const next=Object.entries(snap.val()).map(([id,v])=>({id, ...(v as Omit<Channel,"id">)}));
      next.sort((a,b)=>a.position-b.position);
      setChannels(next);
      setSelectedChannel(prev=> (next[0] && !next.some(c=>c.id===prev) ? next[0].id : prev));
    });
  },[user,selectedServer]);

  useEffect(()=>{
    if(!user || selectedServer==="demo") { setMessages([]); return; }
    if(activeView!=="server") return;
    if(!selectedChannel) return;
    const ch = channels.find(c=>c.id===selectedChannel);
    if(ch?.type==="voice") { setMessages([]); return; }
    const mq=query(ref(db,`messages/${selectedServer}/${selectedChannel}`),orderByChild("createdAt"),limitToLast(100));
    return onValue(mq,(snap)=>{
      const next:ChatMessage[]=[];
      snap.forEach(it=>{ next.push({id:it.key??"", ...(it.val() as Omit<ChatMessage,"id">)}); });
      next.sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
      setMessages(next);
    });
  },[user,selectedServer,selectedChannel,channels,activeView]);

  useEffect(()=>{
    if(!user || selectedServer==="demo") return;
    if(activeView!=="server") return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const unsub = onValue(ref(db,`typing/${selectedServer}/${selectedChannel}`),(snap)=>{
      if(!snap.exists()){ setTypingUsers({}); return; }
      const v=snap.val() as Record<string,{username:string,timestamp:number}>;
      const now=Date.now();
      const filtered: typeof v = {};
      Object.entries(v).forEach(([uid,data])=>{
        if(uid===user!.uid) return;
        if(now - data.timestamp > 7000) return;
        filtered[uid]=data;
      });
      setTypingUsers(filtered);
    });
    timer = setInterval(()=>{
      setTypingUsers(prev=>{
        const now=Date.now();
        let changed=false;
        const next: typeof prev = {};
        Object.entries(prev).forEach(([uid,data])=>{
          if(now - data.timestamp <= 7000){ next[uid]=data; } else { changed=true; }
        });
        return changed ? next : prev;
      });
    }, 2000);
    return ()=>{ try{unsub();}catch{} if(timer) clearInterval(timer); };
  },[user,selectedServer,selectedChannel,activeView]);

  useEffect(()=>{
    if(!user || selectedServer==="demo") { setMembers([]); return; }
    let stale=false;
    const unsub = onValue(ref(db,`serverMembers/${selectedServer}`), (snap)=>{
      if(stale) return;
      if(!snap.exists()){ setMembers([]); return; }
      const entries = Object.entries(snap.val() as Record<string,any>);
      const snapId = JSON.stringify(Object.keys(snap.val()).sort());
      void (async ()=>{
        try{
          const results = await Promise.all(entries.map(async ([uid, val])=>{
            try{
              const profSnap = await get(ref(db,`users/${uid}/public`));
              return {uid, profile: profSnap.exists()? profSnap.val() as UserProfile : null, role: (val as any).role || "member"};
            }catch{ return {uid, profile:null as UserProfile|null, role:(val as any).role || "member"}; }
          }));
          if(stale) return;
          // snapshot hâlâ aynı mı kontrol et (race)
          void get(ref(db,`serverMembers/${selectedServer}`)).then(cur=>{
            if(!cur.exists() && entries.length!==0) return;
            if(cur.exists()){
              const curKeys=JSON.stringify(Object.keys(cur.val() as object).sort());
              if(curKeys!==snapId) return;
            }
            setMembers(results);
          }).catch(()=>{ if(!stale) setMembers(results); });
        }catch{}
      })();
    });
    return ()=>{ stale=true; try{unsub();}catch{} };
  },[user, selectedServer]);

  // Unread badge: backlog abone olurken tek seferlik gerçek sorguyla (createdAt
  // aralığı) hesaplanır; canlı artırım yalnızca sinceTs sonrasını sayar → reload
  // sonrası da doğru, çift sayma/atlama olmaz. Aktif kanal ref'ten okunur.
  const activeChannelKey = activeView==="server" ? `${selectedServer}/${selectedChannel}` : null;
  const lastReadRef = useRef(lastRead);
  lastReadRef.current = lastRead;
  const activeChannelKeyRef = useRef(activeChannelKey);
  activeChannelKeyRef.current = activeChannelKey;
  const activeDmRef = useRef({view: activeView, dm: selectedDm});
  activeDmRef.current = {view: activeView, dm: selectedDm};
  useEffect(()=>{
    if(!user || selectedServer==="demo") return;
    let cancelled = false;
    const unsubs: (()=>void)[] = [];
    channels.forEach(ch=>{
      if(ch.type==="voice") return;
      const key=`${selectedServer}/${ch.id}`;
      const seen0 = lastReadRef.current[key] || 0;
      const sinceTs = Date.now();
      void (async ()=>{
        try{
          const bq=query(ref(db,`messages/${selectedServer}/${ch.id}`), orderByChild("createdAt"), startAt(seen0+1), endAt(sinceTs));
          const s=await get(bq);
          if(cancelled || !s.exists()) return;
          let n=0;
          s.forEach(it=>{ const m=it.val() as ChatMessage; if(m && m.authorId!==user!.uid) n++; });
          if(n>0 && activeChannelKeyRef.current!==key) setUnread(prev=>({...prev, [key]: n}));
        }catch{}
      })();
      const u = onChildAdded(ref(db,`messages/${selectedServer}/${ch.id}`),(snap)=>{
        const m = snap.val() as ChatMessage;
        if(!m || m.authorId===user.uid) return;
        const ts = m.createdAt || 0;
        if(ts<=sinceTs) return; // backlog sorgusunun kapsamı
        if(activeChannelKeyRef.current===key) return;
        if(ts <= (lastReadRef.current[key] || 0)) return;
        setUnread(prev=>({...prev, [key]: (prev[key]||0)+1}));
        if(m.content){
          setToastFlash({id:`${selectedServer}-${ch.id}-${snap.key}`, text: `${m.authorName||"biri"}: ${m.content.slice(0,80)}`});
        }
      });
      unsubs.push(u);
    });
    return ()=>{ cancelled=true; unsubs.forEach(u=>{try{u();}catch{}}); };
  },[user, selectedServer, channels]);

  // When we open a channel, mark it read (persist lastRead)
  useEffect(()=>{
    if(!activeChannelKey) return;
    setLastRead(prev=>({...prev, [activeChannelKey]: Date.now()}));
    setUnread(prev=>{ const n={...prev}; delete n[activeChannelKey]; return n; });
  },[activeChannelKey]);

  // DM unread: backlog gerçek sorguyla hesaplanır, canlı artırım sinceTs sonrasını sayar.
  useEffect(()=>{
    if(!user || dmThreads.length===0) return;
    let cancelled = false;
    const unsubs = dmThreads.map(th=>{
      const key=`dm-${th.id}`;
      const seen0 = lastReadRef.current[key] || 0;
      const sinceTs = Date.now();
      void (async ()=>{
        try{
          const bq=query(ref(db,`dmMessages/${th.id}`), orderByChild("createdAt"), startAt(seen0+1), endAt(sinceTs));
          const s=await get(bq);
          if(cancelled || !s.exists()) return;
          let n=0;
          s.forEach(it=>{ const m=it.val() as {authorId?:string}; if(m?.authorId && m.authorId!==user!.uid) n++; });
          const act=activeDmRef.current;
          if(n>0 && !(act.view==="dms" && act.dm===th.id)) setDmUnreadCount(prev=>({...prev, [th.id]: n}));
        }catch{}
      })();
      return onChildAdded(ref(db,`dmMessages/${th.id}`),(snap)=>{
        const m = snap.val() as {authorId?:string, content?:string, createdAt?:number};
        if(!m || !m.authorId || m.authorId===user.uid) return;
        const ts = m.createdAt || 0;
        if(ts<=sinceTs) return; // backlog kapsamı
        if(ts <= (lastReadRef.current[key] || 0)) return;
        const act=activeDmRef.current;
        if(act.view==="dms" && act.dm===th.id) return;
        setDmUnreadCount(prev=>({...prev, [th.id]: (prev[th.id]||0)+1}));
        if(m.content){
          setToastFlash({id:`dm-${th.id}-${snap.key}`, text:`${th.profile?.displayName||th.profile?.username||"biri"}: ${m.content.slice(0,80)}`});
        }
      });
    });
    return ()=>{ cancelled=true; unsubs.forEach(u=>{try{u();}catch{}}); };
  },[user, dmThreads]);

  // Mark DM read when opening it
  useEffect(()=>{
    if(activeView==="dms" && selectedDm){
      setLastRead(prev=>({...prev, [`dm-${selectedDm}`]: Date.now()}));
      setDmUnreadCount(prev=>{ const n={...prev}; delete n[selectedDm]; return n; });
    }
  },[activeView, selectedDm]);




  useEffect(()=>{
    if(!user) return;
    return onValue(ref(db,"dmThreads"), async (snap)=>{
      if(!snap.exists()){ setDmThreads([]); return; }
      const all = snap.val() as Record<string, any>;
      const byOther = new Map<string, {id:string, otherUid:string, profile:UserProfile|null, lastAt:number}>();
      for(const [id, val] of Object.entries(all)){
        const participants = val.participants as Record<string, boolean>;
        if(!participants || !participants[user!.uid]) continue;
        const otherUid = Object.keys(participants).find(k=>k!==user!.uid);
        if(!otherUid) continue;
        const lastAt = (val as any).lastMessageAt || (val as any).createdAt || 0;
        const existing = byOther.get(otherUid);
        if(existing && existing.lastAt >= lastAt) continue;
        try{
          const psnap = await get(ref(db,`users/${otherUid}/public`));
          byOther.set(otherUid, {id, otherUid, profile: psnap.exists()? psnap.val(): null, lastAt});
        }catch{ byOther.set(otherUid, {id, otherUid, profile:null, lastAt});}
      }
      const next = Array.from(byOther.values());
      next.sort((a,b)=>b.lastAt-a.lastAt);
      setDmThreads(next);
      if(next[0] && !selectedDm) setSelectedDm(next[0].id);
    });
  },[user]);

  useEffect(()=>{
    if(!user || !selectedDm) { setDmMsgs([]); return; }
    const q=query(ref(db,`dmMessages/${selectedDm}`), orderByChild("createdAt"), limitToLast(100));
    return onValue(q,(snap)=>{
      const arr: any[]=[];
      snap.forEach(c=>{ arr.push({id:c.key, ...c.val()}); });
      arr.sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
      setDmMsgs(arr);
    });
  },[user, selectedDm]);

  useEffect(()=>{
    if(!user) return;
    let stale=false;
    const unsub=onValue(ref(db,`friends/${user.uid}`), (snap)=>{
      if(stale) return;
      if(!snap.exists()){ setFriends([]); return; }
      const ids = Object.keys(snap.val() as Record<string,any>);
      void Promise.all(ids.map(async fid=>{
        try{
          const psnap = await get(ref(db,`users/${fid}/public`));
          return {uid:fid, profile: psnap.exists()? psnap.val() as UserProfile: null};
        }catch{ return {uid:fid, profile:null}; }
      })).then(next=>{ if(!stale) setFriends(next); });
    });
    return ()=>{ stale=true; try{unsub();}catch{} };
  },[user]);

  // Listen for incoming friend requests
  useEffect(()=>{
    if(!user) return;
    return onValue(ref(db,`friendRequests/${user.uid}/incoming`),(snap)=>{
      if(!snap.exists()){ setFriendRequests({}); return; }
      setFriendRequests(snap.val() as Record<string,{fromName?:string, createdAt:number}>);
    });
  },[user]);

  // Arkadaşlık olayları (kabul/red/çıkarma). Event anahtarı GÖNDEREN uid'idir ve
  // kurallar yalnızca gönderenin kendi slotuna yazılmasına izin verir; böylece
  // üçüncü bir kişi başına ait olay taklit edemez. "accepted" ek olarak kendi
  // outgoing kaydım varsa işlenir (istek atmadığım biri beni "kabul" edemez).
  useEffect(()=>{
    if(!user) return;
    return onValue(ref(db,`friendRequests/${user.uid}/events`), (snap)=>{
      if(!snap.exists()) return;
      const all = snap.val() as Record<string,{type?:string, fromName?:string}>;
      void (async()=>{
        for(const [fromUid, ev] of Object.entries(all)){
          const evRef=ref(db,`friendRequests/${user.uid}/events/${fromUid}`);
          if(!ev?.type){ await remove(evRef).catch(()=>{}); continue; }
          const who = ev.fromName || "biri";
          try{
            if(ev.type==="accepted"){
              const out = await get(ref(db,`friendRequests/${user.uid}/outgoing/${fromUid}`));
              if(out.exists()){
                await set(ref(db,`friends/${user.uid}/${fromUid}`), true);
                await remove(ref(db,`friendRequests/${user.uid}/outgoing/${fromUid}`));
                setToastFlash({id:`ev-${user.uid}-${fromUid}-a`, text:`${who} arkadaşlık isteğini kabul etti ✓`});
              }
            } else if(ev.type==="rejected"){
              const out = await get(ref(db,`friendRequests/${user.uid}/outgoing/${fromUid}`));
              if(out.exists()){
                await remove(ref(db,`friendRequests/${user.uid}/outgoing/${fromUid}`));
                setToastFlash({id:`ev-${user.uid}-${fromUid}-r`, text:`${who} arkadaşlık isteğini reddetti ✕`});
              }
            } else if(ev.type==="removed"){
              const fr = await get(ref(db,`friends/${user.uid}/${fromUid}`));
              if(fr.exists()){
                await remove(ref(db,`friends/${user.uid}/${fromUid}`));
                setToastFlash({id:`ev-${user.uid}-${fromUid}-x`, text:`${who} seni arkadaşlıktan çıkardı`});
              }
            }
          }catch{}
          await remove(evRef).catch(()=>{});
        }
      })();
    });
  },[user]);

  // Track my outgoing sent requests (createdAt timestamps for cooldown)
  useEffect(()=>{
    if(!user) return;
    return onValue(ref(db,`friendRequests/${user.uid}/outgoing`),(snap)=>{
      if(!snap.exists()){ setSentRequests({}); return; }
      const raw = snap.val() as Record<string, any>;
      const asTs: Record<string, number> = {};
      Object.entries(raw).forEach(([k, v])=>{ asTs[k] = typeof v==="number" ? v : (v?.createdAt || Date.now()); });
      setSentRequests(asTs);
    });
  },[user]);

  // Self-heal: zaten arkadaş olunan kişiler için takılı kalan istek kayıtlarını temizle
  // (eski yarım kalmış kabul/red işlemlerinden artan veriler)
  useEffect(()=>{
    if(!user) return;
    let cancelled = false;
    void (async ()=>{
      try{
        const fs = await get(ref(db,`friends/${user.uid}`));
        const friendIds = new Set(fs.exists()? Object.keys(fs.val() as Record<string,any>) : []);
        if(friendIds.size===0 || cancelled) return;
        const out = await get(ref(db,`friendRequests/${user.uid}/outgoing`));
        if(out.exists()){
          for(const k of Object.keys(out.val() as Record<string,any>)){
            if(friendIds.has(k)) void remove(ref(db,`friendRequests/${user.uid}/outgoing/${k}`)).catch(()=>{});
          }
        }
        const inc = await get(ref(db,`friendRequests/${user.uid}/incoming`));
        if(inc.exists()){
          for(const k of Object.keys(inc.val() as Record<string,any>)){
            if(friendIds.has(k)) void remove(ref(db,`friendRequests/${user.uid}/incoming/${k}`)).catch(()=>{});
          }
        }
      }catch{}
    })();
    return ()=>{ cancelled=true; };
  },[user]);

  // Listen for incoming server invites
  useEffect(()=>{
    if(!user) return;
    return onValue(ref(db,`serverInvites/${user.uid}`),(snap)=>{
      if(!snap.exists()){ setIncomingServerInvites({}); return; }
      setIncomingServerInvites(snap.val() as Record<string,{serverId:string, serverName:string, fromUid:string, fromName?:string, createdAt:number}>);
    });
  },[user]);

  // Voice: real WebRTC mesh via Firebase signaling
  useEffect(()=>{
    const isDMCall = activeView==="dms" && !!joinedVoice;
    if(!user || !joinedVoice || (!isDMCall && selectedServer==="demo")){
      if(localStreamRef.current){
        localStreamRef.current.getTracks().forEach(tr=>tr.stop());
        localStreamRef.current = null;
      }
      Object.values(pcsRef.current).forEach(pc=>{ try{pc.close();}catch{}} );
      pcsRef.current = {};
      setRemoteStreams({});
      setVoiceParticipants({});
      return;
    }
    const myUid = user.uid;
    const room = `${isDMCall ? "dmSignaling" : "signaling"}/${joinedVoice}`;
    const serverIdSignal = isDMCall ? null : selectedServer;
    let cancelled = false;
    let leaveRoom: (()=>void)|null = null;
    let unsubParticipants: (()=>void)|null = null;
    let unsubOffers: (()=>void)|null = null;
    let unsubAnswers: (()=>void)|null = null;
    const candidateUnsubs: (()=>void)[] = [];
    async function setup(){
      try{
        const stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true, noiseSuppression:true, autoGainControl:true}, video:false});
        if(cancelled){ stream.getTracks().forEach(tr=>tr.stop()); return; }
        localStreamRef.current = stream;
        stream.getAudioTracks().forEach(tr=> tr.enabled = !micMuted);
        leaveRoom = joinSignalRoom(room, serverIdSignal, myUid);
        unsubParticipants = listenForParticipants(room, (uid, added)=>{
          if(uid===user!.uid) return;
          if(added){
            get(ref(db, `users/${uid}/public`)).then(s=>{
              setVoiceParticipants(prev=> ({...prev, [uid]: {profile: s.exists()? s.val(): null, joinedAt: Date.now()}}));
            }).catch(()=> setVoiceParticipants(prev=> ({...prev, [uid]: {profile: null, joinedAt: Date.now()}})));
            if(deterministicInitiator(myUid, uid)){
              createPeer(uid, stream, true);
            }
          } else {
            setVoiceParticipants(prev=>{ const n={...prev}; delete n[uid]; return n; });
            setRemoteStreams(prev=>{ const n={...prev}; delete n[uid]; return n; });
            const pc = pcsRef.current[uid];
            if(pc){ try{pc.close();}catch{}; delete pcsRef.current[uid]; }
          }
        });
        const snap = await get(ref(db, `${room}/participants`));
        if(snap.exists()){
          const vals = snap.val() as Record<string, any>;
          for(const uid of Object.keys(vals)){
            if(uid===myUid) continue;
            get(ref(db, `users/${uid}/public`)).then(s=>{
              setVoiceParticipants(prev=> ({...prev, [uid]: {profile: s.exists()? s.val(): null, joinedAt: vals[uid]?.joinedAt || Date.now()}}));
            });
            if(deterministicInitiator(myUid, uid)){
              setTimeout(()=>{ if(!pcsRef.current[uid]) createPeer(uid, stream, true); }, 350);
            }
          }
        }
        unsubOffers = listenForOffers(room, myUid, async (fromUid, offer)=>{
          // eski çağrılardan kalma (stale) offer'ları yut — ts yoksa veya 90sn'den eskiyse yok say
          const o = offer as RTCSessionDescriptionInit & {ts?:number};
          if(!o?.ts || Date.now()-o.ts > 90_000) return;
          if(pcsRef.current[fromUid]) return;
          await createPeer(fromUid, stream, false, offer);
        });
        unsubAnswers = listenForAnswers(room, myUid, async (fromUid, answer)=>{
          const a = answer as RTCSessionDescriptionInit & {ts?:number};
          if(!a?.ts || Date.now()-a.ts > 90_000) return;
          const pc = pcsRef.current[fromUid];
          if(pc && pc.signalingState !== "stable"){
            try{ await pc.setRemoteDescription(new RTCSessionDescription(answer)); }catch{}
          }
        });
        function createPeer(remoteUid: string, localStream: MediaStream, createOffer: boolean, remoteOffer?: RTCSessionDescriptionInit){
          if(pcsRef.current[remoteUid]) return pcsRef.current[remoteUid];
          const pc = new RTCPeerConnection({iceServers: rtcIceServers});
          pcsRef.current[remoteUid] = pc;
          localStream.getTracks().forEach(tr=> pc.addTrack(tr, localStream));
          // Add a real (muted) video track at negotiation time so the remote side gets ontrack;
          // a real camera/screen track replaces it later via replaceTrack.
          const placeholder = getMutedPlaceholder();
          if(placeholder){
            const sender = pc.addTrack(placeholder.track, placeholder.stream);
            videoSendersRef.current[remoteUid] = sender;
            // Görüşme ortasında peer yeniden kurulduysa (view değişimi/rejoin) şu an
            // paylaşımda olan track'i hemen tak — yoksa karşı taraf siyah görür.
            const live = liveVideoTrackRef.current;
            if(live && live.readyState==="live"){ void sender.replaceTrack(live).catch(()=>{}); }
          }
          pc.ontrack = (e)=>{
            setRemoteStreams(prev=>{
              // Her seferinde YENI MediaStream örneği üret → React re-render →
              // <video>/<audio> ref'leri yeniden bağlanır ve play() tekrar denenir.
              const existing = prev[remoteUid];
              const tracks = existing ? Array.from(existing.getTracks()) : [];
              const list = tracks.filter(t=>t.id!==e.track.id);
              list.push(e.track);
              return {...prev, [remoteUid]: new MediaStream(list)};
            });
          };
          pc.onicecandidate = (e)=>{
            if(e.candidate) void publishCandidate(room, myUid, remoteUid, e.candidate);
          };
          const unsub = listenForCandidates(room, remoteUid, myUid, async (raw)=>{
            const c = raw as RTCIceCandidateInit & {ts?:number};
            if(!c?.ts || Date.now()-c.ts > 120_000) return; // stale candidate
            try{
              const {ts, ...init} = c;
              await pc.addIceCandidate(new RTCIceCandidate(init as RTCIceCandidateInit));
            }catch{}
          });
          candidateUnsubs.push(unsub);
          pc.onconnectionstatechange = ()=>{
            if(pc.connectionState==="closed" || pc.connectionState==="failed"){
              setRemoteStreams(prev=>{ const n={...prev}; delete n[remoteUid]; return n; });
            }
          };
          (async()=>{
            try{
              if(createOffer){
                const offer = await pc.createOffer({offerToReceiveAudio:true, offerToReceiveVideo:true});
                await pc.setLocalDescription(offer);
                await publishOffer(room, myUid, remoteUid, {...offer, ts: Date.now()});
              } else if(remoteOffer){
                await pc.setRemoteDescription(new RTCSessionDescription(remoteOffer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await publishAnswer(room, myUid, remoteUid, {...answer, ts: Date.now()});
              }
            }catch{}
          })();
          return pc;
        }
      }catch(e:any){
        setToast(e?.message?.includes("NotAllowed") ? "mikrofon izni gerekli" : "ses: " + (e?.message||"hata"));
        setJoinedVoice(null);
      }
    }
    setup();
    return ()=>{
      cancelled = true;
      if(leaveRoom) leaveRoom();
      if(unsubParticipants) unsubParticipants();
      if(unsubOffers) unsubOffers();
      if(unsubAnswers) unsubAnswers();
      candidateUnsubs.forEach(fn=>{ try{fn();}catch{}});
      // Ayrılırken kendi camStatus'umuzu temizle (karşı tarafta siyah kutu kalmasın)
      void remove(ref(db, `${room}/camStatus/${myUid}`)).catch(()=>{});
      liveVideoTrackRef.current = null;
      if(localStreamRef.current){
        localStreamRef.current.getTracks().forEach(tr=>tr.stop());
        localStreamRef.current = null;
      }
      Object.values(pcsRef.current).forEach(pc=>{ try{pc.close();}catch{} });
      pcsRef.current = {};
      videoSendersRef.current = {};
    };
  },[user, joinedVoice, selectedServer, activeView]);
  useEffect(()=>{
    if(localStreamRef.current){
      localStreamRef.current.getAudioTracks().forEach(tr=> tr.enabled = !micMuted);
    }  },[micMuted]);
  // deafen -> mute remote playback
  useEffect(()=>{
    document.querySelectorAll<HTMLAudioElement>("audio[data-voice]").forEach(a=>{ a.volume = deafen ? 0 : 1; });
  },[deafen, remoteStreams]);

  // listen for incoming DM calls on all DM threads
  useEffect(()=>{
    if(!user || dmThreads.length===0){ setIncomingCall(null); return; }
    const unsubs = dmThreads.map(t=> listenDmCall(t.id, (snap)=>{
      if(!snap){ return; }
      const fromUid = snap.fromUid as string|undefined;
      const status = snap.status as string|undefined;
      const endedBy = snap.endedBy as string|undefined;
      const acceptedBy = snap.acceptedBy as string|undefined;
      if(!fromUid || fromUid===user.uid) return;
      if(endedBy){ setIncomingCall(prev=> prev?.threadId===t.id ? null : prev); return; }
      if(acceptedBy){ setIncomingCall(prev=> prev?.threadId===t.id ? null : prev); return; }
      if(status==="ringing"){
        setIncomingCall({threadId:t.id, fromUid});
      }
    }));
    return ()=>unsubs.forEach(u=>{ try{u();}catch{} });
  },[user, dmThreads]);

  // resolve caller name for incoming call
  useEffect(()=>{
    if(!incomingCall?.fromUid){ return; }
    get(ref(db, `users/${incomingCall.fromUid}/public`)).then(s=>{
      if(s.exists()){
        const p=s.val() as {displayName?:string, username?:string};
        setIncomingCall(c=> c ? {...c, fromName: p.displayName || p.username} : c);
      }
    }).catch(()=>{});
  },[incomingCall?.fromUid]);

  // persist pip position
  useEffect(()=>{
    if(typeof window!=="undefined"){ try{ localStorage.setItem("akayroom_callPipPos", JSON.stringify(callPipPos)); }catch{} }
  },[callPipPos]);

  // persist lastRead across sessions (debounced)
  useEffect(()=>{
    if(typeof window==="undefined") return;
    const t=setTimeout(()=>{ try{ localStorage.setItem("akayroom_lastRead", JSON.stringify(lastRead)); }catch{} }, 800);
    return ()=>clearTimeout(t);
  },[lastRead]);

  // auto-dismiss flash toast after 3s
  useEffect(()=>{
    if(!toastFlash) return;
    const t = setTimeout(()=> setToastFlash(null), 3000);
    return ()=> clearTimeout(t);
  },[toastFlash?.id]);

  // poll votes: live sync per unique poll id (fixes "poll created but cannot vote")
  const pollIdsKey = useMemo(()=> messages.filter(m=>m.poll).map(m=>m.poll!.id).filter((v,i,a)=>a.indexOf(v)===i).join(","), [messages]);
  useEffect(()=>{
    if(!user || !pollIdsKey){ setPollVotesMap({}); return; }
    const ids = pollIdsKey.split(",");
    const unsubs: (()=>void)[] = [];
    ids.forEach(id=>{
      const u = onValue(ref(db,`pollVotes/${id}`),(snap)=>{
        const v = snap.exists() ? snap.val() as Record<string,string> : {};
        setPollVotesMap(prev=>({...prev,[id]:v}));
      });
      unsubs.push(u);
    });
    return ()=>unsubs.forEach(fn=>{try{fn();}catch{}});
  },[user,pollIdsKey]);

  function castVote(pollId: string, optionId: string){
    if(!user || selectedServer==="demo"){ setToast("demo sunucuda oy yok"); return; }
    set(ref(db,`pollVotes/${pollId}/${user.uid}`), optionId).catch(()=>setToast("oy verilemedi"));
  }

  useEffect(()=>{
    if(!selectedProfileUid){ setSelectedProfile(null); return; }
    setProfileLoading(true);
    get(ref(db,`users/${selectedProfileUid}/public`)).then(s=>{ if(s.exists()) setSelectedProfile(s.val()); else setSelectedProfile(null); setProfileLoading(false); }).catch(()=>setProfileLoading(false));
  },[selectedProfileUid]);

  useEffect(()=>{
    if(showUserSettings){
      setConnGithub(profile?.connections?.github ?? "");
      setConnSpotify(profile?.connections?.spotify ?? "");
      setConnSite(profile?.connections?.site ?? "");
    }
  },[showUserSettings]);

  useEffect(()=>{ messagesEndRef.current?.scrollIntoView({behavior:"smooth"}); },[messages,threadMessages, dmMsgs]);
  useEffect(()=>{
    const h=(e:KeyboardEvent)=>{
      if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="k"){ e.preventDefault(); setShowPalette(v=>!v); }
      if(e.key==="Escape"){ setShowPalette(false); setContextMenu(null); setShowThread(false); setShowMembers(false); setHelpOpen(false); }
    };
    window.addEventListener("keydown",h); return()=>window.removeEventListener("keydown",h);
  },[]);
  useEffect(()=>{ if(!toast) return; const t=setTimeout(()=>setToast(""),2500); return()=>clearTimeout(t); },[toast]);
  useEffect(()=>{ setDraft(drafts[selectedChannel] || ""); },[selectedChannel]);

  const updateDraft=(v:string)=>{
    setDraft(v);
    setDrafts(prev=>({...prev,[selectedChannel]:v}));
    if(!user || selectedServer==="demo" || !selectedChannelData || selectedChannelData.type!=="text") return;
    if(v.length===0){
      remove(ref(db,`typing/${selectedServer}/${selectedChannel}/${user.uid}`)).catch(()=>{});
      lastTypingSentRef.current=0;
      return;
    }
    const now=Date.now();
    if(now - lastTypingSentRef.current < 2000) return;
    lastTypingSentRef.current=now;
    set(ref(db,`typing/${selectedServer}/${selectedChannel}/${user.uid}`),{username: profile?.displayName ?? profile?.username ?? username ?? "anon", timestamp: now});
    if(typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current=setTimeout(()=>{
      remove(ref(db,`typing/${selectedServer}/${selectedChannel}/${user.uid}`)).catch(()=>{});
    },3000);
  };

  async function submitAuth(e:React.FormEvent){
    e.preventDefault(); setAuthError("");
    const clean=normalizeUsername(username);
    if(!validUsername(clean)){ setAuthError("kullanıcı adı 3-24: a-z, 0-9, _ , -"); return; }
    if(password.length<6){ setAuthError("şifre en az 6 karakter"); return; }
    try{
      const cred= registerMode
        ? await createUserWithEmailAndPassword(auth, usernameEmail(clean), password)
        : await signInWithEmailAndPassword(auth, usernameEmail(clean), password);
      if(registerMode){
        const name=displayName.trim()||clean;
        await set(ref(db,`users/${cred.user.uid}/public`),{username:clean, usernameLower:clean, displayName:name, createdAt: serverTimestamp()});
        await set(ref(db,`usernameIndex/${clean}`), cred.user.uid);
        await createStarterServer(cred.user.uid);
      }
    }catch(err){ setAuthError(err instanceof Error ? err.message.replace("Firebase: ","") : "giriş hatası"); }
  }

  async function sendMessage(e?:React.FormEvent){
    if(e) e.preventDefault();
    const content=draft.trim();
    if(!user || selectedServer==="demo") return;
    if(!content && !pendingFile) return;
    if(content && !pendingFile && selectedChannelData?.type!=="text") return;
    if(!selectedChannelData || selectedChannelData.type==="voice"){ setToast("ses kanalına mesaj gönderilmez"); return; }
    if(sendingAttachment) return;
    if(content.startsWith("/") && !pendingFile){
      await handleCommand(content);
      setDraft(""); updateDraft("");
      remove(ref(db,`typing/${selectedServer}/${selectedChannel}/${user.uid}`)).catch(()=>{});
      return;
    }
    let attMeta: MessageAttachmentMeta | null = null;
    let attData: string | null = null;
    if(pendingFile){
      setSendingAttachment(true);
      try{
        const kind = attachmentKind(pendingFile.file);
        attMeta = { type: kind, name: pendingFile.file.name, size: pendingFile.file.size };
        attData = (kind==="image" && pendingFile.preview) ? pendingFile.preview : await fileToDataUrl(pendingFile.file);
        if(attData.length > 9.5*1024*1024){ setToast("dosya çok büyük — sıkıştırılamadı"); setSendingAttachment(false); return; }
      }catch{
        setToast("dosya okunamadı");
        setSendingAttachment(false);
        return;
      }
    }
    const msgRef=push(ref(db,`messages/${selectedServer}/${selectedChannel}`));
    const payload: any = {
      serverId:selectedServer, channelId:selectedChannel, authorId:user.uid,
      content: content || (attMeta ? `[dosya] ${attMeta.name}` : ""),
      authorName: profile?.displayName ?? profile?.username ?? username ?? "anon",
      createdAt: Date.now(),
    };
    if(attMeta) payload.attachment = attMeta;
    if(replyTo) payload.replyTo={ id: replyTo.id, authorName: replyTo.authorName, content: replyTo.content.slice(0,120) };
    try{
      await set(msgRef,payload);
      if(attMeta && attData && msgRef.key){
        try{
          await set(ref(db,`attachments/${selectedServer}/${selectedChannel}/${msgRef.key}`),{authorId:user.uid,type:attMeta.type,name:attMeta.name,mime:pendingFile?.file.type||"application/octet-stream",size:attMeta.size,data:attData});
        }catch{ setToast("ek yüklenemedi"); }
      }
      setDraft(""); updateDraft(""); setReplyTo(null); setPendingFile(null); setSendingAttachment(false);
      remove(ref(db,`typing/${selectedServer}/${selectedChannel}/${user.uid}`)).catch(()=>{});
    }catch(e:any){
      setToast(e?.message ? `mesaj gönderilemedi: ${e.message.slice(0,80)}` : "mesaj gönderilemedi — bağlantını kontrol et");
      setSendingAttachment(false);
    }
  }

  function handleFileSelected(file: File){
    if(!user || selectedServer==="demo"){ setToast("önce bir sunucuya katıl"); return; }
    const kind = attachmentKind(file);
    const cap = (kind==="video"||kind==="audio") ? 5*1024*1024 : (kind==="image" ? 15*1024*1024 : 2*1024*1024);
    if(file.size > cap){ setToast(`çok büyük — ${kind==="file"?"dosya":"medya"} sınırı ${fmtSize(cap)}`); return; }
    setShowPlusMenu(false);
    if(kind==="image"){
      compressImage(file).then(preview=>setPendingFile({file,preview})).catch(()=>setPendingFile({file}));
    } else {
      setPendingFile({file});
    }
  }

  async function loadAttachment(m: ChatMessage){
    if(!m.attachment) return;
    setAttCache(prev=>({...prev,[m.id]:{loading:true}}));
    try{
      const s=await get(ref(db,`attachments/${m.serverId}/${m.channelId}/${m.id}`));
      if(s.exists()){
        const v=s.val() as {data:string,mime?:string,type?:MessageAttachmentMeta["type"]};
        setAttCache(prev=>({...prev,[m.id]:{loading:false,dataUrl:v.data,mime:v.mime,type:v.type}}));
      } else {
        setAttCache(prev=>({...prev,[m.id]:{loading:false,error:"ek bulunamadı"}}));
      }
    }catch{
      setAttCache(prev=>({...prev,[m.id]:{loading:false,error:"ek açılamadı"}}));
    }
  }

  async function downloadAttachment(m: ChatMessage){
    if(!m.attachment) return;
    let c=attCache[m.id];
    if(!c?.dataUrl){ await loadAttachment(m); c=attCache[m.id]; }
    const dataUrl=c?.dataUrl;
    if(!dataUrl){ setToast(c?.error||"indirilemedi"); return; }
    const a=document.createElement("a");
    a.href=dataUrl; a.download=m.attachment.name||"dosya";
    document.body.appendChild(a); a.click(); a.remove();
  }

  async function handleCommand(cmd:string){
    const c=cmd.toLowerCase();
    if(c.startsWith("/help")){ setHelpOpen(true); return; }
    else if(c.startsWith("/giphy")){ setToast("giphy için ＋ → GIF kullan"); return; }
    else if(c.startsWith("/shrug")){ const msg= "¯\\_(ツ)_/¯ "+cmd.slice(7); const r=push(ref(db,`messages/${selectedServer}/${selectedChannel}`)); set(r,{serverId:selectedServer,channelId:selectedChannel,authorId:user!.uid,content:msg,authorName:profile?.displayName??username,createdAt:Date.now()}); return; }
    else if(c.startsWith("/me")){ const msg= `*${profile?.displayName??username} ${cmd.slice(4)}*`; const r=push(ref(db,`messages/${selectedServer}/${selectedChannel}`)); set(r,{serverId:selectedServer,channelId:selectedChannel,authorId:user!.uid,content:msg,authorName:profile?.displayName??username,createdAt:Date.now()}); return; }
    else if(c.startsWith("/clear")){ setToast("yerel önbellek temizlendi — yenilemede mesajlar geri gelir"); setMessages([]); return; }
    else if(c.startsWith("/invite")){ setShowInvite(true); return; }
    else if(c.startsWith("/poll")){ setShowPoll(true); return; }
    else if(c.startsWith("/nick")){ const n=cmd.slice(6).trim(); if(n) set(ref(db,`users/${user!.uid}/public/displayName`),n).then(()=>setProfile(p=>p?{...p,displayName:n}:p)); setToast("nick → "+n); return; }
    else if(c.startsWith("/github")){
      const arg = cmd.slice(8).trim();
      if(!arg){ setToast("kullanım: /github vercel/next.js"); return; }
      const repo = arg.split(/\s+/)[0].replace(/^https:\/\/github\.com\//,"").replace(/\.git$/,"");
      if(!/^[^\/\s]+\/[^\/\s]+$/.test(repo)){ setToast("geçersiz repo — örnek: vercel/next.js"); return; }
      if(!user){ setToast("giriş gerekli"); return; }
      if(selectedServer==="demo"){ setToast("demo sunucuda mesaj yok"); return; }
      setToast(`github: ${repo} aranıyor…`);
      try{
        const res = await fetch(`https://api.github.com/repos/${repo}`,{headers:{Accept:"application/vnd.github+json"}});
        if(!res.ok) throw new Error(res.status===404 ? "repo bulunamadı" : `github ${res.status}`);
        const j = await res.json();
        const card: GithubCard = {fullName: j.full_name, description: j.description ?? null, stars: j.stargazers_count, forks: j.forks_count, language: j.language ?? null, htmlUrl: j.html_url, ownerAvatar: j.owner?.avatar_url, ownerLogin: j.owner?.login};
        const r=push(ref(db,`messages/${selectedServer}/${selectedChannel}`));
        await set(r,{serverId:selectedServer, channelId:selectedChannel, authorId:user.uid, authorName:profile?.displayName??username, content:`[github] ${card.fullName} — ${card.description||""}`.trim(), createdAt: Date.now(), githubCard: card});
        setToast(`✓ ${card.fullName}`);
      }catch(e:any){ setToast(e?.message || "github hatası"); }
      return;
    }
    else if(c.startsWith("/music") || c.startsWith("/song")){
      const prefix = c.startsWith("/music") ? 6 : 5;
      const q = cmd.slice(prefix).trim();
      if(!q){ setToast("kullanım: /music <şarkı - sanatçı>   örnek: /music tarkan şımarık"); return; }
      if(!user){ setToast("giriş gerekli"); return; }
      if(selectedServer==="demo"){ setToast("demo sunucuda mesaj yok"); return; }
      setToast(`music: "${q}" aranıyor…`);
      try{
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=1`);
        const data = await res.json();
        const first = data.results?.[0];
        if(!first) throw new Error("sonuç yok");
        const card: MusicCard = {trackName: first.trackName, artistName: first.artistName, artworkUrl: (first.artworkUrl100 as string)?.replace("100x100","300x300") ?? first.artworkUrl100, previewUrl: first.previewUrl ?? null, trackViewUrl: first.trackViewUrl, collectionName: first.collectionName, primaryGenre: first.primaryGenreName};
        const r=push(ref(db,`messages/${selectedServer}/${selectedChannel}`));
        await set(r,{serverId:selectedServer, channelId:selectedChannel, authorId:user.uid, authorName:profile?.displayName??username, content:`🎵 ${card.trackName} — ${card.artistName}`, createdAt: Date.now(), musicCard: card});
        setToast(`♪ ${card.trackName}`);
      }catch(e:any){ setToast(e?.message || "music hatası"); }
      return;
    }
    else if(c.startsWith("/np") || c.startsWith("/playing") || c.startsWith("/dinliyor")){
      const cmdLower = c;
      let q = "";
      if(cmdLower.startsWith("/np")) q = cmd.slice(3).trim();
      else if(cmdLower.startsWith("/playing")) q = cmd.slice(8).trim();
      else q = cmd.slice(9).trim();
      if(!user){ setToast("giriş gerekli"); return; }
      if(!q || q.toLowerCase()==="clear" || q.toLowerCase()==="off" || q.toLowerCase()==="kapat"){
        try{
          await update(ref(db,`users/${user.uid}/public`),{nowPlaying: null});
          setProfile(p=> p ? {...p, nowPlaying: null} : p);
          setToast("dinliyor durumu temizlendi");
        }catch{ setToast("temizlenemedi"); }
        return;
      }
      setToast(`dinliyor: "${q}" aranıyor…`);
      try{
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=1`);
        const data = await res.json();
        const first = data.results?.[0];
        if(!first) throw new Error("şarkı bulunamadı");
        const np = {track: first.trackName, artist: first.artistName, artwork: (first.artworkUrl100 as string)?.replace("100x100","300x300") ?? first.artworkUrl100, previewUrl: first.previewUrl ?? null, url: first.trackViewUrl, genre: first.primaryGenreName, updatedAt: Date.now()};
        await update(ref(db,`users/${user.uid}/public`),{nowPlaying: np});
        setProfile(p=> p ? {...p, nowPlaying: np} : p);
        setToast(`♪ şimdi dinliyor: ${np.track} — ${np.artist}`);
      }catch(e:any){ setToast(e?.message || "np hatası"); }
      return;
    }
    else setToast(`bilinmeyen komut: ${cmd.split(" ")[0]} — /help yaz`);
  }

  async function searchGifs(){
    const key=process.env.NEXT_PUBLIC_GIPHY_API_KEY || "R8c1dYdCtzP7qoeRcFqk7hCjex1lNSYZ";
    if(!key || !gifSearch.trim()){ setGifResults([]); setToast("Giphy anahtarı yok"); return; }
    try{
      const res=await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(gifSearch)}&limit=6`);
      const data=await res.json();
      setGifResults(data.data?.map((x:any)=>x.images?.fixed_height?.url).filter(Boolean)??[]);
    }catch{ setToast("giphy hatası"); }
  }

  async function createServer(){
    if(!user || !newServerName.trim() || creatingServer) return;
    setCreatingServer(true);
    const name=newServerName.trim();
    try{
      const sRef=push(ref(db,"servers"));
      if(!sRef.key) return;
      const now=serverTimestamp();
      await set(sRef,{name, iconUrl: newServerIcon || null, ownerId:user.uid, createdAt: now});
      await set(ref(db,`serverMembers/${sRef.key}/${user.uid}`),{role:"owner",joinedAt:now});
      await set(ref(db,`users/${user.uid}/servers/${sRef.key}`), true);
      const catId=push(ref(db,`categories/${sRef.key}`)).key!;
      await set(ref(db,`categories/${sRef.key}/${catId}`),{name:"SOHBET", position:0});
      const ch1=push(ref(db,`channels/${sRef.key}`)); await set(ch1,{name:"genel", type:"text", position:0, categoryId:catId, createdAt:now});
      const ch2=push(ref(db,`channels/${sRef.key}`)); await set(ch2,{name:"sesli-oda", type:"voice", position:1, categoryId:null, createdAt:now});
      setSelectedServer(sRef.key); setSelectedChannel(ch1.key!);
      setShowCreateServer(false); setNewServerName(""); setToast(`sunucu: ${name}`);
    }catch(err){
      setToast(err instanceof Error ? err.message : "sunucu oluşturulamadı");
    }finally{
      setCreatingServer(false);
    }
  }

  async function createChannel(){
    if(!user || selectedServer==="demo" || !newChannelName.trim()) return;
    try{
      const chRef=push(ref(db,`channels/${selectedServer}`));
      await set(chRef,{name:newChannelName.trim().toLowerCase().replace(/\s+/g,"-"), type:newChannelType, position: channels.length, categoryId: newChannelCat || null, createdAt: serverTimestamp()});
      setShowCreateChannel(false); setNewChannelName(""); setToast(`#${newChannelName}`);
    }catch(e:any){ setToast(e?.message ? `kanal oluşturulamadı: ${e.message.slice(0,60)}` : "kanal oluşturulamadı"); }
  }
  async function deleteChannel(channelId: string){
    if(!user || selectedServer==="demo") return;
    if(!confirm("kanalı silmek istiyor musun? mesajlar da silinecek.")) return;
    try{
      await remove(ref(db,`channels/${selectedServer}/${channelId}`));
      await remove(ref(db,`messages/${selectedServer}/${channelId}`));
      await remove(ref(db,`attachments/${selectedServer}/${channelId}`)).catch(()=>{});
      await remove(ref(db,`signaling/${channelId}`));
      if(selectedChannel===channelId){
        const remaining = channels.filter(c=>c.id!==channelId);
        if(remaining[0]) setSelectedChannel(remaining[0].id);
      }
      setToast("kanal silindi");
    }catch(e:any){ setToast(e?.message ? `silinemedi: ${e.message.slice(0,60)}` : "silinemedi"); }
    setChannelMenu(null);
  }
  async function saveChannelEdit(){
    if(!editingChannel || !user || selectedServer==="demo") return;
    const newName = editChannelName.trim().toLowerCase().replace(/\s+/g,"-");
    if(!newName) return;
    try{
      await update(ref(db,`channels/${selectedServer}/${editingChannel.id}`),{name:newName, topic: editChannelTopic.trim() || null});
      setToast("kanal güncellendi");
      setEditingChannel(null);
    }catch(e:any){ setToast(e?.message ? `güncellenemedi: ${e.message.slice(0,60)}` : "güncellenemedi"); }
  }
  function startCall(){
    if(!user || selectedServer==="demo") return;
    if(!selectedChannelData) return;
    // For voice channel, just join; for text, also join as call
    setJoinedVoice(selectedChannel);
    setCallPip(false);
    setToast(`arama başlatıldı — #${selectedChannelData.name}`);
  }

  async function startDMCall(){
    if(!user || !selectedDm) return;
    const thread = dmThreads.find(d=>d.id===selectedDm);
    const otherUid = thread?.otherUid;
    if(joinedVoice===selectedDm){
      await endDmCall(selectedDm, user.uid).catch(()=>{});
      setJoinedVoice(null);
      setToast("DM araması sona erdi");
      return;
    }
    if(!otherUid){ setToast("karşı taraf bulunamadı"); return; }
    await endDmCall(selectedDm, user.uid).catch(()=>{});
    await ringDmCall(selectedDm, {fromUid:user.uid, status:"ringing"}).catch(()=>setToast("arama gönderilemedi"));
    setJoinedVoice(selectedDm);
    setCallPip(false);
    setToast("arama yapılıyor…");
  }

  async function acceptDMCall(){
    if(!user || !incomingCall) return;
    const threadId = incomingCall.threadId;
    setIncomingCall(null);
    setSelectedDm(threadId);
    setActiveView("dms");
    await acceptDmCall(threadId, user.uid).catch(()=>{});
    setJoinedVoice(threadId);
    setCallPip(false);
  }

  async function rejectDMCall(){
    if(!user || !incomingCall) return;
    const threadId = incomingCall.threadId;
    setIncomingCall(null);
    await endDmCall(threadId, user.uid).catch(()=>{});
    setToast("aramayı reddettin");
  }

  async function hangUpVoice(){
    if(!user || !joinedVoice) return;
    if(activeView==="dms"){
      await endDmCall(joinedVoice, user.uid).catch(()=>{});
    }
    stopCamAndScreen();
    setJoinedVoice(null);
  }

  // Replace the video track on all peer connections (no renegotiation needed)
  function replaceVideoTrackOnAllPeers(track: MediaStreamTrack | null){
    Object.entries(videoSendersRef.current).forEach(([uid, sender])=>{
      void sender.replaceTrack(track).catch(()=>{});
    });
  }

  // A black 1x1 video track so negotiation has a real video track; replaced later by camera/screen
  function getMutedPlaceholder(){
    if(mutedAvRef.current) return mutedAvRef.current;
    const canvas = typeof document!=="undefined" ? document.createElement("canvas") : null;
    if(canvas){
      canvas.width = 1; canvas.height = 1;
      const ctx = canvas.getContext("2d");
      if(ctx) ctx.fillRect(0,0,1,1);
      const stream = canvas.captureStream(1);
      const track = stream.getVideoTracks()[0];
      if(track) track.enabled = true;
      mutedAvRef.current = {track, stream};
      return mutedAvRef.current;
    }
    return null;
  }

  function setCamRemoteStatus(status: "on"|"screen"|null){
    if(!user || !joinedVoice) return;
    const roomKey = `${activeView==="dms" ? "dmSignaling" : "signaling"}/${joinedVoice}`;
    if(status===null){ void remove(ref(db, `${roomKey}/camStatus/${user.uid}`)).catch(()=>{}); }
    else { void set(ref(db, `${roomKey}/camStatus/${user.uid}`), status).catch(()=>{}); }
  }

  // Listen for others' camera/screen status in the current room
  useEffect(()=>{
    if(!user || !joinedVoice){ setRemoteCamStatus({}); return; }
    const roomKey = `${activeView==="dms" ? "dmSignaling" : "signaling"}/${joinedVoice}`;
    return onValue(ref(db, `${roomKey}/camStatus`), (snap)=>{
      if(!snap.exists()){ setRemoteCamStatus({}); return; }
      setRemoteCamStatus(snap.val() as Record<string,"on"|"screen">);
    });
  },[user, joinedVoice, activeView]);

  function stopCamAndScreen(){
    const cam = camStreamRef.current;
    if(cam){ cam.getTracks().forEach(tr=>{try{tr.stop();}catch{}}); camStreamRef.current = null; }
    const scr = screenStreamRef.current;
    if(scr){ scr.getTracks().forEach(tr=>{try{tr.stop();}catch{}}); screenStreamRef.current = null; }
    screenCaptureActive.current = false;
    liveVideoTrackRef.current = null;
    setCamOn(false);
    setScreenSharing(false);
    setCamRemoteStatus(null);
  }

  async function toggleCam(){
    if(!user || !joinedVoice) return;
    if(camOn){
      const cam = camStreamRef.current;
      if(cam){ cam.getTracks().forEach(tr=>{try{tr.stop();}catch{}}); camStreamRef.current = null; }
      if(liveVideoTrackRef.current && cam && cam.getTracks().includes(liveVideoTrackRef.current)) liveVideoTrackRef.current = null;
      setCamOn(false);
      setCamRemoteStatus(null);
      replaceVideoTrackOnAllPeers(null);
      return;
    }
    try{
      const cam = await navigator.mediaDevices.getUserMedia({audio:false, video:{width:{ideal:1280}, height:{ideal:720}, frameRate:{ideal:30}}});
      camStreamRef.current = cam;
      const vtr = cam.getVideoTracks()[0];
      liveVideoTrackRef.current = vtr;
      replaceVideoTrackOnAllPeers(vtr);
      setCamOn(true);
      setScreenSharing(false);
      setCamRemoteStatus("on");
    }catch(e:any){
      setToast(e?.message?.includes("NotAllowed") ? "kamera izni gerekli" : "kamera: " + (e?.message||"hata"));
    }
  }

  // Screen share with canvas re-encode at chosen resolution/fps
  async function startScreenShare(){
    if(!user || !joinedVoice) return;
    setShowScreenPanel(false);
    try{
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: {width:{ideal:1920}, height:{ideal:1080}, frameRate:{ideal:60}},
        audio: false,
      });
      // stop previous cam stream so screen replaces it visually
      if(camStreamRef.current){ camStreamRef.current.getTracks().forEach(tr=>{try{tr.stop();}catch{}}); camStreamRef.current = null; }
      setCamOn(false);

      const vtr = display.getVideoTracks()[0];
      const canvas = screenCanvasRef.current || document.createElement("canvas");
      screenCanvasRef.current = canvas;
      const ctx = canvas.getContext("2d")!;
      const videoEl = document.createElement("video");
      videoEl.srcObject = display;
      videoEl.muted = true;
      await videoEl.play().catch(()=>{});

      const ctrl = new MediaStream();
      let cap: MediaStream | null = null;
      let capFps = 0;
      let pumpTimer = 0;
      const settings = () => screenSettingsRef.current;

      const stopCapture = () => {
        if(cap){ cap.getTracks().forEach(t=>{try{t.stop();}catch{}}); cap = null; capFps = 0; }
      };

      // Tek kare çiz + gerekiyorda capture akışını kur. rAF yerine setTimeout
      // zinciri kullanıyoruz: sekme arka plana geçince rAF tamamen durur ve
      // karşı taraf donuk/siyah görür; setTimeout ise (kısıtlı da olsa) çalışmaya devam eder.
      const drawOnce = () => {
        if(videoEl.videoWidth > 0 && videoEl.videoHeight > 0){
          const s = settings();
          canvas.width = s.w;
          canvas.height = s.h;
          const scale = Math.min(canvas.width / videoEl.videoWidth, canvas.height / videoEl.videoHeight);
          const dw = videoEl.videoWidth * scale;
          const dh = videoEl.videoHeight * scale;
          ctx.fillStyle = "#000";
          ctx.fillRect(0,0,canvas.width,canvas.height);
          ctx.drawImage(videoEl, (canvas.width-dw)/2, (canvas.height-dh)/2, dw, dh);
          // rebuild capture if fps changed
          if(cap && capFps !== s.fps){
            stopCapture();
          }
          if(!cap){
            cap = canvas.captureStream(s.fps);
            capFps = s.fps;
            ctrl.getTracks().forEach(t=>{try{t.stop();}catch{}});
            cap.getVideoTracks().forEach(t=> ctrl.addTrack(t));
            const capTrack = cap.getVideoTracks()[0] || null;
            liveVideoTrackRef.current = capTrack;
            replaceVideoTrackOnAllPeers(capTrack);
          }
        }
      };
      const pump = () => {
        if(!screenCaptureActive.current) return;
        drawOnce();
        const interval = Math.max(15, Math.floor(1000 / Math.max(1, settings().fps * 2)));
        pumpTimer = window.setTimeout(pump, interval);
      };

      screenStreamRef.current = display;
      screenCaptureActive.current = true;
      setScreenSharing(true);
      setCamRemoteStatus("screen");
      pump();

      // when the user stops sharing via browser UI
      vtr.addEventListener("ended", ()=>{
        screenCaptureActive.current = false;
        window.clearTimeout(pumpTimer);
        stopCapture();
        ctrl.getTracks().forEach(t=>{try{t.stop();}catch{}});
        if(display){ display.getTracks().forEach(t=>{try{t.stop();}catch{}}); }
        screenStreamRef.current = null;
        liveVideoTrackRef.current = null;
        replaceVideoTrackOnAllPeers(null);
        setScreenSharing(false);
        setCamRemoteStatus(null);
      });
    }catch(e:any){
      setToast(e?.message?.includes("NotAllowed") ? "ekran paylaşımı izni gerekli" : "paylaşım: " + (e?.message||"hata"));
    }
  }

  async function stopScreenShare(){
    screenCaptureActive.current = false;
    const scr = screenStreamRef.current;
    if(scr){ scr.getTracks().forEach(tr=>{try{tr.stop();}catch{}}); screenStreamRef.current = null; }
    liveVideoTrackRef.current = null;
    replaceVideoTrackOnAllPeers(null);
    setScreenSharing(false);
    setShowScreenPanel(false);
    setCamRemoteStatus(null);
  }


  async function joinViaInvite(){
    if(!joinCode.trim() || !user || joiningInvite) return;
    setJoiningInvite(true);
    const code=joinCode.trim().toUpperCase();
    try{
      const snap=await get(ref(db,`invites/${code}`));
      if(!snap.exists()){ setToast("davet bulunamadı"); return; }
      const inv=snap.val() as any;
      if(inv.expiresAt && Date.now() > inv.expiresAt){ setToast("davet süresi dolmuş"); return; }
      if(inv.maxUses && (inv.uses||0) >= inv.maxUses){ setToast("davet kullanım limiti doldu"); return; }
      // uses'ı transaction ile atomik artır (race kapatıldı) — önce daveti kilitle
      let canJoin=true;
      try{
        const tx:any = await runTransaction(ref(db,`invites/${code}`), (curr:any)=>{
          if(curr===null) return;
          if(curr.expiresAt && Date.now() > curr.expiresAt) return;
          if(curr.maxUses && (curr.uses||0) >= curr.maxUses) return;
          return {...curr, uses: (curr.uses||0)+1};
        });
        if(tx && typeof tx.committed === "boolean" && !tx.committed) canJoin=false;
      }catch{ canJoin=false; }
      if(!canJoin){ setToast("davet kullanım limiti doldu veya süresi doldu"); return; }
      await set(ref(db,`serverMembers/${inv.serverId}/${user.uid}`),{role:"member",joinedAt: serverTimestamp()});
      await set(ref(db,`users/${user.uid}/servers/${inv.serverId}`), true);
      setSelectedServer(inv.serverId);
      setActiveView("server");
      setToast("katıldın");
      setJoinCode("");
    }catch(err){
      setToast(err instanceof Error ? err.message : "davete katılınamadı");
    }finally{
      setJoiningInvite(false);
    }
  }

  function openProfile(uid:string){ setSelectedProfileUid(uid); }

  // ==== Friend request flow ====
  async function sendFriendRequest(targetUid: string, targetName: string){
    if(!user) return;
    if(targetUid===user.uid){ setToast("kendine istek atamazsın"); return; }
    if(friends.some(f=>f.uid===targetUid)){ setToast("zaten arkadaşsınız"); return; }
    const COOLDOWN = 30_000; // 30s
    const lastTs = sentRequests[targetUid] || 0;
    if(lastTs && Date.now() - lastTs < COOLDOWN){
      const left = Math.ceil((COOLDOWN - (Date.now()-lastTs))/1000);
      setToast(`bekleyen istek var — ${left} sn sonra tekrar atabilirsin`);
      return;
    }
    const myName = profile?.displayName || profile?.username || username || "biri";
    try{
      // remove any stale invite on their side first, then send the fresh one
      await remove(ref(db,`friendRequests/${targetUid}/incoming/${user.uid}`)).catch(()=>{});
      await set(ref(db,`friendRequests/${targetUid}/incoming/${user.uid}`), {fromName: myName, createdAt: Date.now()});
      await set(ref(db,`friendRequests/${user.uid}/outgoing/${targetUid}`), {createdAt: Date.now()});
      setToast(`istek gönderildi → ${targetName}`);
    }catch(e){ setToast("istek gönderilemedi"); }
  }

  async function acceptFriendRequest(fromUid: string){
    if(!user) return;
    try{
      // Sadece kendi düğümlerimize yazıyoruz (kurallar buna izin verir).
      // Karşı tarafın friends/outgoing güncellemesini karşı tarafın istemcisi
      // "accepted" eventini alınca yapar (çevrimdışıysa login'de işlenir).
      await set(ref(db,`friends/${user.uid}/${fromUid}`), true);
      await remove(ref(db,`friendRequests/${user.uid}/incoming/${fromUid}`));
      await set(ref(db,`friendRequests/${fromUid}/events/${user.uid}`), {type:"accepted", fromName: profile?.displayName || username || "biri", createdAt: Date.now()});
      setToast("arkadaş oldun ✓");
    }catch{ setToast("işlem başarısız"); }
  }

  async function rejectFriendRequest(fromUid: string, fromName?: string){
    if(!user) return;
    try{
      await remove(ref(db,`friendRequests/${user.uid}/incoming/${fromUid}`));
      await set(ref(db,`friendRequests/${fromUid}/events/${user.uid}`), {type:"rejected", fromName: profile?.displayName || username || "biri", createdAt: Date.now()});
      setToast("istek reddedildi");
    }catch{ setToast("işlem başarısız"); }
  }

  async function cancelFriendRequest(toUid: string){
    if(!user) return;
    try{
      await remove(ref(db,`friendRequests/${user.uid}/outgoing/${toUid}`));
      await remove(ref(db,`friendRequests/${toUid}/incoming/${user.uid}`));
      setToast("istek geri çekildi");
    }catch{ setToast("işlem başarısız"); }
  }

  async function removeFriend(friendUid: string){
    if(!user) return;
    if(!confirm("arkadaşlıktan çıkarılsın mı? karşı taraftan da silinecek.")) return;
    try{
      await remove(ref(db,`friends/${user.uid}/${friendUid}`));
      // Karşı tarafın friends düğümüne yazma iznimiz yok; event ile bildir,
      // kendi tarafını istemcisi temizleyecek. Event anahtarı = gönderen uid.
      await set(ref(db,`friendRequests/${friendUid}/events/${user.uid}`), {type:"removed", fromName: profile?.displayName || username || "biri", createdAt: Date.now()});
      setFriends(prev=> prev.filter(f=>f.uid!==friendUid));
      setToast("arkadaşlıktan çıkarıldı");
    }catch{ setToast("işlem başarısız"); }
  }

  async function inviteFriendToServer(friendUid: string){
    if(!user) return;
    const mine = servers.filter(s=>s.id!=="demo" && myServerIds[s.id]);
    if(mine.length===0){ setToast("önce bir sunucu kur veya bir sunucuya katıl"); return; }
    setInviteFriendTarget(friendUid);
    setInviteFriendServer(mine[0].id);
  }

  async function sendInviteToServer(friendUid: string, serverId: string){
    if(!user || !serverId) return;
    try{
      const server = servers.find(s=>s.id===serverId);
      await set(ref(db,`serverInvites/${friendUid}/${Date.now()}`), {
        serverId,
        serverName: server?.name || "bir sunucu",
        fromUid: user.uid,
        fromName: profile?.displayName || username || "biri",
        createdAt: Date.now(),
      });
      setInviteFriendTarget(null);
      setToast("sunucu daveti gönderildi");
    }catch{ setToast("davet gönderilemedi"); }
  }

  async function acceptServerInvite(inviteId: string, inv: {serverId:string}){
    if(!user) return;
    try{
      const {serverId} = inv;
      await set(ref(db,`serverMembers/${serverId}/${user.uid}`), {role:"member", joinedAt: serverTimestamp()});
      await set(ref(db,`users/${user.uid}/servers/${serverId}`), true);
      await remove(ref(db,`serverInvites/${user.uid}/${inviteId}`));
      setSelectedServer(serverId);
      setActiveView("server");
      setToast("sunucuya katıldın ✓");
    }catch(e){ setToast("katılınamadı"); }
  }

  async function declineServerInvite(inviteId: string){
    if(!user) return;
    await remove(ref(db,`serverInvites/${user.uid}/${inviteId}`)).catch(()=>{});
  }

  async function handleAvatarFile(file: File, forProfile=true){
    if(!user || !file) return;
    if(file.size > 4*1024*1024){ setToast("fotoğraf 4MB'dan küçük olmalı"); return; }
    const url = URL.createObjectURL(file);
    setCropTarget({type:"avatar", file, url});
    setCropPos({x:0,y:0});
    setCropZoom(0.5);
  }
  async function handleBannerFile(file: File){
    if(!user || !file) return;
    if(file.size > 4*1024*1024){ setToast("banner 4MB'dan küçük olmalı"); return; }
    const url = URL.createObjectURL(file);
    setCropTarget({type:"banner", file, url});
    setCropPos({x:0,y:0});
    setCropZoom(0.5);
  }

  async function startDM(otherUid: string){
    if(!user || otherUid===user.uid) return;
    // server-side check first (fresh)
    try{
      const snap = await get(ref(db,"dmThreads"));
      if(snap.exists()){
        const all = snap.val() as Record<string, any>;
        let bestId: string|null = null;
        let bestAt = -1;
        for(const [id, val] of Object.entries(all)){
          const parts = (val as any).participants as Record<string, boolean>|undefined;
          if(!parts || !parts[user.uid] || !parts[otherUid]) continue;
          // ensure exactly these two participants (or at least both)
          const keys = Object.keys(parts);
          if(keys.length!==2) continue;
          const at = (val as any).lastMessageAt || (val as any).createdAt || 0;
          if(at > bestAt){ bestAt = at; bestId = id; }
        }
        if(bestId){
          setSelectedDm(bestId);
          (setActiveView as any)("dms" as any);
          return;
        }
      }
    }catch{}
    // also check local cache
    const local = dmThreads.find(d=>d.otherUid===otherUid);
    if(local){ setSelectedDm(local.id); (setActiveView as any)("dms" as any); return; }
    // deterministic ID to prevent future duplicates: dm_<sortedUid1>_<sortedUid2>
    const detId = ["dm", ...[user.uid, otherUid].sort()].join("_");
    const detRef = ref(db, `dmThreads/${detId}`);
    try{
      const existingDet = await get(detRef);
      if(existingDet.exists()){
        setSelectedDm(detId);
        (setActiveView as any)("dms" as any);
        return;
      }
    }catch{}
    const now = Date.now();
    // try deterministic first
    try{
      await set(detRef, {participants:{[user.uid]:true, [otherUid]:true}, createdAt: now, lastMessageAt: now});
      setSelectedDm(detId);
    }catch{
      // fallback to push if fails (e.g., already exists race)
      const threadRef = push(ref(db,"dmThreads"));
      await set(threadRef, {participants:{[user.uid]:true, [otherUid]:true}, createdAt: now, lastMessageAt: now});
      setSelectedDm(threadRef.key!);
    }
    (setActiveView as any)("dms" as any);
  }

  async function sendDMMessage(){
    const content=dmDraft.trim();
    if(!user || !selectedDm || (!content && !dmPendingFile)) return;
    try{
      let attachment: MessageAttachmentMeta|null=null;
      let data: string|null=null;
      if(dmPendingFile){
        attachment={type:attachmentKind(dmPendingFile.file), name:dmPendingFile.file.name, size:dmPendingFile.file.size};
        data=attachment.type==="image" && dmPendingFile.preview ? dmPendingFile.preview : await fileToDataUrl(dmPendingFile.file);
        if(data.length>9.5*1024*1024){ setToast("DM dosyası çok büyük"); return; }
      }
      const r=push(ref(db,`dmMessages/${selectedDm}`));
      await set(r,{authorId:user.uid, content:content || `[dosya] ${attachment!.name}`, createdAt:Date.now(), attachment});
      if(attachment && data && r.key) await set(ref(db,`dmAttachments/${selectedDm}/${r.key}`),{authorId:user.uid,type:attachment.type,name:attachment.name,size:attachment.size,mime:dmPendingFile!.file.type,data});
      await update(ref(db,`dmThreads/${selectedDm}`),{lastMessageAt:Date.now()});
      setDmDraft(""); setDmPendingFile(null);
    }catch(e:any){ setToast(e?.message ? `DM gönderilemedi: ${e.message.slice(0,60)}` : "DM gönderilemedi"); }
  }

  async function deleteDMMessage(id:string){
    if(!user || !selectedDm) return;
    const msg=dmMsgs.find(m=>m.id===id);
    if(!msg || msg.authorId!==user.uid){setToast("sadece kendi mesajın");return;}
    try{ await remove(ref(db,`dmMessages/${selectedDm}/${id}`)); }catch(e:any){ setToast("silinemedi"); }
  }

  async function saveDMEdit(){
    if(!user || !selectedDm || !dmEditingId || !dmEditContent.trim()) return;
    const msg=dmMsgs.find(m=>m.id===dmEditingId);
    if(!msg || msg.authorId!==user.uid){setToast("sadece kendi mesajın");return;}
    try{
      await update(ref(db,`dmMessages/${selectedDm}/${dmEditingId}`),{content:dmEditContent.trim(),editedAt:Date.now()});
      setDmEditingId(null); setDmEditContent("");
    }catch(e:any){ setToast("düzenlenemedi"); }
  }

  function handleDmFile(file: File){
    const kind=attachmentKind(file);
    const cap=kind==="video"||kind==="audio" ? 5*1024*1024 : kind==="image" ? 15*1024*1024 : 2*1024*1024;
    if(file.size>cap){setToast(`DM dosyası çok büyük — sınır ${fmtSize(cap)}`); return;}
    if(kind==="image") compressImage(file).then(preview=>setDmPendingFile({file,preview}));
    else setDmPendingFile({file});
  }

  async function loadDmAttachment(m: {id:string, attachment?:MessageAttachmentMeta|null}){
    if(!m.attachment || !selectedDm) return;
    setDmAttachmentCache(p=>({...p,[m.id]:{loading:true}}));
    try{
      const s=await get(ref(db,`dmAttachments/${selectedDm}/${m.id}`));
      if(s.exists()) setDmAttachmentCache(p=>({...p,[m.id]:{dataUrl:(s.val() as any).data}}));
      else setDmAttachmentCache(p=>({...p,[m.id]:{error:"ek bulunamadı"}}));
    }catch{setDmAttachmentCache(p=>({...p,[m.id]:{error:"ek açılamadı"}}));}
  }

  async function createInvite(){
    if(!user || selectedServer==="demo") return;
    const charset="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const gen=()=> Array.from(crypto.getRandomValues(new Uint8Array(6)), b=>charset[b%charset.length]).join('');
    let code=gen(); let tries=0;
    while(tries<10){
      const snap=await get(ref(db,`invites/${code}`));
      if(!snap.exists()) break;
      code=gen(); tries++;
      if(tries>=10){ setToast("davet oluşturulamadı, tekrar dene"); return; }
    }
    try{
      await set(ref(db,`invites/${code}`),{serverId:selectedServer, createdBy:user.uid, createdAt:Date.now(), uses:0, maxUses: 50, expiresAt: Date.now()+7*24*60*60*1000});
      setInviteCode(code); setToast(`davet: ${code}`);
    }catch(e:any){ setToast(e?.message ? `davet oluşturulamadı: ${e.message.slice(0,60)}` : "davet oluşturulamadı"); }
  }

  // reactions: live sync from DB (fixes disappearing reactions)
  useEffect(()=>{
    if(!user || selectedServer==="demo" || !selectedChannel){ setReactionMap({}); return; }
    return onValue(ref(db,`reactions/${selectedServer}/${selectedChannel}`),(snap)=>{
      const out: Record<string, Record<string,{count:number,me:boolean}>> = {};
      if(snap.exists()){
        const v=snap.val() as Record<string, Record<string, Record<string, boolean>>>;
        Object.entries(v).forEach(([mid,emojis])=>{
          Object.entries(emojis||{}).forEach(([emoji,users])=>{
            const ids=Object.keys(users||{});
            if(ids.length===0) return;
            out[mid]=out[mid]||{};
            out[mid][emoji]={count:ids.length, me: !!users[user!.uid]};
          });
        });
      }
      setReactionMap(out);
    });
  },[user,selectedServer,selectedChannel]);

  // threads: persist + live sync (fixes disappearing thread replies)
  useEffect(()=>{
    if(!showThread || !threadParent) return;
    return onValue(ref(db,`threadMessages/${threadParent.id}`),(snap)=>{
      const arr:ChatMessage[]=[];
      snap.forEach(c=>{
        const v=c.val() as any;
        arr.push({id:c.key??"", serverId:threadParent.serverId, channelId:threadParent.channelId, authorId:v.authorId, authorName:v.authorName, content:v.content, createdAt:v.createdAt});
      });
      arr.sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
      setThreadMessages(prev=>({...prev,[threadParent.id]:arr}));
    });
  },[showThread,threadParent]);

  function toggleReaction(msgId:string, emoji:string){
    if(!user || selectedServer==="demo") { setToast("demo sunucuda tepki yok"); return; }
    const rRef=ref(db,`reactions/${selectedServer}/${selectedChannel}/${msgId}/${emoji}/${user.uid}`);
    get(rRef).then(s=>{ if(s.exists()) remove(rRef); else set(rRef,true); }).catch(()=>{});
  }

  async function deleteMessage(msg:ChatMessage){
    if(!user || msg.authorId!==user.uid) { setToast("sadece kendi mesajın"); return; }
    await remove(ref(db,`messages/${msg.serverId}/${msg.channelId}/${msg.id}`));
    setToast("silindi");
  }

  async function editMessage(){
    if(!editingId || !editContent.trim() || !user) return;
    const msg=messages.find(m=>m.id===editingId);
    if(!msg || msg.authorId!==user.uid) return;
    await update(ref(db,`messages/${msg.serverId}/${msg.channelId}/${msg.id}`),{content: editContent.trim(), editedAt: Date.now()});
    setEditingId(null); setEditContent("");
  }

  function openThread(msg:ChatMessage){
    setThreadParent(msg); setShowThread(true);
  }

  function sendThread(){
    if(!threadParent || !threadDraft.trim() || !user) return;
    const r=push(ref(db,`threadMessages/${threadParent.id}`));
    void set(r,{authorId:user.uid, authorName: profile?.displayName ?? profile?.username ?? username ?? "anon", content: threadDraft.trim(), createdAt: Date.now()});
    setThreadDraft("");
  }

  function handleComposerKey(e:React.KeyboardEvent<HTMLTextAreaElement>){
    if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); sendMessage(); }
  }

  const typingText = useMemo(()=>{
    const arr=Object.values(typingUsers);
    if(arr.length===0) return "";
    if(arr.length===1) return `${arr[0].username} yazıyor…`;
    if(arr.length===2) return `${arr[0].username} ve ${arr[1].username} yazıyor…`;
    return `${arr.length} kişi yazıyor…`;
  },[typingUsers]);

  const isDemo = selectedServer==="demo";

  if(authLoading) return <main className="loading-screen">AKAYROOM — YÜKLENİYOR…</main>;
  if(!user){
    if(showLanding) return <Landing onLogin={()=>{setShowLanding(false); setRegisterMode(false);}} onRegister={()=>{setShowLanding(false); setRegisterMode(true);}} />;
    return <AuthScreen registerMode={registerMode} setRegisterMode={setRegisterMode} username={username} setUsername={setUsername} password={password} setPassword={setPassword} displayName={displayName} setDisplayName={setDisplayName} error={authError} onSubmit={submitAuth} configured={firebaseConfigured} onBack={()=>setShowLanding(true)} />;
  }

  const paletteItems=[
    ...channels.filter(c=>c.type!=="voice").slice(0,8).map(c=>({
      id:"ch-"+c.id,
      label:`Kanala git: #${c.name}`,
      action:()=>{ setActiveView("server"); setSelectedChannel(c.id); setShowPalette(false); },
      kbd:"#",
    })),
    {id:"2",label:"Davet oluştur",action:()=>{setShowInvite(true); setShowPalette(false);},kbd:"/invite"},
    {id:"3",label:"Sunucu oluştur",action:()=>{setShowCreateServer(true); setShowPalette(false);},kbd:"⌘ N"},
    {id:"4",label:"Komutlar: /help",action:()=>{setHelpOpen(true); setShowPalette(false);},kbd:"/"},
    {id:"5",label:"Anket başlat (/poll)",action:()=>{setShowPoll(true); setShowPalette(false);},kbd:"/poll"},
    {id:"6",label:"GitHub repo kartı (/github)",action:()=>{setHelpOpen(true); setShowPalette(false);},kbd:"/github"},
    {id:"7",label:"Şarkı paylaş (/music)",action:()=>{setHelpOpen(true); setShowPalette(false);},kbd:"/music"},
    {id:"8",label:"Dinliyor durumu (/np)",action:()=>{setHelpOpen(true); setShowPalette(false);},kbd:"/np"},
  ].filter(it=> !paletteQ || it.label.toLowerCase().includes(paletteQ.toLowerCase()));

  return (
    <main className={`app-shell ${!showMembers || isDemo ? "no-members" : ""}`} onClick={()=>{setContextMenu(null); setChannelMenu(null); setMobileSidebarOpen(false);}}>
      <aside className="server-rail">
        <div className="brand-mark">AR</div>
        <div className="rail-divider"/>
        <button className={`server-icon dm ${activeView==="servers"?"active":""}`} onClick={()=>setActiveView("servers")} title="Sunucular"><span className="icon"><Icon name="grid"/></span></button>
        <button className={`server-icon dm ${activeView==="friends"?"active":""}`} onClick={()=>setActiveView("friends")} title="Arkadaşlar"><span className="icon"><Icon name="users"/></span>{(Object.keys(friendRequests).length > 0 || Object.keys(incomingServerInvites).length > 0) && <span className="unread-badge rail-badge">{Object.keys(friendRequests).length + Object.keys(incomingServerInvites).length}</span>}</button>
        <div className="rail-divider" style={{marginTop:8}}/>
        <div style={{flex:1}}/>
        <button onClick={()=>setActiveView("profile")} style={{width:44, height:44, border:"1px solid var(--border)", background: (activeView as any)==="profile" ? "var(--accent)" : "var(--surface-3)", color: (activeView as any)==="profile" ? "var(--accent-fg)" : "var(--text)", display:"grid", placeItems:"center", overflow:"visible", flex:"0 0 auto", position:"relative", borderRadius:"50%", transition:"all .2s var(--ease)"}} title="Profil">
          <div style={{width:"100%", height:"100%", borderRadius:"50%", overflow:"hidden", display:"grid", placeItems:"center"}}>{profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : initials(profile?.displayName ?? username)}</div>
          {profile?.decoration && profile.decoration.startsWith("http") && <img src={profile.decoration} alt="" onError={(e)=>{(e.currentTarget as HTMLImageElement).style.display="none"}} style={{position:"absolute", inset:-6, width:"calc(100% + 12px)", height:"calc(100% + 12px)", pointerEvents:"none"}}/>}
        </button>
      </aside>

      <aside className={`channel-sidebar ${mobileSidebarOpen ? "mobile-open" : ""}`} onClick={(e)=>e.stopPropagation()}>
        {activeView==="servers" ? (
          <>
            <div className="server-title"><strong>SUNUCULAR</strong><button className="sidebar-back" onClick={()=>setActiveView("server")} title="Geri"><span className="icon"><Icon name="minimize" size={13}/></span> ÇIKIŞ</button></div>
            <div className="channel-scroll">
              <button className="hub-action" onClick={()=>setShowCreateServer(true)}><span className="icon"><Icon name="plus" size={14}/></span> Sunucu Oluştur</button>
              <button className="hub-action" onClick={()=>setShowJoinInvite(true)}><span className="icon"><Icon name="invite" size={14}/></span> Davetle Katıl</button>
              <div className="category-label">SUNUCULARIM</div>
              {servers.filter(s=>s.id!=="demo" && myServerIds[s.id]).length===0 && (
                <div style={{border:"1px dashed var(--border)", padding:12, fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)", textAlign:"center", margin:"8px 0"}}>henüz sunucun yok — yukarıdan oluştur</div>
              )}
              {servers.filter(s=>s.id!=="demo" && myServerIds[s.id]).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)).map(s=>(
                <div key={s.id} className={`dm-item ${selectedServer===s.id ? "active": ""}`} onClick={()=>{setSelectedServer(s.id); setActiveView("server"); setMobileSidebarOpen(false);}}>
                  <button className="dm-av" style={{cursor:"pointer", overflow:"hidden"}}>{s.iconUrl ? <img src={s.iconUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : <span className="server-hub-initial">{initials(s.name)}</span>}</button>
                  <div className="dm-meta"><div className="dm-name" style={{textAlign:"left"}}>{s.name}</div><div className="dm-sub">{s.memberCount ?? ""}</div></div>
                  <span style={{marginLeft:"auto"}}>{serverUnread(s.id) > 0 && <span className="unread-badge">{serverUnread(s.id)}</span>}</span>
                </div>
              ))}
            </div>
          </>
        ) : activeView==="server" ? (
          <>
            <div className="server-title">
              {isDemo ? <strong>AKAYROOM</strong> : <strong>{selectedServerData?.name}</strong>}
              {!isDemo && (()=>{ const myRole=members.find(m=>m.uid===user?.uid)?.role; const canManage=myRole==="owner"||myRole==="admin"; return (
                <div style={{display:"flex", gap:6}}>
                  <button onClick={()=>setShowMembers(v=>!v)} title="Üyeler" style={{width:26,height:26,border:"1px solid var(--border)",background: showMembers?"var(--accent)":"transparent",color: showMembers?"var(--accent-fg)":"var(--muted)",display:"grid",placeItems:"center",borderRadius:"var(--r-sm)",transition:"all .2s var(--ease)"}}><span className="icon"><Icon name="users" size={13}/></span></button>
                  {canManage && <button onClick={()=>setShowServerSettings(true)} title="Sunucu Ayarları" style={{width:26,height:26,border:"1px solid var(--border)",background:"transparent",color:"var(--muted)",display:"grid",placeItems:"center",borderRadius:"var(--r-sm)",transition:"all .2s var(--ease)"}}><span className="icon"><Icon name="settings" size={13}/></span></button>}
                </div>
              );})()}
            </div>

            {isDemo ? (
              <div style={{padding:24, display:"flex", flexDirection:"column", gap:12}}>
                <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)", lineHeight:1.6}}>
                  henüz sunucun yok.<br/>oluştur ve başla.
                </div>
                <button className="btn btn-primary" onClick={()=>setShowCreateServer(true)}>SUNUCU OLUŞTUR</button>
              </div>
            ) : (
              <>
                <div className="channel-search">
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="kanal ara" />
                </div>
                <div className="channel-scroll">
                  {(categories.length?categories:[{id:"_none",name:"SOHBET",position:0}] as Category[]).map(cat=>{
                    const chans = filteredChannels.filter(c=> (c.categoryId||"_none")===cat.id || (cat.id==="_none" && !c.categoryId));
                    if(chans.length===0) return null;
                    return (
                      <div key={cat.id}>
                        <div className="category-label">{cat.name} {(()=>{ const r=members.find(m=>m.uid===user?.uid)?.role; const ok=r==="owner"||r==="admin"; return ok ? <span onClick={()=>setShowCreateChannel(true)}><span className="icon"><Icon name="plus" size={12}/></span></span> : null;})()}</div>
                        {chans.map(ch=>(
                          <div key={ch.id} style={{position:"relative"}}>
                            <button
                              className={`channel-row ${selectedChannel===ch.id ? "selected":""}`}
                              onClick={()=>{
                                if(ch.type==="voice"){ setJoinedVoice(ch.id); setSelectedChannel(ch.id); }
                                else setSelectedChannel(ch.id);
                                setMobileSidebarOpen(false);
                              }}
                              onContextMenu={e=>{ e.preventDefault(); setChannelMenu({x:e.clientX, y:e.clientY, channel:ch}); }}
                            >
                              <span className="ch-icon"><span className="icon">{ch.type==="voice" ? <Icon name="voice" size={13}/> : <Icon name="hash" size={13}/>}</span></span>
                              <span className="ch-name">{ch.name}</span>
                              {ch.type==="voice" && <span style={{fontSize:10, opacity:.5}}>●</span>}
                              {(()=>{ const r=members.find(m=>m.uid===user?.uid)?.role; const ok=r==="owner"||r==="admin"; return ok ? (
                              <span style={{marginLeft:"auto", display:"flex", gap:2, opacity:0}} className="ch-actions-hover">
                                <span onClick={e=>{e.stopPropagation(); setEditingChannel(ch); setEditChannelName(ch.name); setEditChannelTopic(ch.topic||"");}} style={{border:"1px solid var(--border)", width:18, height:18, display:"grid", placeItems:"center"}} title="Düzenle"><span className="icon"><Icon name="edit" size={10}/></span></span>
                                <span onClick={e=>{e.stopPropagation(); deleteChannel(ch.id);}} style={{border:"1px solid var(--border)", width:18, height:18, display:"grid", placeItems:"center"}} title="Sil"><span className="icon"><Icon name="trash" size={10}/></span></span>
                              </span>
                              ) : null;})()}
                            </button>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
                {channelMenu && (()=>{ const r=members.find(m=>m.uid===user?.uid)?.role; const ok=r==="owner"||r==="admin"; return (
                  <div className="context-menu" style={{left:channelMenu.x, top:channelMenu.y}} onClick={e=>e.stopPropagation()}>
                    <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)", padding:"4px 8px", borderBottom:"1px solid var(--border)"}}>#{channelMenu.channel.name}</div>
                    <div className="context-item" onClick={()=>{ setSelectedChannel(channelMenu.channel.id); if(channelMenu.channel.type==="voice") setJoinedVoice(channelMenu.channel.id); setChannelMenu(null); }}><span className="icon"><Icon name="hash" size={12}/></span> Kanala Git</div>
                    <div className="context-item" onClick={()=>{ startCall(); setChannelMenu(null); }}><span className="icon"><Icon name="phone" size={12}/></span> Sesli arama</div>
                    {ok && <div className="context-item" onClick={()=>{ setEditingChannel(channelMenu.channel); setEditChannelName(channelMenu.channel.name); setEditChannelTopic(channelMenu.channel.topic||""); setChannelMenu(null); }}><span className="icon"><Icon name="settings" size={12}/></span> Düzenle</div>}
                    <div className="context-item" onClick={()=>{ navigator.clipboard.writeText(`#${channelMenu.channel.name}`); setToast("kopyalandı"); setChannelMenu(null); }}>⎘ Kopyala</div>
                    {ok && <div className="context-item danger" onClick={()=> deleteChannel(channelMenu.channel.id)}><span className="icon"><Icon name="plus" size={12}/></span> Sil</div>}
                  </div>
                );})()}
                <div className="current-user">
                  <button className="cu-avatar" onClick={()=>openProfile(user.uid)} style={{cursor:"pointer"}}>{profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : initials(profile?.displayName ?? username)}</button>
                  <div className="cu-meta">
                    <strong>{profile?.displayName ?? username}</strong>
                    <small>@{profile?.username ?? username}</small>
                    {profile?.nowPlaying && <small style={{color:"var(--spotify)", display:"flex", alignItems:"center", gap:4, marginTop:2}}><span className="icon"><Icon name="music" size={10}/></span><span style={{overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{profile.nowPlaying.track}</span></small>}
                  </div>
                  <div className="cu-actions">
                    <button onClick={()=>setShowAccountSettings(true)} title="Kullanıcı Ayarları"><span className="icon"><Icon name="settings"/></span></button>
                  </div>
                </div>
              </>
            )}
          </>
        ) : (activeView as any)==="profile" ? (
          <>
            <div className="server-title"><strong>PROFİL</strong></div>
            <div className="channel-scroll">
              <div className="category-label">HESAP</div>
              <button className="channel-row selected" onClick={()=>setActiveView("profile")}><span className="ch-icon"><span className="icon"><Icon name="user"/></span></span><span className="ch-name">Profilim</span></button>
              <button className="channel-row" onClick={()=>setShowAccountSettings(true)}><span className="ch-icon"><span className="icon"><Icon name="settings"/></span></span><span className="ch-name">Ayarlar</span></button>
              <div className="category-label" style={{marginTop:14}}>DİĞER</div>
              <button className="channel-row" onClick={()=>setActiveView("friends")}><span className="ch-icon"><span className="icon"><Icon name="users"/></span></span><span className="ch-name">Arkadaşlar</span></button>
              <div style={{marginTop:16, border:"1px solid var(--border)", padding:10, background:"var(--surface-2)"}}>
                <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)", marginBottom:6}}>PROFİL FOTOĞRAFI</div>
                <div style={{width:64, height:64, border:"1px solid var(--border)", background:"var(--bg)", display:"grid", placeItems:"center", overflow:"visible", marginBottom:8, position:"relative", borderRadius:"50%"}}>
                  <div style={{width:"100%", height:"100%", borderRadius:"50%", overflow:"hidden", display:"grid", placeItems:"center"}}>{profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : <span style={{fontFamily:"var(--font-mono)", fontWeight:700}}>{initials(profile?.displayName ?? username)}</span>}</div>
                  {profile?.decoration && profile.decoration.startsWith("http") && <img src={profile.decoration} alt="" onError={(e)=>{(e.currentTarget as HTMLImageElement).style.display="none"}} style={{position:"absolute", inset:-8, width:"calc(100% + 16px)", height:"calc(100% + 16px)", pointerEvents:"none"}}/>}
                </div>
                <label style={{display:"block", border:"1px dashed var(--border)", padding:"8px", textAlign:"center", cursor:"pointer", fontFamily:"var(--font-mono)", fontSize:11}}>
                  FOTOĞRAF SEÇ
                  <input type="file" accept="image/*" hidden onChange={e=>{const f=e.target.files?.[0]; if(f) handleAvatarFile(f);}} />
                </label>
                <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--dim)", marginTop:6}}>jpg/png, max 2MB — otomatik dataURL</div>
              </div>
            </div>
            <div className="current-user">
              <div className="cu-avatar">{profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : initials(profile?.displayName ?? username)}</div>
              <div className="cu-meta"><strong>{profile?.displayName ?? username}</strong><small>@{profile?.username ?? username}</small></div>
              <div className="cu-actions"><button onClick={()=>setShowAccountSettings(true)} title="Kullanıcı Ayarları"><span className="icon"><Icon name="settings"/></span></button></div>
            </div>
          </>
        ) : activeView==="friends" ? (
          <>
            <div className="server-title"><strong>ARKADAŞLAR</strong><button className="sidebar-back" onClick={()=>setActiveView("server")} title="Geri"><span className="icon"><Icon name="minimize" size={13}/></span> ÇIKIŞ</button></div>
            <div className="channel-scroll">
              <div style={{display:"flex", gap:6, padding:"0 0 12px"}}>
                {(["friends","inbox","dms"] as const).map(t=>(
                  <button key={t} className={`tab ${friendsTab===t?"active":""}`} onClick={()=>setFriendsTab(t)} style={{flex:1}}>{t==="friends"?"ARKADAŞLAR":t==="inbox"?"GELEN":"MESAJLAR"}</button>
                ))}
              </div>
              {friendsTab==="dms" ? (
                dmThreads.length===0 ? (
                  <div style={{border:"1px dashed var(--border)", padding:12, margin:"8px 0", fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)", textAlign:"center"}}>henüz DM yok</div>
                ) : dmThreads.map(th=>(
                  <div key={th.id} className={`dm-item ${selectedDm===th.id ? "active": ""}`} onClick={()=>{setSelectedDm(th.id); setActiveView("dms");}}>
                    <button className="dm-av" onClick={(e)=>{e.stopPropagation(); openProfile(th.otherUid);}} style={{cursor:"pointer"}}>{th.profile?.avatarUrl ? <img src={th.profile.avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : initials(th.profile?.displayName||th.profile?.username||"??")}</button>
                    <div className="dm-meta"><div className="dm-name">{th.profile?.displayName||th.profile?.username}</div><div className="dm-sub">@{th.profile?.username}</div></div>
                    <span style={{marginLeft:"auto"}}>{dmUnread(th.id) > 0 && <span className="unread-badge">{dmUnread(th.id)}</span>}</span>
                  </div>
                ))
              ) : friendsTab==="inbox" ? (
                <>
                  <div className="category-label" style={{display:"flex", alignItems:"center", gap:6}}>ARKADAŞLIK İSTEKLERİ {Object.keys(friendRequests).length>0 && <span className="unread-badge">{Object.keys(friendRequests).length}</span>}</div>
                  {Object.keys(friendRequests).length===0 ? (
                    <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)", padding:12, border:"1px dashed var(--border)", textAlign:"center", marginBottom:14}}>
                      bekleyen arkadaşlık isteği yok
                    </div>
                  ) : Object.entries(friendRequests).map(([fid, req])=>(
                    <div key={fid} style={{border:"1px solid var(--border)", background:"var(--surface-2)", padding:10, marginBottom:8, display:"flex", alignItems:"center", gap:8}}>
                      <button className="avatar" onClick={()=>openProfile(fid)} style={{cursor:"pointer", border:"1px solid var(--border)", background:"var(--surface-3)"}}>{initials(req.fromName || "??")}</button>
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{fontSize:13, fontWeight:600}}>{req.fromName || "kullanıcı"}</div>
                        <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)"}}>{fmtTime(req.createdAt)}</div>
                      </div>
                      <button className="btn btn-primary" onClick={()=>void acceptFriendRequest(fid)}>KABUL</button>
                      <button className="btn" onClick={()=>void rejectFriendRequest(fid, req.fromName)}>REDDET</button>
                    </div>
                  ))}
                  <div className="category-label" style={{display:"flex", alignItems:"center", gap:6, marginTop:6}}>SUNUCU DAVETLERİ {Object.keys(incomingServerInvites).length>0 && <span className="unread-badge">{Object.keys(incomingServerInvites).length}</span>}</div>
                  {Object.entries(incomingServerInvites).map(([invId, inv])=>(
                    <div key={invId} style={{border:"1px solid var(--border)", background:"var(--surface-2)", padding:10, marginBottom:8, display:"flex", alignItems:"center", gap:8}}>
                      <div style={{width:28, height:28, display:"grid", placeItems:"center", border:"1px solid var(--border)", background:"var(--bg)", color:"var(--text)"}}><span className="icon"><Icon name="grid" size={13}/></span></div>
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{fontSize:13, fontWeight:600}}>{inv.serverName}</div>
                        <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)"}}>{inv.fromName || "biri"} seni davet etti</div>
                      </div>
                      <button className="btn btn-primary" onClick={()=>void acceptServerInvite(invId, inv)}>KATIL</button>
                      <button className="btn" onClick={()=>void declineServerInvite(invId)}>REDDET</button>
                    </div>
                  ))}
                  {Object.keys(incomingServerInvites).length===0 && (
                    <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)", padding:12, border:"1px dashed var(--border)", textAlign:"center"}}>sunucu daveti yok</div>
                  )}
                  <div className="category-label" style={{margin:"18px 0 8px"}}>BAHSEDİLMELER</div>
                  {filteredMessages.length===0 ? (
                    <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)", padding:12, border:"1px dashed var(--border)", textAlign:"center"}}>
                      bahsedilme yok — birisi seni @ ile etiketlediğinde burada görünür
                    </div>
                  ) : filteredMessages.slice(-4).reverse().map(m=>(
                    <div key={m.id} style={{border:"1px solid var(--border)", padding:10, marginBottom:8, background:"var(--surface-2)"}}>
                      <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)", marginBottom:4}}>#{channels.find(c=>c.id===m.channelId)?.name} • {fmtTime(m.createdAt)}</div>
                      <div style={{fontSize:12}}><strong>{m.authorName}</strong>: {m.content.slice(0,80)}</div>
                    </div>
                  ))}
                </>
              ) : (
                <>
                    <div className="category-label" style={{marginBottom:8}}>ARKADAŞ EKLE</div>
                    <div style={{display:"flex", gap:6}}>
                      <input value={friendName} onChange={e=>setFriendName(e.target.value)} placeholder="kullanici_adi" style={{flex:1, background:"var(--bg)", border:"1px solid var(--border)", color:"var(--text)", padding:"8px", fontFamily:"var(--font-mono)", fontSize:12}} />
                      <button className="btn btn-primary" onClick={async()=>{
                        const clean = friendName.trim().toLowerCase();
                        if(!clean) return;
                        const snap = await get(ref(db,`usernameIndex/${clean}`));
                        if(!snap.exists()){ setToast("bulunamadı"); return; }
                        const fid = snap.val() as string;
                        const psnap = await get(ref(db,`users/${fid}/public`));
                        await sendFriendRequest(fid, (psnap.exists()? (psnap.val() as any).displayName : null) || clean);
                        setFriendName("");
                      }}>İSTEK AT</button>
                    </div>
                  <div className="category-label" style={{margin:"14px 0 8px"}}>ARKADAŞLARIM</div>
                  {friends.length===0 ? (
                    <div style={{border:"1px dashed var(--border)", padding:16, textAlign:"center", fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)"}}>
                      henüz arkadaş yok — yukarıdan kullanıcı adıyla ekle
                    </div>
                  ) : friends.map(f=>(
                    <div key={f.uid} className="friend-row" style={{cursor:"pointer"}} onClick={()=>openProfile(f.uid)}>
                      <button className="avatar" onClick={(e)=>{e.stopPropagation(); openProfile(f.uid);}} style={{cursor:"pointer", border:"1px solid var(--border)", background:"var(--surface-3)", flex:"0 0 auto"}}>{f.profile?.avatarUrl ? <img src={f.profile.avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : initials(f.profile?.displayName||f.profile?.username||"??")}</button>
                      <div style={{flex:1, minWidth:0}}>
                        <div data-friend-name style={{fontSize:13, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{f.profile?.displayName||f.profile?.username}</div>
                        <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>@{f.profile?.username}</div>
                      </div>
                      <button className="friend-mini-btn" title="Mesaj" onClick={(e)=>{e.stopPropagation(); startDM(f.uid);}}><span className="icon"><Icon name="dm" size={12}/></span></button>
                      <button className="friend-mini-btn" title="Sunucuya davet et" onClick={(e)=>{e.stopPropagation(); void inviteFriendToServer(f.uid);}}><span className="icon"><Icon name="invite" size={12}/></span></button>
                      <button className="friend-mini-btn" style={{color:"var(--danger)"}} title="Arkadaşlıktan çıkar" onClick={(e)=>{e.stopPropagation(); void removeFriend(f.uid);}}><span className="icon"><Icon name="close" size={12}/></span></button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </>
        ) : activeView==="dms" ? (
          <>
            <div className="server-title"><strong>MESAJLAR</strong><button className="sidebar-back" onClick={()=>setActiveView("friends")} title="Geri"><span className="icon"><Icon name="minimize" size={13}/></span> ÇIKIŞ</button></div>
            <div className="channel-scroll">
              <div className="category-label">DİREKT MESAJLAR</div>
              {dmThreads.length===0 ? (
                <div style={{border:"1px dashed var(--border)", padding:12, margin:"8px 0", fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)", textAlign:"center"}}>henüz DM yok</div>
              ) : dmThreads.map(th=>(
                <div key={th.id} className={`dm-item ${selectedDm===th.id ? "active": ""}`} onClick={()=>{setSelectedDm(th.id); setMobileSidebarOpen(false);}}>
                  <button className="dm-av" onClick={(e)=>{e.stopPropagation(); openProfile(th.otherUid);}} style={{cursor:"pointer"}}>{th.profile?.avatarUrl ? <img src={th.profile.avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : initials(th.profile?.displayName||th.profile?.username||"??")}</button>
                  <div className="dm-meta"><div className="dm-name">{th.profile?.displayName||th.profile?.username}</div><div className="dm-sub">@{th.profile?.username}</div></div>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </aside>

      <section className="chat-panel">
        {activeView==="servers" ? (
          <>
            <header className="chat-header">
              <div className="channel-heading"><span className="hash">◈</span><strong>SUNUCU MERKEZİ</strong><span className="topic">sunucularını yönet ve katıl</span></div>
              <div className="header-actions"><button className="header-back" onClick={()=>setActiveView("server")}><span className="icon"><Icon name="arrowLeft" size={14}/></span></button></div>
            </header>
            <div className="message-area" style={{padding:16, overflow:"auto"}}>
              <div style={{maxWidth:640, margin:"0 auto", width:"100%", display:"flex", flexDirection:"column", gap:12}}>
                <div style={{display:"flex", gap:10}}>
                  <button className="hub-card" onClick={()=>setShowCreateServer(true)}><span className="hub-card-icon"><Icon name="plus" size={18}/></span><span><strong>Sunucu Oluştur</strong><em>yeni bir topluluk kur</em></span></button>
                  <button className="hub-card" onClick={()=>setShowJoinInvite(true)}><span className="hub-card-icon"><Icon name="invite" size={18}/></span><span><strong>Davetle Katıl</strong><em>kod ile bir sunucuya gir</em></span></button>
                </div>
                <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)", letterSpacing:".06em", marginTop:8}}>SUNUCULARIM</div>
                <div style={{display:"flex", flexDirection:"column", gap:8}}>
                  {servers.filter(s=>s.id!=="demo" && myServerIds[s.id]).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)).map(s=>(
                    <div key={s.id} className="server-portfolio-card" onClick={()=>{setSelectedServer(s.id); setActiveView("server"); setMobileSidebarOpen(false);}}>
                      <div className="spc-icon">{s.iconUrl ? <img src={s.iconUrl} alt=""/> : initials(s.name)}</div>
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{fontWeight:700, fontSize:14}}>{s.name}</div>
                        <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)"}}>{s.description || "sohbet etmeye hazır"}</div>
                      </div>
                      <span className="spc-go">GİR →</span>
                    </div>
                  ))}
                  {servers.filter(s=>s.id!=="demo" && myServerIds[s.id]).length===0 && (
                    <div style={{border:"1px dashed var(--border)", padding:16, textAlign:"center", fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)"}}>henüz sunucun yok — oluştur veya kod ile katıl</div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : activeView!=="server" ? (
          (activeView as any)==="profile" ? (
            <>
              <header className="chat-header">
                <div className="channel-heading"><span className="hash"><span className="icon"><Icon name="user"/></span></span><strong>PROFİL</strong><span className="topic">@{profile?.username} • {profile?.displayName} {profile?.pronouns ? `• ${profile.pronouns}` : ""}</span></div>
                <div className="header-actions"><button onClick={()=>setShowUserSettings(true)}><span className="icon"><Icon name="settings"/></span></button></div>
              </header>
              <div className="page-panel" style={{display:"flex", justifyContent:"center", alignItems:"flex-start", padding:24, overflow:"auto", background:"var(--bg)"}}>
                <div style={{width:"100%", maxWidth:560, display:"flex", flexDirection:"column", gap:12}}>
                  {/* Banner + Avatar Card */}
                  <div style={{border:"1px solid var(--border)", background:"var(--surface)", overflow:"visible"}}>
                    <div style={{height:112, position:"relative", borderBottom:"1px solid var(--border)", background: profile?.bannerUrl ? `url(${profile.bannerUrl}) center/cover` : (profile?.bannerColor || "#fff"), overflow:"visible"}}>
                      {!profile?.bannerUrl && <div style={{position:"absolute", inset:0, backgroundImage:"linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)", backgroundSize:"20px 20px", opacity: profile?.bannerColor ? .15 : .9}}/>}
                      {!profile?.bannerUrl && <div style={{position:"absolute", inset:0, opacity:.06, background:"repeating-linear-gradient(45deg, #000 0 8px, transparent 8px 16px)"}}/>}
                      <div style={{position:"absolute", top:8, right:8, display:"flex", gap:6}}>
                        <label style={{border:"1px solid #000", background:"rgba(0,0,0,.7)", color:"var(--text)", padding:"5px 8px", fontFamily:"var(--font-mono)", fontSize:10, cursor:"pointer", backdropFilter:"blur(4px)"}}>
                          BANNER
                          <input type="file" accept="image/*" hidden onChange={e=>{const f=e.target.files?.[0]; if(f) handleBannerFile(f);}} />
                        </label>
                      </div>
                      <div style={{position:"absolute", left:16, bottom:-30, display:"flex", alignItems:"flex-end", gap:10}}>
                        <div style={{width:76, height:76, border:"2px solid var(--accent)", background:"var(--bg)", display:"grid", placeItems:"center", overflow:"visible", borderRadius:"50%", boxShadow:"0 2px 8px rgba(0,0,0,.4)", position:"relative", zIndex:2}}>
                          <div style={{width:"100%", height:"100%", borderRadius:"50%", overflow:"hidden", display:"grid", placeItems:"center"}}>{profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : <span style={{fontFamily:"var(--font-mono)", fontWeight:800, fontSize:20}}>{initials(profile?.displayName ?? username)}</span>}</div>
                          {/* decoration - image or border */}
                          {profile?.decoration && (profile.decoration.startsWith("http") ? <img src={profile.decoration} alt="" onError={(e)=>{(e.currentTarget as HTMLImageElement).style.display="none"}} style={{position:"absolute", inset:-10, width:"calc(100% + 20px)", height:"calc(100% + 20px)", pointerEvents:"none"}}/> : <div style={{position:"absolute", inset:-2, border:"2px solid var(--accent)", borderRadius: profile.decoration==="circle" ? "50%" : "0", pointerEvents:"none"}}/>)}
                          <div style={{position:"absolute", right:0, bottom:0, width:14, height:14, border:"2px solid var(--surface)", background: profile?.status==="online" ? "var(--online)" : profile?.status==="idle" ? "var(--idle)" : profile?.status==="dnd" ? "var(--dnd)" : "var(--offline)", borderRadius:"50%", boxShadow:"0 1px 2px rgba(0,0,0,.3)"}}/>
                        </div>
                        <div style={{marginBottom:4, display:"flex", gap:4, flexWrap:"wrap"}}>
                          {(profile?.badges||[]).map(b=> <span key={b} style={{border:"1px solid #000", background:"var(--accent)", color:"var(--accent-fg)", fontFamily:"var(--font-mono)", fontSize:10.5, fontWeight:700, padding:"2px 6px", letterSpacing:".04em"}}>{b}</span>)}
                          {(!profile?.badges || profile.badges.length===0) && <span style={{border:"1px dashed var(--border)", background:"rgba(0,0,0,.5)", color:"var(--text)", fontFamily:"var(--font-mono)", fontSize:10.5, padding:"2px 6px"}}>ROZET YOK</span>}
                        </div>
                      </div>
                    </div>
                    <div style={{padding:"40px 16px 14px"}}>
                      <div style={{display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12}}>
                        <div style={{minWidth:0}}>
                          <div style={{display:"flex", alignItems:"center", gap:8, flexWrap:"wrap"}}>
                            <span style={{fontWeight:800, fontSize:18, letterSpacing:"-.02em"}}>{profile?.displayName}</span>
                            {profile?.pronouns && <span style={{border:"1px solid var(--border)", background:"var(--surface-2)", fontFamily:"var(--font-mono)", fontSize:10, padding:"2px 6px", color:"var(--muted)"}}>{profile.pronouns}</span>}
                            {profile?.title && <span style={{border:"1px solid var(--accent)", background:"var(--accent)", color:"var(--accent-fg)", fontFamily:"var(--font-mono)", fontSize:10, fontWeight:700, padding:"2px 6px"}}>{profile.title}</span>}
                            {profile?.accentColor && <span style={{width:10, height:10, border:"1px solid var(--border)", background: profile.accentColor, display:"inline-block"}}/>}
                          </div>
                          <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)", marginTop:2}}>@{profile?.username} • {profile?.customStatusEmoji || ""} {profile?.customStatus || profile?.statusText || "durum yok"}</div>
                          {(profile?.customStatus || profile?.customStatusEmoji) && <div style={{marginTop:6, border:"1px solid var(--border)", background:"var(--surface-2)", padding:"6px 8px", fontSize:12, display:"flex", alignItems:"center", gap:6}}><span>{profile.customStatusEmoji || "●"}</span><span style={{color:"var(--text-2)"}}>{profile.customStatus}</span></div>}
                        </div>
                        <button className="btn" onClick={()=>setShowUserSettings(true)}>DÜZENLE</button>
                      </div>
                      <div style={{marginTop:12, border:"1px solid var(--border)", background:"var(--surface-2)", padding:12}}>
                        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6}}>
                          <span style={{fontFamily:"var(--font-mono)", fontSize:10, letterSpacing:".06em", color:"var(--muted)"}}>HAKKIMDA — ABOUT ME</span>
                          <span style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--dim)"}}>{(profile?.bio||"").length}/190</span>
                        </div>
                        {profile?.bio ? <div style={{fontSize:13, lineHeight:1.6, whiteSpace:"pre-wrap"}}><RenderContent text={profile.bio}/></div> : <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)"}}>henüz bio yok — Discord’daki gibi kendinden bahset, markdown desteklenir (**kalın**, `kod`, emoji).</div>}
                      </div>
                      <div style={{marginTop:10, display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8}}>
                        <div style={{border:"1px solid var(--border)", padding:10, textAlign:"center"}}><div style={{fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--muted)", letterSpacing:".06em"}}>KATILIM</div><div style={{fontWeight:700, fontSize:11, marginTop:4}}>{profile?.createdAt ? fmtDate(profile.createdAt) : "—"}</div></div>
                        <div style={{border:"1px solid var(--border)", padding:10, textAlign:"center"}}><div style={{fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--muted)"}}>SUNUCU</div><div style={{fontWeight:800, fontSize:14}}>{Object.keys(myServerIds).length}</div></div>
                        <div style={{border:"1px solid var(--border)", padding:10, textAlign:"center"}}><div style={{fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--muted)"}}>ARKADAŞ</div><div style={{fontWeight:800, fontSize:14}}>{friends.length}</div></div>
                      </div>
                      <div style={{marginTop:10, border:"1px solid var(--border)", background:"var(--bg)", padding:10, display:"flex", gap:8, alignItems:"center"}}>
                        <div style={{width:28, height:28, border:"1px solid var(--border)", display:"grid", placeItems:"center", background:"var(--surface-3)"}}><Icon name="grid"/></div>
                        {(()=>{ const cn=profile?.connections||{}; const items=[
                          cn.github ? {k:"GITHUB", href: cn.github.startsWith("http")?cn.github:`https://github.com/${cn.github.replace(/^@/,"")}`} : null,
                          cn.spotify ? {k:"SPOTIFY", href: cn.spotify.startsWith("http")?cn.spotify:`https://open.spotify.com/search/${encodeURIComponent(cn.spotify)}`} : null,
                          cn.site ? {k:"SİTE", href: cn.site.startsWith("http")?cn.site:`https://${cn.site}`} : null,
                        ].filter(Boolean) as {k:string,href:string}[];
                        return (
                          <div style={{flex:1}}>
                            <div style={{fontFamily:"var(--font-mono)", fontSize:10, fontWeight:700}}>BAĞLANTILAR</div>
                            {items.length ? (
                              <div style={{display:"flex", gap:6, flexWrap:"wrap", marginTop:4}}>
                                {items.map(it=>(
                                  <a key={it.k} href={it.href} target="_blank" rel="noreferrer" style={{border:"1px solid var(--accent)", background:"var(--accent)", color:"var(--accent-fg)", fontFamily:"var(--font-mono)", fontSize:10.5, fontWeight:700, padding:"3px 8px", textDecoration:"none"}}>{it.k} ↗</a>
                                ))}
                              </div>
                            ) : (
                              <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)"}}>bağlantı yok — ayarlardan ekle</div>
                            )}
                          </div>
                        ); })()}
                      </div>
                    </div>
                  </div>
                  {/* quick edit row */}
                  <div style={{border:"1px solid var(--border)", background:"var(--surface)", padding:10, display:"flex", gap:6, flexWrap:"wrap"}}>
                    <button className="btn" onClick={()=>setShowUserSettings(true)}>PROFİLİ SÜSLE</button>
                    <button className="btn btn-primary" onClick={()=>setActiveView("friends")}>ARKADAŞLAR</button>
                    <label style={{marginLeft:"auto", border:"1px dashed var(--border)", padding:"7px 10px", fontFamily:"var(--font-mono)", fontSize:10, cursor:"pointer"}}>
                      AVATAR
                      <input type="file" accept="image/*" hidden onChange={e=>{const f=e.target.files?.[0]; if(f) handleAvatarFile(f);}} />
                    </label>
                  </div>
                </div>
              </div>
            </>
          ) : activeView==="dms" ? (
            <>
              <header className="chat-header">
                <div className="channel-heading"><span className="hash"><span className="icon"><Icon name="dm"/></span></span><strong>{dmThreads.find(d=>d.id===selectedDm)?.profile?.displayName || "MESAJLAR"}</strong><span className="topic">uçtan uca • RTDB</span></div>
                <div className="header-actions"><button className="header-back" onClick={()=>setActiveView("friends")} title="Arkadaşlara dön"><span className="icon"><Icon name="arrowLeft" size={14}/></span></button><div className="header-search"><span className="icon" style={{display:"grid", color:"var(--muted)"}}><Icon name="search" size={12}/></span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="DM'de ara"/></div><button onClick={()=>{void startDMCall();}} title="DM sesli arama" style={{border:joinedVoice===selectedDm?"1px solid var(--accent)":"1px solid var(--border)",background:joinedVoice===selectedDm?"var(--accent)":"transparent",color:joinedVoice===selectedDm?"var(--accent-fg)":"var(--muted)"}}><span className="icon"><Icon name="phone"/></span></button></div>
              </header>
              <div className="message-area" style={{padding:16}}>
                {!selectedDm ? (
                  <div className="empty-state"><div className="empty-orb"><span className="icon"><Icon name="dm"/></span></div><h2>DM seç</h2><p>soldan bir kişi seç veya arkadaş ekle.</p></div>
                ) : dmMsgs.length===0 ? (
                  <div className="empty-state"><div className="empty-orb">#</div><h2>henüz mesaj yok</h2><p>ilk mesajı gönder.</p></div>
                ) : (
                  <>
                    {search.trim() ? (
                      <div className="dm-search-panel">
                        <div className="dm-search-head">
                          <span>{dmSearchResults.length} SONUÇ BULUNDU — &ldquo;{search.trim().slice(0,24)}{search.trim().length>24?"…":""}&rdquo;</span>
                          <button onClick={()=>setSearch("")}><span className="icon"><Icon name="close" size={11}/></span> TEMİZLE</button>
                        </div>
                        <div className="dm-search-results">
                          {dmSearchResults.length===0 ? (
                            <div className="dm-search-empty">bu sohbette eşleşen mesaj yok</div>
                          ) : dmSearchResults.slice().reverse().map(m=>(
                            <button key={m.id} className="dm-search-item" onClick={()=>jumpToDmMessage(m.id)}>
                              <span className="avatar">{initials(m.authorId===user.uid ? (profile?.displayName||username) : (dmThreads.find(d=>d.id===selectedDm)?.profile?.displayName||"??"))}</span>
                              <span style={{flex:1, minWidth:0}}>
                                <span className="dm-search-meta">
                                  <strong>{m.authorId===user.uid ? "Sen" : (dmThreads.find(d=>d.id===selectedDm)?.profile?.displayName||"arkadaş")}</strong>
                                  <span>{fmtTime(m.createdAt)}</span>
                                </span>
                                {m.content && <span className="dm-search-snippet"><SearchHighlight text={m.content} q={search}/></span>}
                                {m.attachment && <span className="dm-search-file">⎘ <SearchHighlight text={m.attachment.name} q={search}/> ({fmtSize(m.attachment.size)})</span>}
                              </span>
                              <span className="dm-search-jump">↓ MESAJA GİT</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {dmMsgs.map(m=>(
                  <div key={m.id} id={`dm-msg-${m.id}`} className={`message-row ${dmHighlightId===m.id ? "msg-flash" : ""}`} style={{maxWidth:760, margin:"0 auto", width:"100%"}}>
                    <button className="msg-avatar" onClick={()=>openProfile(m.authorId)} style={{cursor:"pointer"}}>{m.authorId===user.uid && profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : initials(m.authorId===user.uid ? (profile?.displayName||username) : (dmThreads.find(d=>d.id===selectedDm)?.profile?.displayName||"??"))}</button>
                    <div className="msg-body"><div className="msg-author-row"><span className="msg-author">{m.authorId===user.uid ? "Sen" : (dmThreads.find(d=>d.id===selectedDm)?.profile?.displayName||"arkadaş")}</span><span className="msg-time">{fmtTime(m.createdAt)} {m.editedAt?"(düzenlendi)":""}</span></div>{dmEditingId===m.id ? <div style={{display:"flex",gap:6}}><input value={dmEditContent} onChange={e=>setDmEditContent(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void saveDMEdit();if(e.key==="Escape")setDmEditingId(null)}} autoFocus style={{flex:1,background:"var(--bg)",border:"1px solid var(--accent)",color:"var(--text)",padding:6}}/><button className="btn btn-primary" onClick={()=>void saveDMEdit()}>KAYDET</button><button className="btn" onClick={()=>setDmEditingId(null)}>İPTAL</button></div> : <><div className="msg-content">{m.content}</div>{m.attachment && (()=>{const c=dmAttachmentCache[m.id]; return c?.dataUrl ? (m.attachment.type==="image" ? <img src={c.dataUrl} alt={m.attachment.name} style={{marginTop:6,maxWidth:"100%",maxHeight:340,objectFit:"contain",display:"block"}}/> : m.attachment.type==="video" ? <video src={c.dataUrl} controls style={{marginTop:6,maxWidth:"100%",maxHeight:360,display:"block"}}/> : m.attachment.type==="audio" ? <audio src={c.dataUrl} controls style={{marginTop:6,width:"100%"}}/> : <a href={c.dataUrl} download={m.attachment.name} className="btn" style={{display:"inline-block",marginTop:6}}>⎘ {m.attachment.name}</a>) : <button className="btn" style={{marginTop:6}} onClick={()=>loadDmAttachment(m)} disabled={c?.loading}>{c?.loading?"yükleniyor…":<><span className="icon"><Icon name="paperclip" size={11}/></span> {m.attachment.name} ({fmtSize(m.attachment.size)}) — aç</>}</button>;})()}</>} {m.authorId===user.uid && <div className="msg-actions"><button onClick={()=>{setDmEditingId(m.id);setDmEditContent(m.content)}}><span className="icon"><Icon name="edit" size={13}/></span></button><button onClick={()=>void deleteDMMessage(m.id)}><span className="icon"><Icon name="trash" size={13}/></span></button></div>}</div>
                  </div>
                    ))}
                  </>
                )}
              </div>
              {selectedDm && (
                <div className="composer-wrap">
                  {dmPendingFile && <div style={{border:"1px solid var(--border)",background:"var(--surface-2)",padding:"6px 8px",marginBottom:6,display:"flex",alignItems:"center",gap:8}}><span style={{flex:1,fontFamily:"var(--font-mono)",fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:6}}><span className="icon"><Icon name="paperclip" size={12}/></span>{dmPendingFile.file.name} ({fmtSize(dmPendingFile.file.size)})</span><button onClick={()=>setDmPendingFile(null)} style={{border:"1px solid var(--border)",background:"transparent"}}><span className="icon"><Icon name="close" size={12}/></span></button></div>}
                  <form className="composer" onSubmit={e=>{e.preventDefault(); void sendDMMessage();}} style={{alignItems:"center"}}>
                    <label className="composer-plus" title="DM dosyası ekle" style={{cursor:"pointer",display:"grid",placeItems:"center"}}><span className="icon"><Icon name="plus" size={16}/></span><input type="file" hidden accept="image/*,video/*,audio/*,.pdf,.zip,.txt,.doc,.docx" onChange={e=>{const f=e.target.files?.[0];if(f)handleDmFile(f);e.currentTarget.value="";}}/></label>
                    <textarea value={dmDraft} onChange={e=>setDmDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();void sendDMMessage();}}} placeholder="mesaj yaz — dosya veya fotoğraf ekle" rows={1} className="composer-input" style={{minHeight:24, maxHeight:80}}/>
                    <button type="submit" className="send-button" disabled={!dmDraft.trim()&&!dmPendingFile}><span className="icon"><Icon name="send"/></span></button>
                  </form>
                </div>
              )}
            </>
        ) : activeView==="friends" ? (
            <>
              <header className="chat-header">
                <div className="channel-heading"><span className="hash">◉</span><strong>ARKADAŞLAR</strong><span className="topic">{friends.length} kişi</span></div>
                <div className="header-actions"><button className="header-back" onClick={()=>setActiveView("server")}><span className="icon"><Icon name="arrowLeft" size={14}/></span></button></div>
              </header>
              <div className="page-panel">
                {friends.length===0 ? (
                  <div className="empty-state animate-fade">
                    <div className="empty-orb">◉</div>
                    <h2>arkadaş listesi boş</h2>
                    <p>soldan kullanıcı adıyla ekle.</p>
                  </div>
                ) : (
                  <div style={{maxWidth:560, margin:"0 auto", width:"100%"}}>
                    {friends.map(f=>(
                      <div key={f.uid} className="friend-row" style={{cursor:"pointer"}} onClick={()=>openProfile(f.uid)}>
                        <button className="avatar" onClick={(e)=>{e.stopPropagation(); openProfile(f.uid);}} style={{cursor:"pointer", border:"1px solid var(--border)", background:"var(--surface-3)", flex:"0 0 auto"}}>{f.profile?.avatarUrl ? <img src={f.profile.avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : initials(f.profile?.displayName||f.profile?.username||"??")}</button>
                        <div style={{flex:1, minWidth:0}}>
                          <div data-friend-name style={{fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{f.profile?.displayName||f.profile?.username}</div>
                          <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>@{f.profile?.username}</div>
                        </div>
                        <button className="btn" onClick={(e)=>{e.stopPropagation(); startDM(f.uid);}}><span className="icon"><Icon name="dm" size={12}/></span> MESAJ</button>
                        <button className="btn" onClick={(e)=>{e.stopPropagation(); void inviteFriendToServer(f.uid);}} title="Sunucuya davet et">DAVET</button>
                        <button className="btn" style={{color:"var(--danger)"}} onClick={(e)=>{e.stopPropagation(); void removeFriend(f.uid);}} title="Arkadaşlıktan çıkar">ÇIKAR</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <header className="chat-header">
                <div className="channel-heading"><span className="hash">◎</span><strong>GELEN KUTUSU</strong></div>
              </header>
              <div className="page-panel">
                <div style={{maxWidth:560, margin:"0 auto", width:"100%"}}>
                  {filteredMessages.length===0 ? (
                    <div className="empty-state animate-fade">
                      <div className="empty-orb">◎</div>
                      <h2>kutu boş</h2>
                      <p>bahsedildiğinde burada görünür.</p>
                    </div>
                  ) : filteredMessages.slice(-5).reverse().map(m=>(
                    <div key={m.id} style={{border:"1px solid var(--border)", padding:12, marginBottom:8, background:"var(--surface-2)"}}>
                      <div style={{fontSize:13}}><strong>{m.authorName}</strong> <span style={{color:"var(--muted)"}}>#{channels.find(c=>c.id===m.channelId)?.name}</span></div>
                      <div style={{fontSize:13, color:"var(--text-2)", marginTop:4}}>{m.content.slice(0,120)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )
        ) : (
          <>
            <header className="chat-header">
              <div className="channel-heading">
                <button className="header-back mobile-toggle" onClick={()=>setMobileSidebarOpen(v=>!v)} title="Kanallar"><span className="icon"><Icon name="grid" size={14}/></span></button>
                <span className="hash">{selectedChannelData?.type==="voice" ? "⌁" : "#"}</span>
                <strong>{isDemo ? "hoş geldin" : selectedChannelData?.name ?? "genel"}</strong>
                {!isDemo && <span className="topic">{selectedChannelData?.topic ?? ""}</span>}
              </div>
              <div className="header-actions">
                <div className="header-search"><span className="icon" style={{display:"grid", color:"var(--muted)"}}><Icon name="search" size={12}/></span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ara" /></div>
                <button onClick={startCall} title="Sesli arama başlat" style={{border: selectedChannelData?.type==="voice" && joinedVoice===selectedChannel ? "1px solid var(--accent)" : "1px solid var(--border)", background: selectedChannelData?.type==="voice" && joinedVoice===selectedChannel ? "var(--accent)" : "transparent", color: selectedChannelData?.type==="voice" && joinedVoice===selectedChannel ? "var(--accent-fg)" : "var(--muted)"}}><span className="icon"><Icon name="phone"/></span></button>
                {(()=>{ const r=members.find(m=>m.uid===user?.uid)?.role; const ok=r==="owner"||r==="admin"; if(!ok) return null; return (<>
                  <button onClick={()=>{ if(selectedChannelData && selectedServer!=="demo"){ setEditingChannel(selectedChannelData); setEditChannelName(selectedChannelData.name); setEditChannelTopic(selectedChannelData.topic||""); } }} title="Kanalı Düzenle"><span className="icon"><Icon name="edit" size={12}/></span></button>
                  <button onClick={()=>{ if(selectedChannelData && selectedServer!=="demo") deleteChannel(selectedChannelData.id); }} title="Kanalı Sil" style={{color:"var(--danger)"}}><span className="icon"><Icon name="trash" size={12}/></span></button>
                  <button onClick={()=>setShowServerSettings(true)} title="Sunucu Ayarları"><span className="icon"><Icon name="settings" size={12}/></span></button>
                </>);})()}
                <button onClick={()=>setShowPalette(true)} title="Komut paleti (Ctrl+K)" className="h-icon"><span style={{fontFamily:"var(--font-mono)",fontSize:11,fontWeight:700,letterSpacing:".04em"}}>⌘K</span></button>
              </div>
            </header>

            <div className="message-area" onClick={()=>{setShowEmoji(false); setShowGif(false); setShowPlusMenu(false);}}>
              {helpOpen && (
                <div style={{margin:"10px 16px", border:"1px solid var(--accent)", background:"var(--surface)", padding:12, alignSelf:"center", width:"min(440px, 92%)"}} onClick={e=>e.stopPropagation()}>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8}}>
                    <strong style={{fontFamily:"var(--font-mono)", fontSize:12, letterSpacing:".08em"}}>KOMUTLAR</strong>
                    <button onClick={()=>setHelpOpen(false)} style={{border:"1px solid var(--border)", background:"transparent", color:"var(--muted)", width:22, height:22}}><span className="icon"><Icon name="close" size={12}/></span></button>
                  </div>
                  {[
                    ["/help","bu paneli açar"],
                    ["/me <eylem>","italik eylem mesajı — /me kod yazıyor"],
                    ["/shrug <mesaj>","¯\\_(ツ)_/¯ ekler"],
                    ["/nick <isim>","görünen adını değiştirir"],
                    ["/poll","anket oluşturur (＋ → POLL)"],
                    ["/github <owner/repo>","GitHub repo kartı — /github vercel/next.js"],
                    ["/music <şarkı> | /song","iTunes ile şarkı kartı + 30sn preview — /music tarkan"],
                    ["/np <şarkı> | /playing","şimdi dinliyor durumunu ayarla — /np şımarık — /np clear ile kapat"],
                    ["/invite","davet kodu üretir"],
                    ["/clear","ekranı yerel olarak temizler"],
                    ["Ctrl+K","hızlı komut paleti — kanal ara, komut çalıştır"],
                  ].map(([cmd,desc])=>(
                    <div key={cmd} style={{display:"flex", gap:10, padding:"5px 0", borderBottom:"1px dashed var(--border)"}}>
                      <code style={{fontFamily:"var(--font-mono)", fontSize:11, fontWeight:700, minWidth:110}}>{cmd}</code>
                      <span style={{fontSize:11, color:"var(--muted)"}}>{desc}</span>
                    </div>
                  ))}
                </div>
              )}
              {isDemo ? (
                <div className="welcome animate-slide">
                  <div className="welcome-icon">◈</div>
                  <h1>AKAYROOM</h1>
                  <p>minimal, siyah-beyaz. önce bir sunucu kur.</p>
                  <button className="btn btn-primary" style={{marginTop:12}} onClick={()=>setShowCreateServer(true)}>SUNUCU OLUŞTUR</button>
                </div>
              ) : selectedChannelData?.type==="voice" ? (
                <div className="empty-state animate-fade">
                  <div className="empty-orb">⌁</div>
                  <h2>{selectedChannelData.name}</h2>
                  <p>ses kanalı — katıl ve konuş.</p>
                  <div style={{marginTop:12, display:"flex", gap:8}}>
                    <button className="btn btn-primary" onClick={()=>setJoinedVoice(selectedChannel)}>KATIL</button>
                    <button className="btn" onClick={()=>{void hangUpVoice();}}>AYRIL</button>
                  </div>
                </div>
              ) : filteredMessages.length===0 ? (
                <div className="empty-state animate-fade">
                  <div className="empty-orb">#</div>
                  <h2># {selectedChannelData?.name}</h2>
                  <p>ilk mesajı gönder — Enter</p>
                </div>
              ) : (
                <>
                  <div className="divider">{fmtDate(filteredMessages[0]?.createdAt || Date.now())}</div>
                  {filteredMessages.map((m, idx)=>{
                    const prev=filteredMessages[idx-1];
                    const isGrouped = prev && prev.authorId===m.authorId && (m.createdAt - prev.createdAt) < 1000*60*7 && !m.replyTo && !prev.replyTo;
                    const reactions = reactionMap[m.id] || {};
                    const isMe = user.uid===m.authorId;
                    const isEditing = editingId===m.id;
                    return (
                      <div key={m.id} className={`message-row msg-animate ${isGrouped?"grouped":""}`} onContextMenu={e=>{ e.preventDefault(); setContextMenu({x:e.clientX, y:e.clientY, msg:m});}}>
                        {isGrouped && <div className="group-time">{fmtTime(m.createdAt).slice(0,5)}</div>}
                        <button className="msg-avatar" onClick={()=>openProfile(m.authorId)} style={{cursor:"pointer"}}>{m.authorId===user.uid && profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : initials(m.authorName||"??")}</button>
                        <div className="msg-body">
                          {!isGrouped && <div className="msg-author-row"><span className="msg-author">{m.authorName || "anon"}</span><span className="msg-time">{fmtTime(m.createdAt)} {m.editedAt?"(düzenlendi)":""}</span></div>}
                          {m.replyTo && <div className="msg-reply"><strong>{m.replyTo.authorName}</strong> {m.replyTo.content}</div>}
                          {isEditing ? (
                            <div style={{display:"flex", gap:6, marginTop:4}}>
                              <input value={editContent} onChange={e=>setEditContent(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter") editMessage(); if(e.key==="Escape") setEditingId(null); }} style={{flex:1, background:"var(--bg)", border:"1px solid var(--accent)", color:"var(--text)", padding:"6px", fontSize:13}} autoFocus />
                              <button className="btn btn-primary" onClick={editMessage}>KAYDET</button><button className="btn" onClick={()=>setEditingId(null)}>İPTAL</button>
                            </div>
                          ) : (
                            <div className="msg-content"><RenderContent text={m.content} /></div>
                          )}
                          {m.attachment && (()=>{
                            const c = attCache[m.id];
                            const meta = m.attachment;
                            if(meta.type==="image"){
                              return c?.dataUrl ? (
                                <img src={c.dataUrl} alt={meta.name} style={{marginTop:6, maxWidth:"100%", maxHeight:340, border:"1px solid var(--border)", cursor:"zoom-in", display:"block"}} onClick={()=>setLightbox({src:c.dataUrl!, name:meta.name})}/>
                              ) : (
                                <button style={{marginTop:6}} className="btn" onClick={()=>loadAttachment(m)} disabled={c?.loading}>{c?.loading ? "yükleniyor…" : `🖼 ${meta.name} (${fmtSize(meta.size)}) — göster`}</button>
                              );
                            }
                            if(meta.type==="video"){
                              return c?.dataUrl ? (
                                <video src={c.dataUrl} controls style={{marginTop:6, maxWidth:"100%", maxHeight:380, border:"1px solid var(--border)", display:"block"}}/>
                              ) : (
                                <button style={{marginTop:6}} className="btn" onClick={()=>loadAttachment(m)} disabled={c?.loading}>{c?.loading ? "yükleniyor…" : `▶ ${meta.name} (${fmtSize(meta.size)}) — oynat`}</button>
                              );
                            }
                            if(meta.type==="audio"){
                              return c?.dataUrl ? (
                                <audio src={c.dataUrl} controls style={{marginTop:6, width:"100%", display:"block"}}/>
                              ) : (
                                <button style={{marginTop:6}} className="btn" onClick={()=>loadAttachment(m)} disabled={c?.loading}>{c?.loading ? "yükleniyor…" : <><span className="icon"><Icon name="music" size={11}/></span> {meta.name} ({fmtSize(meta.size)})</>}</button>
                              );
                            }
                            return c?.error ? (
                              <div style={{marginTop:6, fontFamily:"var(--font-mono)", fontSize:10, color:"var(--danger)", border:"1px dashed var(--border)", padding:"4px 8px", display:"inline-block", borderRadius:"var(--r-xs)"}}>{c.error}</div>
                            ) : (
                              <button style={{marginTop:6}} className="btn" onClick={()=>downloadAttachment(m)} disabled={c?.loading}>⎘ {c?.loading ? "hazırlanıyor…" : `${meta.name} (${fmtSize(meta.size)}) — indir`}</button>
                            );
                          })()}
                          {m.poll && (()=>{
                            const poll=m.poll;
                            const votes=pollVotesMap[poll.id]||{};
                            const counts: Record<string,number> = {};
                            poll.options.forEach(o=>{counts[o.id]=0;});
                            Object.values(votes).forEach(opt=>{ if(counts[opt]!==undefined) counts[opt]++; });
                            const total=Object.values(counts).reduce((a,b)=>a+b,0);
                            const myVote=user ? votes[user.uid] : undefined;
                            return (
                              <div className="poll">
                                <q>{poll.question}</q>
                                {poll.options.map(o=>{
                                  const n=counts[o.id]||0;
                                  const pct= total>0 ? Math.round((n/total)*100) : 0;
                                  return (
                                    <div key={o.id} className="poll-option" style={myVote===o.id?{borderColor:"var(--accent)", background:"var(--surface-3)"}:undefined} onClick={()=>castVote(poll.id,o.id)}>
                                      <span style={{fontSize:11, fontWeight:700}}>{o.text}</span>
                                      <span className="bar"><i style={{width:`${pct}%`}}/></span>
                                      <span style={{fontFamily:"var(--font-mono)", fontSize:10}}>{n}</span>
                                      {myVote===o.id && <span style={{fontSize:10}}>✓</span>}
                                    </div>
                                  );
                                })}
                                <div style={{fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--muted)", marginTop:6, textAlign:"right"}}>{total} oy{myVote?" — oyunu değiştirebilirsin":""}</div>
                              </div>
                            );
                          })()}
                          {m.githubCard && (
                            <a href={m.githubCard.htmlUrl} target="_blank" rel="noopener noreferrer" className="github-card" onClick={e=>e.stopPropagation()}>
                              <div className="github-card-head"><span className="icon"><Icon name="github" size={14}/></span> GITHUB <span style={{marginLeft:"auto", fontSize:10.5, color:"var(--muted)"}}>{m.githubCard.language||""}</span></div>
                              <div className="github-card-body">
                                <img src={m.githubCard.ownerAvatar} alt="" className="github-card-avatar"/>
                                <div style={{flex:1, minWidth:0}}>
                                  <div className="github-card-title">{m.githubCard.fullName}</div>
                                  {m.githubCard.description && <div className="github-card-desc">{m.githubCard.description}</div>}
                                  <div className="github-card-stats"><span>★ {m.githubCard.stars.toLocaleString("tr-TR")}</span><span>⑂ {m.githubCard.forks.toLocaleString("tr-TR")}</span><span style={{marginLeft:"auto", fontSize:10.5, color:"var(--muted)"}}>github.com</span></div>
                                </div>
                              </div>
                            </a>
                          )}
                          {m.musicCard && (
                            <div className="music-card">
                              <img src={m.musicCard.artworkUrl} alt="" className="music-card-art"/>
                              <div style={{flex:1, minWidth:0}}>
                                <div className="music-card-title">{m.musicCard.trackName}</div>
                                <div className="music-card-artist">{m.musicCard.artistName} • {m.musicCard.collectionName}</div>
                                {m.musicCard.primaryGenre && <div className="music-card-genre">{m.musicCard.primaryGenre}</div>}
                                <div className="music-card-actions">
                                  {m.musicCard.previewUrl && <audio className="music-preview" src={m.musicCard.previewUrl} controls preload="none" style={{height:28, width:"100%", maxWidth:240}} onPlay={(e)=>{ const cur=e.currentTarget; document.querySelectorAll('audio.music-preview').forEach(a=>{ if(a!==cur) { (a as HTMLAudioElement).pause(); try{(a as HTMLAudioElement).currentTime=0;}catch{} } }); }}/>}
                                  <a href={m.musicCard.trackViewUrl} target="_blank" rel="noopener noreferrer" className="btn" style={{fontSize:10.5, padding:"4px 8px"}}>Apple Music →</a>
                                </div>
                              </div>
                            </div>
                          )}
                          {Object.keys(reactions).length>0 && (
                            <div className="msg-reactions">
                              {Object.entries(reactions).map(([emoji,info])=>(
                                <button key={emoji} className={`msg-reaction ${info.me?"active":""}`} onClick={()=>toggleReaction(m.id, emoji)}><span>{emoji}</span><span>{info.count}</span></button>
                              ))}
                            </div>
                          )}
                          {threadMessages[m.id]?.length ? (
                            <button style={{marginTop:6, border:"1px solid var(--border)", background:"var(--surface-2)", padding:"4px 6px", fontFamily:"var(--font-mono)", fontSize:10}} onClick={()=>openThread(m)}>
                              {threadMessages[m.id].length} yanıt
                            </button>
                          ): null}
                        </div>
                        <div className="msg-actions">
                          {QUICK_REACTIONS.map(e=> <button key={e} onClick={()=>toggleReaction(m.id, e)}>{e}</button>)}
                          <button onClick={()=>setReplyTo(m)}>↳</button>
                          <button onClick={()=>openThread(m)}>⧉</button>
                          <button onClick={()=>{
                            if(isMe){ setEditingId(m.id); setEditContent(m.content); } else setToast("sadece kendi mesajın");
                          }}>✎</button>
                          <button onClick={()=>{ navigator.clipboard?.writeText(m.content).then(()=>setToast("kopyalandı"));}}>⎘</button>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef}/>
                </>
              )}
            </div>

            <div className="typing-indicator">
              {typingText ? (
                <>
                  <span className="typing-dots"><i/><i/><i/></span>
                  <span style={{color:"var(--text-2)", fontSize:13}}>{typingText}</span>
                </>
              ) : (
                <span style={{color:"transparent", userSelect:"none"}}>—</span>
              )}
            </div>

            {!isDemo && selectedChannelData?.type!=="voice" && (
              <div className="composer-wrap">
                {pendingFile && (
                  <div style={{border:"1px solid var(--border)", background:"var(--surface-2)", padding:"6px 8px", marginBottom:6, display:"flex", alignItems:"center", gap:8}}>
                    {pendingFile.preview ? (
                      <img src={pendingFile.preview} alt="" style={{width:36, height:36, objectFit:"cover", border:"1px solid var(--border)"}}/>
                    ) : (
                      <div style={{width:36, height:36, border:"1px solid var(--border)", display:"grid", placeItems:"center", color:"var(--muted)"}}><span className="icon">{attachmentKind(pendingFile.file)==="video" ? <Icon name="cam" size={16}/> : attachmentKind(pendingFile.file)==="audio" ? <Icon name="music" size={16}/> : <Icon name="paperclip" size={16}/>}</span></div>
                    )}
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontFamily:"var(--font-mono)", fontSize:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{pendingFile.file.name}</div>
                      <div style={{fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--muted)"}}>{fmtSize(pendingFile.file.size)}{sendingAttachment ? " — gönderiliyor…" : " — Enter ile gönder"}</div>
                    </div>
                    <button onClick={()=>{ if(!sendingAttachment) setPendingFile(null); }} style={{border:"1px solid var(--border)", background:"transparent", color:"var(--muted)", width:22, height:22}}><span className="icon"><Icon name="close" size={12}/></span></button>
                  </div>
                )}
                {replyTo && (
                  <div className="composer-reply">
                    <span>↳ <strong>{replyTo.authorName}</strong> — {replyTo.content.slice(0,60)}</span>
                    <button onClick={()=>setReplyTo(null)} style={{border:"1px solid var(--border)", background:"transparent", padding:"2px 6px"}}><span className="icon"><Icon name="close" size={12}/></span></button>
                  </div>
                )}
                <form className="composer" onSubmit={sendMessage} style={{alignItems:"center"}}>
                  <button type="button" onClick={()=>setShowPlusMenu(v=>!v)} className="composer-plus" title="Dosya ekle"><span className="icon"><Icon name="plus" size={16}/></span></button>
                  <div className="composer-main">
                    <textarea
                      ref={composerRef}
                      className="composer-input"
                      value={draft}
                      onChange={e=>updateDraft(e.target.value)}
                      onKeyDown={handleComposerKey}
                      placeholder={`#${selectedChannelData?.name ?? "genel"} mesaj gönder`}
                      rows={1}
                    />
                  </div>
                  <div className="composer-actions">
                    <button type="button" onClick={()=>setShowGif(v=>!v)} title="GIF">GIF</button>
                    <button type="button" onClick={()=>setShowEmoji(v=>!v)} title="Emoji">☺</button>
                    <button type="submit" className="send-button" disabled={!draft.trim()} title="Gönder"><span className="icon"><Icon name="send" size={18}/></span></button>
                  </div>
                </form>
                {showPlusMenu && (
                  <div style={{position:"absolute", bottom:52, left:12, background:"var(--surface)", border:"1px solid var(--border)", padding:6, display:"flex", gap:6, zIndex:5}}>
                    <label style={{border:"1px solid var(--border)", padding:"6px 8px", fontFamily:"var(--font-mono)", fontSize:11, cursor:"pointer"}}>DOSYA<input type="file" hidden accept="image/*,video/*,audio/*,.pdf,.zip,.txt,.doc,.docx,.json,.csv,.mp4,.webm" onChange={e=>{const f=e.target.files?.[0]; if(f) handleFileSelected(f); e.currentTarget.value="";}} /></label>
                    <button className="btn" onClick={()=>{setShowPoll(true); setShowPlusMenu(false);}}>POLL</button>
                    <button className="btn" onClick={()=>{setShowGif(true); setShowPlusMenu(false);}}>GIF</button>
                  </div>
                )}
                {showPoll && (
                  <div style={{marginTop:8, border:"1px solid var(--border)", background:"var(--surface-2)", padding:10}}>
                    <div style={{fontFamily:"var(--font-mono)", fontSize:11, fontWeight:700, marginBottom:8}}>POLL</div>
                    <input value={pollQ} onChange={e=>setPollQ(e.target.value)} placeholder="Soru" style={{width:"100%", background:"var(--bg)", border:"1px solid var(--border)", color:"var(--text)", padding:"7px", fontFamily:"var(--font-mono)", fontSize:12, marginBottom:6}} />
                    {pollOpts.map((o,i)=>(
                      <div key={i} style={{display:"flex", gap:6, marginBottom:4}}>
                        <input value={o} onChange={e=>setPollOpts(prev=>prev.map((x,idx)=> idx===i? e.target.value: x))} placeholder={`Seçenek ${i+1}`} style={{flex:1, background:"var(--bg)", border:"1px solid var(--border)", color:"var(--text)", padding:"7px", fontSize:12}} />
                        <button onClick={()=>setPollOpts(p=>p.filter((_,idx)=>idx!==i))} style={{border:"1px solid var(--border)", background:"transparent"}}><span className="icon"><Icon name="close" size={12}/></span></button>
                      </div>
                    ))}
                    <div style={{display:"flex", gap:6, marginTop:8}}>
                      <button className="btn" onClick={()=>setPollOpts(p=>[...p,""])}>+ SEÇENEK</button>
                      <button className="btn btn-primary" onClick={()=>{
                        if(!pollQ.trim() || pollOpts.filter(s=>s.trim()).length<2){ setToast("en az 2 seçenek"); return; }
                        const charset="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"; const gen=()=> Array.from(crypto.getRandomValues(new Uint8Array(8)), b=>charset[b%charset.length]).join('').slice(0,8);
                        const poll={id: gen(), question: pollQ.trim(), options: pollOpts.filter(s=>s.trim()).map((t,i)=>({id:i.toString(), text:t.trim(), votes:0})), totalVotes:0, allowMultiple:false};
                        const r=push(ref(db,`messages/${selectedServer}/${selectedChannel}`));
                        set(r,{serverId:selectedServer, channelId:selectedChannel, authorId:user.uid, content: poll.question, authorName: profile?.displayName??username, createdAt: serverTimestamp(), poll});
                        setPollQ(""); setPollOpts(["",""]); setShowPoll(false);
                      }}>GÖNDER</button>
                      <button className="btn" onClick={()=>setShowPoll(false)}>İPTAL</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {showEmoji && <div className="picker"><div className="picker-title">EMOJİ <button onClick={()=>setShowEmoji(false)}><span className="icon"><Icon name="close" size={12}/></span></button></div><div className="emoji-grid">{EMOJIS.map(e=><button key={e} onClick={()=>{updateDraft(draft + e); setShowEmoji(false);}}>{e}</button>)}</div></div>}
            {showGif && <div className="picker"><div className="picker-title">GIF <button onClick={()=>setShowGif(false)}><span className="icon"><Icon name="close" size={12}/></span></button></div><div className="picker-search"><input value={gifSearch} onChange={e=>setGifSearch(e.target.value)} onKeyDown={e=> e.key==="Enter" && searchGifs()} placeholder="ara..." /><button onClick={searchGifs}>ARA</button></div><div className="gif-grid">{gifResults.map(u=><button key={u} onClick={()=>{updateDraft(draft + " " + u); setShowGif(false);}}><img src={u} alt="gif" /></button>)}{gifResults.length===0 && <div style={{gridColumn:"1 / -1", fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)", padding:8, border:"1px dashed var(--border)", textAlign:"center"}}>giphy — API boşsa çalışmaz</div>}</div></div>}

            {showThread && (
              <div className="thread-drawer">
                <div className="thread-head"><span>THREAD</span><button onClick={()=>setShowThread(false)}><span className="icon"><Icon name="close" size={12}/></span></button></div>
                <div className="thread-body">
                  {threadParent ? (
                    <>
                      <div style={{border:"1px solid var(--border)", padding:10, background:"var(--surface-2)", marginBottom:10}}>
                        <div style={{fontSize:12, fontWeight:700}}>{threadParent.authorName}</div><div style={{fontSize:12, color:"var(--muted)"}}>{threadParent.content}</div>
                      </div>
                      {(threadMessages[threadParent.id]||[]).map(tm=>(
                        <div key={tm.id} style={{display:"flex", gap:8, padding:"6px 0", borderBottom:"1px solid var(--border)"}}>
                          <div className="msg-avatar" style={{width:24, height:24, fontSize:10.5}}>{initials(tm.authorName||"??")}</div>
                          <div style={{flex:1}}><div style={{fontSize:12, fontWeight:600}}>{tm.authorName} <span style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)"}}>{fmtTime(tm.createdAt)}</span></div><div style={{fontSize:12}}>{tm.content}</div></div>
                        </div>
                      ))}
                      { (threadMessages[threadParent.id]||[]).length===0 && <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)"}}>yanıt yok</div>}
                    </>
                  ) : <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)"}}>bir mesajda ⧉ ile thread aç</div>}
                </div>
                {threadParent && <div className="thread-composer"><input value={threadDraft} onChange={e=>setThreadDraft(e.target.value)} onKeyDown={e=> e.key==="Enter" && sendThread()} placeholder="yanıt..." /><button className="btn btn-primary" onClick={sendThread}>GÖNDER</button></div>}
              </div>
            )}

            {contextMenu && (
              <div className="context-menu" style={{left:contextMenu.x, top:contextMenu.y}}>
                <div className="context-item" onClick={()=>{toggleReaction(contextMenu.msg.id, "❤️"); setContextMenu(null);}}>❤️ Tepki</div>
                <div className="context-item" onClick={()=>{setReplyTo(contextMenu.msg); setContextMenu(null);}}>↳ Yanıtla</div>
                <div className="context-item" onClick={()=>{openThread(contextMenu.msg); setContextMenu(null);}}>⧉ Thread</div>
                <div className="context-item" onClick={()=>{navigator.clipboard.writeText(contextMenu.msg.content); setToast("kopyalandı"); setContextMenu(null);}}>⎘ Kopyala</div>
                {contextMenu.msg.authorId===user.uid && <div className="context-item" onClick={()=>{setEditingId(contextMenu.msg.id); setEditContent(contextMenu.msg.content); setContextMenu(null);}}>✎ Düzenle</div>}
                {contextMenu.msg.authorId===user.uid && <div className="context-item danger" onClick={()=>{deleteMessage(contextMenu.msg); setContextMenu(null);}}>Sil</div>}
              </div>
            )}
          </>
        )}
      </section>

      {activeView==="server" && !isDemo && showMembers && (
        <aside className="member-sidebar">
          <div className="ms-head">
            <strong>ÜYELER — {members.length}</strong>
            <button onClick={()=>setShowMembers(false)} style={{border:"1px solid var(--border)", background:"transparent", width:22, height:22, display:"grid", placeItems:"center"}}><span className="icon"><Icon name="close" size={12}/></span></button>
          </div>
          <div className="member-scroll">
            {members.length===0 ? (
              <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)", padding:12, textAlign:"center"}}>henüz üye yok</div>
            ) : (
              <div className="member-group">
                <div className="member-group-title">ÇEVRİMİÇİ — {members.length}</div>
                {members.map(m=>(
                  <div key={m.uid} className="member-row" style={{alignItems:"flex-start", cursor:"pointer"}} onClick={()=>openProfile(m.uid)}>
                    <div className="m-av" role="button" tabIndex={0} onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault(); openProfile(m.uid);}}} style={{cursor:"pointer", display:"grid", placeItems:"center"}}>{m.profile?.avatarUrl ? <img src={m.profile.avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : initials(m.profile?.displayName||m.profile?.username||"??")}<i className="status-dot online"/></div>
                    <div style={{flex:1, minWidth:0}}><div className="m-name">{m.profile?.displayName||m.profile?.username}</div><small>{m.role}</small>{m.profile?.nowPlaying && <small style={{display:"flex", alignItems:"center", gap:4, color:"var(--spotify)", marginTop:2}}><span className="icon"><Icon name="music" size={10}/></span><span style={{overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{m.profile.nowPlaying.track} — {m.profile.nowPlaying.artist}</span></small>}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      )}

      {showCreateServer && (
        <div className="modal-backdrop" onClick={()=>setShowCreateServer(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-head"><span>SUNUCU OLUŞTUR</span><button onClick={()=>setShowCreateServer(false)}><span className="icon"><Icon name="close" size={12}/></span></button></div>
            <div className="modal-body">
              <div className="icon-upload">
                {newServerIcon ? <img src={newServerIcon} alt=""/> : <span className="icon"><Icon name="grid" size={22}/></span>}
                <label className="icon-upload-btn">FOTOĞRAF SEÇ<input type="file" accept="image/*" hidden onChange={e=>{const f=e.target.files?.[0]; if(!f) return; const r=new FileReader(); r.onload=()=>setNewServerIcon(String(r.result)); r.readAsDataURL(f);}} /></label>
                {newServerIcon && <button className="icon-upload-btn" onClick={()=>setNewServerIcon("")}>KALDIR</button>}
              </div>
              <label>SUNUCU ADI</label>
              <input value={newServerName} onChange={e=>setNewServerName(e.target.value)} placeholder="AKAY-ops" autoFocus />
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={()=>setShowCreateServer(false)}>İPTAL</button>
              <button className="btn btn-primary" onClick={()=>{ createServer(); setNewServerIcon(""); }} disabled={!newServerName.trim() || creatingServer}>{creatingServer ? "OLUŞTURULUYOR..." : "OLUŞTUR"}</button>
            </div>
          </div>
        </div>
      )}

      {showCreateChannel && (
        <div className="modal-backdrop" onClick={()=>setShowCreateChannel(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-head"><span>KANAL OLUŞTUR</span><button onClick={()=>setShowCreateChannel(false)}><span className="icon"><Icon name="close" size={12}/></span></button></div>
            <div className="modal-body">
              <label>TİP</label>
              <select value={newChannelType} onChange={e=>setNewChannelType(e.target.value as Channel["type"])}>
                <option value="text"># metin</option>
                <option value="voice">⌁ ses</option>
              </select>
              <label>AD</label>
              <input value={newChannelName} onChange={e=>setNewChannelName(e.target.value)} placeholder="genel" />
              <label>KATEGORİ</label>
              <select value={newChannelCat} onChange={e=>setNewChannelCat(e.target.value)}>
                <option value="">— yok —</option>
                {categories.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={()=>setShowCreateChannel(false)}>İPTAL</button>
              <button className="btn btn-primary" onClick={createChannel}>OLUŞTUR</button>
            </div>
          </div>
        </div>
      )}
      {editingChannel && (
        <div className="modal-backdrop" onClick={()=>setEditingChannel(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-head"><span>KANALI DÜZENLE — #{editingChannel.name}</span><button onClick={()=>setEditingChannel(null)}><span className="icon"><Icon name="close" size={12}/></span></button></div>
            <div className="modal-body">
              <label>KANAL ADI</label>
              <input value={editChannelName} onChange={e=>setEditChannelName(e.target.value)} placeholder="genel" />
              <label>TOPIC — KANAL KONUSU</label>
              <input value={editChannelTopic} onChange={e=>setEditChannelTopic(e.target.value)} placeholder="bu kanalda ne konuşulur?" />
              <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)", marginTop:4}}>Boş bırakırsan topic silinir. Ad küçük harf ve tire ile kaydedilir.</div>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={()=>setEditingChannel(null)}>İPTAL</button>
              <button className="btn btn-danger" onClick={()=>{ if(editingChannel) deleteChannel(editingChannel.id); setEditingChannel(null); }}>SİL</button>
              <button className="btn btn-primary" onClick={saveChannelEdit}>KAYDET</button>
            </div>
          </div>
        </div>
      )}

      {showInvite && (
        <div className="modal-backdrop" onClick={()=>setShowInvite(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-head"><span>DAVET</span><button onClick={()=>setShowInvite(false)}><span className="icon"><Icon name="close" size={12}/></span></button></div>
            <div className="modal-body">
              <button className="btn btn-primary" onClick={createInvite}>KOD ÜRET</button>
              {inviteCode && (
                <div style={{marginTop:12, border:"1px solid var(--accent)", padding:10, background:"var(--accent)", color:"var(--accent-fg)"}}>
                  <div style={{fontFamily:"var(--font-mono)", fontSize:18, fontWeight:800, letterSpacing:".12em"}}>{inviteCode}</div>
                  <button className="btn" style={{marginTop:8, borderColor:"var(--border-strong)"}} onClick={()=>{navigator.clipboard.writeText(inviteCode); setToast("kopyalandı");}}>KOPYALA</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showJoinInvite && (
        <div className="modal-backdrop" onClick={()=>setShowJoinInvite(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-head"><span>DAVETLE KATIL</span><button onClick={()=>setShowJoinInvite(false)}><span className="icon"><Icon name="close" size={12}/></span></button></div>
            <div className="modal-body">
              <div className="join-invite-card">
                <div className="join-invite-icon"><span className="icon"><Icon name="invite" size={26}/></span></div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontWeight:800, fontSize:16}}>Bir davet kodun mu var?</div>
                  <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)", marginTop:4}}>6 haneli kodu gir, arkadaşlarının sunucusuna katıl.</div>
                </div>
                <div className="join-invite-input">
                  <span className="join-invite-caret">›</span>
                  <input value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6))} placeholder="ABC123" autoFocus maxLength={6} />
                  <button className="btn btn-primary" onClick={async()=>{ if(!joinCode.trim())return; setJoiningInvite(true); setShowJoinInvite(false); await joinViaInvite(); setJoiningInvite(false); }} disabled={joiningInvite || joinCode.length!==6}>{joiningInvite ? "..." : "KATIL"}</button>
                </div>
                <button className="btn" onClick={()=>{ setShowJoinInvite(false); setShowCreateServer(true); }} style={{alignSelf:"center", borderColor:"var(--border)", background:"transparent"}}>ya da yeni bir sunucu oluştur →</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showServerInviteMenu && (
        <div className="modal-backdrop" onClick={()=>setShowServerInviteMenu(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{width:"min(420px,100%)"}}>
            <div className="modal-head"><span>DAVET ET — {selectedServerData?.name || "SUNUCU"}</span><button onClick={()=>setShowServerInviteMenu(false)}><span className="icon"><Icon name="close" size={12}/></span></button></div>
            <div className="modal-body">
              <button className="invite-method" onClick={()=>{ setShowServerInviteMenu(false); setShowInvite(true); }}>
                <span className="invite-method-icon"><span className="icon"><Icon name="invite" size={16}/></span></span>
                <span style={{flex:1, textAlign:"left"}}>
                  <strong>KOD İLE DAVET ET</strong>
                  <small>6 haneli kod üret — kodu olan herkes katılabilir, arkadaş olmayanlara da verebilirsin</small>
                </span>
                <span className="invite-method-arrow">→</span>
              </button>
              <button className="invite-method" onClick={()=>{ setShowServerInviteMenu(false); setServerFriendInvites({}); setShowServerFriendPicker(true); }}>
                <span className="invite-method-icon"><span className="icon"><Icon name="users" size={16}/></span></span>
                <span style={{flex:1, textAlign:"left"}}>
                  <strong>ARKADAŞLARI DAVET ET</strong>
                  <small>sadece arkadaşlarına doğrudan davet gönder — kabul edenler anında katılır</small>
                </span>
                <span className="invite-method-arrow">→</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showServerFriendPicker && (
        <div className="modal-backdrop" onClick={()=>setShowServerFriendPicker(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{width:"min(440px,100%)"}}>
            <div className="modal-head"><span>ARKADAŞLARI DAVET ET — {selectedServerData?.name}</span><button onClick={()=>setShowServerFriendPicker(false)}><span className="icon"><Icon name="close" size={12}/></span></button></div>
            <div className="modal-body">
              {friends.length===0 ? (
                <div className="invite-pick-hint">arkadaş listen boş — önce arkadaşlık isteği gönder</div>
              ) : (
                <div style={{display:"flex", flexDirection:"column", gap:6, maxHeight:"46vh", overflow:"auto"}}>
                  {friends.map(f=>(
                    <div key={f.uid} className="friend-row" style={{marginBottom:0}}>
                      <span className="avatar" style={{border:"1px solid var(--border)", background:"var(--surface-3)", overflow:"hidden", flex:"0 0 auto"}}>{f.profile?.avatarUrl ? <img src={f.profile.avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : initials(f.profile?.displayName||f.profile?.username||"??")}</span>
                      <div style={{flex:1, minWidth:0}}>
                        <div data-friend-name style={{fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{f.profile?.displayName||f.profile?.username||f.uid.slice(0,6)}</div>
                        <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>@{f.profile?.username}</div>
                      </div>
                      {serverFriendInvites[f.uid] ? (
                        <span className="invited-mark">GÖNDERİLDİ ✓</span>
                      ) : (
                        <button className="btn btn-primary" style={{flex:"none"}} onClick={()=>{ void sendInviteToServer(f.uid, selectedServer); setServerFriendInvites(p=>({...p,[f.uid]:true})); }}>DAVET ET</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="invite-pick-hint" style={{marginTop:12}}>arkadaşın olmayan birini davet etmek için: davet et → kod ile davet et</div>
            </div>
          </div>
        </div>
      )}

      {inviteFriendTarget && (
        <div className="modal-backdrop" onClick={()=>setInviteFriendTarget(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-head"><span>SUNUCUYA DAVET ET</span><button onClick={()=>setInviteFriendTarget(null)}><span className="icon"><Icon name="close" size={12}/></span></button></div>
            <div className="modal-body">
              <div className="invite-pick-hint">davet edeceğin sunucuyu seç — arkadaşın daveti kabul ettiğinde doğrudan o sunucuya katılır</div>
              <div style={{display:"flex", flexDirection:"column", gap:8}}>
                {servers.filter(s=>s.id!=="demo" && myServerIds[s.id]).map(s=>(
                  <button key={s.id} className={`friend-row ${inviteFriendServer===s.id?"invite-selected":""}`} onClick={()=>setInviteFriendServer(s.id)} style={{cursor:"pointer", width:"100%", textAlign:"left"}}>
                    <span className="avatar" style={{cursor:"pointer", border:"1px solid var(--border)", background:"var(--surface-3)", overflow:"hidden"}}>{s.iconUrl ? <img src={s.iconUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : initials(s.name)}</span>
                    <span style={{flex:1, fontWeight:600, fontSize:13}}>{s.name}</span>
                    <span className="invite-radio">{inviteFriendServer===s.id ? "◉" : "○"}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={()=>setInviteFriendTarget(null)}>İPTAL</button>
              <button className="btn btn-primary" onClick={()=>void sendInviteToServer(inviteFriendTarget, inviteFriendServer)} disabled={!inviteFriendServer}>DAVET GÖNDER</button>
            </div>
          </div>
        </div>
      )}

      {showUserSettings && (
        <div className="modal-backdrop" onClick={()=>setShowUserSettings(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-head"><span>PROFİLİ DÜZENLE — Discord “Profiles” gibi</span><button onClick={()=>setShowUserSettings(false)}><span className="icon"><Icon name="close" size={12}/></span></button></div>
            <div className="modal-body" style={{maxHeight:"68vh", overflow:"auto", padding:14}}>
              <div style={{display:"flex", flexDirection:"column", gap:14}}>
                <div style={{border:"1px solid var(--border)", background:"var(--surface-2)", padding:10, display:"flex", gap:10, alignItems:"center"}}>
                  <div style={{width:48, height:48, border:"1px solid var(--border)", background:"var(--bg)", display:"grid", placeItems:"center", overflow:"hidden", position:"relative", flex:"0 0 auto"}}>
                    {profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : <span style={{fontFamily:"var(--font-mono)", fontWeight:700}}>{initials(profile?.displayName ?? username)}</span>}
                    {profile?.decoration && profile.decoration.startsWith("http") && <img src={profile.decoration} alt="" onError={(e)=>{(e.currentTarget as HTMLImageElement).style.display="none"}} style={{position:"absolute", inset:-8, width:"calc(100% + 16px)", height:"calc(100% + 16px)", pointerEvents:"none"}}/>}
                    {profile?.decoration && !profile.decoration.startsWith("http") && <div style={{position:"absolute", inset:-2, border:"2px solid var(--accent)", borderRadius: profile.decoration==="circle" ? "50%" : "0"}}/>}
                  </div>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontWeight:700, fontSize:13}}>{profile?.displayName || "—"}</div>
                    <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)"}}>@{profile?.username} {profile?.pronouns ? `• ${profile.pronouns}` : ""} {profile?.title ? `• ${profile.title}` : ""}</div>
                  </div>
                  <span style={{fontFamily:"var(--font-mono)", fontSize:10, border:"1px solid var(--border)", padding:"4px 6px", color:"var(--muted)"}}>ÖNİZLEME</span>
                </div>

                <div>
                  <label>GÖRÜNEN İSİM</label>
                  <input value={profile?.displayName ?? ""} onChange={e=> setProfile(p=> p? {...p, displayName:e.target.value}:p)} placeholder="operator" />
                  <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:8}}>
                    <div>
                      <label>ÜNVAN — TITLE <span style={{fontWeight:400, textTransform:"none", letterSpacing:0}}>(serbest)</span></label>
                      <input value={profile?.title ?? ""} onChange={e=> setProfile(p=> p? {...p, title:e.target.value}:p)} placeholder="Founder • AKAY • ..." />
                    </div>
                    <div>
                      <label>PRONOUNS <span style={{fontWeight:400, textTransform:"none"}}>— ara</span></label>
                      <div style={{position:"relative"}}>
                        <input value={profile?.pronouns ?? ""} onChange={e=> setProfile(p=> p? {...p, pronouns:e.target.value}:p)} placeholder="he/him" list="pronouns-list" style={{width:"100%"}} />
                        <datalist id="pronouns-list">
                          {PRONOUNS_LIST.map(pr=> <option key={pr} value={pr}/>)}
                        </datalist>
                      </div>
                    </div>
                  </div>
                  <label style={{marginTop:8}}>ÖZEL DURUM</label>
                  <div style={{display:"flex", gap:6}}>
                    <input value={profile?.customStatusEmoji ?? ""} onChange={e=> setProfile(p=> p? {...p, customStatusEmoji:e.target.value}:p)} placeholder="😀" style={{width:52, textAlign:"center"}} />
                    <input value={profile?.customStatus ?? ""} onChange={e=> setProfile(p=> p? {...p, customStatus:e.target.value}:p)} placeholder="Kod yazıyor..." style={{flex:1}} />
                  </div>
                </div>

                <div>
                  <label>BIO — HAKKIMDA</label>
                  <textarea value={profile?.bio ?? ""} onChange={e=> setProfile(p=> p? {...p, bio:e.target.value}:p)} placeholder="kendini anlat — **kalın**, `kod`, emoji" rows={2} style={{width:"100%", background:"var(--bg)", border:"1px solid var(--border)", color:"var(--text)", padding:"8px", fontFamily:"var(--font-mono)", fontSize:12}} />
                </div>

                <div>
                  <label>BAĞLANTILAR — CONNECTIONS <span style={{fontWeight:400, textTransform:"none", letterSpacing:0}}>(kullanıcı adı veya tam link)</span></label>
                  <div style={{display:"flex", flexDirection:"column", gap:6}}>
                    <input value={connGithub} onChange={e=>setConnGithub(e.target.value)} placeholder="github: kerimhypr" style={{background:"var(--bg)", border:"1px solid var(--border)", color:"var(--text)", padding:"7px 8px", fontFamily:"var(--font-mono)", fontSize:12}} />
                    <input value={connSpotify} onChange={e=>setConnSpotify(e.target.value)} placeholder="spotify: kullanıcı adı veya link" style={{background:"var(--bg)", border:"1px solid var(--border)", color:"var(--text)", padding:"7px 8px", fontFamily:"var(--font-mono)", fontSize:12}} />
                    <input value={connSite} onChange={e=>setConnSite(e.target.value)} placeholder="site: example.com" style={{background:"var(--bg)", border:"1px solid var(--border)", color:"var(--text)", padding:"7px 8px", fontFamily:"var(--font-mono)", fontSize:12}} />
                  </div>
                </div>

                <div style={{borderTop:"1px solid var(--border)", paddingTop:12}}>
                  <label>AVATAR</label>
                  <div style={{display:"flex", gap:8, alignItems:"center"}}>
                    <label style={{flex:1, border:"1px dashed var(--border)", padding:"10px", textAlign:"center", cursor:"pointer", fontFamily:"var(--font-mono)", fontSize:10, background:"var(--surface)"}}>
                      FOTOĞRAF SEÇ
                      <input type="file" accept="image/*" hidden onChange={e=>{const f=e.target.files?.[0]; if(f) handleAvatarFile(f);}} />
                    </label>
                    <input value={profile?.avatarUrl ?? ""} onChange={e=> setProfile(p=> p? {...p, avatarUrl:e.target.value}:p)} placeholder="https://..." style={{flex:1, fontSize:11}} />
                  </div>
                </div>

                <div>
                  <label>DEKORASYON — Discord tarzı <span style={{fontWeight:400, textTransform:"none"}}>({DECORATIONS.length} adet)</span></label>
                  <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(56px, 1fr))", gap:6, maxHeight:120, overflow:"auto", border:"1px solid var(--border)", padding:6, background:"var(--bg)"}}>
                    {DECORATIONS.map(d=>(
                      <button key={d.id} onClick={()=>setProfile(p=>p?{...p, decoration: d.url || undefined}:p)} title={d.label} style={{aspectRatio:"1", border:"1px solid var(--border)", background: (profile?.decoration||"")===d.url ? "var(--accent)" : "var(--surface-3)", display:"grid", placeItems:"center", overflow:"hidden", position:"relative", padding:0}}>
                        {d.url ? <img src={d.url} alt={d.label} style={{width:"140%", height:"140%", objectFit:"contain", position:"absolute", inset:"-20%"}} loading="lazy" onError={(e)=>{ (e.currentTarget as HTMLImageElement).style.display="none"; }}/> : <span style={{fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--muted)"}}>YOK</span>}
                        <span style={{position:"absolute", bottom:1, left:0, right:0, background:"rgba(0,0,0,.7)", color:"var(--text)", fontFamily:"var(--font-mono)", fontSize:8, textAlign:"center", padding:"1px 0", lineHeight:1.2}}>{d.label.slice(0,6)}</span>
                      </button>
                    ))}
                  </div>
                  <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--dim)", marginTop:4}}>seçili: {(profile?.decoration && DECORATIONS.find(d=>d.url===profile.decoration)?.label) || "YOK"} — internetten bulundu</div>
                </div>

                <details style={{border:"1px solid var(--border)", padding:8, background:"var(--surface-2)"}}>
                  <summary style={{fontFamily:"var(--font-mono)", fontSize:10, cursor:"pointer", letterSpacing:".06em"}}>GELİŞMİŞ — BANNER / ROZET / ACCENT</summary>
                  <div style={{marginTop:10}}>
                    <label>BANNER</label>
                    <div style={{height:44, border:"1px solid var(--border)", background: profile?.bannerUrl ? `url(${profile.bannerUrl}) center/cover` : (profile?.bannerColor || "#fff"), position:"relative"}}>
                      {!profile?.bannerUrl && <div style={{position:"absolute", inset:0, backgroundImage:"linear-gradient(to right, var(--border) 1px, transparent 1px)", backgroundSize:"14px 14px", opacity:.2}}/>}
                    </div>
                    <div style={{display:"flex", gap:4, marginTop:6}}>
                      <label style={{flex:1, border:"1px dashed var(--border)", padding:"6px", textAlign:"center", cursor:"pointer", fontFamily:"var(--font-mono)", fontSize:10}}>YÜKLE<input type="file" accept="image/*" hidden onChange={async e=>{const f=e.target.files?.[0]; if(!f) return; if(f.size>3*1024*1024){setToast("3MB"); return;} const r=new FileReader(); r.onload=async()=>{const url=r.result as string; setProfile(p=>p?{...p, bannerUrl:url}:p);}; r.readAsDataURL(f);}} /></label>
                      <input type="color" value={profile?.bannerColor || "#ffffff"} onChange={e=>setProfile(p=>p?{...p, bannerColor:e.target.value}:p)} style={{width:28, height:28}} />
                      <button className="btn" onClick={()=>setProfile(p=>p?{...p, bannerUrl:undefined, bannerColor:undefined}:p)} style={{fontSize:10}}>SİL</button>
                    </div>
                    <label style={{marginTop:8}}>ROZETLER</label>
                    <div style={{display:"flex", gap:4, flexWrap:"wrap"}}>
                      {["OPERATOR","EARLY","BOOSTER","DEV","AKAY"].map(b=>{
                        const has = (profile?.badges||[]).includes(b);
                        return <button key={b} onClick={()=>setProfile(p=>{const cur=p?.badges||[]; const next= has ? cur.filter(x=>x!==b) : [...cur,b]; return p?{...p, badges: next}:p;})} style={{border:"1px solid var(--border)", background: has ? "var(--accent)":"transparent", color: has ? "var(--accent-fg)":"var(--muted)", padding:"4px 6px", fontFamily:"var(--font-mono)", fontSize:10.5, fontWeight:700}}>{b}</button>
                      })}
                    </div>
                    <label>ACCENT</label>
                    <input type="color" value={profile?.accentColor || "#ffffff"} onChange={e=>setProfile(p=>p?{...p, accentColor:e.target.value}:p)} style={{width:"100%", height:28}} />
                  </div>
                </details>
              </div>
              <div style={{display:"flex", gap:8, marginTop:14, borderTop:"1px solid var(--border)", paddingTop:12}}>
                <button className="btn btn-primary" onClick={async()=>{
                  if(!user || !profile) return;
                  await update(ref(db,`users/${user.uid}/public`), {
                    displayName: profile.displayName,
                    title: profile.title||"",
                    bio: profile.bio||"",
                    avatarUrl: profile.avatarUrl||"",
                    pronouns: profile.pronouns||"",
                    customStatus: profile.customStatus||"",
                    customStatusEmoji: profile.customStatusEmoji||"",
                    bannerUrl: profile.bannerUrl||"",
                    bannerColor: profile.bannerColor||"",
                    decoration: profile.decoration||"",
                    badges: profile.badges||[],
                    accentColor: profile.accentColor||"",
                    connections: { github: connGithub.trim(), spotify: connSpotify.trim(), site: connSite.trim() },
                  });
                  setToast("profil güncellendi"); setShowUserSettings(false);
                }}>KAYDET</button>
                <button className="btn" onClick={()=>void doSignOut()}>ÇIKIŞ</button>
                <button className="btn" onClick={()=>setShowUserSettings(false)} style={{marginLeft:"auto"}}>KAPAT</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAccountSettings && (
        <div className="modal-backdrop" onClick={()=>setShowAccountSettings(false)}>
          <div className="modal account-settings-modal" onClick={e=>e.stopPropagation()} style={{width:"min(760px, 96vw)", maxHeight:"88vh", display:"flex", overflow:"hidden", padding:0}}>
            <div className="account-settings-nav" style={{width:200, borderRight:"1px solid var(--border)", background:"var(--surface-2)", padding:14, display:"flex", flexDirection:"column", gap:5, overflow:"auto"}}>
              <div style={{fontFamily:"var(--font-mono)", fontSize:10, letterSpacing:".08em", color:"var(--muted)", padding:"8px 8px 4px"}}>KULLANICI AYARLARI</div>
              {[
                {id:"hesabim", label:"Hesabım", icon:"user"},
                {id:"gorunum", label:"Görünüm", icon:"grid"},
                {id:"gizlilik", label:"Gizlilik", icon:"inbox"},
                {id:"cikis", label:"Çıkış", icon:"logout"},
              ].map(tab=>(
                <button key={tab.id} onClick={()=>setAccountTab(tab.id as any)} style={{textAlign:"left", padding:"8px 10px", border:"1px solid var(--border)", background: accountTab===tab.id ? "var(--accent)" : "transparent", color: accountTab===tab.id ? "var(--accent-fg)" : "var(--muted)", fontFamily:"var(--font-mono)", fontSize:11, fontWeight:700, display:"flex", alignItems:"center", gap:8}}>
                  <span className="icon"><Icon name={tab.icon}/></span>{tab.label}
                </button>
              ))}
              <div style={{marginTop:"auto", borderTop:"1px solid var(--border)", paddingTop:8}}>
                <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)", padding:"4px 8px"}}>{profile?.displayName}</div>
                <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--dim)", padding:"0 8px"}}>@{profile?.username}</div>
                <button className="btn btn-danger" onClick={()=>void doSignOut()} style={{width:"100%", marginTop:8, fontSize:10}}>ÇIKIŞ YAP</button>
              </div>
            </div>
            <div style={{flex:1, display:"flex", flexDirection:"column", minWidth:0, background:"var(--surface)"}}>
              <div className="modal-head"><span>{accountTab==="hesabim" ? "HESABIM" : accountTab==="gorunum" ? "GÖRÜNÜM" : accountTab==="gizlilik" ? "GİZLİLİK" : "ÇIKIŞ"}</span><button onClick={()=>setShowAccountSettings(false)}><span className="icon"><Icon name="close" size={12}/></span></button></div>
              <div style={{flex:1, overflow:"auto", padding:16}}>
                {accountTab==="hesabim" && (
                  <div style={{display:"flex", flexDirection:"column", gap:14}}>
                    <div style={{border:"1px solid var(--border)", background:"var(--surface-2)", padding:12, display:"flex", gap:12, alignItems:"center", minWidth:0}}>
                      <div style={{width:64, height:64, minWidth:64, border:"1px solid var(--border)", background:"var(--bg)", display:"grid", placeItems:"center", overflow:"hidden", position:"relative", flex:"0 0 auto"}}>
                        {profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : <span style={{fontFamily:"var(--font-mono)", fontWeight:700}}>{initials(profile?.displayName ?? username)}</span>}
                        {profile?.decoration && profile.decoration.startsWith("http") && <img src={profile.decoration} alt="" onError={(e)=>{(e.currentTarget as HTMLImageElement).style.display="none"}} style={{position:"absolute", inset:-6, width:"calc(100% + 12px)", height:"calc(100% + 12px)", pointerEvents:"none"}}/>}
                      </div>
                      <div style={{flex:1, minWidth:0, overflow:"hidden"}}>
                        <div style={{fontWeight:700, overflowWrap:"anywhere"}}>{profile?.displayName}</div>
                        <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)", overflowWrap:"anywhere"}}>@{profile?.username} • {user.email}</div>
                        <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--dim)", marginTop:2}}>Katılım: {profile?.createdAt ? fmtDate(profile.createdAt) : "—"} • ID: {user.uid.slice(0,8)}…</div>
                      </div>
                      <button className="btn" style={{flex:"0 0 auto", whiteSpace:"nowrap"}} onClick={()=>{setShowAccountSettings(false); setActiveView("profile");}}>PROFİLİ DÜZENLE</button>
                    </div>
                    <div style={{display:"flex", flexDirection:"column", gap:14}}>
                      <div className="account-settings-field">
                        <label>KULLANICI ADI</label>
                        <input value={profile?.username ?? ""} disabled />
                        <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--dim)", marginTop:4}}>Kullanıcı adın giriş için kullanılır — değiştirilemez (Discord’da da böyle).</div>
                      </div>
                      <div className="account-settings-grid">
                        <div className="account-settings-field">
                          <label>GÖRÜNEN İSİM</label>
                          <input value={profile?.displayName ?? ""} onChange={e=>setProfile(p=>p?{...p, displayName:e.target.value}:p)} placeholder="operator" />
                        </div>
                        <div className="account-settings-field">
                          <label>E-POSTA (otomatik)</label>
                          <input value={user.email || ""} disabled />
                        </div>
                      </div>
                      <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--dim)", marginTop:-6}}>E-posta = kullanıcı_adın@poseidon.local — Firebase Auth tarafından oluşturulur.</div>
                      <div className="account-settings-field">
                        <label>ŞİFRE DEĞİŞTİR</label>
                        <div style={{display:"flex", gap:6}}>
                          <input id="new-pass" type="password" placeholder="yeni şifre (6+)" style={{flex:1}} />
                          <button className="btn" style={{flex:"0 0 auto"}} onClick={async()=>{
                            const el=document.getElementById("new-pass") as HTMLInputElement;
                            const v=el?.value || "";
                            if(v.length<6){setToast("şifre 6+ olmalı"); return;}
                            try{ const {updatePassword}=await import("firebase/auth"); await updatePassword(user, v); el.value=""; setToast("şifre güncellendi"); }catch(e:any){ setToast(e.message || "hata"); }
                          }}>GÜNCELLE</button>
                        </div>
                      </div>
                    </div>
                    <div style={{border:"1px solid var(--spotify)", background:"rgba(29,185,84,.08)", padding:10}}>
                      <div style={{fontFamily:"var(--font-mono)", fontSize:11, fontWeight:700, color:"var(--spotify)", display:"flex", alignItems:"center", gap:6}}><span className="icon"><Icon name="music" size={12}/></span> ŞU AN DİNLİYOR — PROFİLDEN SEÇ</div>
                      <div style={{fontSize:11, color:"var(--spotify)", marginTop:4}}>iTunes Search (ücretsiz/keysiz) ile ara, profile yazılır — server'a mesaj gitmez.</div>
                      {profile?.nowPlaying && (
                        <div style={{marginTop:8, border:"1px solid var(--spotify)", background:"var(--bg)", padding:8, display:"flex", gap:8, alignItems:"center"}}>
                          {profile.nowPlaying.artwork && <img src={profile.nowPlaying.artwork} alt="" style={{width:40, height:40, flex:"0 0 auto"}}/>}
                          <div style={{flex:1, minWidth:0}}>
                            <div style={{fontSize:12, fontWeight:700, overflowWrap:"anywhere"}}>{profile.nowPlaying.track}</div>
                            <div style={{fontSize:11, color:"var(--muted)", overflowWrap:"anywhere"}}>{profile.nowPlaying.artist}</div>
                          </div>
                          <button className="btn" style={{borderColor:"var(--danger)", color:"var(--danger)", flex:"0 0 auto"}} onClick={async()=>{ try{ await update(ref(db,`users/${user.uid}/public`),{nowPlaying:null}); setProfile(p=>p?{...p, nowPlaying:null}:p); setToast("temizlendi"); }catch(e:any){setToast(e.message);} }}>TEMİZLE</button>
                        </div>
                      )}
                      <div style={{display:"flex", gap:6, marginTop:8}}>
                        <input value={npSearch} onChange={e=>setNpSearch(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){ (e.target as HTMLInputElement).blur(); void (async()=>{ if(!npSearch.trim()) return; setNpLoading(true); try{ const r=await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(npSearch.trim())}&media=music&entity=song&limit=4`); const j=await r.json(); setNpResults((j.results||[]).map((x:any)=>({trackName:x.trackName, artistName:x.artistName, artworkUrl:(x.artworkUrl100 as string)?.replace("100x100","300x300")??x.artworkUrl100, previewUrl:x.previewUrl??null, trackViewUrl:x.trackViewUrl, collectionName:x.collectionName, primaryGenre:x.primaryGenreName}))); }catch{setToast("arama hatası");} setNpLoading(false); })(); }}} placeholder="tarkan — şımarık" style={{flex:1}} />
                        <button className="btn btn-primary" disabled={npLoading} onClick={async()=>{ if(!npSearch.trim()) return; setNpLoading(true); try{ const r=await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(npSearch.trim())}&media=music&entity=song&limit=4`); const j=await r.json(); setNpResults((j.results||[]).map((x:any)=>({trackName:x.trackName, artistName:x.artistName, artworkUrl:(x.artworkUrl100 as string)?.replace("100x100","300x300")??x.artworkUrl100, previewUrl:x.previewUrl??null, trackViewUrl:x.trackViewUrl, collectionName:x.collectionName, primaryGenre:x.primaryGenreName}))); if((j.results||[]).length===0) setToast("sonuç yok"); }catch{setToast("arama hatası");} setNpLoading(false); }}>{npLoading?"…":"ARA"}</button>
                      </div>
                      {npResults && (
                        <div style={{marginTop:8, display:"flex", flexDirection:"column", gap:6}}>
                          {npResults.length===0 ? <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)", border:"1px dashed var(--border)", padding:8, textAlign:"center"}}>sonuç yok</div> : npResults.map(c=>(
                            <div key={c.trackViewUrl} style={{display:"flex", gap:8, alignItems:"center", border:"1px solid var(--border)", background:"var(--bg)", padding:6}}>
                              <img src={c.artworkUrl} alt="" style={{width:36, height:36, flex:"0 0 auto"}}/>
                              <div style={{flex:1, minWidth:0}}>
                                <div style={{fontSize:12, fontWeight:700, overflowWrap:"anywhere"}}>{c.trackName}</div>
                                <div style={{fontSize:11, color:"var(--muted)", overflowWrap:"anywhere"}}>{c.artistName} • {c.collectionName}</div>
                              </div>
                              <button className="btn btn-primary" style={{flex:"0 0 auto", fontSize:10, padding:"6px 10px"}} onClick={async()=>{ const np={track:c.trackName, artist:c.artistName, artwork:c.artworkUrl, previewUrl:c.previewUrl, url:c.trackViewUrl, genre:c.primaryGenre, updatedAt:Date.now()}; try{ await update(ref(db,`users/${user.uid}/public`),{nowPlaying: np}); setProfile(p=>p?{...p, nowPlaying: np}:p); setNpResults(null); setNpSearch(""); setToast(`♪ ${np.track}`);}catch(e:any){setToast(e.message);} }}>SEÇ</button>
                            </div>
                          ))}
                          <button className="btn" onClick={()=>setNpResults(null)}>KAPAT</button>
                        </div>
                      )}
                    </div>
                    <div style={{border:"1px solid rgba(242,63,66,.35)", background:"rgba(242,63,66,.07)", padding:10, borderRadius:"var(--r-sm)"}}>
                      <div style={{fontFamily:"var(--font-mono)", fontSize:11, fontWeight:700, color:"var(--danger)"}}>HESABI SİL</div>
                      <div style={{fontSize:11, color:"var(--danger)", opacity:.8, marginTop:4}}>Bu işlem geri alınamaz. Sunucuların ve mesajların silinir.</div>
                      <button className="btn btn-danger" style={{marginTop:8, borderColor:"var(--danger)", color:"var(--danger)"}} onClick={async()=>{
                        if(!confirm("hesabı kalıcı silmek istiyor musun?")) return;
                        try{ await remove(ref(db,`users/${user.uid}`)); await user.delete(); setToast("hesap silindi"); }catch(e:any){ setToast(e.message); }
                      }}>HESABI SİL</button>
                    </div>
                  </div>
                )}
                {accountTab==="gorunum" && (
                  <div style={{display:"flex", flexDirection:"column", gap:12}}>
                    <div style={{border:"1px solid var(--border)", padding:12, background:"var(--surface-2)"}}>
                      <div style={{fontFamily:"var(--font-mono)", fontSize:11, fontWeight:700}}>TEMA</div>
                      <div style={{fontSize:11, color:"var(--muted)", marginTop:4}}>Akayroom brutalist — siyah/beyaz, 1px border, JetBrains Mono. Tema şimdilik sabit, yakında açık/koyu.</div>
                      <div style={{display:"flex", gap:6, marginTop:8}}>
                        <div style={{flex:1, height:32, border:"1px solid var(--accent)", background:"var(--bg)", display:"grid", placeItems:"center", fontFamily:"var(--font-mono)", fontSize:10}}>SİYAH</div>
                        <div style={{flex:1, height:32, border:"1px solid var(--border)", background:"var(--accent)", color:"var(--accent-fg)", display:"grid", placeItems:"center", fontFamily:"var(--font-mono)", fontSize:10}}>BEYAZ (yakında)</div>
                      </div>
                    </div>
                    <div style={{border:"1px solid var(--border)", padding:12}}>
                      <div style={{fontFamily:"var(--font-mono)", fontSize:11, fontWeight:700}}>DİL</div>
                      <select defaultValue="tr" style={{marginTop:6, width:"100%", background:"var(--bg)", border:"1px solid var(--border)", color:"var(--text)", padding:"8px", fontFamily:"var(--font-mono)", fontSize:12}}>
                        <option value="tr">Türkçe</option><option value="en">English (yakında)</option>
                      </select>
                    </div>
                    <div style={{border:"1px dashed var(--border)", padding:10, fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)", textAlign:"center"}}>Discord’daki gibi “Erişilebilirlik / Gelişmiş” ayarları yakında eklenecek.</div>
                  </div>
                )}
                {accountTab==="gizlilik" && (
                  <div style={{display:"flex", flexDirection:"column", gap:12}}>
                    <div style={{border:"1px solid var(--border)", padding:12, background:"var(--surface-2)"}}>
                      <div style={{fontFamily:"var(--font-mono)", fontSize:11, fontWeight:700}}>GİZLİLİK</div>
                      <div style={{fontSize:11, color:"var(--muted)", marginTop:4}}>DM’ler sadece arkadaşlarından — yakında “herkesten” seçeneği eklenecek. Şu an `friends` tablosu ile kontrol.</div>
                    </div>
                    <div style={{border:"1px solid var(--border)", padding:12}}>
                      <div style={{fontFamily:"var(--font-mono)", fontSize:11, fontWeight:700}}>GÜVENLİ MESAJLAŞMA</div>
                      <div style={{fontSize:11, color:"var(--muted)", marginTop:4}}>Uçtan uca şifreleme stub — ileride Signal benzeri.</div>
                    </div>
                  </div>
                )}
                {accountTab==="cikis" && (
                  <div style={{display:"flex", flexDirection:"column", gap:12, maxWidth:440}}>
                    <div style={{border:"1px solid rgba(242,63,66,.4)", background:"rgba(242,63,66,.07)", padding:16, borderRadius:"var(--r-sm)"}}>
                      <div style={{fontFamily:"var(--font-mono)", fontSize:12, fontWeight:700, color:"var(--danger)"}}>OTURUMU KAPAT</div>
                      <div style={{fontSize:12, color:"var(--text-2)", marginTop:8}}>Bu cihazdaki Akayroom oturumun kapatılır. Hesabın ve sunucuların silinmez.</div>
                      <button className="btn btn-danger" onClick={()=>void doSignOut()} style={{marginTop:14, borderColor:"var(--danger)", color:"var(--danger)"}}>ÇIKIŞ YAP</button>
                    </div>
                    <div style={{border:"1px dashed var(--border)", padding:12, fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)"}}>Hesabı kalıcı silmek için Hesabım sekmesindeki Hesabı Sil alanını kullan.</div>
                  </div>
                )}
              </div>
              <div className="modal-actions">
                <span style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)", marginRight:"auto"}}>AKAYROOM — discord esintisi, brutalist ruh</span>
                <button className="btn" onClick={()=>setShowAccountSettings(false)}>KAPAT</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showServerSettings && !isDemo && (
        <div className="modal-backdrop" onClick={()=>setShowServerSettings(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-head"><span>SUNUCU — {selectedServerData?.name}</span><button onClick={()=>setShowServerSettings(false)}><span className="icon"><Icon name="close" size={12}/></span></button></div>
            <div className="modal-body">
              {(()=>{ const myRole=members.find(m=>m.uid===user?.uid)?.role; const canManage=myRole==="owner"||myRole==="admin"; const isOwner=myRole==="owner"; return (
                <>
                  {canManage && (
                    <>
                      <div className="icon-upload">
                        {selectedServerData?.iconUrl ? <img src={selectedServerData.iconUrl} alt=""/> : <span className="icon"><Icon name="grid" size={22}/></span>}
                        <label className="icon-upload-btn">FOTOĞRAF<input type="file" accept="image/*" hidden onChange={e=>{const f=e.target.files?.[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ update(ref(db,`servers/${selectedServer}`),{iconUrl:String(r.result)}).catch(()=>{}); setToast("güncellendi"); }; r.readAsDataURL(f);}} /></label>
                      </div>
                      <label>SUNUCU ADI</label>
                      <input defaultValue={selectedServerData?.name} onBlur={e=>{
                        if(!e.target.value.trim()) return;
                        update(ref(db,`servers/${selectedServer}`),{name:e.target.value.trim()}); setToast("güncellendi");
                      }} />
                    </>
                  )}
                  {!canManage && (
                    <div style={{border:"1px solid var(--border)", padding:10, background:"var(--surface-2)", display:"flex", gap:10, alignItems:"center"}}>
                      {selectedServerData?.iconUrl ? <img src={selectedServerData.iconUrl} alt="" style={{width:40, height:40, border:"1px solid var(--border)"}}/> : <span style={{width:40, height:40, display:"grid", placeItems:"center", border:"1px solid var(--border)", background:"var(--bg)"}}><span className="icon"><Icon name="grid" size={16}/></span></span>}
                      <div>
                        <div style={{fontWeight:700}}>{selectedServerData?.name}</div>
                        <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)"}}>ID: {selectedServer} • {members.length} üye</div>
                      </div>
                    </div>
                  )}
                  <div style={{marginTop:14, display:"flex", gap:6}}>
                    <button className="btn btn-primary" onClick={()=>{ setShowServerSettings(false); setShowServerInviteMenu(true); }}>DAVET ET</button>
                    {isOwner && (
                      <button className="btn btn-danger" onClick={()=>{
                        if(confirm("silinsin mi?")){
                          remove(ref(db,`servers/${selectedServer}`)).catch(()=>{});
                          remove(ref(db,`serverMembers/${selectedServer}`)).catch(()=>{});
                          remove(ref(db,`channels/${selectedServer}`)).catch(()=>{});
                          remove(ref(db,`categories/${selectedServer}`)).catch(()=>{});
                          remove(ref(db,`attachments/${selectedServer}`)).catch(()=>{});
                          if(joinedVoice) void hangUpVoice();
                          setSelectedServer("demo");
                          setSelectedChannel("general");
                          setToast("silindi"); setShowServerSettings(false);
                        }
                      }}>SUNUCUYU SİL</button>
                    )}
                  </div>
                </>
              );})()}
              <div style={{marginTop:16, border:"1px solid var(--border)", padding:10, background:"var(--surface-2)"}}>
                <div style={{fontFamily:"var(--font-mono)", fontSize:11, fontWeight:700}}>ROLLER — {members.length} üye</div>
                {(()=> {
                  const myRole = members.find(m=>m.uid===user?.uid)?.role || "member";
                  const canManage = myRole==="owner" || myRole==="admin";
                  const ownerCount = members.filter(m=>m.role==="owner").length;
                  const setRole = async (uid:string, role:string, currentRole:string) => {
                    if(!user) return;
                    if(role===currentRole) return;
                    if(currentRole==="owner" && role!=="owner" && ownerCount<=1){ setToast("son owner düşürülemez"); return; }
                    if(myRole==="admin" && (currentRole==="owner" || role==="owner")){ setToast("admin owner atayamaz/düşüremez"); return; }
                    try{
                      await update(ref(db,`serverMembers/${selectedServer}/${uid}`),{role});
                      setToast("rol güncellendi");
                    }catch{ setToast("yetkin yok"); }
                  };
                  if(members.length===0) return <div style={{marginTop:8, fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)"}}>üye yok</div>;
                  return (
                    <div style={{marginTop:8, display:"flex", flexDirection:"column", gap:4}}>
                      {members.map(m=>(
                        <div key={m.uid} style={{display:"flex", alignItems:"center", gap:8, border:"1px solid var(--border)", background:"var(--bg)", padding:"5px 8px"}}>
                          <div style={{width:22, height:22, borderRadius:"50%", background:"var(--surface-3)", color:"var(--text)", display:"grid", placeItems:"center", fontSize:10.5, fontWeight:700, overflow:"hidden"}}>
                            {m.profile?.avatarUrl ? <img src={m.profile.avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : initials(m.profile?.displayName||m.profile?.username||"??")}
                          </div>
                          <span style={{flex:1, minWidth:0, fontFamily:"var(--font-mono)", fontSize:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{m.profile?.displayName||m.profile?.username||m.uid.slice(0,6)}</span>
                          {canManage && m.uid!==user?.uid ? (
                            <select value={m.role} onChange={e=>setRole(m.uid, e.target.value, m.role)} style={{background:"var(--bg)", border:"1px solid var(--border)", color:"var(--text)", fontFamily:"var(--font-mono)", fontSize:10, padding:"2px 4px"}}>
                              <option value="member">member</option>
                              <option value="admin">admin</option>
                              <option value="owner">owner</option>
                            </select>
                          ) : (
                            <span style={{fontFamily:"var(--font-mono)", fontSize:10, color: m.role==="owner"?"var(--accent)":"var(--muted)", border:"1px solid var(--border)", padding:"2px 6px"}}>{m.role}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <div style={{marginTop:6, fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--muted)"}}>owner: her şey • admin: rolleri yönetir • member: sohbet</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPalette && (
        <div className="palette-backdrop" onClick={()=>setShowPalette(false)}>
          <div className="palette" onClick={e=>e.stopPropagation()}>
            <div className="palette-input"><span>›</span><input value={paletteQ} onChange={e=>setPaletteQ(e.target.value)} placeholder="ara..." autoFocus /></div>
            <div className="palette-list">
              {paletteItems.map(it=>(
                <div key={it.id} className="palette-item" onClick={it.action}><span>{it.label}</span><kbd>{it.kbd}</kbd></div>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedProfileUid && (
        <div className="modal-backdrop" onClick={()=>setSelectedProfileUid(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{width:"min(380px, 100%)", overflow:"visible"}}>
            <div style={{height:84, background: selectedProfile?.bannerUrl ? `url(${selectedProfile.bannerUrl}) center/cover` : (selectedProfile?.bannerColor || "#fff"), position:"relative", borderBottom:"1px solid var(--accent)", overflow:"visible"}}>
              {!selectedProfile?.bannerUrl && <div style={{position:"absolute", inset:0, backgroundImage:"linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)", backgroundSize:"16px 16px", opacity:.2}}/>}
            </div>
            <div className="modal-body" style={{paddingTop:48, position:"relative", textAlign:"left", overflow:"visible"}}>
              <div style={{position:"absolute", top:-32, left:16, width:68, height:68, border:"2px solid var(--accent)", background:"var(--bg)", display:"grid", placeItems:"center", overflow:"visible", borderRadius:"50%", boxShadow:"0 2px 8px rgba(0,0,0,.4)"}}>
                <div style={{width:"100%", height:"100%", borderRadius:"50%", overflow:"hidden", display:"grid", placeItems:"center"}}>{selectedProfile?.avatarUrl ? <img src={selectedProfile.avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : <span style={{fontFamily:"var(--font-mono)", fontWeight:800}}>{selectedProfile ? initials(selectedProfile.displayName||selectedProfile.username) : "??"}</span>}</div>
                {selectedProfile?.decoration && selectedProfile.decoration.startsWith("http") && <img src={selectedProfile.decoration} alt="" onError={(e)=>{(e.currentTarget as HTMLImageElement).style.display="none"}} style={{position:"absolute", inset:-10, width:"calc(100% + 20px)", height:"calc(100% + 20px)", pointerEvents:"none"}}/>}
              </div>
              <div style={{position:"absolute", top:-32, right:16, display:"flex", gap:4}}>
                {(selectedProfile?.badges||[]).map(b=> <span key={b} style={{background:"var(--accent)", color:"var(--accent-fg)", border:"1px solid #000", fontFamily:"var(--font-mono)", fontSize:10.5, fontWeight:700, padding:"2px 5px"}}>{b}</span>)}
              </div>
              {profileLoading ? <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)", textAlign:"center", padding:20}}>yükleniyor…</div> : selectedProfile ? (
                <>
                  <div style={{display:"flex", alignItems:"center", gap:8, flexWrap:"wrap"}}>
                    <span style={{fontWeight:800, fontSize:15}}>{selectedProfile.displayName}</span>
                    {selectedProfile.pronouns && <span style={{border:"1px solid var(--border)", fontFamily:"var(--font-mono)", fontSize:10, padding:"1px 5px", color:"var(--muted)"}}>{selectedProfile.pronouns}</span>}
                    {selectedProfile.title && <span style={{border:"1px solid var(--accent)", background:"var(--accent)", color:"var(--accent-fg)", fontFamily:"var(--font-mono)", fontSize:10, fontWeight:700, padding:"1px 5px"}}>{selectedProfile.title}</span>}
                    {selectedProfile.accentColor && <span style={{width:8, height:8, background:selectedProfile.accentColor, border:"1px solid var(--border)", display:"inline-block"}}/>}
                  </div>
                  <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)"}}>@{selectedProfile.username} • {selectedProfile.customStatusEmoji || ""} {selectedProfile.customStatus || selectedProfile.statusText || ""}</div>
                  {selectedProfile.nowPlaying && (
                    <div style={{marginTop:10, border:"1px solid var(--spotify)", background:"rgba(29,185,84,.08)", padding:8, display:"flex", gap:8, alignItems:"center"}}>
                      {selectedProfile.nowPlaying.artwork && <img src={selectedProfile.nowPlaying.artwork} alt="" style={{width:40, height:40, border:"1px solid var(--spotify)", flex:"0 0 auto"}}/>}
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{fontFamily:"var(--font-mono)", fontSize:10.5, color:"var(--spotify)", fontWeight:700, letterSpacing:".08em", display:"flex", alignItems:"center", gap:6}}><span className="icon"><Icon name="music" size={12}/></span> ŞU AN DİNLİYOR</div>
                        <div style={{fontSize:12, fontWeight:700, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{selectedProfile.nowPlaying.track}</div>
                        <div style={{fontSize:11, color:"var(--muted)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{selectedProfile.nowPlaying.artist}{selectedProfile.nowPlaying.genre?` • ${selectedProfile.nowPlaying.genre}`:""}</div>
                      </div>
                      {selectedProfile.nowPlaying.previewUrl && <audio className="music-preview" src={selectedProfile.nowPlaying.previewUrl} controls preload="none" style={{height:28, width:100}} onPlay={(e)=>{ const cur=e.currentTarget; document.querySelectorAll('audio.music-preview').forEach(a=>{ if(a!==cur) { (a as HTMLAudioElement).pause(); try{(a as HTMLAudioElement).currentTime=0;}catch{} } }); }}/>}
                    </div>
                  )}
                  {selectedProfile.bio ? <div style={{marginTop:10, border:"1px solid var(--border)", background:"var(--surface-2)", padding:10, fontSize:12, lineHeight:1.6, whiteSpace:"pre-wrap"}}><RenderContent text={selectedProfile.bio}/></div> : <div style={{marginTop:10, fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)", border:"1px dashed var(--border)", padding:8, textAlign:"center"}}>bio yok</div>}
                  {(()=>{ const cn=selectedProfile.connections||{}; const items=[
                    cn.github ? {k:"GITHUB", href: cn.github.startsWith("http")?cn.github:`https://github.com/${cn.github.replace(/^@/,"")}`} : null,
                    cn.spotify ? {k:"SPOTIFY", href: cn.spotify.startsWith("http")?cn.spotify:`https://open.spotify.com/search/${encodeURIComponent(cn.spotify)}`} : null,
                    cn.site ? {k:"SİTE", href: cn.site.startsWith("http")?cn.site:`https://${cn.site}`} : null,
                  ].filter(Boolean) as {k:string,href:string}[];
                  return items.length ? (
                    <div style={{display:"flex", gap:6, flexWrap:"wrap", marginTop:10}}>
                      {items.map(it=>(
                        <a key={it.k} href={it.href} target="_blank" rel="noreferrer" style={{border:"1px solid var(--border)", background:"var(--accent)", color:"var(--accent-fg)", fontFamily:"var(--font-mono)", fontSize:10.5, fontWeight:700, padding:"3px 8px", textDecoration:"none"}}>{it.k} ↗</a>
                      ))}
                    </div>
                  ) : null; })()}
                  <div style={{marginTop:10, display:"flex", gap:6, fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)"}}>
                    <span>katılım {selectedProfile.createdAt ? fmtDate(selectedProfile.createdAt) : ""}</span>
                    <span>•</span>
                    <span>@{selectedProfile.username}</span>
                  </div>
                  <div style={{display:"flex", gap:6, justifyContent:"flex-end", marginTop:12}}>
                    {selectedProfileUid!==user.uid && <button className="btn btn-primary" onClick={()=>{startDM(selectedProfileUid!); setSelectedProfileUid(null);}}>DM GÖNDER</button>}
                    {selectedProfileUid!==user.uid && (friends.some(f=>f.uid===selectedProfileUid) ? (
  <button className="btn" onClick={()=>void removeFriend(selectedProfileUid)} style={{color:"var(--danger)"}}>ARKADAŞLIĞI BİTİR</button>
) : sentRequests[selectedProfileUid] ? (
  <button className="btn" onClick={()=>void cancelFriendRequest(selectedProfileUid)}>İSTEK GÖNDERİLDİ — GERİ ÇEK</button>
) : (
  <button className="btn" onClick={()=>void sendFriendRequest(selectedProfileUid, selectedProfile.username)}>ARKADAŞLIK İSTEĞİ GÖNDER</button>
))}
                    <button className="btn" onClick={()=>setSelectedProfileUid(null)}>KAPAT</button>
                  </div>
                </>
              ) : <div style={{fontFamily:"var(--font-mono)", fontSize:11}}>bulunamadı</div>}
            </div>
          </div>
        </div>
      )}
      {lightbox && (
        <div className="modal-backdrop" style={{zIndex:60}} onClick={()=>setLightbox(null)}>
          <div onClick={e=>e.stopPropagation()} style={{maxWidth:"92vw", maxHeight:"88vh", display:"flex", flexDirection:"column", gap:8}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", fontFamily:"var(--font-mono)", fontSize:11}}>
              <span>{lightbox.name}</span>
              <button onClick={()=>setLightbox(null)} style={{border:"1px solid var(--accent)", background:"var(--bg)", color:"var(--text)", width:26, height:26}}><span className="icon"><Icon name="close" size={12}/></span></button>
            </div>
            <img src={lightbox.src} alt={lightbox.name} style={{maxWidth:"92vw", maxHeight:"82vh", border:"2px solid var(--accent)", objectFit:"contain"}}/>
          </div>
        </div>
      )}
      {cropTarget && (
        <div className="modal-backdrop" onClick={()=>{ if(cropTarget) URL.revokeObjectURL(cropTarget.url); setCropTarget(null);}}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{width:"min(440px, 96vw)", overflow:"hidden"}}>
            <div className="modal-head"><span>{cropTarget.type==="avatar" ? "AVATAR — KIRP" : "BANNER — KIRP"}</span><button onClick={()=>{ URL.revokeObjectURL(cropTarget.url); setCropTarget(null);}}><span className="icon"><Icon name="close" size={12}/></span></button></div>
            <div style={{padding:14, display:"flex", flexDirection:"column", gap:12}}>
              <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)", textAlign:"center"}}>
                {cropTarget.type==="avatar" ? "yuvarlak alan kaydedilecek — sürükle ortala, zoomla" : "sürükle Y eksenini ayarla — banner 112px yüksek"}
              </div>
              <div
                onMouseDown={e=>{setDragging(true); setDragStart({x:e.clientX - cropPos.x, y:e.clientY - cropPos.y});}}
                onMouseMove={e=>{if(!dragging) return; setCropPos({x:e.clientX - dragStart.x, y:e.clientY - dragStart.y});}}
                onMouseUp={()=>setDragging(false)}
                onMouseLeave={()=>setDragging(false)}
                onTouchStart={e=>{const t=e.touches[0]; setDragging(true); setDragStart({x:t.clientX - cropPos.x, y:t.clientY - cropPos.y});}}
                onTouchMove={e=>{if(!dragging) return; const t=e.touches[0]; setCropPos({x:t.clientX - dragStart.x, y:t.clientY - dragStart.y});}}
                onTouchEnd={()=>setDragging(false)}
                style={{
                  width: cropTarget.type==="avatar" ? 300 : "100%",
                  height: cropTarget.type==="avatar" ? 300 : 160,
                  maxWidth: 360,
                  margin: cropTarget.type==="avatar" ? "0 auto" : "0",
                  border:"1px solid var(--border)",
                  background:"var(--bg)",
                  position:"relative",
                  overflow:"hidden",
                  cursor: dragging ? "grabbing" : "grab",
                  touchAction:"none",
                  display:"grid",
                  placeItems:"center"
                }}>
                <img src={cropTarget.url} alt="preview" draggable={false}
                  style={{
                    position:"absolute", left:"50%", top:"50%",
                    width: cropTarget.type==="avatar" ? 280 : "100%",
                    height: cropTarget.type==="avatar" ? 280 : "auto",
                    maxWidth: cropTarget.type==="avatar" ? 280 : "120%",
                    maxHeight: cropTarget.type==="avatar" ? 280 : 300,
                    objectFit:"cover",
                    transform:`translate(-50%, -50%) translate(${cropPos.x}px, ${cropPos.y}px) scale(${cropZoom})`,
                    userSelect:"none", pointerEvents:"none"
                  }}
                />
                {/* clean overlay */}
                {cropTarget.type==="avatar" ? (
                  <>
                    <div style={{position:"absolute", inset:0, background:"rgba(0,0,0,.55)", pointerEvents:"none"}}/>
                    <div style={{position:"absolute", left:"50%", top:"50%", width:180, height:180, transform:"translate(-50%, -50%)", border:"2px solid var(--accent)", borderRadius:"50%", boxShadow:"0 0 0 200vmax rgba(0,0,0,.55)", pointerEvents:"none"}}/>
                    <div style={{position:"absolute", inset:0, pointerEvents:"none", backgroundImage:"linear-gradient(to right, rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.08) 1px, transparent 1px)", backgroundSize:"20px 20px", opacity:.15}}/>
                  </>
                ) : (
                  <>
                    <div style={{position:"absolute", inset:0, border:"1px dashed rgba(255,255,255,.25)", pointerEvents:"none"}}/>
                    <div style={{position:"absolute", left:0, right:0, top:"50%", height:1, background:"var(--accent)", opacity:.8, pointerEvents:"none"}}/>
                    <div style={{position:"absolute", left:"50%", top:8, transform:"translateX(-50%)", background:"var(--accent)", color:"var(--accent-fg)", fontFamily:"var(--font-mono)", fontSize:10.5, padding:"2px 6px"}}>112px</div>
                  </>
                )}
              </div>
              <div style={{display:"flex", alignItems:"center", gap:8, border:"1px solid var(--border)", background:"var(--surface-2)", padding:"8px 10px"}}>
                <span style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)"}}>ZOOM</span>
                 <button onClick={()=>setCropZoom(z=>Math.max(0.5, z-0.1))} style={{width:24, height:24, border:"1px solid var(--border)", background:"var(--bg)", color:"var(--text)"}}>−</button>
                 <input type="range" min={0.5} max={2.2} step={0.05} value={cropZoom} onChange={e=>setCropZoom(parseFloat(e.target.value))} style={{flex:1, accentColor:"var(--accent)"}} />
                <button onClick={()=>setCropZoom(z=>Math.min(2.2, z+0.1))} style={{width:24, height:24, border:"1px solid var(--border)", background:"var(--bg)", color:"var(--text)"}}>+</button>
                <span style={{fontFamily:"var(--font-mono)", fontSize:10, border:"1px solid var(--border)", padding:"3px 6px", minWidth:42, textAlign:"center"}}>{Math.round(cropZoom*100)}%</span>
                 <button className="btn" onClick={()=>{setCropPos({x:0,y:0}); setCropZoom(0.5);}} style={{fontSize:10, padding:"4px 8px"}}>RESET</button>
              </div>
              <div style={{display:"flex", gap:6, justifyContent:"flex-end"}}>
                <button className="btn" onClick={()=>{ URL.revokeObjectURL(cropTarget.url); setCropTarget(null);}}>İPTAL</button>
                <button className="btn btn-primary" onClick={async()=>{
                  if(!cropTarget || !user) return;
                  try{
                    const img = new Image();
                    img.src = cropTarget.url;
                    await new Promise<void>((res, rej)=>{ img.onload=()=>res(); img.onerror=()=>rej(new Error("img")); });
                    const canvas = document.createElement("canvas");
                    const isAvatar = cropTarget.type==="avatar";
                    const outW = isAvatar ? 400 : 840;
                    const outH = isAvatar ? 400 : 280;
                    canvas.width = outW; canvas.height = outH;
                    const ctx = canvas.getContext("2d");
                    if(!ctx) throw new Error("ctx");
                    // Fill with bannerColor or white for avatar
                    if(!isAvatar && profile?.bannerColor) { ctx.fillStyle = profile.bannerColor; ctx.fillRect(0,0,outW,outH); }
                    // Calculate source draw
                    // Our preview container is 280x280 for avatar,  ~380x140 for banner, image is 140%/120% scaled and translated
                    // We simulate by drawing image centered with zoom and pos, then cropping to canvas
                    // Simplifiy: draw image to cover the preview area, then crop center
                    const previewW = isAvatar ? 300 : 360;
                    const previewH = isAvatar ? 300 : 160;
                    const imgAspect = img.width / img.height;
                    const previewAspect = previewW / previewH;
                    let baseW, baseH;
                    if(isAvatar){
                      baseW = previewW * 1.4;
                      baseH = baseW / imgAspect;
                      if(baseH < previewH * 1.4){ baseH = previewH * 1.4; baseW = baseH * imgAspect; }
                    } else {
                      baseW = previewW * 1.2;
                      baseH = baseW / imgAspect;
                      if(baseH < previewH * 1.2){ baseH = previewH * 1.2; baseW = baseH * imgAspect; }
                    }
                    const drawW = baseW * cropZoom;
                    const drawH = baseH * cropZoom;
                    const cx = previewW/2 + cropPos.x;
                    const cy = previewH/2 + cropPos.y;
                    const dx = cx - drawW/2;
                    const dy = cy - drawH/2;
                    // Map preview coords to canvas coords
                    const scaleX = outW / previewW;
                    const scaleY = outH / previewH;
                    const sdx = dx * scaleX;
                    const sdy = dy * scaleY;
                    const sDrawW = drawW * scaleX;
                    const sDrawH = drawH * scaleY;
                    if(isAvatar){
                      ctx.save();
                      ctx.beginPath();
                      ctx.arc(outW/2, outH/2, outW/2 - 4, 0, Math.PI*2);
                      ctx.clip();
                    }
                    ctx.drawImage(img, sdx, sdy, sDrawW, sDrawH);
                    if(isAvatar) ctx.restore();
                    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
                    if(isAvatar){
                      setProfile(p=>p?{...p, avatarUrl:dataUrl}:p);
                      await update(ref(db,`users/${user.uid}/public`),{avatarUrl:dataUrl});
                      setToast("avatar kırpıldı");
                    } else {
                      setProfile(p=>p?{...p, bannerUrl:dataUrl}:p);
                      await update(ref(db,`users/${user.uid}/public`),{bannerUrl:dataUrl});
                      setToast("banner kırpıldı");
                    }
                    URL.revokeObjectURL(cropTarget.url);
                    setCropTarget(null);
                  }catch(e){ setToast("kırpma hatası"); }
                }}>KIRP VE KAYDET</button>
              </div>
              <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)", textAlign:"center"}}>{cropTarget.type==="avatar" ? "yuvarlak alan dışındakiler kesilecek — sürükle & zoomla" : "banner Y ekseni — sürükle ortala, zoomla"}</div>
            </div>
          </div>
        </div>
      )}
      {toastFlash && <div className="flash-toast">{toastFlash.text}</div>}
      {toast && <div className="toast">{toast}</div>}
      {incomingCall && !joinedVoice && (
        <div className="call-overlay">
          <div className="call-window">
            <div className="call-head">
              <div>
                <div className="call-title" style={{display:"flex",alignItems:"center",gap:6}}><span className="icon"><Icon name="phone" size={14}/></span> Gelen Arama</div>
                <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)", marginTop:2}}>sizi arıyor…</div>
              </div>
            </div>
            <div className="call-grid">
              <div className="call-card incoming-pulse">
                <div className="call-avatar">{initials(incomingCall.fromName || "??")}</div>
                <div className="call-name">{incomingCall.fromName || "aranan kişi"}</div>
                <div className="call-status"><span className="icon"><Icon name="phone" size={11}/></span> arama geliyor…</div>
              </div>
            </div>
            <div className="call-controls">
              <button className="danger" onClick={()=>{void rejectDMCall();}} title="Reddet"><span className="icon"><Icon name="phoneOff" size={16}/></span> REDDET</button>
              <button className="accept" onClick={()=>{void acceptDMCall();}} title="Cevapla"><span className="icon"><Icon name="phone" size={16}/></span> CEVAPLA</button>
            </div>
          </div>
        </div>
      )}
      {joinedVoice && (
        callPip ? (
          <div className="call-pip"
            style={{left:callPipPos.x, top:callPipPos.y}}
            onPointerDown={(e)=>{ e.currentTarget.setPointerCapture(e.pointerId); (e.currentTarget as any)._startX=e.clientX; (e.currentTarget as any)._startY=e.clientY; (e.currentTarget as any)._pipStart=callPipPos; (e.currentTarget as any)._moved=false; }}
            onPointerMove={(e)=>{ const el=e.currentTarget as any; if(el._pipStart==null) return; const dx=e.clientX-el._startX; const dy=e.clientY-el._startY; if(Math.abs(dx)>4||Math.abs(dy)>4) el._moved=true; setCallPipPos({x:Math.max(4, Math.min(window.innerWidth-44, el._pipStart.x+dx)), y:Math.max(4, Math.min(window.innerHeight-44, el._pipStart.y+dy))}); }}
            onPointerUp={(e)=>{ const el=e.currentTarget as any; if(el._moved){ /* just drag */ } else { setCallPip(false); } el._pipStart=null; }}
            title="Aramayı genişlet"
          >
            <span className="icon"><Icon name={micMuted?"phoneOff":"phone"} size={20}/></span>
            {micMuted && <span className="pip-muted"><Icon name="micOff" size={10}/></span>}
            {(camOn||screenSharing) && <span className="pip-cam"><Icon name="cam" size={9}/></span>}
          </div>
        ) : (
          <div className="call-overlay">
            <div className="call-window">
              <div className="call-head">
                <div>
                  <div className="call-title">● {callTitle}</div>
                  <div style={{fontFamily:"var(--font-mono)", fontSize:10, color: deafen ? "var(--dnd)" : "var(--muted)", marginTop:2}}>{deafen ? "sağır — ses kapalı" : micMuted ? "mikrofon kapalı" : "canlı — konuş"}</div>
                </div>
                <button className="call-min" onClick={()=>setCallPip(true)} title="Küçült"><span className="icon"><Icon name="minimize" size={14}/></span></button>
              </div>
              <div className="call-grid">
                {(()=>{
                  // Find an active video source to feature large on stage
                  const remoteCamUid = Object.keys(voiceParticipants).find(uid=> remoteCamStatus[uid] && remoteStreams[uid]);
                  const featured = remoteCamUid ? {uid:remoteCamUid, info:voiceParticipants[remoteCamUid], kind:remoteCamStatus[remoteCamUid]} : (camOn && camStreamRef.current ? {uid:user.uid, info:null, kind:"on" as const} : null);
                  if(featured){
                    const videoStream = featured.uid===user.uid ? camStreamRef.current : remoteStreams[featured.uid];
                    return (
                      <div className="call-stage">
                        <video className="call-stage-video" muted autoPlay playsInline ref={el=>{ if(el && videoStream){ el.muted = true; el.srcObject = videoStream; void el.play().catch(()=>{}); } }} />
                        <div className="call-stage-bar">
                          <span className="call-stage-name">● {featured.kind==="screen" ? "EKRAN PAYLAŞIMI" : featured.uid===user.uid ? "Sen — kamera" : (featured.info?.profile?.displayName || featured.info?.profile?.username || "Kamera")}</span>
                          <span style={{marginLeft:"auto", display:"flex", gap:6}}>
                            <button className="stage-btn" title="Tam ekran" onClick={(e)=>{ const v=e.currentTarget.parentElement?.parentElement?.querySelector("video"); if(v) void v.requestFullscreen().catch(()=>{}); }}><span className="icon"><Icon name="maximize" size={14}/></span></button>
                            <button className="stage-btn" title="Ayrı pencerede aç (PIP)" onClick={(e)=>{ const v=e.currentTarget.parentElement?.parentElement?.querySelector("video") as HTMLVideoElement|null; if(v && (v as any).requestPictureInPicture) void (v as any).requestPictureInPicture().catch(()=>{}); }}><span className="icon"><Icon name="pip" size={14}/></span></button>
                          </span>
                        </div>
                        {Object.entries(voiceParticipants).filter(([uid])=> uid!==featured.uid).length>0 && (
                          <div className="call-stage-mini">
                            {Object.entries(voiceParticipants).filter(([uid])=> uid!==featured.uid).map(([uid, info])=>(
                              <div key={uid} className="call-card mini">
                                <div className="call-avatar">{info.profile?.avatarUrl ? <img src={info.profile.avatarUrl} alt="" /> : initials(info.profile?.displayName || info.profile?.username || "??")}</div>
                                <div className="call-name">{info.profile?.displayName || info.profile?.username || uid.slice(0,6)}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return (
                    <>
                <div className={`call-card ${micMuted?"muted":""}`}>
                  <div className="call-video-box">
                    {camOn && camStreamRef.current ? <video autoPlay playsInline muted ref={el=>{ if(el && camStreamRef.current){ el.muted = true; el.srcObject = camStreamRef.current; void el.play().catch(()=>{}); } }}/> : <div className="call-avatar">{profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : initials(profile?.displayName ?? username)}</div>}
                  </div>
                  <div className="call-name">Sen {screenSharing ? "— ekran paylaşımı" : ""}</div>
                  <div className="call-status"><span className="icon"><Icon name={micMuted?"micOff":"mic"} size={11}/></span> {micMuted ? "sessiz" : "konuşuyor"}</div>
                </div>
                {Object.entries(voiceParticipants).map(([uid, info])=>(
                  <div key={uid} className="call-card">
                    <div className="call-video-box">
                      {remoteCamStatus[uid] && remoteStreams[uid] ? (
                        <video autoPlay playsInline muted ref={el=>{ if(el && remoteStreams[uid]){ el.muted = true; el.srcObject = remoteStreams[uid]; void el.play().catch(()=>{}); } }}/>
                      ) : (
                        <div className="call-avatar">{info.profile?.avatarUrl ? <img src={info.profile.avatarUrl} alt="" /> : initials(info.profile?.displayName || info.profile?.username || "??")}</div>
                      )}
                    </div>
                    <div className="call-name">{info.profile?.displayName || info.profile?.username || uid.slice(0,6)}</div>
                    <div className="call-status"><span className="icon"><Icon name="mic" size={11}/></span> {remoteCamStatus[uid]==="screen" ? "ekran paylaşıyor" : remoteCamStatus[uid] ? "kamera açık" : remoteStreams[uid] ? "bağlı" : "bağlanıyor…"}</div>
                  </div>
                ))}
                </>
                  );
                })()}
                {Object.keys(voiceParticipants).length===0 && !camOn && <div className="call-empty">başka kimse yok — davet et</div>}
              </div>
              <div className="call-controls">
                <button className={micMuted?"active":""} onClick={()=>setMicMuted(v=>!v)} title="Mikrofonu aç/kapat"><span className="icon"><Icon name={micMuted?"micOff":"mic"} size={16}/></span></button>
                <button className={camOn?"active":""} onClick={()=>{void toggleCam();}} title="Kamerayı aç/kapat"><span className="icon"><Icon name={camOn?"cam":"camOff"} size={16}/></span></button>
                <button className={screenSharing?"active":""} onClick={()=>{ if(screenSharing){ void stopScreenShare(); } else { setShowScreenPanel(true); } }} title="Ekran paylaşımı"><span className="icon"><Icon name="screen" size={16}/></span></button>
                <button className={deafen?"active":""} onClick={()=>setDeafen(v=>!v)} title="Sağır modu (karşı tarafın sesini kapat)"><span className="icon"><Icon name="phoneOff" size={16}/></span></button>
                <button className="danger" onClick={()=>{void hangUpVoice();}} title="Aramayı bitir"><span className="icon"><Icon name="phoneOff" size={16}/></span> AYRIL</button>
              </div>
              {screenSharing && (
                <div style={{display:"flex", alignItems:"center", gap:8, justifyContent:"center", marginTop:10}}>
                  <span style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)", display:"inline-flex", alignItems:"center", gap:6}}><span className="icon"><Icon name="screen" size={12}/></span> PAYLAŞIM — {screenSettings.w}×{screenSettings.h} @ {screenSettings.fps}fps</span>
                  <button className="screen-settings-btn" onClick={()=>setShowScreenPanel(true)}>AYAR</button>
                </div>
              )}
              {showScreenPanel && (
                <div className="screen-panel">
                  <div style={{fontFamily:"var(--font-mono)", fontSize:11, fontWeight:700, marginBottom:10}}>EKRAN PAYLAŞIM AYARLARI</div>
                  <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
                    <label style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)"}}>ÇÖZÜNÜRLÜK<select value={`${screenSettings.w}x${screenSettings.h}`} onChange={e=>{const [w,h]=e.target.value.split("x").map(Number); setScreenSettings(s=>({...s, w, h}));}} style={{width:"100%", background:"var(--bg)", color:"var(--text)", border:"1px solid var(--border)", padding:"6px", marginTop:4}}>
                      <option value="1280x720">720p (1280×720)</option>
                      <option value="1920x1080">1080p (1920×1080)</option>
                    </select></label>
                    <label style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)"}}>KARE HIZI (FPS)<select value={screenSettings.fps} onChange={e=>setScreenSettings(s=>({...s, fps:Number(e.target.value)}))} style={{width:"100%", background:"var(--bg)", color:"var(--text)", border:"1px solid var(--border)", padding:"6px", marginTop:4}}>
                      <option value={15}>15 fps</option>
                      <option value={30}>30 fps</option>
                      <option value={60}>60 fps</option>
                    </select></label>
                  </div>
                  <div style={{display:"flex", gap:8, justifyContent:"flex-end", marginTop:12}}>
                    <button className="btn" onClick={()=>setShowScreenPanel(false)}>{screenSharing ? "İPTAL" : "VAZGEÇ"}</button>
                    <button className="btn btn-primary" onClick={()=>{ if(screenSharing){ setShowScreenPanel(false); } else { setShowScreenPanel(false); void startScreenShare(); } }}>{screenSharing ? "UYGULA" : "PAYLAŞIMI BAŞLAT"}</button>
                  </div>
                </div>
              )}
              <div className="call-audios">
                {Object.entries(remoteStreams).map(([uid,stream])=>(<audio key={uid} autoPlay playsInline data-voice ref={el=>{if(el){el.srcObject=stream;el.volume=deafen?0:1;void el.play().catch(()=>{});}}}/>))}
              </div>
            </div>
          </div>
        )
      )}
    </main>
  );
}

function Landing({onLogin, onRegister}: {onLogin:()=>void, onRegister:()=>void}){
  return (
    <main className="landing">
      <nav className="landing-nav animate-fade">
        <div className="nav-logo"><i>AR</i> AKAYROOM<span style={{color:"var(--muted)", fontWeight:400}}> // OPERATOR COMMS</span></div>
        <div className="nav-links">
          <a href="#features">özellikler</a>
          <a href="#manifesto">manifesto</a>
          <button className="btn" onClick={onLogin}>GİRİŞ</button>
          <button className="btn btn-primary" onClick={onRegister}>KAYIT OL</button>
        </div>
      </nav>
      <section className="landing-hero animate-slide">
        <div className="landing-badge"><i/> CANLI • v0.5 • WEBRTC SES • RTDB</div>
        <h1 className="landing-title">SİNYAL.<br/>GÜRÜLTÜ DEĞİL.<br/><span>Discord rahatlığı,<br/>mühendis sadeliğinde.</span></h1>
        <p className="landing-sub">
          Akayroom, ekipler için tek operatör mantığında kurulmuş minimal comms.
          Sunucu, kanal, ses, DM — hepsi tek sayfada değil, doğru yerde. Gereksiz yok.
          Derin siyah, viyol accent, JetBrains Mono. Hızlı, sessiz, kalıcı.
        </p>
        <div className="landing-cta">
          <button className="btn btn-primary" onClick={onRegister}>ÜCRETSİZ KUR — 30 SN</button>
          <button className="btn" onClick={onLogin}>GİRİŞ YAP</button>
          <span style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)", alignSelf:"center"}}>davet koduyla katıl • kurulum yok</span>
        </div>
        <div className="landing-terminal">
          <div className="term-head"><span>AKAYROOM.SYS // LIVE</span><span>● REC</span></div>
          <div className="term-body">
            <div><span className="prompt">operator@akayroom</span> ./init --server AKAY-ops</div>
            <div style={{color:"var(--text)"}}>  ▸ sunucu kuruldu — #genel #sesli-oda</div>
            <div><span className="prompt">operator@akayroom</span> ./invite --create</div>
            <div style={{color:"var(--text)"}}>  ▸ davet: <b style={{background:"var(--accent)", color:"var(--accent-fg)", padding:"0 4px"}}>X7K9PQ</b> — paylaş ve başla</div>
            <div><span className="prompt">operator@akayroom</span> ./msg #genel "ilk sinyal"</div>
            <div style={{opacity:.6}}>  ▸ low-latency • 12ms • WebRTC</div>
          </div>
        </div>
      </section>
      <section id="features" className="landing-grid">
        {[
          {icon:"hash", title:"METİN & SES", desc:"Kategori, duyuru, ses odası. WebRTC stub, mute/deafen, katılımcı listesi."},
          {icon:"dm", title:"DM — GERÇEK", desc:"1-1 şifreli DM. Thread’e gerek yoksa direkt yaz. Firebase RTDB canlı."},
          {icon:"users", title:"ARKADAŞ", desc:"Kullanıcı adıyla ekle, anında DM başlat. Sahte üye yok."},
          {icon:"plus", title:"DAVET & ROL", desc:"6 haneli kod, otomatik katılım. Roller sadece ayarlardan — sayfa kalabalık değil."},
          {icon:"search", title:"ARA & PALET", desc:"⌘K ile kanal/komut ara. Mesajda markdown, tepki, yanıt, pin."},
          {icon:"settings", title:"MİNIMAL BY DESIGN", desc:"Koyu tema, mono detay, akıcı hareket. Gerekmeyen yerde özellik yok."},
        ].map(c=>(
          <div key={c.title} className="landing-card">
            <div className="card-icon"><Icon name={c.icon}/></div>
            <h3>{c.title}</h3>
            <p>{c.desc}</p>
          </div>
        ))}
      </section>
      <section id="manifesto" style={{maxWidth:980, margin:"0 auto", padding:"0 24px 40px", position:"relative", zIndex:1, width:"100%"}}>
        <div style={{border:"1px solid var(--border)", background:"var(--surface)", padding:16, display:"grid", gridTemplateColumns:"1fr 1fr", gap:16}}>
          <div>
            <div style={{fontFamily:"var(--font-mono)", fontSize:11, fontWeight:700, letterSpacing:".06em"}}>MANIFESTO</div>
            <p style={{fontSize:12, lineHeight:1.7, color:"var(--muted)", marginTop:8}}>
              Her şeyi tek sayfaya sıkıştırmıyoruz. Gereken yerde, gerektiği kadar.<br/>
              Demo’da rol yok, sahte üye yok. Sunucu kurunca üyeler, ayarlar, davetler açılır.<br/>
              Akıcılık için üyeler drawer, ses paneli inline, composer tek satır.
            </p>
          </div>
          <div style={{borderLeft:"1px solid var(--border)", paddingLeft:16}}>
            <div style={{fontFamily:"var(--font-mono)", fontSize:11, fontWeight:700}}>STACK</div>
            <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)", lineHeight:1.8, marginTop:8}}>
              Next.js 15 • Firebase Auth/RTDB • WebRTC stub<br/>
              JetBrains Mono • koyu tema & viyol accent • animasyonlu ama sakin
            </div>
          </div>
        </div>
      </section>
      <footer className="landing-footer">
        <span>© 2026 AKAYROOM — single-developer, shadcn mantığı, AI kokusu yok.</span>
        <span style={{display:"flex", gap:12}}><a href="#" onClick={(e)=>{e.preventDefault(); onLogin();}}>giriş</a><a href="#" onClick={(e)=>{e.preventDefault(); onRegister();}}>kayıt</a><span>● online</span></span>
      </footer>
    </main>
  );
}

function AuthScreen(props:{registerMode:boolean; setRegisterMode:(v:boolean)=>void; username:string; setUsername:(v:string)=>void; password:string; setPassword:(v:string)=>void; displayName:string; setDisplayName:(v:string)=>void; error:string; onSubmit:(e:React.FormEvent)=>void; configured:boolean; onBack:()=>void}){
  return (
    <main className="auth-screen">
      <section className="auth-card animate-slide">
      <button onClick={props.onBack} style={{position:"absolute", top:8, right:8, border:"1px solid var(--border)", background:"transparent", width:24, height:24, display:"grid", placeItems:"center", fontSize:12}}><span className="icon"><Icon name="close" size={12}/></span></button>
        <div className="auth-logo">AR</div>
        <h1>{props.registerMode ? "KATIL" : "GİRİŞ"}</h1>
        <p className="auth-subtitle">tek operatör, tam sinyal. gürültü yok.</p>
        {!props.configured && <div className="setup-note">Firebase .env.local bekleniyor</div>}
        <form onSubmit={props.onSubmit}>
          {props.registerMode && <label>GÖRÜNEN İSİM<input value={props.displayName} onChange={e=>props.setDisplayName(e.target.value)} placeholder="operator" /></label>}
          <label>KULLANICI ADI<input value={props.username} onChange={e=>props.setUsername(e.target.value)} placeholder="kullanici_adi" autoComplete="username" /></label>
          <label>ŞİFRE<input value={props.password} onChange={e=>props.setPassword(e.target.value)} type="password" placeholder="••••••••" autoComplete={props.registerMode?"new-password":"current-password"} /></label>
          {props.error && <div className="auth-error">ERR // {props.error}</div>}
          <button className="primary-button" type="submit">{props.registerMode ? "OLUŞTUR" : "GİRİŞ"}</button>
        </form>
        <div className="auth-switch">{props.registerMode? "hesabın var mı?" : "hesabın yok mu?"} <button onClick={()=>props.setRegisterMode(!props.registerMode)}>{props.registerMode? "Giriş":"Kayıt"}</button></div>
      </section>
    </main>
  );
}
