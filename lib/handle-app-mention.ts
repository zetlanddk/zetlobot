import { AppMentionEvent } from "@slack/web-api";
import { client, getThread } from "./slack-utils";
import { generateResponse } from "./generate-response";
import { randomThinkingEmoji } from "./utils";

/**
 * Posts an initial message and returns a function to update it.
 * Used for showing a "thinking" indicator that gets replaced with the response.
 */
const createMessageUpdater = async (
  initialStatus: string,
  event: AppMentionEvent,
) => {
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
) {
  // Note: Bot messages are filtered at the event handler level in api/events.ts
  console.log("Handling app mention");

  const { thread_ts, channel } = event;
  const updateMessage = await createMessageUpdater(randomThinkingEmoji(), event);

  let result: string;
  try {
    if (thread_ts) {
      const messages = await getThread(channel, thread_ts, botUserId);
      result = await generateResponse(messages);
    } else {
      result = await generateResponse([{ role: "user", content: event.text }]);
    }
  } catch (error) {
    console.error("Failed to generate response:", error);
    result = "Sorry, I encountered an error while generating a response. Please try again.";
  }

  await updateMessage(result);
}
