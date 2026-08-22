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
  get,
  limitToLast,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  remove,
  serverTimestamp,
  set,
  update,
} from "firebase/database";
import { auth, db, firebaseConfigured } from "@/lib/firebase";
import { rtcIceServers, joinSignalRoom, listenForParticipants, listenForCandidates, publishCandidate, publishOffer, publishAnswer, listenForOffers, listenForAnswers, deterministicInitiator, cleanupSignalRoom } from "@/lib/webrtc";
import { createStarterServer } from "@/lib/seed";
import { normalizeUsername, usernameEmail, validUsername } from "@/lib/username";
import type { Channel, ChatMessage, Category, Server, UserProfile } from "@/lib/types";

function initials(v: string) { return (v?.trim()?.slice(0,2) || "??").toUpperCase(); }
function fmtTime(ts: number) { try { return new Date(ts).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"});} catch{ return "--:--"; } }
function fmtDate(ts: number) { try{ return new Date(ts).toLocaleDateString("tr-TR",{day:"2-digit",month:"long",year:"numeric"});}catch{return "";} }

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
    user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
  };
  return <svg {...common}>{paths[name] ?? paths.hash}</svg>;
}
const EMOJIS = ["😀","😂","❤️","🔥","👍","👎","🎉","💀","👀","⚡","✅","❌","🤖","👾"];
const QUICK_REACTIONS = ["❤️","👍","😂"];
const STICKERS = ["🌊","🐙","⚡","🌙","🛡️","🦈","✨","👾"];
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
                  if (up) tokens.push(<span key={`t-${i}-${j}-${k}-${b}-${c}-${d}-${e}-${tokens.length}`}>{up}</span>);
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

