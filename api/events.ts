import type { SlackEvent } from "@slack/web-api";
import {
  assistantThreadMessage,
  handleNewAssistantMessage,
} from "../lib/handle-messages";
import { waitUntil } from "@vercel/functions";
import { handleNewAppMention } from "../lib/handle-app-mention";
import { verifyRequest, getBotId, client } from "../lib/slack-utils";
import { isChannelWhitelisted } from "../lib/utils";

/**
 * Extract channel ID from various Slack event types
 */
function getChannelFromEvent(event: SlackEvent): string | null {
  if (event.type === "app_mention" || event.type === "message") {
    return event.channel;
  }
  if (event.type === "assistant_thread_started") {
    return event.assistant_thread.channel_id;
  }
  return null;
}

/**
 * Send a message explaining the bot is not available in this channel
 */
async function sendChannelNotAllowedMessage(event: SlackEvent, channelId: string) {
  let threadTs: string | undefined;
  
  if (event.type === "app_mention") {
    threadTs = event.thread_ts ?? event.ts;
  } else if (event.type === "message" && "ts" in event) {
    threadTs = ("thread_ts" in event ? event.thread_ts : undefined) ?? event.ts;
  } else if (event.type === "assistant_thread_started") {
    threadTs = event.assistant_thread.thread_ts;
  }

  await client.chat.postMessage({
    channel: channelId,
    thread_ts: threadTs,
    text: "🚫 Sorry, I'm not configured to respond in this channel. Please contact an administrator if you believe this is an error.",
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const payload = JSON.parse(rawBody);
  const requestType = payload.type as "url_verification" | "event_callback";

  // See https://api.slack.com/events/url_verification
  if (requestType === "url_verification") {
    return new Response(payload.challenge, { status: 200 });
  }

  await verifyRequest({ requestType, request, rawBody });

  try {
    const event = payload.event as SlackEvent;

    // Check channel whitelist
    const channelId = getChannelFromEvent(event);
    if (channelId && !isChannelWhitelisted(channelId)) {
      console.log(`Channel ${channelId} is not whitelisted, sending rejection message`);
      waitUntil(sendChannelNotAllowedMessage(event, channelId));
      return new Response("Channel not whitelisted", { status: 200 });
    }

    const botUserId = await getBotId();

    if (event.type === "app_mention") {
      waitUntil(handleNewAppMention(event, botUserId));
    }

    if (event.type === "assistant_thread_started") {
      waitUntil(assistantThreadMessage(event));
    }

    if (
      event.type === "message" &&
      !event.subtype &&
      event.channel_type === "im" &&
      !event.bot_id &&
      !event.bot_profile &&
      event.bot_id !== botUserId
    ) {
      waitUntil(handleNewAssistantMessage(event, botUserId));
    }

    return new Response("Success!", { status: 200 });
  } catch (error) {
    console.error("Error generating response", error);
    return new Response("Error generating response", { status: 500 });
  }
}
