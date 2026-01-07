import type { SlackEvent } from "@slack/web-api";
import {
  assistantThreadMessage,
  handleNewAssistantMessage,
  handleThreadReply,
} from "../lib/handle-messages";
import { waitUntil } from "@vercel/functions";
import { handleNewAppMention } from "../lib/handle-app-mention";
import { verifyRequest, getBotId, client, hasBotParticipatedInThread } from "../lib/slack-utils";
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
 * Check if an event is from a bot (to avoid infinite loops)
 */
function isFromBot(event: SlackEvent): boolean {
  if (event.type === "app_mention" || event.type === "message") {
    return Boolean("bot_id" in event && event.bot_id) || Boolean("bot_profile" in event && event.bot_profile);
  }
  return false;
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

    // Skip bot messages to avoid infinite loops
    if (isFromBot(event)) {
      return new Response("Ignoring bot message", { status: 200 });
    }

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

    // Handle thread replies in channels where the bot has participated
    if (
      event.type === "message" &&
      !event.subtype &&
      event.channel_type === "channel" &&
      !event.bot_id &&
      !event.bot_profile &&
      event.thread_ts // Only handle messages that are replies in a thread
    ) {
      // Check if the bot has participated in this thread
      const botParticipated = await hasBotParticipatedInThread(
        event.channel,
        event.thread_ts,
        botUserId
      );
      
      if (botParticipated) {
        console.log(`Bot has participated in thread ${event.thread_ts}, responding to reply`);
        waitUntil(handleThreadReply(event, botUserId));
      }
    }

    return new Response("Success!", { status: 200 });
  } catch (error) {
    console.error("Error generating response", error);
    return new Response("Error generating response", { status: 500 });
  }
}
