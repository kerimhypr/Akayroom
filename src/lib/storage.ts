import { getAuth } from "firebase/auth";

const STORAGE_BUCKET = "cizbull.firebasestorage.app";
const STORAGE_BASE = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o`;

function encPath(p: string): string {
  return encodeURIComponent(p).replace(/%2F/g, "/");
}

export async function uploadAttachment(
  path: string,
  data: string,
  mime: string
): Promise<string> {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error("giriş gerekli");
  const token = await user.getIdToken();

  const boundary = "akayroom_boundary_" + Date.now();
  const meta = JSON.stringify({ name: path.split("/").pop(), contentType: mime });

  const bodyArr = [
    `--${boundary}`,
    'Content-Type: application/json; charset=utf-8',
    '',
    meta,
    `--${boundary}`,
    `Content-Type: ${mime}`,
    'Content-Transfer-Encoding: base64',
    '',
    data,
    `--${boundary}--`,
    '',
  ];
  const body = bodyArr.join("\r\n");

  const url = `${STORAGE_BASE}?uploadType=multipart&name=${encodeURIComponent(path)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`upload failed: ${res.status} ${errText.slice(0, 120)}`);
  }
  const json = (await res.json()) as { downloadTokens?: string };
  if (!json.downloadTokens) throw new Error("download token yok");
  return json.downloadTokens;
}

export function storageDownloadUrl(path: string, token: string): string {
  return `${STORAGE_BASE}/${encodeURIComponent(path)}?alt=media&token=${token}`;
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
