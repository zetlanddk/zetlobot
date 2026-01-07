import type {
  AssistantThreadStartedEvent,
  GenericMessageEvent,
} from "@slack/web-api";
import { client, getThread, updateStatusUtil } from "./slack-utils";
import { generateResponse } from "./generate-response";
import { randomThinkingEmoji } from "./utils";

/**
 * Posts an initial message and returns a function to update it.
 * Used for channel threads (not assistant threads).
 */
const postAndUpdateMessage = async (
  channel: string,
  thread_ts: string,
  initialText: string,
) => {
  const initialMessage = await client.chat.postMessage({
    channel: channel,
    thread_ts: thread_ts,
    text: initialText,
  });

  if (!initialMessage || !initialMessage.ts)
    throw new Error("Failed to post initial message");

  const updateMessage = async (text: string) => {
    await client.chat.update({
      channel: channel,
      ts: initialMessage.ts as string,
      text: text,
    });
  };
  return updateMessage;
};

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
  const updateMessage = updateStatusUtil(channel, thread_ts);
  await updateMessage(randomThinkingEmoji());

  const messages = await getThread(channel, thread_ts, botUserId);
  const result = await generateResponse(messages, updateMessage);

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

  await updateMessage("");
}

/**
 * Handle messages in a thread where the bot has previously participated.
 * This allows users to continue conversations without re-tagging the bot.
 */
export async function handleThreadReply(
  event: GenericMessageEvent,
  botUserId: string,
) {
  console.log("Handling thread reply");
  
  const { thread_ts, channel } = event;
  
  if (!thread_ts) {
    console.log("No thread_ts, skipping");
    return;
  }

  const updateMessage = await postAndUpdateMessage(channel, thread_ts, randomThinkingEmoji());

  const messages = await getThread(channel, thread_ts, botUserId);
  const result = await generateResponse(messages, updateMessage);
  await updateMessage(result);
}
