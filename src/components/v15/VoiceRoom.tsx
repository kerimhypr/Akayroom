"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { Icon } from "@/components/Icon";
import { deterministicInitiator, joinSignalRoom, listenForAnswers, listenForCandidates, listenForOffers, listenForParticipants, publishAnswer, publishCandidate, publishOffer, rtcIceServers } from "@/lib/webrtc";

export default function VoiceRoom({room,serverId,user}:{room:string;serverId:string;user:User}){
  const [state,setState]=useState<"idle"|"joining"|"joined">("idle"),[muted,setMuted]=useState(false),[camera,setCamera]=useState(false),[sharing,setSharing]=useState(false),[peers,setPeers]=useState<string[]>([]),[error,setError]=useState("");
  const localRef=useRef<MediaStream|null>(null),[remote,setRemote]=useState<Record<string,MediaStream>>({});
  const pcs=useRef<Record<string,RTCPeerConnection>>({}),audioEls=useRef<Record<string,HTMLAudioElement|null>>({}),videoEls=useRef<Record<string,HTMLVideoElement|null>>({}),candidateCleanups=useRef<Record<string,()=>void>>({});
  const stopRoomRef=useRef<(()=>void)|null>(null),startedRef=useRef(false),baseVideoRef=useRef<MediaStreamTrack|null>(null);

  useEffect(()=>{
    let cancelled=false; startedRef.current=false; setState("idle"); setPeers([]); setRemote({}); setError("");
    const closePeer=(uid:string)=>{candidateCleanups.current[uid]?.();delete candidateCleanups.current[uid];pcs.current[uid]?.close();delete pcs.current[uid];setRemote(r=>{const n={...r};delete n[uid];return n})};
    const cleanup=()=>{stopRoomRef.current?.();stopRoomRef.current=null;Object.keys(pcs.current).forEach(closePeer);localRef.current?.getTracks().forEach(t=>t.stop());localRef.current=null;baseVideoRef.current=null;setPeers([]);setRemote({});startedRef.current=false;setCamera(false);setSharing(false)};
    const renegotiate=async()=>{for(const [uid,pc] of Object.entries(pcs.current)){try{const offer=await pc.createOffer();await pc.setLocalDescription(offer);await publishOffer(room,user.uid,uid,{type:offer.type,sdp:offer.sdp||"",ts:Date.now()})}catch{}}};
    async function connect(uid:string,initiator:boolean){
      if(pcs.current[uid]||!localRef.current)return pcs.current[uid];
      const pc=new RTCPeerConnection({iceServers:rtcIceServers});pcs.current[uid]=pc;
      localRef.current.getTracks().forEach(track=>pc.addTrack(track,localRef.current!));
      pc.onicecandidate=e=>{if(e.candidate)void publishCandidate(room,user.uid,uid,e.candidate).catch(()=>{})};
      candidateCleanups.current[uid]=listenForCandidates(room,user.uid,uid,c=>{void pc.addIceCandidate(c).catch(()=>{})});
      pc.ontrack=e=>{const s=e.streams[0];if(!s)return;setRemote(r=>({...r,[uid]:s}));setTimeout(()=>{const a=audioEls.current[uid];if(a){a.srcObject=s;void a.play().catch(()=>{})}const v=videoEls.current[uid];if(v){v.srcObject=s;void v.play().catch(()=>{})}},0)};
      pc.onconnectionstatechange=()=>{if(pc.connectionState==="failed"||pc.connectionState==="closed")closePeer(uid)};
      if(initiator){const offer=await pc.createOffer();await pc.setLocalDescription(offer);await publishOffer(room,user.uid,uid,{type:offer.type,sdp:offer.sdp||"",ts:Date.now()})}
      return pc;
    }
    async function acceptOffer(from:string,offer:RTCSessionDescriptionInit){try{const pc=await connect(from,false);if(!pc)return;await pc.setRemoteDescription(offer);const answer=await pc.createAnswer();await pc.setLocalDescription(answer);await publishAnswer(room,user.uid,from,{type:answer.type,sdp:answer.sdp||"",ts:Date.now()})}catch{}}
    async function acceptAnswer(from:string,answer:RTCSessionDescriptionInit){const pc=pcs.current[from];if(pc)await pc.setRemoteDescription(answer).catch(()=>{})}
    async function start(){
      if(cancelled||startedRef.current||!serverId)return;startedRef.current=true;setState("joining");
      try{
        const stream=await navigator.mediaDevices.getUserMedia({audio:true});
        if(cancelled){stream.getTracks().forEach(t=>t.stop());return}
        localRef.current=stream;stopRoomRef.current=joinSignalRoom(room,serverId,user.uid);
        const p=listenForParticipants(room,(uid,added)=>{if(uid===user.uid)return;if(added){setPeers(x=>x.includes(uid)?x:[...x,uid]);void connect(uid,deterministicInitiator(user.uid,uid))}else{setPeers(x=>x.filter(v=>v!==uid));closePeer(uid)}});
        const o=listenForOffers(room,user.uid,(from,offer)=>{void acceptOffer(from,offer)}),a=listenForAnswers(room,user.uid,(from,answer)=>{void acceptAnswer(from,answer)}),old=stopRoomRef.current;
        stopRoomRef.current=()=>{p();o();a();old?.()};
        if(!cancelled)setState("joined");
      }catch(e){setError(e instanceof Error?e.message:"Mikrofon erişilemedi");cleanup();setState("idle")}
    }
    void start();return cleanup;
  },[room,serverId,user.uid]);

  function toggleMute(){const next=!muted;localRef.current?.getAudioTracks().forEach(t=>t.enabled=!next);setMuted(next)}
  async function toggleCamera(){if(state!=="joined")return;if(camera){const old=baseVideoRef.current;for(const pc of Object.values(pcs.current)){const sender=pc.getSenders().find(s=>s.track?.kind==="video");if(sender)await sender.replaceTrack(null)}old?.stop();baseVideoRef.current=null;setCamera(false);await renegotiateAll();return}try{const s=await navigator.mediaDevices.getUserMedia({video:true});const track=s.getVideoTracks()[0];baseVideoRef.current=track;const local=localRef.current||new MediaStream();local.addTrack(track);localRef.current=local;for(const pc of Object.values(pcs.current)){const sender=pc.getSenders().find(x=>x.track?.kind==="video");if(sender)await sender.replaceTrack(track);else pc.addTrack(track,local)}setCamera(true);await renegotiateAll()}catch(e){setError(e instanceof Error?e.message:"Kamera erişilemedi")}}
  async function toggleShare(){if(state!=="joined")return;if(sharing){const base=baseVideoRef.current;for(const pc of Object.values(pcs.current)){const sender=pc.getSenders().find(s=>s.track?.kind==="video");if(sender)await sender.replaceTrack(base||null)};setSharing(false);await renegotiateAll();return}try{const display=await navigator.mediaDevices.getDisplayMedia({video:true});const track=display.getVideoTracks()[0];for(const pc of Object.values(pcs.current)){const sender=pc.getSenders().find(s=>s.track?.kind==="video");if(sender)await sender.replaceTrack(track);else pc.addTrack(track,display)}setSharing(true);track.onended=()=>{setSharing(false);void toggleShare()};await renegotiateAll()}catch(e){setError(e instanceof Error?e.message:"Ekran paylaşımı başlatılamadı")}}
  async function renegotiateAll(){for(const [uid,pc] of Object.entries(pcs.current)){try{const offer=await pc.createOffer();await pc.setLocalDescription(offer);await publishOffer(room,user.uid,uid,{type:offer.type,sdp:offer.sdp||"",ts:Date.now()})}catch{}}}
  function leave(){stopRoomRef.current?.();stopRoomRef.current=null;Object.keys(pcs.current).forEach(uid=>{candidateCleanups.current[uid]?.();delete candidateCleanups.current[uid];pcs.current[uid]?.close();delete pcs.current[uid]});localRef.current?.getTracks().forEach(t=>t.stop());localRef.current=null;setRemote({});setPeers([]);setState("idle");startedRef.current=false}

  return <section className="v15-voice-room"><div className="v15-voice-head"><div><span className="v15-live-dot"/><b>{state==="joined"?"Sesli kanal":"Sesli kanala bağlan"}</b><small>{state==="joined"?`${peers.length+1} bağlı`:state==="joining"?"bağlanıyor…":"hazır"}</small></div>{state==="joined"&&<div className="v15-voice-actions"><button onClick={toggleMute} title="Mikrofon">{muted?<Icon name="micOff" size={14}/>:<Icon name="mic" size={14}/>}</button><button onClick={()=>void toggleCamera()} title="Kamera"><Icon name={camera?"camOff":"cam"} size={14}/></button><button onClick={()=>void toggleShare()} title="Ekran paylaş"><Icon name="screen" size={14}/></button><button className="danger" onClick={leave} title="Ayrıl">×</button></div>}</div>{error&&<div className="v15-error">{error}</div>}<div className="v15-video-grid">{camera&&localRef.current&&<video className="v15-video-tile local" ref={el=>{if(el){el.srcObject=localRef.current;void el.play().catch(()=>{})}}} muted autoPlay playsInline/>}{Object.entries(remote).map(([uid,stream])=><video key={uid} className="v15-video-tile" ref={el=>{videoEls.current[uid]=el;if(el){el.srcObject=stream;void el.play().catch(()=>{})}}} autoPlay playsInline/>)}{peers.map(uid=><audio key={uid} ref={el=>{audioEls.current[uid]=el}} autoPlay playsInline/>)}</div>{peers.length>0&&<div className="v15-voice-peer-list">{peers.map(uid=><span key={uid}>{uid.slice(0,8)}</span>)}</div>}{state!=="joined"&&<button className="v15-voice-join" onClick={()=>{if(state==="idle")void 0}} disabled={state==="joining"}>{state==="joining"?"Bağlanıyor…":"Mikrofonla katıl"}</button>}</section>;
}
