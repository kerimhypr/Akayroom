"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { Icon } from "@/components/Icon";
import { deterministicInitiator, joinSignalRoom, listenForAnswers, listenForCandidates, listenForOffers, listenForParticipants, publishAnswer, publishCandidate, publishOffer } from "@/lib/webrtc";
import { rtcIceServers } from "@/lib/webrtc";

export default function VoiceRoom({ room, serverId, user }: { room:string; serverId:string; user:User }){
  const [state,setState]=useState<"idle"|"joining"|"joined">("idle");
  const [muted,setMuted]=useState(false);
  const [peers,setPeers]=useState<string[]>([]);
  const [error,setError]=useState("");
  const localRef=useRef<MediaStream|null>(null);
  const pcs=useRef<Record<string,RTCPeerConnection>>({});
  const streams=useRef<Record<string,MediaStream>>({});
  const audioEls=useRef<Record<string,HTMLAudioElement|null>>({});
  const cleanups=useRef<(()=>void)[]>([]);

  useEffect(()=>{
    let cancelled=false;
    async function start(){
      if(!serverId||state!=="idle")return;
      setState("joining");setError("");
      try{
        const stream=await navigator.mediaDevices.getUserMedia({audio:true});
        if(cancelled){stream.getTracks().forEach(t=>t.stop());return;}
        localRef.current=stream;
        const stop=joinSignalRoom(room,serverId,user.uid);
        cleanups.current.push(stop);
        const removeParticipant=listenForParticipants(room,(uid,added)=>{
          if(uid===user.uid)return;
          if(added){setPeers(p=>p.includes(uid)?p:[...p,uid]);void connect(uid,deterministicInitiator(user.uid,uid));}
          else{setPeers(p=>p.filter(x=>x!==uid));closePeer(uid);}
        });
        cleanups.current.push(removeParticipant);
        cleanups.current.push(listenForOffers(room,user.uid,(from,offer)=>{void acceptOffer(from,offer)}));
        cleanups.current.push(listenForAnswers(room,user.uid,(from,answer)=>{void acceptAnswer(from,answer)}));
        setState("joined");
      }catch(e){setError(e instanceof Error?e.message:"Mikrofon erişilemedi");setState("idle");}
    }
    async function connect(uid:string,initiator:boolean){
      if(pcs.current[uid]||!localRef.current)return pcs.current[uid];
      const pc=new RTCPeerConnection({iceServers:rtcIceServers});pcs.current[uid]=pc;
      localRef.current.getTracks().forEach(t=>pc.addTrack(t,localRef.current!));
      pc.onicecandidate=e=>{if(e.candidate)void publishCandidate(room,user.uid,uid,e.candidate)};
      pc.ontrack=e=>{const s=e.streams[0];if(!s)return;streams.current[uid]=s;const el=audioEls.current[uid];if(el){el.srcObject=s;void el.play().catch(()=>{});}};
      pc.onconnectionstatechange=()=>{if(["failed","closed","disconnected"].includes(pc.connectionState)){if(pc.connectionState!=="disconnected")closePeer(uid);}};
      if(initiator){const offer=await pc.createOffer();await pc.setLocalDescription(offer);await publishOffer(room,user.uid,uid,{type:offer.type,sdp:offer.sdp||"",ts:Date.now()});}
      return pc;
    }
    async function acceptOffer(from:string,offer:RTCSessionDescriptionInit){const pc=await connect(from,false);if(!pc)return;await pc.setRemoteDescription(offer);const answer=await pc.createAnswer();await pc.setLocalDescription(answer);await publishAnswer(room,user.uid,from,{type:answer.type,sdp:answer.sdp||"",ts:Date.now()});}
    async function acceptAnswer(from:string,answer:RTCSessionDescriptionInit){const pc=pcs.current[from];if(pc)await pc.setRemoteDescription(answer).catch(()=>{});}
    function closePeer(uid:string){pcs.current[uid]?.close();delete pcs.current[uid];delete streams.current[uid];}
    void start();
    return()=>{cancelled=true;cleanups.current.splice(0).forEach(fn=>fn());Object.keys(pcs.current).forEach(closePeer);localRef.current?.getTracks().forEach(t=>t.stop());localRef.current=null;setPeers([]);setState("idle");};
  },[room,serverId,user.uid,state]);

  function toggleMute(){const next=!muted;localRef.current?.getAudioTracks().forEach(t=>{t.enabled=!next});setMuted(next);}
  function leave(){cleanups.current.splice(0).forEach(fn=>fn());Object.keys(pcs.current).forEach(uid=>{pcs.current[uid]?.close();delete pcs.current[uid]});localRef.current?.getTracks().forEach(t=>t.stop());localRef.current=null;setPeers([]);setState("idle");}

  return <section className="v15-voice-room"><div className="v15-voice-head"><div><span className="v15-live-dot"/><b>{state==="joined"?"Sesli kanal":"Sesli kanala bağlan"}</b><small>{state==="joined"?`${peers.length+1} bağlı`:(state==="joining"?"bağlanıyor…":"hazır")}</small></div>{state==="joined"&&<div className="v15-voice-actions"><button onClick={toggleMute} title={muted?"Mikrofonu aç":"Mikrofonu sustur"}><Icon name={muted?"micOff":"mic"} size={14}/></button><button className="danger" onClick={leave} title="Ayrıl">×</button></div>}</div>{error&&<div className="v15-error">{error}</div>}{state!=="joined"&&<button className="v15-primary v15-voice-join" onClick={()=>setState("idle")}>{state==="joining"?"Bağlanıyor…":"Mikrofonla katıl"}</button>}{peers.map(uid=><audio key={uid} ref={el=>{audioEls.current[uid]=el}} autoPlay playsInline />)}</section>;
}
