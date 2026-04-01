import type { GenericMessageEvent } from "@slack/web-api";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { isBotInThread } from "./slack-utils";

const CLASSIFICATION_PROMPT = `You are a classification model for an internal technical support bot in Slack.

Your task: Decide whether the following Slack channel message is something the bot should respond to.

The bot CAN help with:
- User lookups and account issues
- Subscriptions and memberships
- Payments and billing (ChargeBee, MobilePay)
- Technical support questions related to internal systems
- Questions directed at the bot

The bot should NOT respond to:
- General chat and smalltalk between colleagues
- Messages clearly directed at other people
- Internal discussions about editorial content, articles, or journalism
- Questions unrelated to technical support or user management
- Simple confirmations, thank-you messages, emojis, or reactions
- Jokes, memes, or casual communication

Respond ONLY with "YES" or "NO".`;

export async function shouldRespond(
  event: GenericMessageEvent,
  botUserId: string,
): Promise<boolean> {
  // If we're in a thread where the bot is already participating, always respond
  if (event.thread_ts) {
    try {
      const botInThread = await isBotInThread(event.channel, event.thread_ts);
      if (botInThread) {
        return true;
      }
    } catch (error) {
      console.error("Failed to check thread participation:", error);
      // Fall through to classification
    }
  }

  const content = (event.text ?? "")
    .replace(new RegExp(`<@${botUserId}>\\s*`, "g"), "")
    .trim();

  if (!content) {
    return false;
  }

  try {
    const { text } = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      system: CLASSIFICATION_PROMPT,
      messages: [{ role: "user", content }],
      temperature: 0,
      maxOutputTokens: 5,
    });

    return text.trim().toUpperCase().startsWith("YES");
  } catch (error) {
    console.error("Failed to classify message, defaulting to respond:", error);
    return true;
  }
}
