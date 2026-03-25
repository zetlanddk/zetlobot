import type { GenericMessageEvent } from "@slack/web-api";
import { client, getThread } from "./slack-utils";
import { generateResponse } from "./generate-response";
import { randomThinkingEmoji } from "./utils";
import { TenantId } from "./tenants";

/**
 * Posts an initial message in a thread and returns a function to update it.
 */
const createMessageUpdater = async (
  initialStatus: string,
  channel: string,
  threadTs: string,
) => {
  const initialMessage = await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: initialStatus,
  });

  if (!initialMessage || !initialMessage.ts)
    throw new Error("Failed to post initial message");

  const updateMessage = async (status: string) => {
    await client.chat.update({
      channel,
      ts: initialMessage.ts as string,
      text: status,
    });
  };
  return updateMessage;
};

/**
 * Handles all messages in channels when AUTO_RESPOND is enabled.
 * Responds to both top-level messages (creating a new thread) and thread replies.
 */
export async function handleChannelMessage(
  event: GenericMessageEvent,
  botUserId: string,
  tenantId: TenantId,
  currentUserId: string | null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  slackTeamId: string,
) {
  console.log("Handling channel message (auto-respond)");

  const { thread_ts, channel } = event;
  const context = currentUserId ? { currentUserId } : undefined;

  // Strip bot mentions from the message text
  let content = event.text ?? "";
  content = content.replace(new RegExp(`<@${botUserId}>\\s*`, "g"), "").trim();

  let result: string;
  try {
    if (thread_ts) {
      // Thread reply: fetch full thread history and respond in the same thread
      const updateMessage = await createMessageUpdater(randomThinkingEmoji(), channel, thread_ts);
      const messages = await getThread(channel, thread_ts, botUserId);
      result = await generateResponse(messages, tenantId, context);
      await updateMessage(result);
    } else {
      // Top-level message: start a new thread off the original message
      const updateMessage = await createMessageUpdater(randomThinkingEmoji(), channel, event.ts);
      result = await generateResponse([{ role: "user", content }], tenantId, context);
      await updateMessage(result);
    }
  } catch (error) {
    console.error("Failed to generate response:", error);
  }
}
