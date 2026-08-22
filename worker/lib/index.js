"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const app_1 = require("firebase-admin/app");
const database_1 = require("firebase-admin/database");
const databaseUrl = process.env.FIREBASE_DATABASE_URL;
const cerebrasKey = process.env.CEREBRAS_API_KEY;
const startedAt = Date.now();
if (!databaseUrl)
    throw new Error("FIREBASE_DATABASE_URL eksik.");
if (!cerebrasKey)
    throw new Error("CEREBRAS_API_KEY eksik. worker/.env.local içine ekleyin.");
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS)
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS eksik.");
(0, app_1.initializeApp)({ credential: (0, app_1.applicationDefault)(), databaseURL: databaseUrl });
const database = (0, database_1.getDatabase)();
const attachedServers = new Set();
const attachedChannels = new Set();
function childEntries(snapshot) {
    const entries = [];
    snapshot.forEach((child) => {
        entries.push([child.key ?? "", child.val()]);
        return false;
    });
    return entries;
}
async function processMessage(serverId, channelId, messageId, message) {
    if (message.authorId === "system-ai")
        return;
    if (typeof message.createdAt === "number" && message.createdAt < startedAt - 3000)
        return;
    const mentions = message.mentions;
    const targetUid = mentions ? Object.entries(mentions).find(([, mentioned]) => mentioned)?.[0] : undefined;
    if (!targetUid || targetUid === message.authorId || typeof message.content !== "string")
        return;
    const [presenceSnapshot, personaSnapshot] = await Promise.all([
        database.ref(`users/${targetUid}/presence/connections`).once("value"),
        database.ref(`users/${targetUid}/ai_persona`).once("value"),
    ]);
    const persona = personaSnapshot.val();
    if (presenceSnapshot.exists() || !persona?.enabled || !persona.prompt)
        return;
    const jobRef = database.ref(`aiJobs/${messageId}`);
    const claim = await jobRef.transaction((current) => current ?? {
        sourceMessageId: messageId,
        targetUid,
        serverId,
        channelId,
        status: "processing",
        createdAt: Date.now(),
    });
    if (!claim.committed)
        return;
    try {
        const historySnapshot = await database.ref(`messages/${serverId}/${channelId}`).limitToLast(12).once("value");
        const input = [
            "You are an AI twin. Always label the response [AI İkiz]. Never claim to be the real person.",
            `Persona: ${persona.prompt}`,
            `Recent messages: ${JSON.stringify(historySnapshot.val() ?? {})}`,
            `Reply briefly in the persona's style to: ${message.content}`,
        ].join("\n\n");
        const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${cerebrasKey}` },
            body: JSON.stringify({
                model: process.env.CEREBRAS_MODEL ?? "gpt-oss-120b",
                messages: [{ role: "user", content: input }],
                max_tokens: 350,
            }),
        });
        if (!response.ok)
            throw new Error(`Cerebras HTTP ${response.status}`);
        const result = await response.json();
        const content = result.choices?.[0]?.message?.content?.trim();
        if (!content)
            throw new Error("Cerebras boş cevap döndürdü.");
        const reply = database.ref(`messages/${serverId}/${channelId}`).push();
        await reply.set({
            serverId, channelId, authorId: "system-ai", twinOfUid: targetUid,
            isAiTwin: true, content: `[AI İkiz] ${content}`, createdAt: Date.now(),
        });
        await jobRef.update({ status: "complete", replyId: reply.key, updatedAt: Date.now() });
        console.log(`[AI Twin] ${serverId}/${channelId}/${messageId} işlendi.`);
    }
    catch (error) {
        await jobRef.update({ status: "failed", error: String(error), updatedAt: Date.now() });
        console.error("[AI Twin] işlem hatası:", error);
    }
}
function attachChannel(serverId, channelId) {
    const key = `${serverId}/${channelId}`;
    if (attachedChannels.has(key))
        return;
    attachedChannels.add(key);
    database.ref(`messages/${serverId}/${channelId}`).on("child_added", (snapshot) => {
        void processMessage(serverId, channelId, snapshot.key ?? "", snapshot.val());
    });
    console.log(`[AI Twin] kanal dinleniyor: ${key}`);
}
function attachServer(serverId) {
    if (attachedServers.has(serverId))
        return;
    attachedServers.add(serverId);
    database.ref(`channels/${serverId}`).on("child_added", (snapshot) => attachChannel(serverId, snapshot.key ?? ""));
}
database.ref("channels").on("child_added", (snapshot) => attachServer(snapshot.key ?? ""));
console.log("[AI Twin] local worker aktif. Bilgisayar açık kaldığı sürece offline mention'ları işleyecek.");
//# sourceMappingURL=index.js.map