import { WebClient } from '@slack/web-api';
import { ModelMessage } from 'ai'
import crypto from 'crypto'
import { env } from './env'

const signingSecret = env.SLACK_SIGNING_SECRET;

export const client = new WebClient(env.SLACK_BOT_TOKEN);

// See https://api.slack.com/authentication/verifying-requests-from-slack
export async function isValidSlackRequest({
  request,
  rawBody,
}: {
  request: Request
  rawBody: string
}) {
  // console.log('Validating Slack request')
  const timestamp = request.headers.get('X-Slack-Request-Timestamp')
  const slackSignature = request.headers.get('X-Slack-Signature')
  // console.log(timestamp, slackSignature)

  if (!timestamp || !slackSignature) {
    console.log('Missing timestamp or signature')
    return false
  }

  // Prevent replay attacks on the order of 5 minutes
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 60 * 5) {
    console.log('Timestamp out of range')
    return false
  }

  const base = `v0:${timestamp}:${rawBody}`
  const hmac = crypto
    .createHmac('sha256', signingSecret)
    .update(base)
    .digest('hex')
  const computedSignature = `v0=${hmac}`

  // Prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(computedSignature),
    Buffer.from(slackSignature)
  )
}

export const verifyRequest = async ({
  request,
  rawBody,
}: {
  request: Request;
  rawBody: string;
}) => {
  const validRequest = await isValidSlackRequest({ request, rawBody });
  if (!validRequest) {
    throw new Error("Invalid Slack request signature");
  }
};

/**
 * Creates a function to update the Slack Assistant thread status indicator.
 * Used to show typing/thinking indicators in assistant threads.
 */
export const createAssistantStatusUpdater = (channel: string, thread_ts: string) => {
  return async (status: string) => {
    await client.assistant.threads.setStatus({
      channel_id: channel,
      thread_ts: thread_ts,
      status: status,
    });
  };
};

/**
 * Strip Slack's angle-bracket link formatting from message text.
 * Replaces `<...|label>` with just the label (the display text the user sees).
 */
export const stripSlackLinks = (text: string) =>
  text.replace(/<[^>]*\|([^>]*)>/g, "$1");

export async function getThread(
  channel_id: string,
  thread_ts: string,
  botUserId: string,
): Promise<ModelMessage[]> {
  const { messages } = await client.conversations.replies({
    channel: channel_id,
    ts: thread_ts,
    limit: 50,
  });

  // Ensure we have messages
  if (!messages) throw new Error("No messages found in thread");

  const result = messages
    .map((message) => {
      const isBot = !!message.bot_id;
      if (!message.text) return null;

      let content = message.text;
      if (!isBot) {
        content = stripBotMention(content, botUserId);
        content = stripSlackLinks(content);
      }

      return {
        role: isBot ? "assistant" : "user",
        content: content,
      } as ModelMessage;
    })
    .filter((msg): msg is ModelMessage => msg !== null);

  return result;
}

// Cache the bot ID to avoid API calls on every request
let cachedBotId: string | null = null;

// Cache for user info to avoid repeated API calls
const userCache = new Map<string, { displayName: string }>();

export type UserInfo = { displayName: string };

export async function getUserInfo(userId: string): Promise<UserInfo> {
  if (userCache.has(userId)) {
    return userCache.get(userId)!;
  }

  try {
    const { user } = await client.users.info({ user: userId });
    const info: UserInfo = {
      displayName: user?.profile?.display_name || user?.real_name || userId,
    };
    userCache.set(userId, info);
    return info;
  } catch (error) {
    console.error(`Failed to fetch user info for ${userId}:`, error);
    // Return userId as fallback so the tool still works
    return { displayName: userId };
  }
}

// Best-effort check — uses Slack's per-call max of 200 replies. For threads
// longer than that the bot's earliest message could fall outside the window
// and we'd misclassify the thread as bot-free; the classifier picks up the
// slack on the next message.
export async function isBotInThread(
  channelId: string,
  threadTs: string,
  botUserId: string,
): Promise<boolean> {
  const { messages } = await client.conversations.replies({
    channel: channelId,
    ts: threadTs,
    limit: 200,
  });
  return messages?.some((m) => m.user === botUserId) ?? false;
}

/**
 * Strip bot mentions from message text.
 */
export function stripBotMention(text: string, botUserId: string): string {
  return text.replace(new RegExp(`<@${botUserId}>\\s*`, "g"), "").trim();
}

/**
 * Adds a "thinking" reaction to the user's message and returns a function
 * that posts the final answer as a thread reply, then removes the reaction.
 */
export async function createReactionPlaceholder(
  reactionName: string,
  channel: string,
  messageTs: string,
  threadTs: string,
) {
  await client.reactions.add({
    channel,
    name: reactionName,
    timestamp: messageTs,
  });

  return async (text: string) => {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text,
      unfurl_links: false,
    });
    await client.reactions
      .remove({ channel, name: reactionName, timestamp: messageTs })
      .catch(() => {
        // Best-effort: tolerate no_reaction races (e.g. a user manually
        // removed it, or a retry already cleared it).
      });
  };
}

export const getBotId = async () => {
  if (cachedBotId) {
    return cachedBotId;
  }

  const { user_id: botUserId } = await client.auth.test();

  if (!botUserId) {
    throw new Error("botUserId is undefined");
  }

  cachedBotId = botUserId;
  return botUserId;
};
