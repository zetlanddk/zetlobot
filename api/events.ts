import type { SlackEvent } from "@slack/web-api";
import {
  assistantThreadMessage,
  handleNewAssistantMessage,
} from "../lib/handle-messages";
import { waitUntil } from "@vercel/functions";
import { handleNewAppMention } from "../lib/handle-app-mention";
import { verifyRequest, getBotId, client } from "../lib/slack-utils";
import { getTenantByChannelId } from "../lib/tenants";

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
  
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON payload", { status: 400 });
  }

  const requestType = payload.type as "url_verification" | "event_callback";

  // See https://api.slack.com/events/url_verification
  if (requestType === "url_verification") {
    return new Response(payload.challenge, { status: 200 });
  }

  // Verify the request signature before processing
  try {
    await verifyRequest({ request, rawBody });
  } catch (error) {
    console.error("Request verification failed:", error);
    return new Response("Invalid request signature", { status: 401 });
  }

  // Only process event_callback requests
  if (requestType !== "event_callback") {
    return new Response("Unsupported request type", { status: 400 });
  }

  try {
    const event = payload.event as SlackEvent;

    // Skip bot messages to avoid infinite loops
    if (isFromBot(event)) {
      return new Response("Ignoring bot message", { status: 200 });
    }

    // Resolve tenant from channel
    const channelId = getChannelFromEvent(event);
    if (!channelId) {
      console.log("No channel ID found in event, cannot determine tenant");
      return new Response("No channel context", { status: 200 });
    }

    const tenant = getTenantByChannelId(channelId);
    if (!tenant) {
      console.log(`Channel ${channelId} is not configured for any tenant, sending rejection message`);
      waitUntil(sendChannelNotAllowedMessage(event, channelId));
      return new Response("Channel not configured", { status: 200 });
    }

    const botUserId = await getBotId();
    const tenantId = tenant.id;

    if (event.type === "app_mention") {
      waitUntil(handleNewAppMention(event, botUserId, tenantId));
    }

    if (event.type === "assistant_thread_started") {
      waitUntil(assistantThreadMessage(event, tenantId));
    }

    // Bot messages are already filtered by isFromBot() above
    if (
      event.type === "message" &&
      !event.subtype &&
      event.channel_type === "im"
    ) {
      waitUntil(handleNewAssistantMessage(event, botUserId, tenantId));
    }

    return new Response("Success!", { status: 200 });
  } catch (error) {
    console.error("Error generating response", error);
    return new Response("Error generating response", { status: 500 });
  }
}
