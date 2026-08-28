import { getAuth } from "firebase/auth";

const STORAGE_BUCKET = "cizbull.firebasestorage.app";
const STORAGE_BASE = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o`;

export async function uploadAttachment(path: string, dataUrl: string, mime: string): Promise<string> {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error("giriş gerekli");
  const token = await user.getIdToken();
  const comma = dataUrl.indexOf(",");
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const boundary = `akayroom_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const meta = JSON.stringify({ name: path.split("/").pop() || "file", contentType: mime });
  const body = [
    `--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${meta}\r\n`,
    `--${boundary}\r\nContent-Type: ${mime}\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64}\r\n`,
    `--${boundary}--\r\n`,
  ].join("");

  const url = `${STORAGE_BASE}?uploadType=multipart&name=${encodeURIComponent(path)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  let json: any = null;
  try { json = await res.json(); } catch {}
  if (!res.ok) {
    throw new Error(`upload failed: ${res.status}${json?.error?.message ? ` ${json.error.message}` : ""}`);
  }
  const downloadTokens = typeof json?.downloadTokens === "string" ? json.downloadTokens.split(",")[0] : "";
  if (!downloadTokens) throw new Error("download token yok");
  return downloadTokens;
}

export function storageDownloadUrl(path: string, token: string): string {
  return `${STORAGE_BASE}/${encodeURIComponent(path)}?alt=media&token=${encodeURIComponent(token)}`;
}

export function attachmentStoragePath(
  serverId: string,
  channelId: string,
  messageId: string,
  fileName: string
): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `attachments/${serverId}/${channelId}/${messageId}_${safeName}`;
}
