import type { GenericMessageEvent } from "@slack/web-api";
import { client, getThread, createMessageUpdater, stripBotMention, stripSlackLinks } from "./slack-utils";
import { generateResponse } from "./generate-response";
import { randomThinkingEmoji } from "./utils";
import { TenantId, getTenantById } from "./tenants";
import { shouldRespond } from "./should-respond";
import { withSupabaseGate } from "./auth/gate";
import { postSignInPrompt, postForbiddenPrompt } from "./auth/slack-prompts";

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

  const tenant = getTenantById(tenantId);
  if (!tenant) {
    console.log(`Tenant ${tenantId} not found; skipping`);
    return;
  }

  const respond = await shouldRespond(event, botUserId, tenant.shortcuts);
  if (!respond) return;

  const { thread_ts, channel } = event;
  const threadTs = thread_ts ?? event.ts;

  // Defer the public "thinking" indicator until inside doWork, so we don't
  // expose the bot's auto-respond attempt (or the user's auth state) when
  // the user didn't @-mention us. Holder object so TS doesn't narrow the
  // type across the closure mutation. Null-guard prevents double-posting
  // on a force-refresh retry.
  type Updater = (status: string) => Promise<void>;
  const state: { updater: Updater | null } = { updater: null };

  const gate = await withSupabaseGate(
    {
      tenantId,
      slackTeamId,
      slackUserId: currentUserId,
      channelId: channel,
      threadHint: threadTs,
    },
    async (accessToken) => {
      if (!state.updater) {
        state.updater = await createMessageUpdater(randomThinkingEmoji(), channel, threadTs);
      }
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
    },
  );

  const updater = state.updater;

  if (gate.kind === "ok") {
    await updater!(gate.result);
    return;
  }

  if (gate.kind === "needs_auth") {
    // Auth-gate didn't run doWork, so nothing was posted publicly. Keep
    // the sign-in flow private — the ephemeral prompt is user-only.
    await postSignInPrompt(
      { channel, user: currentUserId, threadTs },
      gate.signInUrl,
    );
    return;
  }

  if (gate.kind === "forbidden") {
    if (updater) {
      await updater("I left you a private note.");
    }
    await postForbiddenPrompt({ channel, user: currentUserId, threadTs });
    return;
  }

  console.error("Auth gate error:", gate.reason);
  if (updater) {
    // Auth succeeded; generation kept failing. Replace the public thinking
    // indicator so the user isn't stuck looking at an emoji.
    await updater("Sorry, I encountered an error while generating a response. Please try again.");
  } else {
    // Session failed before any public artifact; keep the failure private.
    await client.chat.postEphemeral({
      channel,
      user: currentUserId,
      thread_ts: threadTs,
      text: "Sorry, I encountered an error while authenticating. Please try again.",
    });
  }
}
