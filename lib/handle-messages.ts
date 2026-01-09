import type {
  AssistantThreadStartedEvent,
  GenericMessageEvent,
} from "@slack/web-api";
import { client, getThread, createAssistantStatusUpdater } from "./slack-utils";
import { generateResponse } from "./generate-response";
import { randomThinkingEmoji } from "./utils";

export async function assistantThreadMessage(
  event: AssistantThreadStartedEvent,
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
) {
  // Note: Bot messages are filtered at the event handler level in api/events.ts
  if (!event.thread_ts) return;

  const { thread_ts, channel } = event;
  const updateStatus = createAssistantStatusUpdater(channel, thread_ts);
  await updateStatus(randomThinkingEmoji());

  const messages = await getThread(channel, thread_ts, botUserId);

  let result: string;
  try {
    result = await generateResponse(messages);
  } catch (error) {
    console.error("Failed to generate response:", error);
    result = "Sorry, I encountered an error while generating a response. Please try again.";
  }

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
