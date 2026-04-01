import { AppMentionEvent } from "@slack/web-api";
import { getThread, createMessageUpdater } from "./slack-utils";
import { generateResponse } from "./generate-response";
import { randomThinkingEmoji } from "./utils";
import { TenantId } from "./tenants";

export async function handleNewAppMention(
  event: AppMentionEvent,
  botUserId: string,
  tenantId: TenantId,
  currentUserId: string | null,
) {
  // Note: Bot messages are filtered at the event handler level in api/events.ts
  console.log("Handling app mention");

  const { thread_ts, channel } = event;
  const updateMessage = await createMessageUpdater(randomThinkingEmoji(), channel, thread_ts ?? event.ts);
  const context = currentUserId ? { currentUserId } : undefined;

  let result: string;
  try {
    if (thread_ts) {
      const messages = await getThread(channel, thread_ts, botUserId);
      result = await generateResponse(messages, tenantId, context);
    } else {
      result = await generateResponse([{ role: "user", content: event.text }], tenantId, context);
    }
  } catch (error) {
    console.error("Failed to generate response:", error);
    result = "Sorry, I encountered an error while generating a response. Please try again.";
  }

  await updateMessage(result);
}
