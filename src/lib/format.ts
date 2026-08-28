import type { MessageAttachmentMeta } from "./types";

export function initials(v: string) { return (v?.trim()?.slice(0,2) || "??").toUpperCase(); }

export function fmtSize(bytes: number){
  if(!bytes && bytes!==0) return "";
  if(bytes<1024) return bytes+" B";
  if(bytes<1024*1024) return (bytes/1024).toFixed(0)+" KB";
  return (bytes/1024/1024).toFixed(1)+" MB";
}

export function fileToDataUrl(file: File): Promise<string>{
  return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result as string); r.onerror=()=>rej(new Error("okunamadı")); r.readAsDataURL(file); });
}

export async function compressImage(file: File): Promise<string>{
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

export function attachmentKind(f: File): MessageAttachmentMeta["type"]{
  if(f.type.startsWith("image/")) return "image";
  if(f.type.startsWith("video/")) return "video";
  if(f.type.startsWith("audio/")) return "audio";
  return "file";
}

export function fmtTime(ts: number) { try { return new Date(ts).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"});} catch{ return "--:--"; } }

export function fmtDate(ts: number) { try{ return new Date(ts).toLocaleDateString("tr-TR",{day:"2-digit",month:"long",year:"numeric"});}catch{return "";} }
