import { getDatabase } from "firebase-admin/database";
import { initializeApp } from "firebase-admin/app";
import { onValueCreated } from "firebase-functions/v2/database";
import { defineSecret } from "firebase-functions/params";

initializeApp();
const cerebrasKey = defineSecret("CEREBRAS_API_KEY");

type IncomingMessage = {
  authorId?: string;
  content?: string;
  mentions?: Record<string, boolean>;
};

type Persona = { enabled?: boolean; prompt?: string };

export const generateAiTwinReply = onValueCreated(
  { ref: "/messages/{serverId}/{channelId}/{messageId}", region: "europe-west1", secrets: [cerebrasKey] },
  async (event) => {
    const message = event.data.val() as IncomingMessage | null;
    if (!message?.content || !message.authorId || !message.mentions) return;

    const targetUid = Object.entries(message.mentions).find(([, mentioned]) => mentioned)?.[0];
    if (!targetUid || targetUid === message.authorId) return;

    const database = getDatabase();
    const [presenceSnapshot, personaSnapshot, duplicateSnapshot] = await Promise.all([
      database.ref(`users/${targetUid}/presence/connections`).get(),
      database.ref(`users/${targetUid}/ai_persona`).get(),
      database.ref(`aiJobs/${event.params.messageId}`).get(),
    ]);
    const persona = personaSnapshot.val() as Persona | null;
    if (presenceSnapshot.exists() || !persona?.enabled || !persona.prompt || duplicateSnapshot.exists()) return;

    await database.ref(`aiJobs/${event.params.messageId}`).set({
      sourceMessageId: event.params.messageId,
      targetUid,
      serverId: event.params.serverId,
      channelId: event.params.channelId,
      status: "processing",
      createdAt: Date.now(),
    });

    const historySnapshot = await database.ref(`messages/${event.params.serverId}/${event.params.channelId}`).limitToLast(12).get();
    const history = historySnapshot.val() ?? {};
    const input = [
      `You are an AI twin. Always clearly label your answer as [AI İkiz]. Never claim to be the real person.`,
      `Persona: ${persona.prompt}`,
      `Recent messages: ${JSON.stringify(history)}`,
      `Respond briefly to the latest message in the persona's style.`,
    ].join("\n\n");

    const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cerebrasKey.value()}` },
      body: JSON.stringify({
        model: process.env.CEREBRAS_MODEL ?? "gpt-oss-120b",
        messages: [{ role: "user", content: input }],
        max_tokens: 350,
      }),
    });
    if (!response.ok) {
      await database.ref(`aiJobs/${event.params.messageId}`).update({ status: "failed", updatedAt: Date.now() });
      return;
    }
    const result = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = result.choices?.[0]?.message?.content?.trim();
    if (!content) return;

    const reply = database.ref(`messages/${event.params.serverId}/${event.params.channelId}`).push();
    await reply.set({
      serverId: event.params.serverId,
      channelId: event.params.channelId,
      authorId: "system-ai",
      twinOfUid: targetUid,
      isAiTwin: true,
      content: `[AI İkiz] ${content}`,
      createdAt: Date.now(),
    });
    await database.ref(`aiJobs/${event.params.messageId}`).update({ status: "complete", replyId: reply.key, updatedAt: Date.now() });
  },
);
