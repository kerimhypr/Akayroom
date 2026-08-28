"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { Icon } from "@/components/Icon";
import { deterministicInitiator, joinSignalRoom, listenForAnswers, listenForCandidates, listenForOffers, listenForParticipants, publishAnswer, publishCandidate, publishOffer, rtcIceServers } from "@/lib/webrtc";

export default function VoiceRoom({ room, serverId, user }: { room:string; serverId:string; user:User }){
  const [state,setState]=useState<"idle"|"joining"|"joined">("idle");
  const [muted,setMuted]=useState(false);
  const [peers,setPeers]=useState<string[]>([]);
  const [error,setError]=useState("");
  const localRef=useRef<MediaStream|null>(null);
  const pcs=useRef<Record<string,RTCPeerConnection>>({});
  const audioEls=useRef<Record<string,HTMLAudioElement|null>>({});
  const stopRoomRef=useRef<(()=>void)|null>(null);
  const startedRef=useRef(false);

  useEffect(()=>{
    let cancelled=false;
    startedRef.current=false;
    setState("idle");
    setPeers([]);
    setError("");

    const closePeer=(uid:string)=>{pcs.current[uid]?.close();delete pcs.current[uid];};
    const cleanup=()=>{
      stopRoomRef.current?.();
      stopRoomRef.current=null;
      Object.keys(pcs.current).forEach(closePeer);
      localRef.current?.getTracks().forEach(t=>t.stop());
      localRef.current=null;
      setPeers([]);
      startedRef.current=false;
    };

    async function connect(uid:string,initiator:boolean){
      if(pcs.current[uid]||!localRef.current)return pcs.current[uid];
      const pc=new RTCPeerConnection({iceServers:rtcIceServers});
      pcs.current[uid]=pc;
      localRef.current.getTracks().forEach(track=>pc.addTrack(track,localRef.current!));
      pc.onicecandidate=e=>{if(e.candidate)void publishCandidate(room,user.uid,uid,e.candidate).catch(()=>{});};
      const candidateUnsub=listenForCandidates(room,user.uid,uid,candidate=>{void pc.addIceCandidate(candidate).catch(()=>{});});
      pc.ontrack=e=>{const stream=e.streams[0];const el=audioEls.current[uid];if(stream&&el){el.srcObject=stream;void el.play().catch(()=>{});}};
      pc.onconnectionstatechange=()=>{if(pc.connectionState==="failed"||pc.connectionState==="closed"){candidateUnsub();closePeer(uid);setPeers(p=>p.filter(x=>x!==uid));}};
      if(initiator){
        const offer=await pc.createOffer();
        await pc.setLocalDescription(offer);
        await publishOffer(room,user.uid,uid,{type:offer.type,sdp:offer.sdp||"",ts:Date.now()});
      }
      return pc;
    }

    async function acceptOffer(from:string,offer:RTCSessionDescriptionInit){
      try{const pc=await connect(from,false);if(!pc)return;await pc.setRemoteDescription(offer);const answer=await pc.createAnswer();await pc.setLocalDescription(answer);await publishAnswer(room,user.uid,from,{type:answer.type,sdp:answer.sdp||"",ts:Date.now()});}catch{}
    }
    async function acceptAnswer(from:string,answer:RTCSessionDescriptionInit){const pc=pcs.current[from];if(pc)await pc.setRemoteDescription(answer).catch(()=>{});}

    async function start(){
      if(cancelled||startedRef.current||!serverId)return;
      startedRef.current=true;
      setState("joining");
      try{
        const stream=await navigator.mediaDevices.getUserMedia({audio:true});
        if(cancelled){stream.getTracks().forEach(t=>t.stop());return;}
        localRef.current=stream;
        stopRoomRef.current=joinSignalRoom(room,serverId,user.uid);
        const participantUnsub=listenForParticipants(room,(uid,added)=>{
          if(uid===user.uid)return;
          if(added){setPeers(p=>p.includes(uid)?p:[...p,uid]);void connect(uid,deterministicInitiator(user.uid,uid));}
          else{setPeers(p=>p.filter(x=>x!==uid));closePeer(uid);}
        });
        const offerUnsub=listenForOffers(room,user.uid,(from,offer)=>{void acceptOffer(from,offer);});
        const answerUnsub=listenForAnswers(room,user.uid,(from,answer)=>{void acceptAnswer(from,answer);});
        const cleanupFns=[participantUnsub,offerUnsub,answerUnsub];
        const previous=stopRoomRef.current;
        stopRoomRef.current=()=>{cleanupFns.forEach(fn=>fn());previous?.();};
        if(!cancelled)setState("joined");
      }catch(e){
        setError(e instanceof Error?e.message:"Mikrofon erişilemedi");
        cleanup();
        setState("idle");
      }
    }
    void start();
    return cleanup;
  },[room,serverId,user.uid]);

  function toggleMute(){const next=!muted;localRef.current?.getAudioTracks().forEach(t=>t.enabled=!next);setMuted(next);}
  function leave(){stopRoomRef.current?.();stopRoomRef.current=null;Object.keys(pcs.current).forEach(uid=>{pcs.current[uid]?.close();delete pcs.current[uid]});localRef.current?.getTracks().forEach(t=>t.stop());localRef.current=null;setPeers([]);setState("idle");startedRef.current=false;}

  return <section className="v15-voice-room"><div className="v15-voice-head"><div><span className="v15-live-dot"/><b>{state==="joined"?"Sesli kanal":"Sesli kanala bağlan"}</b><small>{state==="joined"?`${peers.length+1} bağlı`:(state==="joining"?"bağlanıyor…":"hazır")}</small></div>{state==="joined"&&<div className="v15-voice-actions"><button onClick={toggleMute} title={muted?"Mikrofonu aç":"Mikrofonu sustur"}><Icon name={muted?"micOff":"mic"} size={14}/></button><button className="danger" onClick={leave} title="Ayrıl">×</button></div>}</div>{error&&<div className="v15-error">{error}</div>}{peers.length>0&&<div className="v15-voice-peer-list">{peers.map(uid=><span key={uid}>{uid.slice(0,6)}</span>)}</div>}<button className="v15-primary v15-voice-join" onClick={()=>{if(state==="idle")setState("idle");else leave()}} disabled={state==="joining"}>{state==="joined"?"Ayrıl":state==="joining"?"Bağlanıyor…":"Mikrofonla katıl"}</button>{peers.map(uid=><audio key={uid} ref={el=>{audioEls.current[uid]=el}} autoPlay playsInline />)}</section>;
}
