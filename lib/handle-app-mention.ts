import { AppMentionEvent } from "@slack/web-api";
import { client, getThread, getUserInfo, stripSlackLinks } from "./slack-utils";
import { generateResponse } from "./generate-response";
import { randomThinkingEmoji } from "./utils";
import { TenantId } from "./tenants";
import { withSupabaseGate } from "./auth/gate";
import { postSignInPrompt, postUnauthorizedPrompt } from "./auth/slack-prompts";

const createMessageUpdater = async (initialStatus: string, event: AppMentionEvent) => {
  const initialMessage = await client.chat.postMessage({
    channel: event.channel,
    thread_ts: event.thread_ts ?? event.ts,
    text: initialStatus,
  });

  if (!initialMessage || !initialMessage.ts)
    throw new Error("Failed to post initial message");

  const updateMessage = async (status: string) => {
    await client.chat.update({
      channel: event.channel,
      ts: initialMessage.ts as string,
      text: status,
    });
  };
  return updateMessage;
};

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

  const updateMessage = await createMessageUpdater(randomThinkingEmoji(), event);

  const userInfo = await getUserInfo(currentUserId);
  const ephemeralThread = thread_ts ?? event.ts;
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

  if (gate.kind === "unauthorized") {
    await updateMessage("Your account isn't authorized for this feature.");
    await postUnauthorizedPrompt(
      { channel, user: currentUserId, threadTs: ephemeralThread },
      userInfo?.email ?? null,
    );
    return;
  }

  console.error("Auth gate error:", gate.reason);
  await updateMessage(
    "Sorry, I encountered an error while authenticating. Please try again.",
  );
}
