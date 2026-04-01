import type { GenericMessageEvent } from "@slack/web-api";
import { getThread, createMessageUpdater, stripBotMention } from "./slack-utils";
import { generateResponse } from "./generate-response";
import { randomThinkingEmoji } from "./utils";
import { TenantId } from "./tenants";
import { shouldRespond } from "./should-respond";

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

  const respond = await shouldRespond(event, botUserId);
  if (!respond) {
    console.log("Decided not to respond to channel message");
    return;
  }

  const { thread_ts, channel } = event;
  const context = currentUserId ? { currentUserId } : undefined;
  const content = stripBotMention(event.text ?? "", botUserId);

  const threadTs = thread_ts ?? event.ts;
  const updateMessage = await createMessageUpdater(randomThinkingEmoji(), channel, threadTs);

  let result: string;
  try {
    if (thread_ts) {
      const messages = await getThread(channel, thread_ts, botUserId);
      result = await generateResponse(messages, tenantId, context);
    } else {
      result = await generateResponse([{ role: "user", content }], tenantId, context);
    }
  } catch (error) {
    console.error("Failed to generate response:", error);
    result = "Sorry, I encountered an error while generating a response. Please try again.";
  }

  await updateMessage(result);
}
