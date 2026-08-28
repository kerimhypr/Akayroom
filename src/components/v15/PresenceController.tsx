"use client";

import { useEffect } from "react";
import { onDisconnect, ref, remove, set } from "firebase/database";
import { db } from "@/lib/firebase";
import type { User } from "firebase/auth";

export default function PresenceController({user}:{user:User}){
  useEffect(()=>{
    const connectionId=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
    const connection=ref(db,`users/${user.uid}/presence/connections/${connectionId}`);
    const status=ref(db,`users/${user.uid}/presence/status`);
    const lastChanged=ref(db,`users/${user.uid}/presence/lastChanged`);
    let active=true;
    void (async()=>{
      try{
        await set(connection,true);
        await onDisconnect(connection).remove();
        await onDisconnect(status).set("offline");
        await onDisconnect(lastChanged).set(Date.now());
        if(active){await set(status,"online");await set(lastChanged,Date.now());}
      }catch{}
    })();
    return()=>{active=false;void remove(connection);void set(status,"offline");void set(lastChanged,Date.now());};
  },[user.uid]);
  return null;
}
