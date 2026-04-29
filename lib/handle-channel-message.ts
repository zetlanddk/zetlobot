import type { GenericMessageEvent } from "@slack/web-api";
import { getThread, createMessageUpdater, stripBotMention, stripSlackLinks } from "./slack-utils";
import { generateResponse } from "./generate-response";
import { randomThinkingEmoji } from "./utils";
import { TenantId } from "./tenants";
import { shouldRespond } from "./should-respond";
import { withSupabaseGate } from "./auth/gate";
import { postSignInPrompt } from "./auth/slack-prompts";

/**
 * Handles all messages in channels when AUTO_RESPOND is enabled.
 * Responds to both top-level messages (creating a new thread) and thread replies.
 */
export async function handleChannelMessage(
  event: GenericMessageEvent,
  botUserId: string,
  tenantId: TenantId,
  currentUserId: string | null,
  slackTeamId: string,
) {
  console.log("Handling channel message (auto-respond)");

  if (!currentUserId) {
    console.log("No user id on channel message event; skipping");
    return;
  }

  const respond = await shouldRespond(event, botUserId);
  if (!respond) {
    console.log("Decided not to respond to channel message");
    return;
  }

  const { thread_ts, channel } = event;
  const threadTs = thread_ts ?? event.ts;
  const updateMessage = await createMessageUpdater(randomThinkingEmoji(), channel, threadTs);

  const sessionInput = {
    tenantId,
    slackTeamId,
    slackUserId: currentUserId,
    channelId: channel,
    threadHint: threadTs,
  };

  const gate = await withSupabaseGate(sessionInput, async (accessToken) => {
    const messages = thread_ts
      ? await getThread(channel, thread_ts, botUserId)
      : [{
          role: "user" as const,
          content: stripSlackLinks(stripBotMention(event.text ?? "", botUserId)),
        }];
    return generateResponse(messages, tenantId, {
      currentUserId,
      supabaseAccessToken: accessToken,
    });
  });

  if (gate.kind === "ok") {
    await updateMessage(gate.result);
    return;
  }

  if (gate.kind === "needs_auth") {
    await updateMessage("I sent you a sign-in link.");
    await postSignInPrompt(
      { channel, user: currentUserId, threadTs },
      gate.signInUrl,
    );
    return;
  }

  console.error("Auth gate error:", gate.reason);
  await updateMessage(
    "Sorry, I encountered an error while authenticating. Please try again.",
  );
}
