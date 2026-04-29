import type {
  AssistantThreadStartedEvent,
  GenericMessageEvent,
} from "@slack/web-api";
import {
  client,
  getThread,
  getUserInfo,
  createAssistantStatusUpdater,
} from "./slack-utils";
import { generateResponse } from "./generate-response";
import { randomThinkingEmoji } from "./utils";
import { TenantId } from "./tenants";
import { withSupabaseGate } from "./auth/gate";
import { postSignInPrompt } from "./auth/slack-prompts";

export async function assistantThreadMessage(
  event: AssistantThreadStartedEvent,
  tenantId: TenantId,
) {
  const { channel_id, thread_ts } = event.assistant_thread;
  console.log(`Thread started: ${channel_id} ${thread_ts}`);

  await client.chat.postMessage({
    channel: channel_id,
    thread_ts: thread_ts,
    text: "Hello, I'm the Zetlobot AI assistant 👋",
  });

  await client.assistant.threads.setSuggestedPrompts({
    channel_id: channel_id,
    thread_ts: thread_ts,
    prompts: [
      {
        title: "Get the weather",
        message: "What is the current weather in London?",
      },
    ],
  });
}

export async function handleNewAssistantMessage(
  event: GenericMessageEvent,
  botUserId: string,
  tenantId: TenantId,
  currentUserId: string | null,
  slackTeamId: string,
) {
  if (!event.thread_ts) return;
  if (!currentUserId) {
    console.log("No user id on message event; skipping");
    return;
  }

  const { thread_ts, channel } = event;
  const updateStatus = createAssistantStatusUpdater(channel, thread_ts);
  await updateStatus(randomThinkingEmoji());

  const userInfo = await getUserInfo(currentUserId);
  const sessionInput = {
    tenantId,
    slackTeamId,
    slackUserId: currentUserId,
    channelId: channel,
    threadHint: thread_ts,
  };

  const gate = await withSupabaseGate(sessionInput, async (accessToken) => {
    const messages = await getThread(channel, thread_ts, botUserId);
    return generateResponse(messages, tenantId, {
      currentUserId,
      supabaseAccessToken: accessToken,
    });
  });

  await updateStatus("");

  if (gate.kind === "ok") {
    await client.chat.postMessage({
      channel,
      thread_ts,
      text: gate.result,
      unfurl_links: false,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: gate.result } },
      ],
    });
    return;
  }

  if (gate.kind === "needs_auth") {
    await postSignInPrompt(
      { channel, user: currentUserId, threadTs: thread_ts },
      gate.signInUrl,
    );
    return;
  }

  console.error("Auth gate error:", gate.reason);
  await client.chat.postMessage({
    channel,
    thread_ts,
    text: "Sorry, I encountered an error while authenticating. Please try again.",
  });
}