const fallbackServers: Server[] = [{ id:"demo", name:"GHOSTGRID // DEMO", ownerId:"demo", createdAt:0 }];
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

  const [servers,setServers]=useState<Server[]>(fallbackServers);
  const [categories,setCategories]=useState<Category[]>(fallbackCats);
  const [channels,setChannels]=useState<Channel[]>(fallbackChannels);
  const [selectedServer,setSelectedServer]=useState("demo");
  const [selectedChannel,setSelectedChannel]=useState("general");
  const [activeView,setActiveView]=useState<"server"|"friends"|"dms"|"inbox"|"profile">("server");
  const [friendsTab,setFriendsTab]=useState<"all"|"add">("all");
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [draft,setDraft]=useState("");
  const [drafts,setDrafts]=useState<Record<string,string>>({});
  const [replyTo,setReplyTo]=useState<ChatMessage|null>(null);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [editContent,setEditContent]=useState("");
  const [search,setSearch]=useState("");
  const [typingUsers,setTypingUsers]=useState<Record<string,{username:string,timestamp:number}>>({});
  const [showEmoji,setShowEmoji]=useState(false);
  const [showGif,setShowGif]=useState(false);
  const [showStickers,setShowStickers]=useState(false);
  const [showPlusMenu,setShowPlusMenu]=useState(false);
  const [showPoll,setShowPoll]=useState(false);
  const [pollQ,setPollQ]=useState("");
  const [pollOpts,setPollOpts]=useState(["",""]);
  const [gifSearch,setGifSearch]=useState("");
  const [gifResults,setGifResults]=useState<string[]>([]);
  const [toast,setToast]=useState("");
  const [showCreateServer,setShowCreateServer]=useState(false);
  const [newServerName,setNewServerName]=useState("");
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
  const [accountTab,setAccountTab]=useState<"hesabim"|"gorunum"|"gizlilik">("hesabim");
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
  const [voiceParticipants,setVoiceParticipants]=useState<Record<string, {profile: UserProfile|null, joinedAt:number}>>({});
  const [remoteStreams,setRemoteStreams]=useState<Record<string, MediaStream>>({});
  const localStreamRef = useRef<MediaStream|null>(null);
  const pcsRef = useRef<Record<string, RTCPeerConnection>>({});
  const [pinnedIds,setPinnedIds]=useState<Set<string>>(new Set());
  const [reactionMap,setReactionMap]=useState<Record<string, Record<string,{count:number,me:boolean}>>>({});
  const [contextMenu,setContextMenu]=useState<{x:number,y:number,msg:ChatMessage}|null>(null);
  const [friendName,setFriendName]=useState("");
  const [members,setMembers]=useState<{uid:string, profile:UserProfile|null, role:string}[]>([]);
  const [dmThreads,setDmThreads]=useState<{id:string, otherUid:string, profile:UserProfile|null, lastAt:number}[]>([]);
  const [selectedDm,setSelectedDm]=useState<string|null>(null);
  const [dmMsgs,setDmMsgs]=useState<{id:string, authorId:string, content:string, createdAt:number}[]>([]);
  const [dmDraft,setDmDraft]=useState("");
  const [friends,setFriends]=useState<{uid:string, profile:UserProfile|null}[]>([]);
  const [showMembers,setShowMembers]=useState(false);
  const [selectedProfileUid,setSelectedProfileUid]=useState<string|null>(null);
  const [selectedProfile,setSelectedProfile]=useState<UserProfile|null>(null);
  const [profileLoading,setProfileLoading]=useState(false);
  const [showLanding,setShowLanding]=useState(true);

  const messagesEndRef=useRef<HTMLDivElement>(null);
  const typingTimeout=useRef<NodeJS.Timeout | null>(null);
  const composerRef=useRef<HTMLTextAreaElement>(null);

  const selectedServerData = useMemo(()=> servers.find(s=>s.id===selectedServer) ?? servers[0],[servers,selectedServer]);
  const selectedChannelData = useMemo(()=> channels.find(c=>c.id===selectedChannel) ?? channels[0],[channels,selectedChannel]);

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

  useEffect(()=>{
    if(!firebaseConfigured){ setAuthLoading(false); return; }
    return onAuthStateChanged(auth, async (u)=>{
      setUser(u); setAuthLoading(false);
      if(!u){ setProfile(null); return; }
      const snap=await get(ref(db,`users/${u.uid}/public`));
      if(snap.exists()) setProfile(snap.val());
      const presRef=ref(db,`users/${u.uid}/presence`);
      set(presRef,{status:"online",lastChanged:Date.now(),connections:{[Date.now()]:true}}).catch(()=>{});
    });
  },[]);

  useEffect(()=>{
    if(!user) return;
    const q=query(ref(db,"servers"),orderByChild("createdAt"));
    return onValue(q,(snap)=>{
      if(!snap.exists()) return;
      const next=Object.entries(snap.val()).map(([id,v])=>({id, ...(v as Omit<Server,"id">)}));
      setServers(next);
      if(next[0] && selectedServer==="demo") setSelectedServer(next[0].id);
    });
  },[user,selectedServer]);

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
      if(next[0] && !next.some(c=>c.id===selectedChannel)) setSelectedChannel(next[0].id);
    });
  },[user,selectedServer,selectedChannel]);

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
    return onValue(ref(db,`typing/${selectedServer}/${selectedChannel}`),(snap)=>{
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
  },[user,selectedServer,selectedChannel,activeView]);

  useEffect(()=>{
    if(!user || selectedServer==="demo") { setMembers([]); return; }
    return onValue(ref(db,`serverMembers/${selectedServer}`), async (snap)=>{
      if(!snap.exists()){ setMembers([]); return; }
      const entries = Object.entries(snap.val() as Record<string,any>);
      const next: {uid:string, profile:UserProfile|null, role:string}[] = [];
      for(const [uid, val] of entries){
        try{
          const profSnap = await get(ref(db,`users/${uid}/public`));
          next.push({uid, profile: profSnap.exists()? profSnap.val() : null, role: (val as any).role || "member"});
        }catch{ next.push({uid, profile:null, role:(val as any).role || "member"});}
      }
      setMembers(next);
    });
  },[user, selectedServer]);


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
    return onValue(ref(db,`friends/${user.uid}`), async (snap)=>{
      if(!snap.exists()){ setFriends([]); return; }
      const ids = Object.keys(snap.val() as Record<string,any>);
      const next: {uid:string, profile:UserProfile|null}[] = [];
      for(const fid of ids){
        const psnap = await get(ref(db,`users/${fid}/public`));
        next.push({uid:fid, profile: psnap.exists()? psnap.val(): null});
      }
      setFriends(next);
    });
  },[user]);

  // Voice: real WebRTC mesh via Firebase signaling
  useEffect(()=>{
    if(!user || !joinedVoice || selectedServer==="demo"){
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
        leaveRoom = joinSignalRoom(joinedVoice!, selectedServer, myUid);
        unsubParticipants = listenForParticipants(joinedVoice!, (uid, added)=>{
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
        const snap = await get(ref(db, `signaling/${joinedVoice}/participants`));
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
        unsubOffers = listenForOffers(joinedVoice!, myUid, async (fromUid, offer)=>{
          if(pcsRef.current[fromUid]) return;
          await createPeer(fromUid, stream, false, offer);
        });
        unsubAnswers = listenForAnswers(joinedVoice!, myUid, async (fromUid, answer)=>{
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
          pc.ontrack = (e)=>{
            const stream = e.streams[0];
            setRemoteStreams(prev=> ({...prev, [remoteUid]: stream}));
          };
          pc.onicecandidate = (e)=>{
            if(e.candidate) void publishCandidate(joinedVoice!, myUid, remoteUid, e.candidate);
          };
          const unsub = listenForCandidates(joinedVoice!, remoteUid, myUid, async (cand)=>{
            try{ await pc.addIceCandidate(new RTCIceCandidate(cand)); }catch{}
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
                const offer = await pc.createOffer({offerToReceiveAudio:true});
                await pc.setLocalDescription(offer);
                await publishOffer(joinedVoice!, myUid, remoteUid, offer);
              } else if(remoteOffer){
                await pc.setRemoteDescription(new RTCSessionDescription(remoteOffer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await publishAnswer(joinedVoice!, myUid, remoteUid, answer);
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
      if(localStreamRef.current){
        localStreamRef.current.getTracks().forEach(tr=>tr.stop());
        localStreamRef.current = null;
      }
      Object.values(pcsRef.current).forEach(pc=>{ try{pc.close();}catch{} });
      pcsRef.current = {};
    };
  },[user, joinedVoice, selectedServer]);

  // mic mute
  useEffect(()=>{
    if(localStreamRef.current){
      localStreamRef.current.getAudioTracks().forEach(tr=> tr.enabled = !micMuted);
    }
  },[micMuted]);
  // deafen -> mute remote playback
  useEffect(()=>{
    document.querySelectorAll<HTMLAudioElement>("audio[data-voice]").forEach(a=>{ a.volume = deafen ? 0 : 1; });
  },[deafen, remoteStreams]);

  useEffect(()=>{
    if(!selectedProfileUid){ setSelectedProfile(null); return; }
    setProfileLoading(true);
    get(ref(db,`users/${selectedProfileUid}/public`)).then(s=>{ if(s.exists()) setSelectedProfile(s.val()); else setSelectedProfile(null); setProfileLoading(false); }).catch(()=>setProfileLoading(false));
  },[selectedProfileUid]);

  useEffect(()=>{ messagesEndRef.current?.scrollIntoView({behavior:"smooth"}); },[messages,threadMessages, dmMsgs]);
  useEffect(()=>{
    const h=(e:KeyboardEvent)=>{
      if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="k"){ e.preventDefault(); setShowPalette(v=>!v); }
      if(e.key==="Escape"){ setShowPalette(false); setContextMenu(null); setShowThread(false); setShowMembers(false); }
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
      return;
    }
    set(ref(db,`typing/${selectedServer}/${selectedChannel}/${user.uid}`),{username: profile?.displayName ?? profile?.username ?? username ?? "anon", timestamp: Date.now()});
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
    if(!content || !user || selectedServer==="demo" || selectedChannelData?.type!=="text") return;
    if(content.startsWith("/")){
      handleCommand(content);
      setDraft(""); updateDraft("");
      remove(ref(db,`typing/${selectedServer}/${selectedChannel}/${user.uid}`)).catch(()=>{});
      return;
    }
    const msgRef=push(ref(db,`messages/${selectedServer}/${selectedChannel}`));
    const payload: any = {
      serverId:selectedServer, channelId:selectedChannel, authorId:user.uid,
      content, authorName: profile?.displayName ?? profile?.username ?? username ?? "anon",
      createdAt: Date.now(),
    };
    if(replyTo) payload.replyTo={ id: replyTo.id, authorName: replyTo.authorName, content: replyTo.content.slice(0,120) };
    await set(msgRef,payload);
    setDraft(""); updateDraft(""); setReplyTo(null);
    remove(ref(db,`typing/${selectedServer}/${selectedChannel}/${user.uid}`)).catch(()=>{});
  }

  function handleCommand(cmd:string){
    const c=cmd.toLowerCase();
    if(c.startsWith("/giphy")){ setToast("giphy için ＋ → GIF kullan"); }
    else if(c.startsWith("/shrug")){ const msg= "¯\\_(ツ)_/¯ "+cmd.slice(7); const r=push(ref(db,`messages/${selectedServer}/${selectedChannel}`)); set(r,{serverId:selectedServer,channelId:selectedChannel,authorId:user!.uid,content:msg,authorName:profile?.displayName??username,createdAt:Date.now()}); }
    else if(c.startsWith("/me")){ const msg= `*${profile?.displayName??username} ${cmd.slice(4)}*`; const r=push(ref(db,`messages/${selectedServer}/${selectedChannel}`)); set(r,{serverId:selectedServer,channelId:selectedChannel,authorId:user!.uid,content:msg,authorName:profile?.displayName??username,createdAt:Date.now()}); }
    else if(c.startsWith("/clear")){ setToast("ekran temizlendi (yerel)"); setMessages([]); }
    else if(c.startsWith("/invite")){ setShowInvite(true); }
    else if(c.startsWith("/poll")){ setShowPoll(true); }
    else if(c.startsWith("/nick")){ const n=cmd.slice(6).trim(); if(n) set(ref(db,`users/${user!.uid}/public/displayName`),n).then(()=>setProfile(p=>p?{...p,displayName:n}:p)); setToast("nick → "+n); }
    else setToast(`bilinmeyen komut: ${cmd.split(" ")[0]}`);
  }

  async function searchGifs(){
    const key=process.env.NEXT_PUBLIC_GIPHY_API_KEY;
    if(!key || !gifSearch.trim()){ setGifResults([]); setToast("Giphy anahtarı yok"); return; }
    try{
      const res=await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(gifSearch)}&limit=6`);
      const data=await res.json();
      setGifResults(data.data?.map((x:any)=>x.images?.fixed_height?.url).filter(Boolean)??[]);
    }catch{ setToast("giphy hatası"); }
  }

  async function createServer(){
    if(!user || !newServerName.trim()) return;
    const sRef=push(ref(db,"servers"));
    if(!sRef.key) return;
    const now=serverTimestamp();
    await set(sRef,{name:newServerName.trim(), ownerId:user.uid, createdAt: now});
    await set(ref(db,`serverMembers/${sRef.key}/${user.uid}`),{role:"owner",joinedAt:now});
    const catId=push(ref(db,`categories/${sRef.key}`)).key!;
    await set(ref(db,`categories/${sRef.key}/${catId}`),{name:"SOHBET", position:0});
    const ch1=push(ref(db,`channels/${sRef.key}`)); await set(ch1,{name:"genel", type:"text", position:0, categoryId:catId, createdAt:now});
    const ch2=push(ref(db,`channels/${sRef.key}`)); await set(ch2,{name:"sesli-oda", type:"voice", position:1, categoryId:null, createdAt:now});
    setSelectedServer(sRef.key); setSelectedChannel(ch1.key!);
    setShowCreateServer(false); setNewServerName(""); setToast(`sunucu: ${newServerName}`);
  }

  async function createChannel(){
    if(!user || selectedServer==="demo" || !newChannelName.trim()) return;
    const chRef=push(ref(db,`channels/${selectedServer}`));
    await set(chRef,{name:newChannelName.trim().toLowerCase().replace(/\s+/g,"-"), type:newChannelType, position: channels.length, categoryId: newChannelCat || null, createdAt: serverTimestamp()});
    setShowCreateChannel(false); setNewChannelName(""); setToast(`#${newChannelName}`);
  }
  async function deleteChannel(channelId: string){
    if(!user || selectedServer==="demo") return;
    if(!confirm("kanalı silmek istiyor musun? mesajlar da silinecek.")) return;
    await remove(ref(db,`channels/${selectedServer}/${channelId}`));
    await remove(ref(db,`messages/${selectedServer}/${channelId}`));
    await remove(ref(db,`signaling/${channelId}`));
    if(selectedChannel===channelId){
      const remaining = channels.filter(c=>c.id!==channelId);
      if(remaining[0]) setSelectedChannel(remaining[0].id);
    }
    setToast("kanal silindi");
    setChannelMenu(null);
  }
  async function saveChannelEdit(){
    if(!editingChannel || !user || selectedServer==="demo") return;
    const newName = editChannelName.trim().toLowerCase().replace(/\s+/g,"-");
    if(!newName) return;
    await update(ref(db,`channels/${selectedServer}/${editingChannel.id}`),{name:newName, topic: editChannelTopic.trim() || null});
    setToast("kanal güncellendi");
    setEditingChannel(null);
  }
  function startCall(){
    if(!user || selectedServer==="demo") return;
    if(!selectedChannelData) return;
    // For voice channel, just join; for text, also join as call
    setJoinedVoice(selectedChannel);
    setToast(`arama başlatıldı — #${selectedChannelData.name}`);
  }

  async function joinViaInvite(){
    if(!joinCode.trim() || !user) return;
    const code=joinCode.trim();
    const snap=await get(ref(db,`invites/${code}`));
    if(!snap.exists()){ setToast("davet bulunamadı"); return; }
    const inv=snap.val() as any;
    await set(ref(db,`serverMembers/${inv.serverId}/${user.uid}`),{role:"member",joinedAt: serverTimestamp()});
    setSelectedServer(inv.serverId);
    setToast("katıldın");
    setJoinCode("");
  }

  function openProfile(uid:string){ setSelectedProfileUid(uid); }

  async function handleAvatarFile(file: File, forProfile=true){
    if(!user || !file) return;
    if(file.size > 4*1024*1024){ setToast("fotoğraf 4MB'dan küçük olmalı"); return; }
    const url = URL.createObjectURL(file);
    setCropTarget({type:"avatar", file, url});
    setCropPos({x:0,y:0});
    setCropZoom(1);
  }
  async function handleBannerFile(file: File){
    if(!user || !file) return;
    if(file.size > 4*1024*1024){ setToast("banner 4MB'dan küçük olmalı"); return; }
    const url = URL.createObjectURL(file);
    setCropTarget({type:"banner", file, url});
    setCropPos({x:0,y:0});
    setCropZoom(1);
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

  async function createInvite(){
    if(!user || selectedServer==="demo") return;
    const code=Math.random().toString(36).slice(2,8).toUpperCase();
    await set(ref(db,`invites/${code}`),{serverId:selectedServer, createdBy:user.uid, createdAt:Date.now(), uses:0});
    setInviteCode(code); setToast(`davet: ${code}`);
  }

  function toggleReaction(msgId:string, emoji:string){
    setReactionMap(prev=>{
      const cur=prev[msgId]||{};
      const existed=cur[emoji];
      const next={...cur};
      if(existed?.me){ if(existed.count<=1) delete next[emoji]; else next[emoji]={count:existed.count-1, me:false}; }
      else next[emoji]={count:(existed?.count||0)+1, me:true};
      return {...prev, [msgId]:next};
    });
    if(user && selectedServer!=="demo"){
      const rRef=ref(db,`reactions/${selectedServer}/${selectedChannel}/${msgId}/${emoji}/${user.uid}`);
      get(rRef).then(s=>{ if(s.exists()) remove(rRef); else set(rRef,true); }).catch(()=>{});
    }
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
    if(!threadMessages[msg.id]) setThreadMessages(prev=>({...prev, [msg.id]:[]}));
  }

  function sendThread(){
    if(!threadParent || !threadDraft.trim() || !user) return;
    const t={id: Math.random().toString(36).slice(2,9), serverId: threadParent.serverId, channelId: threadParent.channelId, authorId:user.uid, authorName: profile?.displayName ?? username, content: threadDraft.trim(), createdAt: Date.now() } as ChatMessage;
    setThreadMessages(prev=>({...prev, [threadParent.id]: [...(prev[threadParent.id]||[]), t]}));
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

  if(authLoading) return <main className="loading-screen">GHOSTGRID — YÜKLENİYOR…</main>;
  if(!user){
    if(showLanding) return <Landing onLogin={()=>{setShowLanding(false); setRegisterMode(false);}} onRegister={()=>{setShowLanding(false); setRegisterMode(true);}} />;
    return <AuthScreen registerMode={registerMode} setRegisterMode={setRegisterMode} username={username} setUsername={setUsername} password={password} setPassword={setPassword} displayName={displayName} setDisplayName={setDisplayName} error={authError} onSubmit={submitAuth} configured={firebaseConfigured} onBack={()=>setShowLanding(true)} />;
  }

  const paletteItems=[
    {id:"1",label:"Kanala git: #genel",action:()=>{setActiveView("server"); setSelectedChannel(channels.find(c=>c.type==="text")?.id||"general"); setShowPalette(false);},kbd:"↵"},
    {id:"2",label:"Davet oluştur",action:()=>{setShowInvite(true); setShowPalette(false);},kbd:"/invite"},
    {id:"3",label:"Sunucu oluştur",action:()=>{setShowCreateServer(true); setShowPalette(false);},kbd:"⌘ N"},
    {id:"4",label:"Komutlar: /help",action:()=>{setToast("/me /shrug /nick /poll /clear /invite"); setShowPalette(false);},kbd:"/"},
  ].filter(it=> !paletteQ || it.label.toLowerCase().includes(paletteQ.toLowerCase()));

  return (
    <main className={`app-shell ${!showMembers || isDemo ? "no-members" : ""}`} onClick={()=>{setContextMenu(null); setChannelMenu(null);}}>
      <aside className="server-rail">
        <div className="brand-mark">GG</div>
        <div className="rail-divider"/>
        {servers.filter(s=>s.id!=="demo").map(s=>(
          <button key={s.id} className={`server-icon ${selectedServer===s.id && activeView==="server" ? "active":""}`} onClick={()=>{setSelectedServer(s.id); setActiveView("server");}} title={s.name}>
            {initials(s.name)}
          </button>
        ))}
        <button className="server-icon add" onClick={()=>setShowCreateServer(true)} title="Sunucu oluştur"><span className="icon"><Icon name="plus"/></span></button>
        <button className="server-icon discover" onClick={()=>{const c=prompt("Davet kodu:"); if(c){ setJoinCode(c); joinViaInvite(); }}} title="Davetle katıl"><span className="icon"><Icon name="invite"/></span></button>
        <div className="rail-divider" style={{marginTop:8}}/>
        <button className={`server-icon dm ${activeView==="friends"?"active":""}`} onClick={()=>setActiveView("friends")} title="Arkadaşlar"><span className="icon"><Icon name="users"/></span></button>
        <button className={`server-icon dm ${activeView==="dms"?"active":""}`} onClick={()=>setActiveView("dms")} title="Mesajlar"><span className="icon"><Icon name="dm"/></span></button>
        <button className={`server-icon dm ${activeView==="inbox"?"active":""}`} onClick={()=>setActiveView("inbox")} title="Gelen kutusu"><span className="icon"><Icon name="inbox"/></span></button>
        <div style={{flex:1}}/>
        <button onClick={()=>setActiveView("profile")} style={{width:44, height:44, border:"1px solid var(--border)", background: (activeView as any)==="profile" ? "#fff" : "#111", color: (activeView as any)==="profile" ? "#000" : "#fff", display:"grid", placeItems:"center", overflow:"visible", flex:"0 0 auto", position:"relative", borderRadius:"50%"}} title="Profil">
          <div style={{width:"100%", height:"100%", borderRadius:"50%", overflow:"hidden", display:"grid", placeItems:"center"}}>{profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : initials(profile?.displayName ?? username)}</div>
          {profile?.decoration && profile.decoration.startsWith("http") && <img src={profile.decoration} alt="" style={{position:"absolute", inset:-6, width:"calc(100% + 12px)", height:"calc(100% + 12px)", pointerEvents:"none"}}/>}
        </button>
      </aside>

      <aside className="channel-sidebar">
        {activeView==="server" ? (
          <>
            <div className="server-title">
              {isDemo ? <strong>GHOSTGRID</strong> : <strong>{selectedServerData?.name}</strong>}
              {!isDemo && (
                <div style={{display:"flex", gap:6}}>
                  <button onClick={()=>setShowMembers(v=>!v)} title="Üyeler" style={{width:26,height:26,border:"1px solid var(--border)",background: showMembers?"#fff":"transparent",color: showMembers?"#000":"var(--muted)",display:"grid",placeItems:"center"}}>◫</button>
                  <button onClick={()=>setShowServerSettings(true)} title="Ayarlar" style={{width:26,height:26,border:"1px solid var(--border)",background:"transparent",color:"var(--muted)",display:"grid",placeItems:"center"}}>⚙</button>
                </div>
              )}
            </div>

            {isDemo ? (
              <div style={{padding:24, display:"flex", flexDirection:"column", gap:12}}>
                <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)", lineHeight:1.6}}>
                  henüz sunucun yok.<br/>oluştur ve başla.
                </div>
                <button className="btn btn-primary" onClick={()=>setShowCreateServer(true)}>SUNUCU OLUŞTUR</button>
                <div style={{display:"flex", gap:6}}>
                  <input value={joinCode} onChange={e=>setJoinCode(e.target.value)} placeholder="davet kodu" style={{flex:1, background:"#000", border:"1px solid var(--border)", color:"#fff", padding:"8px", fontFamily:"var(--font-mono)", fontSize:11}} />
                  <button className="btn" onClick={joinViaInvite}>KATIL</button>
                </div>
              </div>
            ) : (
              <>
                <div className="channel-search">
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="kanal ara" />
                </div>
                <div className="channel-scroll">
                  {joinedVoice && (
                    <div className="voice-panel animate-fade">
                      <div className="vp-head"><span>● {channels.find(c=>c.id===joinedVoice)?.name} — {Object.keys(voiceParticipants).length + 1} kişi</span><button onClick={()=>setJoinedVoice(null)} style={{border:"1px solid var(--border)", background:"transparent", color:"var(--muted)"}}>✕</button></div>
                      <div style={{fontFamily:"var(--font-mono)", fontSize:10, color: deafen ? "#f23f42" : "var(--muted)", marginBottom:6}}>{deafen ? "sağır — ses kapalı" : micMuted ? "mikrofon kapalı" : "● canlı — konuş"}</div>
                      <div className="voice-controls">
                        <button className={micMuted?"active":""} onClick={()=>setMicMuted(v=>!v)}>{micMuted?"🔇 MİK KAPALI":"🎙️ MİK AÇIK"}</button>
                        <button className={deafen?"active":""} onClick={()=>setDeafen(v=>!v)}>{deafen?"🔊 SAĞIR KAPALI":"🔇 SAĞIR"}</button>
                        <button onClick={()=>setJoinedVoice(null)}>AYRIL</button>
                      </div>
                      <div style={{marginTop:8, display:"flex", flexDirection:"column", gap:4, maxHeight:140, overflow:"auto"}}>
                        <div style={{display:"flex", alignItems:"center", gap:6, padding:"4px 6px", border:"1px solid var(--border)", background: micMuted ? "var(--surface)" : "#fff", color: micMuted ? "var(--muted)" : "#000"}}>
                          <div style={{width:22, height:22, borderRadius:"50%", background:"#000", color:"#fff", display:"grid", placeItems:"center", fontSize:9, fontWeight:700}}>{initials(profile?.displayName ?? username)}</div>
                          <span style={{flex:1, fontFamily:"var(--font-mono)", fontSize:11, fontWeight:700}}>Sen {micMuted ? "(sessiz)" : ""}</span>
                          <span style={{fontSize:10}}>{micMuted ? "🔇" : "●"}</span>
                        </div>
                        {Object.entries(voiceParticipants).map(([uid, info])=>(
                          <div key={uid} style={{display:"flex", alignItems:"center", gap:6, padding:"4px 6px", border:"1px solid var(--border)", background:"var(--surface-2)"}}>
                            <div style={{width:22, height:22, borderRadius:"50%", background:"#111", color:"#fff", display:"grid", placeItems:"center", fontSize:9, fontWeight:700, overflow:"hidden"}}>
                              {info.profile?.avatarUrl ? <img src={info.profile.avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : initials(info.profile?.displayName || info.profile?.username || "??")}
                            </div>
                            <span style={{flex:1, fontFamily:"var(--font-mono)", fontSize:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{info.profile?.displayName || info.profile?.username || uid.slice(0,6)}</span>
                            <span style={{fontSize:10}}>{remoteStreams[uid] ? "●" : "○"}</span>
                            <audio autoPlay playsInline data-voice ref={el=>{ if(el && remoteStreams[uid]){ el.srcObject = remoteStreams[uid]; el.volume = deafen ? 0 : 1; try{ el.play().catch(()=>{});}catch{} } }} />
                          </div>
                        ))}
                        {Object.keys(voiceParticipants).length===0 && <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)", padding:"6px", border:"1px dashed var(--border)", textAlign:"center"}}>başka kimse yok — davet et</div>}
                      </div>
                    </div>
                  )}
                  {(categories.length?categories:[{id:"_none",name:"SOHBET",position:0}] as Category[]).map(cat=>{
                    const chans = filteredChannels.filter(c=> (c.categoryId||"_none")===cat.id || (cat.id==="_none" && !c.categoryId));
                    if(chans.length===0) return null;
                    return (
                      <div key={cat.id}>
                        <div className="category-label">{cat.name} <span onClick={()=>setShowCreateChannel(true)}>＋</span></div>
                        {chans.map(ch=>(
                          <div key={ch.id} style={{position:"relative"}}>
                            <button
                              className={`channel-row ${selectedChannel===ch.id ? "selected":""}`}
                              onClick={()=>{
                                if(ch.type==="voice"){ setJoinedVoice(ch.id); setSelectedChannel(ch.id); }
                                else setSelectedChannel(ch.id);
                              }}
                              onContextMenu={e=>{ e.preventDefault(); setChannelMenu({x:e.clientX, y:e.clientY, channel:ch}); }}
                            >
                              <span className="ch-icon"><span className="icon">{ch.type==="voice" ? <Icon name="voice" size={13}/> : <Icon name="hash" size={13}/>}</span></span>
                              <span className="ch-name">{ch.name}</span>
                              {ch.type==="voice" && <span style={{fontSize:10, opacity:.5}}>●</span>}
                              <span style={{marginLeft:"auto", display:"flex", gap:2, opacity:0}} className="ch-actions-hover">
                                <span onClick={e=>{e.stopPropagation(); setEditingChannel(ch); setEditChannelName(ch.name); setEditChannelTopic(ch.topic||"");}} style={{border:"1px solid var(--border)", width:18, height:18, display:"grid", placeItems:"center", fontSize:10}} title="Düzenle">✎</span>
                                <span onClick={e=>{e.stopPropagation(); deleteChannel(ch.id);}} style={{border:"1px solid var(--border)", width:18, height:18, display:"grid", placeItems:"center", fontSize:10}} title="Sil">🗑</span>
                              </span>
                            </button>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
                {channelMenu && (
                  <div className="context-menu" style={{left:channelMenu.x, top:channelMenu.y}} onClick={e=>e.stopPropagation()}>
                    <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)", padding:"4px 8px", borderBottom:"1px solid var(--border)"}}>#{channelMenu.channel.name}</div>
                    <div className="context-item" onClick={()=>{ setSelectedChannel(channelMenu.channel.id); if(channelMenu.channel.type==="voice") setJoinedVoice(channelMenu.channel.id); setChannelMenu(null); }}><span className="icon"><Icon name="hash" size={12}/></span> Kanala Git</div>
                    <div className="context-item" onClick={()=>{ startCall(); setChannelMenu(null); }}><span className="icon"><Icon name="mic" size={12}/></span> Arama Başlat</div>
                    <div className="context-item" onClick={()=>{ setEditingChannel(channelMenu.channel); setEditChannelName(channelMenu.channel.name); setEditChannelTopic(channelMenu.channel.topic||""); setChannelMenu(null); }}><span className="icon"><Icon name="settings" size={12}/></span> Düzenle</div>
                    <div className="context-item" onClick={()=>{ navigator.clipboard.writeText(`#${channelMenu.channel.name}`); setToast("kopyalandı"); setChannelMenu(null); }}>⎘ Kopyala</div>
                    <div className="context-item danger" onClick={()=> deleteChannel(channelMenu.channel.id)}><span className="icon"><Icon name="plus" size={12}/></span> Sil</div>
                  </div>
                )}
                <div className="current-user">
                  <button className="cu-avatar" onClick={()=>openProfile(user.uid)} style={{cursor:"pointer"}}>{profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : initials(profile?.displayName ?? username)}</button>
                  <div className="cu-meta">
                    <strong>{profile?.displayName ?? username}</strong>
                    <small>@{profile?.username ?? username}</small>
                  </div>
                  <div className="cu-actions">
                    <button onClick={()=>setShowAccountSettings(true)} title="Hesap Ayarları"><span className="icon"><Icon name="settings"/></span></button>
                    <button onClick={()=>signOut(auth)} title="Çıkış">⎋</button>
                  </div>
                </div>
              </>
            )}
          </>
        ) : activeView==="dms" ? (
          <>
            <div className="server-title"><strong>MESAJLAR</strong><span onClick={()=>setActiveView("friends")} style={{cursor:"pointer"}}>＋</span></div>
            <div className="channel-scroll">
              <div className="category-label">DİREKT MESAJLAR</div>
              {dmThreads.length===0 ? (
                <div style={{border:"1px dashed var(--border)", padding:12, margin:"8px 0", fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)", textAlign:"center"}}>henüz DM yok</div>
              ) : dmThreads.map(th=>(
                <div key={th.id} className={`dm-item ${selectedDm===th.id ? "active": ""}`} onClick={()=>setSelectedDm(th.id)}>
                  <button className="dm-av" onClick={(e)=>{e.stopPropagation(); openProfile(th.otherUid);}} style={{cursor:"pointer"}}>{th.profile?.avatarUrl ? <img src={th.profile.avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : initials(th.profile?.displayName||th.profile?.username||"??")}</button>
                  <div className="dm-meta"><div className="dm-name">{th.profile?.displayName||th.profile?.username}</div><div className="dm-sub">@{th.profile?.username}</div></div>
                </div>
              ))}
            </div>
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
              <button className="channel-row" onClick={()=>setActiveView("dms")}><span className="ch-icon"><span className="icon"><Icon name="dm"/></span></span><span className="ch-name">Mesajlar</span></button>
              <div style={{marginTop:16, border:"1px solid var(--border)", padding:10, background:"var(--surface-2)"}}>
                <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)", marginBottom:6}}>PROFİL FOTOĞRAFI</div>
                <div style={{width:64, height:64, border:"1px solid var(--border)", background:"#000", display:"grid", placeItems:"center", overflow:"visible", marginBottom:8, position:"relative", borderRadius:"50%"}}>
                  <div style={{width:"100%", height:"100%", borderRadius:"50%", overflow:"hidden", display:"grid", placeItems:"center"}}>{profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : <span style={{fontFamily:"var(--font-mono)", fontWeight:700}}>{initials(profile?.displayName ?? username)}</span>}</div>
                  {profile?.decoration && profile.decoration.startsWith("http") && <img src={profile.decoration} alt="" style={{position:"absolute", inset:-8, width:"calc(100% + 16px)", height:"calc(100% + 16px)", pointerEvents:"none"}}/>}
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
              <div className="cu-actions"><button onClick={()=>signOut(auth)} title="Çıkış">⎋</button></div>
            </div>
          </>
        ) : activeView==="friends" ? (
          <>
            <div className="server-title"><strong>ARKADAŞLAR</strong></div>
            <div className="channel-scroll">
              <div style={{display:"flex", gap:6, padding:"0 0 12px"}}>
                {(["all","add"] as const).map(t=>(
                  <button key={t} className={`tab ${friendsTab===t?"active":""}`} onClick={()=>setFriendsTab(t)} style={{flex:1}}>{t==="all"?"TÜMÜ":"EKLE"}</button>
                ))}
              </div>
              {friendsTab==="add" ? (
                <div style={{border:"1px solid var(--border)", padding:12, background:"var(--surface-2)"}}>
                  <div style={{fontFamily:"var(--font-mono)", fontSize:11, fontWeight:700, marginBottom:8}}>KULLANICI ADIYLA EKLE</div>
                  <div style={{display:"flex", gap:6}}>
                    <input value={friendName} onChange={e=>setFriendName(e.target.value)} placeholder="kullanici_adi" style={{flex:1, background:"#000", border:"1px solid var(--border)", color:"#fff", padding:"8px", fontFamily:"var(--font-mono)", fontSize:12}} />
                    <button className="btn btn-primary" onClick={async()=>{
                      const clean = friendName.trim().toLowerCase();
                      if(!clean) return;
                      const snap = await get(ref(db,`usernameIndex/${clean}`));
                      if(!snap.exists()){ setToast("bulunamadı"); return; }
                      const fid = snap.val() as string;
                      if(fid===user.uid){ setToast("kendini ekleyemezsin"); return; }
                      await set(ref(db,`friends/${user.uid}/${fid}`), true);
                      await set(ref(db,`friends/${fid}/${user.uid}`), true);
                      const psnap = await get(ref(db,`users/${fid}/public`));
                      setFriends(prev=> [...prev, {uid: fid, profile: psnap.exists()? psnap.val(): null}]);
                      setFriendName(""); setToast(`eklendi: ${clean}`); setFriendsTab("all");
                    }}>EKLE</button>
                  </div>
                </div>
              ) : friends.length===0 ? (
                <div style={{border:"1px dashed var(--border)", padding:16, textAlign:"center", fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)"}}>
                  henüz arkadaş yok
                </div>
              ) : friends.map(f=>(
                <div key={f.uid} className="friend-row">
                  <button className="avatar" onClick={()=>openProfile(f.uid)} style={{cursor:"pointer", border:"1px solid var(--border)", background:"#111"}}>{f.profile?.avatarUrl ? <img src={f.profile.avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : initials(f.profile?.displayName||f.profile?.username||"??")}</button>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:13, fontWeight:600}}>{f.profile?.displayName||f.profile?.username}</div>
                    <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)"}}>@{f.profile?.username}</div>
                  </div>
                  <button className="btn" onClick={()=>startDM(f.uid)}>DM</button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="server-title"><strong>GELEN KUTUSU</strong></div>
            <div className="channel-scroll">
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
            </div>
          </>
        )}
      </aside>

      <section className="chat-panel">
        {activeView!=="server" ? (
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
                      {!profile?.bannerUrl && <div style={{position:"absolute", inset:0, backgroundImage:"linear-gradient(to right, #111 1px, transparent 1px), linear-gradient(to bottom, #111 1px, transparent 1px)", backgroundSize:"20px 20px", opacity: profile?.bannerColor ? .15 : .9}}/>}
                      {!profile?.bannerUrl && <div style={{position:"absolute", inset:0, opacity:.06, background:"repeating-linear-gradient(45deg, #000 0 8px, transparent 8px 16px)"}}/>}
                      <div style={{position:"absolute", top:8, right:8, display:"flex", gap:6}}>
                        <label style={{border:"1px solid #000", background:"rgba(0,0,0,.7)", color:"#fff", padding:"5px 8px", fontFamily:"var(--font-mono)", fontSize:10, cursor:"pointer", backdropFilter:"blur(4px)"}}>
                          BANNER
                          <input type="file" accept="image/*" hidden onChange={e=>{const f=e.target.files?.[0]; if(f) handleBannerFile(f);}} />
                        </label>
                      </div>
                      <div style={{position:"absolute", left:16, bottom:-30, display:"flex", alignItems:"flex-end", gap:10}}>
                        <div style={{width:76, height:76, border:"2px solid #fff", background:"#000", display:"grid", placeItems:"center", overflow:"visible", borderRadius:"50%", boxShadow:"0 2px 8px rgba(0,0,0,.4)", position:"relative", zIndex:2}}>
                          <div style={{width:"100%", height:"100%", borderRadius:"50%", overflow:"hidden", display:"grid", placeItems:"center"}}>{profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : <span style={{fontFamily:"var(--font-mono)", fontWeight:800, fontSize:20}}>{initials(profile?.displayName ?? username)}</span>}</div>
                          {/* decoration - image or border */}
                          {profile?.decoration && (profile.decoration.startsWith("http") ? <img src={profile.decoration} alt="" style={{position:"absolute", inset:-10, width:"calc(100% + 20px)", height:"calc(100% + 20px)", pointerEvents:"none"}}/> : <div style={{position:"absolute", inset:-2, border:"2px solid #fff", borderRadius: profile.decoration==="circle" ? "50%" : "0", pointerEvents:"none"}}/>)}
                          <div style={{position:"absolute", right:0, bottom:0, width:14, height:14, border:"2px solid var(--surface)", background: profile?.status==="online" ? "#23a559" : profile?.status==="idle" ? "#f0b132" : profile?.status==="dnd" ? "#f23f42" : "#80848e", borderRadius:"50%", boxShadow:"0 1px 2px rgba(0,0,0,.3)"}}/>
                        </div>
                        <div style={{marginBottom:4, display:"flex", gap:4, flexWrap:"wrap"}}>
                          {(profile?.badges||[]).map(b=> <span key={b} style={{border:"1px solid #000", background:"#fff", color:"#000", fontFamily:"var(--font-mono)", fontSize:9, fontWeight:700, padding:"2px 6px", letterSpacing:".04em"}}>{b}</span>)}
                          {(!profile?.badges || profile.badges.length===0) && <span style={{border:"1px dashed var(--border)", background:"rgba(0,0,0,.5)", color:"#fff", fontFamily:"var(--font-mono)", fontSize:9, padding:"2px 6px"}}>ROZET YOK</span>}
                        </div>
                      </div>
                    </div>
                    <div style={{padding:"40px 16px 14px"}}>
                      <div style={{display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12}}>
                        <div style={{minWidth:0}}>
                          <div style={{display:"flex", alignItems:"center", gap:8, flexWrap:"wrap"}}>
                            <span style={{fontWeight:800, fontSize:18, letterSpacing:"-.02em"}}>{profile?.displayName}</span>
                            {profile?.pronouns && <span style={{border:"1px solid var(--border)", background:"var(--surface-2)", fontFamily:"var(--font-mono)", fontSize:10, padding:"2px 6px", color:"var(--muted)"}}>{profile.pronouns}</span>}
                            {profile?.title && <span style={{border:"1px solid #fff", background:"#fff", color:"#000", fontFamily:"var(--font-mono)", fontSize:10, fontWeight:700, padding:"2px 6px"}}>{profile.title}</span>}
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
                        <div style={{border:"1px solid var(--border)", padding:10, textAlign:"center"}}><div style={{fontFamily:"var(--font-mono)", fontSize:9, color:"var(--muted)", letterSpacing:".06em"}}>KATILIM</div><div style={{fontWeight:700, fontSize:11, marginTop:4}}>{profile?.createdAt ? fmtDate(profile.createdAt) : "—"}</div></div>
                        <div style={{border:"1px solid var(--border)", padding:10, textAlign:"center"}}><div style={{fontFamily:"var(--font-mono)", fontSize:9, color:"var(--muted)"}}>SUNUCU</div><div style={{fontWeight:800, fontSize:14}}>{servers.filter(s=>s.id!=="demo").length}</div></div>
                        <div style={{border:"1px solid var(--border)", padding:10, textAlign:"center"}}><div style={{fontFamily:"var(--font-mono)", fontSize:9, color:"var(--muted)"}}>ARKADAŞ</div><div style={{fontWeight:800, fontSize:14}}>{friends.length}</div></div>
                      </div>
                      <div style={{marginTop:10, border:"1px solid var(--border)", background:"#000", padding:10, display:"flex", gap:8, alignItems:"center"}}>
                        <div style={{width:28, height:28, border:"1px solid var(--border)", display:"grid", placeItems:"center", background:"#111"}}><Icon name="grid"/></div>
                        <div style={{flex:1}}><div style={{fontFamily:"var(--font-mono)", fontSize:10, fontWeight:700}}>BAĞLANTILAR</div><div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)"}}>yakında: github / spotify / site — Discord Connections gibi</div></div>
                        <span style={{fontFamily:"var(--font-mono)", fontSize:10, border:"1px solid var(--border)", padding:"4px 6px", color:"var(--muted)"}}>YAKINDA</span>
                      </div>
                    </div>
                  </div>
                  {/* quick edit row */}
                  <div style={{border:"1px solid var(--border)", background:"var(--surface)", padding:10, display:"flex", gap:6, flexWrap:"wrap"}}>
                    <button className="btn" onClick={()=>setShowUserSettings(true)}>PROFİLİ SÜSLE</button>
                    <button className="btn btn-primary" onClick={()=>setActiveView("friends")}>ARKADAŞLAR</button>
                    <button className="btn" onClick={()=>setActiveView("dms")}>MESAJLAR</button>
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
                <div className="header-actions"><div className="header-search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ara"/></div></div>
              </header>
              <div className="message-area" style={{padding:16}}>
                {!selectedDm ? (
                  <div className="empty-state"><div className="empty-orb"><span className="icon"><Icon name="dm"/></span></div><h2>DM seç</h2><p>soldan bir kişi seç veya arkadaş ekle.</p></div>
                ) : dmMsgs.length===0 ? (
                  <div className="empty-state"><div className="empty-orb">#</div><h2>henüz mesaj yok</h2><p>ilk mesajı gönder.</p></div>
                ) : dmMsgs.filter(m=> !search || m.content.toLowerCase().includes(search.toLowerCase())).map(m=>(
                  <div key={m.id} className={`message-row ${m.authorId===user.uid ? "" : ""}`} style={{maxWidth:760, margin:"0 auto", width:"100%"}}>
                    <button className="msg-avatar" onClick={()=>openProfile(m.authorId)} style={{cursor:"pointer"}}>{m.authorId===user.uid && profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : initials(m.authorId===user.uid ? (profile?.displayName||username) : (dmThreads.find(d=>d.id===selectedDm)?.profile?.displayName||"??"))}</button>
                    <div className="msg-body"><div className="msg-author-row"><span className="msg-author">{m.authorId===user.uid ? "Sen" : (dmThreads.find(d=>d.id===selectedDm)?.profile?.displayName||"arkadaş")}</span><span className="msg-time">{fmtTime(m.createdAt)}</span></div><div className="msg-content">{m.content}</div></div>
                  </div>
                ))}
              </div>
              {selectedDm && (
                <div className="composer-wrap">
                  <form className="composer" onSubmit={e=>{e.preventDefault(); const c=dmDraft.trim(); if(!c||!selectedDm||!user) return; const r=push(ref(db,`dmMessages/${selectedDm}`)); set(r,{authorId:user.uid, content:c, createdAt: Date.now()}); update(ref(db,`dmThreads/${selectedDm}`),{lastMessageAt: Date.now()}); setDmDraft("");}} style={{alignItems:"center"}}>
                    <textarea value={dmDraft} onChange={e=>setDmDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault(); const c=dmDraft.trim(); if(!c||!selectedDm||!user) return; const r=push(ref(db,`dmMessages/${selectedDm}`)); set(r,{authorId:user.uid, content:c, createdAt: Date.now()}); update(ref(db,`dmThreads/${selectedDm}`),{lastMessageAt: Date.now()}); setDmDraft("");}}} placeholder="mesaj yaz — Enter gönder" rows={1} className="composer-input" style={{minHeight:24, maxHeight:80}}/>
                    <button type="submit" className="send-button" disabled={!dmDraft.trim()}><span className="icon"><Icon name="send"/></span></button>
                  </form>
                </div>
              )}
            </>
        ) : activeView==="friends" ? (
            <>
              <header className="chat-header">
                <div className="channel-heading"><span className="hash">◉</span><strong>ARKADAŞLAR</strong><span className="topic">{friends.length} kişi</span></div>
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
                      <div key={f.uid} className="friend-row">
                        <button className="avatar" onClick={()=>openProfile(f.uid)} style={{cursor:"pointer", border:"1px solid var(--border)", background:"#111"}}>{f.profile?.avatarUrl ? <img src={f.profile.avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : initials(f.profile?.displayName||f.profile?.username||"??")}</button>
                        <div style={{flex:1}}><div style={{fontWeight:600}}>{f.profile?.displayName||f.profile?.username}</div><div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)"}}>@{f.profile?.username}</div></div>
                        <button className="btn" onClick={()=>startDM(f.uid)}>MESAJ</button>
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
                <span className="hash">{selectedChannelData?.type==="voice" ? "⌁" : "#"}</span>
                <strong>{isDemo ? "hoş geldin" : selectedChannelData?.name ?? "genel"}</strong>
                {!isDemo && <span className="topic">{selectedChannelData?.topic ?? ""}</span>}
              </div>
              <div className="header-actions">
                <div className="header-search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ara" /></div>
                <button onClick={startCall} title="Arama Başlat — sesli arama" style={{border: selectedChannelData?.type==="voice" && joinedVoice===selectedChannel ? "1px solid #fff" : "1px solid var(--border)", background: selectedChannelData?.type==="voice" && joinedVoice===selectedChannel ? "#fff" : "transparent", color: selectedChannelData?.type==="voice" && joinedVoice===selectedChannel ? "#000" : "var(--muted)"}}><span className="icon"><Icon name="mic"/></span></button>
                <button onClick={()=>{ if(selectedChannelData && selectedServer!=="demo"){ setEditingChannel(selectedChannelData); setEditChannelName(selectedChannelData.name); setEditChannelTopic(selectedChannelData.topic||""); } }} title="Kanalı Düzenle"><span className="icon"><Icon name="settings"/></span></button>
                <button onClick={()=>{ if(selectedChannelData && selectedServer!=="demo") deleteChannel(selectedChannelData.id); }} title="Kanalı Sil" style={{color:"#ff4444", borderColor:"var(--border)"}}>🗑</button>
                <button onClick={()=>setShowPalette(true)}>⌘K</button>
              </div>
            </header>

            <div className="message-area" onClick={()=>{setShowEmoji(false); setShowGif(false); setShowStickers(false); setShowPlusMenu(false);}}>
              {isDemo ? (
                <div className="welcome animate-slide">
                  <div className="welcome-icon">◈</div>
                  <h1>GHOSTGRID</h1>
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
                    <button className="btn" onClick={()=>setJoinedVoice(null)}>AYRIL</button>
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
                              <input value={editContent} onChange={e=>setEditContent(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter") editMessage(); if(e.key==="Escape") setEditingId(null); }} style={{flex:1, background:"#000", border:"1px solid #fff", color:"#fff", padding:"6px", fontSize:13}} autoFocus />
                              <button className="btn btn-primary" onClick={editMessage}>KAYDET</button><button className="btn" onClick={()=>setEditingId(null)}>İPTAL</button>
                            </div>
                          ) : (
                            <div className="msg-content"><RenderContent text={m.content} /></div>
                          )}
                          {m.poll && (
                            <div className="poll">
                              <q>{m.poll.question}</q>
                              {m.poll.options.map(o=>(
                                <div key={o.id} className="poll-option" onClick={()=>setToast(`oy: ${o.text}`)}><span style={{fontSize:11, fontWeight:700}}>{o.text}</span><span className="bar"><i style={{width: `${Math.round((o.votes/(m.poll!.totalVotes||1))*100)}%`}} /></span><span style={{fontFamily:"var(--font-mono)", fontSize:10}}>{o.votes}</span></div>
                              ))}
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
                {replyTo && (
                  <div className="composer-reply">
                    <span>↳ <strong>{replyTo.authorName}</strong> — {replyTo.content.slice(0,60)}</span>
                    <button onClick={()=>setReplyTo(null)} style={{border:"1px solid var(--border)", background:"transparent", padding:"2px 6px"}}>✕</button>
                  </div>
                )}
                <form className="composer" onSubmit={sendMessage} style={{alignItems:"center"}}>
                  <button type="button" onClick={()=>setShowPlusMenu(v=>!v)} className="composer-plus" title="Dosya ekle">＋</button>
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
                    <button type="button" onClick={()=>setShowStickers(v=>!v)} title="Sticker">✦</button>
                    <button type="button" onClick={()=>setShowEmoji(v=>!v)} title="Emoji">☺</button>
                    <button type="submit" className="send-button" disabled={!draft.trim()} title="Gönder"><span className="icon"><Icon name="send" size={18}/></span></button>
                  </div>
                </form>
                {showPlusMenu && (
                  <div style={{position:"absolute", bottom:52, left:12, background:"var(--surface)", border:"1px solid var(--border)", padding:6, display:"flex", gap:6, zIndex:5}}>
                    <label style={{border:"1px solid var(--border)", padding:"6px 8px", fontFamily:"var(--font-mono)", fontSize:11, cursor:"pointer"}}>DOSYA<input type="file" hidden onChange={e=>{const f=e.target.files?.[0]; if(!f) return; setToast(`dosya: ${f.name}`); updateDraft(draft + ` [dosya: ${f.name}]`); setShowPlusMenu(false);}} /></label>
                    <button className="btn" onClick={()=>{setShowPoll(true); setShowPlusMenu(false);}}>POLL</button>
                    <button className="btn" onClick={()=>{setShowGif(true); setShowPlusMenu(false);}}>GIF</button>
                    <button className="btn" onClick={()=>{setShowStickers(true); setShowPlusMenu(false);}}>STICKER</button>
                  </div>
                )}
                {showPoll && (
                  <div style={{marginTop:8, border:"1px solid var(--border)", background:"var(--surface-2)", padding:10}}>
                    <div style={{fontFamily:"var(--font-mono)", fontSize:11, fontWeight:700, marginBottom:8}}>POLL</div>
                    <input value={pollQ} onChange={e=>setPollQ(e.target.value)} placeholder="Soru" style={{width:"100%", background:"#000", border:"1px solid var(--border)", color:"#fff", padding:"7px", fontFamily:"var(--font-mono)", fontSize:12, marginBottom:6}} />
                    {pollOpts.map((o,i)=>(
                      <div key={i} style={{display:"flex", gap:6, marginBottom:4}}>
                        <input value={o} onChange={e=>setPollOpts(prev=>prev.map((x,idx)=> idx===i? e.target.value: x))} placeholder={`Seçenek ${i+1}`} style={{flex:1, background:"#000", border:"1px solid var(--border)", color:"#fff", padding:"7px", fontSize:12}} />
                        <button onClick={()=>setPollOpts(p=>p.filter((_,idx)=>idx!==i))} style={{border:"1px solid var(--border)", background:"transparent"}}>✕</button>
                      </div>
                    ))}
                    <div style={{display:"flex", gap:6, marginTop:8}}>
                      <button className="btn" onClick={()=>setPollOpts(p=>[...p,""])}>+ SEÇENEK</button>
                      <button className="btn btn-primary" onClick={()=>{
                        if(!pollQ.trim() || pollOpts.filter(s=>s.trim()).length<2){ setToast("en az 2 seçenek"); return; }
                        const poll={id: Math.random().toString(36).slice(2,8), question: pollQ.trim(), options: pollOpts.filter(s=>s.trim()).map((t,i)=>({id:i.toString(), text:t.trim(), votes:0})), totalVotes:0, allowMultiple:false};
                        const r=push(ref(db,`messages/${selectedServer}/${selectedChannel}`));
                        set(r,{serverId:selectedServer, channelId:selectedChannel, authorId:user.uid, content: `📊 ${poll.question}`, authorName: profile?.displayName??username, createdAt: serverTimestamp(), poll});
                        setPollQ(""); setPollOpts(["",""]); setShowPoll(false);
                      }}>GÖNDER</button>
                      <button className="btn" onClick={()=>setShowPoll(false)}>İPTAL</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {showEmoji && <div className="picker"><div className="picker-title">EMOJI <button onClick={()=>setShowEmoji(false)}>✕</button></div><div className="emoji-grid">{EMOJIS.map(e=><button key={e} onClick={()=>{updateDraft(draft + e); setShowEmoji(false);}}>{e}</button>)}</div></div>}
            {showGif && <div className="picker"><div className="picker-title">GIF <button onClick={()=>setShowGif(false)}>✕</button></div><div className="picker-search"><input value={gifSearch} onChange={e=>setGifSearch(e.target.value)} onKeyDown={e=> e.key==="Enter" && searchGifs()} placeholder="ara..." /><button onClick={searchGifs}>ARA</button></div><div className="gif-grid">{gifResults.map(u=><button key={u} onClick={()=>{updateDraft(draft + " " + u); setShowGif(false);}}><img src={u} alt="gif" /></button>)}{gifResults.length===0 && <div style={{gridColumn:"1 / -1", fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)", padding:8, border:"1px dashed var(--border)", textAlign:"center"}}>giphy — API boşsa çalışmaz</div>}</div></div>}
            {showStickers && <div className="picker"><div className="picker-title">STICKER <button onClick={()=>setShowStickers(false)}>✕</button></div><div className="sticker-grid">{STICKERS.map(s=><button key={s} onClick={()=>{updateDraft(draft + " " + s); setShowStickers(false);}}>{s}</button>)}</div></div>}

            {showThread && (
              <div className="thread-drawer">
                <div className="thread-head"><span>THREAD</span><button onClick={()=>setShowThread(false)}>✕</button></div>
                <div className="thread-body">
                  {threadParent ? (
                    <>
                      <div style={{border:"1px solid var(--border)", padding:10, background:"var(--surface-2)", marginBottom:10}}>
                        <div style={{fontSize:12, fontWeight:700}}>{threadParent.authorName}</div><div style={{fontSize:12, color:"var(--muted)"}}>{threadParent.content}</div>
                      </div>
                      {(threadMessages[threadParent.id]||[]).map(tm=>(
                        <div key={tm.id} style={{display:"flex", gap:8, padding:"6px 0", borderBottom:"1px solid var(--border)"}}>
                          <div className="msg-avatar" style={{width:24, height:24, fontSize:9}}>{initials(tm.authorName||"??")}</div>
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
            <button onClick={()=>setShowMembers(false)} style={{border:"1px solid var(--border)", background:"transparent", width:22, height:22, display:"grid", placeItems:"center"}}>✕</button>
          </div>
          <div className="member-scroll">
            {members.length===0 ? (
              <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)", padding:12, textAlign:"center"}}>henüz üye yok</div>
            ) : (
              <div className="member-group">
                <div className="member-group-title">ÇEVRİMİÇİ — {members.length}</div>
                {members.map(m=>(
                  <div key={m.uid} className="member-row">
                    <button className="m-av" onClick={()=>openProfile(m.uid)} style={{cursor:"pointer", display:"grid", placeItems:"center"}}>{m.profile?.avatarUrl ? <img src={m.profile.avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : initials(m.profile?.displayName||m.profile?.username||"??")}<i className="status-dot online"/></button>
                    <div style={{flex:1, minWidth:0}}><div className="m-name">{m.profile?.displayName||m.profile?.username}</div><small>{m.role}</small></div>
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
            <div className="modal-head"><span>SUNUCU OLUŞTUR</span><button onClick={()=>setShowCreateServer(false)}>✕</button></div>
            <div className="modal-body">
              <label>SUNUCU ADI</label>
              <input value={newServerName} onChange={e=>setNewServerName(e.target.value)} placeholder="ghost-ops" autoFocus />
              <div style={{marginTop:12, borderTop:"1px solid var(--border)", paddingTop:12}}>
                <label>DAVET KODUYLA KATIL</label>
                <div style={{display:"flex", gap:6}}>
                  <input value={joinCode} onChange={e=>setJoinCode(e.target.value)} placeholder="ABC123" style={{flex:1}} />
                  <button className="btn" onClick={joinViaInvite}>KATIL</button>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={()=>setShowCreateServer(false)}>İPTAL</button>
              <button className="btn btn-primary" onClick={createServer} disabled={!newServerName.trim()}>OLUŞTUR</button>
            </div>
          </div>
        </div>
      )}

      {showCreateChannel && (
        <div className="modal-backdrop" onClick={()=>setShowCreateChannel(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-head"><span>KANAL OLUŞTUR</span><button onClick={()=>setShowCreateChannel(false)}>✕</button></div>
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
            <div className="modal-head"><span>KANALI DÜZENLE — #{editingChannel.name}</span><button onClick={()=>setEditingChannel(null)}>✕</button></div>
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
            <div className="modal-head"><span>DAVET</span><button onClick={()=>setShowInvite(false)}>✕</button></div>
            <div className="modal-body">
              <button className="btn btn-primary" onClick={createInvite}>KOD ÜRET</button>
              {inviteCode && (
                <div style={{marginTop:12, border:"1px solid #fff", padding:10, background:"#fff", color:"#000"}}>
                  <div style={{fontFamily:"var(--font-mono)", fontSize:18, fontWeight:800, letterSpacing:".12em"}}>{inviteCode}</div>
                  <button className="btn" style={{marginTop:8, borderColor:"#000"}} onClick={()=>{navigator.clipboard.writeText(inviteCode); setToast("kopyalandı");}}>KOPYALA</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showUserSettings && (
        <div className="modal-backdrop" onClick={()=>setShowUserSettings(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-head"><span>PROFİLİ DÜZENLE — Discord “Profiles” gibi</span><button onClick={()=>setShowUserSettings(false)}>✕</button></div>
            <div className="modal-body" style={{maxHeight:"68vh", overflow:"auto", padding:14}}>
              <div style={{display:"flex", flexDirection:"column", gap:14}}>
                <div style={{border:"1px solid var(--border)", background:"var(--surface-2)", padding:10, display:"flex", gap:10, alignItems:"center"}}>
                  <div style={{width:48, height:48, border:"1px solid var(--border)", background:"#000", display:"grid", placeItems:"center", overflow:"hidden", position:"relative", flex:"0 0 auto"}}>
                    {profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : <span style={{fontFamily:"var(--font-mono)", fontWeight:700}}>{initials(profile?.displayName ?? username)}</span>}
                    {profile?.decoration && profile.decoration.startsWith("http") && <img src={profile.decoration} alt="" style={{position:"absolute", inset:-8, width:"calc(100% + 16px)", height:"calc(100% + 16px)", pointerEvents:"none"}}/>}
                    {profile?.decoration && !profile.decoration.startsWith("http") && <div style={{position:"absolute", inset:-2, border:"2px solid #fff", borderRadius: profile.decoration==="circle" ? "50%" : "0"}}/>}
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
                      <input value={profile?.title ?? ""} onChange={e=> setProfile(p=> p? {...p, title:e.target.value}:p)} placeholder="Founder • Ghost • ..." />
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
                  <textarea value={profile?.bio ?? ""} onChange={e=> setProfile(p=> p? {...p, bio:e.target.value}:p)} placeholder="kendini anlat — **kalın**, `kod`, emoji" rows={2} style={{width:"100%", background:"#000", border:"1px solid var(--border)", color:"#fff", padding:"8px", fontFamily:"var(--font-mono)", fontSize:12}} />
                  <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--dim)", textAlign:"right"}}>{(profile?.bio||"").length}/190</div>
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
                  <div style={{display:"grid", gridTemplateColumns:"repeat(6, 1fr)", gap:6, maxHeight:120, overflow:"auto", border:"1px solid var(--border)", padding:6, background:"#000"}}>
                    {DECORATIONS.map(d=>(
                      <button key={d.id} onClick={()=>setProfile(p=>p?{...p, decoration: d.url || undefined}:p)} title={d.label} style={{aspectRatio:"1", border:"1px solid var(--border)", background: (profile?.decoration||"")===d.url ? "#fff" : "#111", display:"grid", placeItems:"center", overflow:"hidden", position:"relative", padding:0}}>
                        {d.url ? <img src={d.url} alt={d.label} style={{width:"140%", height:"140%", objectFit:"contain", position:"absolute", inset:"-20%"}} loading="lazy"/> : <span style={{fontFamily:"var(--font-mono)", fontSize:9, color:"var(--muted)"}}>YOK</span>}
                        <span style={{position:"absolute", bottom:1, left:0, right:0, background:"rgba(0,0,0,.7)", color:"#fff", fontFamily:"var(--font-mono)", fontSize:7, textAlign:"center", padding:"1px 0"}}>{d.label.slice(0,6)}</span>
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
                      {!profile?.bannerUrl && <div style={{position:"absolute", inset:0, backgroundImage:"linear-gradient(to right, #111 1px, transparent 1px)", backgroundSize:"14px 14px", opacity:.2}}/>}
                    </div>
                    <div style={{display:"flex", gap:4, marginTop:6}}>
                      <label style={{flex:1, border:"1px dashed var(--border)", padding:"6px", textAlign:"center", cursor:"pointer", fontFamily:"var(--font-mono)", fontSize:10}}>YÜKLE<input type="file" accept="image/*" hidden onChange={async e=>{const f=e.target.files?.[0]; if(!f) return; if(f.size>3*1024*1024){setToast("3MB"); return;} const r=new FileReader(); r.onload=async()=>{const url=r.result as string; setProfile(p=>p?{...p, bannerUrl:url}:p);}; r.readAsDataURL(f);}} /></label>
                      <input type="color" value={profile?.bannerColor || "#ffffff"} onChange={e=>setProfile(p=>p?{...p, bannerColor:e.target.value}:p)} style={{width:28, height:28}} />
                      <button className="btn" onClick={()=>setProfile(p=>p?{...p, bannerUrl:undefined, bannerColor:undefined}:p)} style={{fontSize:10}}>SİL</button>
                    </div>
                    <label style={{marginTop:8}}>ROZETLER</label>
                    <div style={{display:"flex", gap:4, flexWrap:"wrap"}}>
                      {["OPERATOR","EARLY","BOOSTER","DEV","GHOST"].map(b=>{
                        const has = (profile?.badges||[]).includes(b);
                        return <button key={b} onClick={()=>setProfile(p=>{const cur=p?.badges||[]; const next= has ? cur.filter(x=>x!==b) : [...cur,b]; return p?{...p, badges: next}:p;})} style={{border:"1px solid var(--border)", background: has ? "#fff":"transparent", color: has ? "#000":"var(--muted)", padding:"4px 6px", fontFamily:"var(--font-mono)", fontSize:9, fontWeight:700}}>{b}</button>
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
                  });
                  setToast("profil güncellendi"); setShowUserSettings(false);
                }}>KAYDET</button>
                <button className="btn" onClick={()=>signOut(auth)}>ÇIKIŞ</button>
                <button className="btn" onClick={()=>setShowUserSettings(false)} style={{marginLeft:"auto"}}>KAPAT</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAccountSettings && (
        <div className="modal-backdrop" onClick={()=>setShowAccountSettings(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{width:"min(680px, 96vw)", maxHeight:"86vh", display:"flex", overflow:"hidden", padding:0}}>
            <div style={{width:180, borderRight:"1px solid var(--border)", background:"var(--surface-2)", padding:12, display:"flex", flexDirection:"column", gap:4, overflow:"auto"}}>
              <div style={{fontFamily:"var(--font-mono)", fontSize:10, letterSpacing:".08em", color:"var(--muted)", padding:"8px 8px 4px"}}>KULLANICI AYARLARI</div>
              {[
                {id:"hesabim", label:"Hesabım", icon:"user"},
                {id:"gorunum", label:"Görünüm", icon:"grid"},
                {id:"gizlilik", label:"Gizlilik", icon:"inbox"},
              ].map(tab=>(
                <button key={tab.id} onClick={()=>setAccountTab(tab.id as any)} style={{textAlign:"left", padding:"8px 10px", border:"1px solid var(--border)", background: accountTab===tab.id ? "#fff" : "transparent", color: accountTab===tab.id ? "#000" : "var(--muted)", fontFamily:"var(--font-mono)", fontSize:11, fontWeight:700, display:"flex", alignItems:"center", gap:8}}>
                  <span className="icon"><Icon name={tab.icon}/></span>{tab.label}
                </button>
              ))}
              <div style={{marginTop:"auto", borderTop:"1px solid var(--border)", paddingTop:8}}>
                <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)", padding:"4px 8px"}}>{profile?.displayName}</div>
                <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--dim)", padding:"0 8px"}}>@{profile?.username}</div>
                <button className="btn btn-danger" onClick={()=>signOut(auth)} style={{width:"100%", marginTop:8, fontSize:10}}>ÇIKIŞ YAP</button>
              </div>
            </div>
            <div style={{flex:1, display:"flex", flexDirection:"column", minWidth:0, background:"var(--surface)"}}>
              <div className="modal-head"><span>{accountTab==="hesabim" ? "HESABIM" : accountTab==="gorunum" ? "GÖRÜNÜM" : "GİZLİLİK"}</span><button onClick={()=>setShowAccountSettings(false)}>✕</button></div>
              <div style={{flex:1, overflow:"auto", padding:16}}>
                {accountTab==="hesabim" && (
                  <div style={{display:"flex", flexDirection:"column", gap:14}}>
                    <div style={{border:"1px solid var(--border)", background:"var(--surface-2)", padding:12, display:"flex", gap:12, alignItems:"center"}}>
                      <div style={{width:64, height:64, border:"1px solid var(--border)", background:"#000", display:"grid", placeItems:"center", overflow:"hidden", position:"relative"}}>
                        {profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : <span style={{fontFamily:"var(--font-mono)", fontWeight:700}}>{initials(profile?.displayName ?? username)}</span>}
                        {profile?.decoration && profile.decoration.startsWith("http") && <img src={profile.decoration} alt="" style={{position:"absolute", inset:-6, width:"calc(100% + 12px)", height:"calc(100% + 12px)", pointerEvents:"none"}}/>}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700}}>{profile?.displayName}</div>
                        <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)"}}>@{profile?.username} • {user.email}</div>
                        <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--dim)", marginTop:2}}>Katılım: {profile?.createdAt ? fmtDate(profile.createdAt) : "—"} • ID: {user.uid.slice(0,8)}…</div>
                      </div>
                      <button className="btn" onClick={()=>{setShowAccountSettings(false); setActiveView("profile");}}>PROFİLİ DÜZENLE</button>
                    </div>
                    <div>
                      <label>KULLANICI ADI</label>
                      <input value={profile?.username ?? ""} disabled style={{opacity:.6}} />
                      <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--dim)", marginTop:4}}>Kullanıcı adın giriş için kullanılır — değiştirilemez (Discord’da da böyle).</div>
                      <label style={{marginTop:10}}>GÖRÜNEN İSİM</label>
                      <input value={profile?.displayName ?? ""} onChange={e=>setProfile(p=>p?{...p, displayName:e.target.value}:p)} placeholder="operator" />
                      <label>E-POSTA (otomatik)</label>
                      <input value={user.email || ""} disabled style={{opacity:.6}} />
                      <div style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--dim)", marginTop:4}}>E-posta = kullanıcı_adın@poseidon.local — Firebase Auth tarafından oluşturulur.</div>
                      <label style={{marginTop:10}}>ŞİFRE DEĞİŞTİR</label>
                      <div style={{display:"flex", gap:6}}>
                        <input id="new-pass" type="password" placeholder="yeni şifre (6+)" style={{flex:1, background:"#000", border:"1px solid var(--border)", color:"#fff", padding:"8px", fontFamily:"var(--font-mono)", fontSize:12}} />
                        <button className="btn" onClick={async()=>{
                          const el=document.getElementById("new-pass") as HTMLInputElement;
                          const v=el?.value || "";
                          if(v.length<6){setToast("şifre 6+ olmalı"); return;}
                          try{ const {updatePassword}=await import("firebase/auth"); await updatePassword(user, v); el.value=""; setToast("şifre güncellendi"); }catch(e:any){ setToast(e.message || "hata"); }
                        }}>GÜNCELLE</button>
                      </div>
                    </div>
                    <div style={{border:"1px solid #3a0000", background:"#1a0000", padding:10}}>
                      <div style={{fontFamily:"var(--font-mono)", fontSize:11, fontWeight:700, color:"#ff9baf"}}>HESABI SİL</div>
                      <div style={{fontSize:11, color:"#ff9baf", opacity:.8, marginTop:4}}>Bu işlem geri alınamaz. Sunucuların ve mesajların silinir.</div>
                      <button className="btn btn-danger" style={{marginTop:8, borderColor:"#ff9baf", color:"#ff9baf"}} onClick={async()=>{
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
                      <div style={{fontSize:11, color:"var(--muted)", marginTop:4}}>GhostGrid brutalist — siyah/beyaz, 1px border, JetBrains Mono. Tema şimdilik sabit, yakında açık/koyu.</div>
                      <div style={{display:"flex", gap:6, marginTop:8}}>
                        <div style={{flex:1, height:32, border:"1px solid #fff", background:"#000", display:"grid", placeItems:"center", fontFamily:"var(--font-mono)", fontSize:10}}>SİYAH</div>
                        <div style={{flex:1, height:32, border:"1px solid var(--border)", background:"#fff", color:"#000", display:"grid", placeItems:"center", fontFamily:"var(--font-mono)", fontSize:10}}>BEYAZ (yakında)</div>
                      </div>
                    </div>
                    <div style={{border:"1px solid var(--border)", padding:12}}>
                      <div style={{fontFamily:"var(--font-mono)", fontSize:11, fontWeight:700}}>DİL</div>
                      <select defaultValue="tr" style={{marginTop:6, width:"100%", background:"#000", border:"1px solid var(--border)", color:"#fff", padding:"8px", fontFamily:"var(--font-mono)", fontSize:12}}>
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
              </div>
              <div className="modal-actions">
                <span style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)", marginRight:"auto"}}>GHOSTGRID — discord esintisi, brutalist ruh</span>
                <button className="btn" onClick={()=>setShowAccountSettings(false)}>KAPAT</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showServerSettings && !isDemo && (
        <div className="modal-backdrop" onClick={()=>setShowServerSettings(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-head"><span>SUNUCU — {selectedServerData?.name}</span><button onClick={()=>setShowServerSettings(false)}>✕</button></div>
            <div className="modal-body">
              <label>SUNUCU ADI</label>
              <input defaultValue={selectedServerData?.name} onBlur={e=>{
                if(!e.target.value.trim()) return;
                update(ref(db,`servers/${selectedServer}`),{name:e.target.value.trim()}); setToast("güncellendi");
              }} />
              <div style={{marginTop:14, display:"flex", gap:6}}>
                <button className="btn" onClick={()=>setShowInvite(true)}>DAVET OLUŞTUR</button>
                <button className="btn btn-danger" onClick={()=>{
                  if(confirm("silinsin mi?")){ remove(ref(db,`servers/${selectedServer}`)); remove(ref(db,`serverMembers/${selectedServer}`)); remove(ref(db,`channels/${selectedServer}`)); setSelectedServer(servers.find(s=>s.id!==selectedServer)?.id||"demo"); setToast("silindi"); setShowServerSettings(false); }
                }}>SUNUCUYU SİL</button>
              </div>
              <div style={{marginTop:16, border:"1px solid var(--border)", padding:10, background:"var(--surface-2)"}}>
                <div style={{fontFamily:"var(--font-mono)", fontSize:11, fontWeight:700}}>ROLLER</div>
                <div style={{marginTop:8, fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)"}}>owner / admin / member — hiyerarşi yakında burada yönetilecek.</div>
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
            <div style={{height:84, background: selectedProfile?.bannerUrl ? `url(${selectedProfile.bannerUrl}) center/cover` : (selectedProfile?.bannerColor || "#fff"), position:"relative", borderBottom:"1px solid #fff", overflow:"visible"}}>
              {!selectedProfile?.bannerUrl && <div style={{position:"absolute", inset:0, backgroundImage:"linear-gradient(to right, #111 1px, transparent 1px), linear-gradient(to bottom, #111 1px, transparent 1px)", backgroundSize:"16px 16px", opacity:.2}}/>}
            </div>
            <div className="modal-body" style={{paddingTop:48, position:"relative", textAlign:"left", overflow:"visible"}}>
              <div style={{position:"absolute", top:-32, left:16, width:68, height:68, border:"2px solid #fff", background:"#000", display:"grid", placeItems:"center", overflow:"visible", borderRadius:"50%", boxShadow:"0 2px 8px rgba(0,0,0,.4)"}}>
                <div style={{width:"100%", height:"100%", borderRadius:"50%", overflow:"hidden", display:"grid", placeItems:"center"}}>{selectedProfile?.avatarUrl ? <img src={selectedProfile.avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : <span style={{fontFamily:"var(--font-mono)", fontWeight:800}}>{selectedProfile ? initials(selectedProfile.displayName||selectedProfile.username) : "??"}</span>}</div>
                {selectedProfile?.decoration && selectedProfile.decoration.startsWith("http") && <img src={selectedProfile.decoration} alt="" style={{position:"absolute", inset:-10, width:"calc(100% + 20px)", height:"calc(100% + 20px)", pointerEvents:"none"}}/>}
              </div>
              <div style={{position:"absolute", top:-32, right:16, display:"flex", gap:4}}>
                {(selectedProfile?.badges||[]).map(b=> <span key={b} style={{background:"#fff", color:"#000", border:"1px solid #000", fontFamily:"var(--font-mono)", fontSize:8, fontWeight:700, padding:"2px 5px"}}>{b}</span>)}
              </div>
              {profileLoading ? <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)", textAlign:"center", padding:20}}>yükleniyor…</div> : selectedProfile ? (
                <>
                  <div style={{display:"flex", alignItems:"center", gap:8, flexWrap:"wrap"}}>
                    <span style={{fontWeight:800, fontSize:15}}>{selectedProfile.displayName}</span>
                    {selectedProfile.pronouns && <span style={{border:"1px solid var(--border)", fontFamily:"var(--font-mono)", fontSize:10, padding:"1px 5px", color:"var(--muted)"}}>{selectedProfile.pronouns}</span>}
                    {selectedProfile.title && <span style={{border:"1px solid #fff", background:"#fff", color:"#000", fontFamily:"var(--font-mono)", fontSize:10, fontWeight:700, padding:"1px 5px"}}>{selectedProfile.title}</span>}
                    {selectedProfile.accentColor && <span style={{width:8, height:8, background:selectedProfile.accentColor, border:"1px solid var(--border)", display:"inline-block"}}/>}
                  </div>
                  <div style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)"}}>@{selectedProfile.username} • {selectedProfile.customStatusEmoji || ""} {selectedProfile.customStatus || selectedProfile.statusText || ""}</div>
                  {selectedProfile.bio ? <div style={{marginTop:10, border:"1px solid var(--border)", background:"var(--surface-2)", padding:10, fontSize:12, lineHeight:1.6, whiteSpace:"pre-wrap"}}><RenderContent text={selectedProfile.bio}/></div> : <div style={{marginTop:10, fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)", border:"1px dashed var(--border)", padding:8, textAlign:"center"}}>bio yok</div>}
                  <div style={{marginTop:10, display:"flex", gap:6, fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)"}}>
                    <span>katılım {selectedProfile.createdAt ? fmtDate(selectedProfile.createdAt) : ""}</span>
                    <span>•</span>
                    <span>@{selectedProfile.username}</span>
                  </div>
                  <div style={{display:"flex", gap:6, justifyContent:"flex-end", marginTop:12}}>
                    {selectedProfileUid!==user.uid && <button className="btn btn-primary" onClick={()=>{startDM(selectedProfileUid!); setSelectedProfileUid(null);}}>DM GÖNDER</button>}
                    {selectedProfileUid!==user.uid && <button className="btn" onClick={async()=>{const clean=selectedProfile.username.toLowerCase(); const snap=await get(ref(db,`friends/${user.uid}/${selectedProfileUid}`)); if(snap.exists()){ setToast("zaten arkadaş"); return; } await set(ref(db,`friends/${user.uid}/${selectedProfileUid}`), true); await set(ref(db,`friends/${selectedProfileUid}/${user.uid}`), true); setToast("eklendi");}}>ARKADAŞ EKLE</button>}
                    <button className="btn" onClick={()=>setSelectedProfileUid(null)}>KAPAT</button>
                  </div>
                </>
              ) : <div style={{fontFamily:"var(--font-mono)", fontSize:11}}>bulunamadı</div>}
            </div>
          </div>
        </div>
      )}
      {cropTarget && (
        <div className="modal-backdrop" onClick={()=>{ if(cropTarget) URL.revokeObjectURL(cropTarget.url); setCropTarget(null);}}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{width:"min(440px, 96vw)", overflow:"hidden"}}>
            <div className="modal-head"><span>{cropTarget.type==="avatar" ? "AVATAR — KIRP" : "BANNER — KIRP"}</span><button onClick={()=>{ URL.revokeObjectURL(cropTarget.url); setCropTarget(null);}}>✕</button></div>
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
                  background:"#0a0a0a",
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
                    <div style={{position:"absolute", left:"50%", top:"50%", width:180, height:180, transform:"translate(-50%, -50%)", border:"2px solid #fff", borderRadius:"50%", boxShadow:"0 0 0 200vmax rgba(0,0,0,.55)", pointerEvents:"none"}}/>
                    <div style={{position:"absolute", inset:0, pointerEvents:"none", backgroundImage:"linear-gradient(to right, rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.08) 1px, transparent 1px)", backgroundSize:"20px 20px", opacity:.15}}/>
                  </>
                ) : (
                  <>
                    <div style={{position:"absolute", inset:0, border:"1px dashed rgba(255,255,255,.25)", pointerEvents:"none"}}/>
                    <div style={{position:"absolute", left:0, right:0, top:"50%", height:1, background:"#fff", opacity:.8, pointerEvents:"none"}}/>
                    <div style={{position:"absolute", left:"50%", top:8, transform:"translateX(-50%)", background:"#fff", color:"#000", fontFamily:"var(--font-mono)", fontSize:9, padding:"2px 6px"}}>112px</div>
                  </>
                )}
              </div>
              <div style={{display:"flex", alignItems:"center", gap:8, border:"1px solid var(--border)", background:"var(--surface-2)", padding:"8px 10px"}}>
                <span style={{fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)"}}>ZOOM</span>
                <button onClick={()=>setCropZoom(z=>Math.max(1, z-0.1))} style={{width:24, height:24, border:"1px solid var(--border)", background:"#000", color:"#fff"}}>−</button>
                <input type="range" min={1} max={2.2} step={0.05} value={cropZoom} onChange={e=>setCropZoom(parseFloat(e.target.value))} style={{flex:1, accentColor:"#fff"}} />
                <button onClick={()=>setCropZoom(z=>Math.min(2.2, z+0.1))} style={{width:24, height:24, border:"1px solid var(--border)", background:"#000", color:"#fff"}}>+</button>
                <span style={{fontFamily:"var(--font-mono)", fontSize:10, border:"1px solid var(--border)", padding:"3px 6px", minWidth:42, textAlign:"center"}}>{Math.round(cropZoom*100)}%</span>
                <button className="btn" onClick={()=>{setCropPos({x:0,y:0}); setCropZoom(1);}} style={{fontSize:10, padding:"4px 8px"}}>RESET</button>
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
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function Landing({onLogin, onRegister}: {onLogin:()=>void, onRegister:()=>void}){
  return (
    <main className="landing">
      <nav className="landing-nav animate-fade">
        <div className="nav-logo"><i>GG</i> GHOSTGRID<span style={{color:"var(--muted)", fontWeight:400}}> // OPERATOR COMMS</span></div>
        <div className="nav-links">
          <a href="#features">özellikler</a>
          <a href="#manifesto">manifesto</a>
          <button className="btn" onClick={onLogin}>GİRİŞ</button>
          <button className="btn btn-primary" onClick={onRegister}>KAYIT OL</button>
        </div>
      </nav>
      <section className="landing-hero animate-slide">
        <div className="landing-badge"><i/> SİYAH — BEYAZ — TERMINAL • v0.4 • BRUTALIST</div>
        <h1 className="landing-title">SİNYAL.<br/>GÜRÜLTÜ DEĞİL.<br/><span>Discord rahatlığı,<br/>mühendis sadeliğinde.</span></h1>
        <p className="landing-sub">
          GhostGrid, ekipler için tek operatör mantığında kurulmuş minimal comms.
          Sunucu, kanal, ses, DM — hepsi tek sayfada değil, doğru yerde. Gereksiz yok.
          Siyah-beyaz, 1px border, JetBrains Mono. Hızlı, sessiz, kalıcı.
        </p>
        <div className="landing-cta">
          <button className="btn btn-primary" onClick={onRegister}>ÜCRETSİZ KUR — 30 SN</button>
          <button className="btn" onClick={onLogin}>GİRİŞ YAP</button>
          <span style={{fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)", alignSelf:"center"}}>davet koduyla katıl • kurulum yok</span>
        </div>
        <div className="landing-terminal">
          <div className="term-head"><span>GHOSTGRID.SYS // LIVE</span><span>● REC</span></div>
          <div className="term-body">
            <div><span className="prompt">operator@ghostgrid</span> ./init --server ghost-ops</div>
            <div style={{color:"#fff"}}>  ▸ sunucu kuruldu — #genel #sesli-oda</div>
            <div><span className="prompt">operator@ghostgrid</span> ./invite --create</div>
            <div style={{color:"#fff"}}>  ▸ davet: <b style={{background:"#fff", color:"#000", padding:"0 4px"}}>X7K9PQ</b> — paylaş ve başla</div>
            <div><span className="prompt">operator@ghostgrid</span> ./msg #genel "ilk sinyal"</div>
            <div style={{opacity:.6}}>  ▸ low-latency • E2E stub • 12ms</div>
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
          {icon:"settings", title:"MİNIMAL BY DESIGN", desc:"Siyah-beyaz, 1px, mono. Gerekmeyen yerde özellik yok."},
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
              JetBrains Mono • 1px brutalist • animasyonlu ama sakin
            </div>
          </div>
        </div>
      </section>
      <footer className="landing-footer">
        <span>© 2026 GHOSTGRID — single-developer, shadcn mantığı, AI kokusu yok.</span>
        <span style={{display:"flex", gap:12}}><a href="#" onClick={(e)=>{e.preventDefault(); onLogin();}}>giriş</a><a href="#" onClick={(e)=>{e.preventDefault(); onRegister();}}>kayıt</a><span>● online</span></span>
      </footer>
    </main>
  );
}

function AuthScreen(props:{registerMode:boolean; setRegisterMode:(v:boolean)=>void; username:string; setUsername:(v:string)=>void; password:string; setPassword:(v:string)=>void; displayName:string; setDisplayName:(v:string)=>void; error:string; onSubmit:(e:React.FormEvent)=>void; configured:boolean; onBack:()=>void}){
  return (
    <main className="auth-screen">
      <section className="auth-card animate-slide">
      <button onClick={props.onBack} style={{position:"absolute", top:8, right:8, border:"1px solid var(--border)", background:"transparent", width:24, height:24, display:"grid", placeItems:"center", fontSize:12}}>✕</button>
        <div className="auth-logo">GG</div>
        <h1>{props.registerMode ? "KATIL" : "GİRİŞ"}</h1>
        <p className="auth-subtitle">siyah-beyaz, tek operatör. gürültü yok.</p>
        {!props.configured && <div className="setup-note">Firebase .env.local bekleniyor</div>}
        <form onSubmit={props.onSubmit}>
          {props.registerMode && <label>GÖRÜNEN İSİM<input value={props.displayName} onChange={e=>props.setDisplayName(e.target.value)} placeholder="operator" /></label>}
          <label>KULLANICI ADI<input value={props.username} onChange={e=>props.setUsername(e.target.value)} placeholder="kullanici_adi" autoComplete="username" /></label>
          <label>ŞİFRE<input value={props.password} onChange={e=>props.setPassword(e.target.value)} type="password" placeholder="••••••••" autoComplete={props.registerMode?"new-password":"current-password"} /></label>
          {props.error && <div className="auth-error">ERR // {props.error}</div>}
          <button className="primary-button" type="submit">{props.registerMode ? "OLUSTUR" : "GIRIS"}</button>
        </form>
        <div className="auth-switch">{props.registerMode? "hesabın var mı?" : "hesabın yok mu?"} <button onClick={()=>props.setRegisterMode(!props.registerMode)}>{props.registerMode? "Giriş":"Kayıt"}</button></div>
      </section>
    </main>
  );
}