import type {
  AssistantThreadStartedEvent,
  GenericMessageEvent,
} from "@slack/web-api";
import { client, getThread, updateStatusUtil, isBotParticipantInThread } from "./slack-utils";
import { generateResponse } from "./generate-response";
import { randomThinkingEmoji } from "./utils";

export async function assistantThreadMessage(
  event: AssistantThreadStartedEvent,
) {
  const { channel_id, thread_ts } = event.assistant_thread;
  console.log(`Thread started: ${channel_id} ${thread_ts}`);
  console.log(JSON.stringify(event));

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
) {
  if (
    event.bot_id ||
    event.bot_id === botUserId ||
    event.bot_profile ||
    !event.thread_ts
  )
    return;

  const { thread_ts, channel } = event;
  const updateStatus = updateStatusUtil(channel, thread_ts);
  await updateStatus(randomThinkingEmoji());

  const messages = await getThread(channel, thread_ts, botUserId);
  const result = await generateResponse(messages, updateStatus);

  await client.chat.postMessage({
    channel: channel,
    thread_ts: thread_ts,
    text: result,
    unfurl_links: false,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: result,
        },
      },
    ],
  });

  await updateStatus("");
}

export async function handleThreadedMessage(
  event: GenericMessageEvent,
  botUserId: string,
) {
  // Skip if it's the bot's own message
  if (
    event.bot_id === botUserId ||
    event.user === botUserId ||
    event.bot_profile
  )
    return;

  // Skip if there's no thread_ts (not a threaded message)
  if (!event.thread_ts) return;

  // Skip if this is a direct message channel
  if (event.channel_type === "im") return;

  const { thread_ts, channel } = event;

  // Check if the bot has participated in this thread before
  const isBotParticipant = await isBotParticipantInThread(channel, thread_ts, botUserId);
  
  if (!isBotParticipant) return;

  console.log(`Bot responding to thread message in ${channel}`);

  const updateStatus = updateStatusUtil(channel, thread_ts);
  await updateStatus("is thinking...");

  try {
    const messages = await getThread(channel, thread_ts, botUserId);
    const result = await generateResponse(messages, updateStatus);

    await client.chat.postMessage({
      channel: channel,
      thread_ts: thread_ts,
      text: result,
      unfurl_links: false,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: result,
          },
        },
      ],
    });

    await updateStatus("");
  } catch (error) {
    console.error('Error handling threaded message:', error);
    await updateStatus("");
  }
}
