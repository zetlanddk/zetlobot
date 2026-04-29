import { AppMentionEvent } from "@slack/web-api";
import { getThread, stripSlackLinks, createMessageUpdater } from "./slack-utils";
import { generateResponse } from "./generate-response";
import { randomThinkingEmoji } from "./utils";
import { TenantId } from "./tenants";
import { withSupabaseGate } from "./auth/gate";
import { postForbiddenPrompt, postSignInPrompt } from "./auth/slack-prompts";

export async function handleNewAppMention(
  event: AppMentionEvent,
  botUserId: string,
  tenantId: TenantId,
  currentUserId: string | null,
  slackTeamId: string,
) {
  console.log("Handling app mention");

  const { thread_ts, channel } = event;

  if (!currentUserId) {
    console.log("No user id on app_mention event; skipping");
    return;
  }

  const ephemeralThread = thread_ts ?? event.ts;
  const updateMessage = await createMessageUpdater(randomThinkingEmoji(), channel, ephemeralThread);

  const sessionInput = {
    tenantId,
    slackTeamId,
    slackUserId: currentUserId,
    channelId: channel,
    threadHint: ephemeralThread,
  };

  const gate = await withSupabaseGate(sessionInput, async (accessToken) => {
    const messages = thread_ts
      ? await getThread(channel, thread_ts, botUserId)
      : [{ role: "user" as const, content: stripSlackLinks(event.text) }];
    return generateResponse(messages, tenantId, {
      currentUserId,
      supabaseAccessToken: accessToken,
    });
  });

  if (gate.kind === "ok") {
    await updateMessage(gate.result);
    return;
  }

  // Replace the thinking emoji with a brief in-thread acknowledgement, and
  // post the actionable ephemeral separately so it doesn't get lost.
  if (gate.kind === "needs_auth") {
    await updateMessage("I sent you a sign-in link.");
    await postSignInPrompt(
      { channel, user: currentUserId, threadTs: ephemeralThread },
      gate.signInUrl,
    );
    return;
  }

  if (gate.kind === "forbidden") {
    await updateMessage("I left you a private note.");
    await postForbiddenPrompt({ channel, user: currentUserId, threadTs: ephemeralThread });
    return;
  }

  console.error("Auth gate error:", gate.reason);
  await updateMessage(
    "Sorry, I encountered an error while authenticating. Please try again.",
  );
}
