import type { GenericMessageEvent } from "@slack/web-api";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { isBotInThread, stripBotMention } from "./slack-utils";

const CLASSIFICATION_PROMPT = `You are a classification model for an internal technical support bot in Slack.

Your task: Decide whether the following Slack channel message is something the bot should respond to.

The bot CAN help with:
- User and account lookups
- Subscriptions, memberships, and payment status
- Gift codes, impersonation links, account merges, email changes, GDPR deletion
- Company lookups
- Technical support questions related to internal systems
- Questions directed at the bot

The bot should NOT respond to:
- General chat and smalltalk between colleagues
- Messages clearly directed at other people
- Questions unrelated to technical support or user management
- Simple confirmations, thank-you messages, emojis, or reactions
- Jokes, memes, or casual communication

Respond ONLY with "YES" or "NO".`;

function logDecision(
  channelId: string,
  decision: "yes" | "no",
  startedAt: number,
  opts: { reason: "thread_bypass" | "empty_content" | "classifier" | "classifier_error"; classifierOutput?: string },
) {
  console.log(
    JSON.stringify({
      event: "auto_respond_decision",
      channelId,
      decision,
      latencyMs: Date.now() - startedAt,
      reason: opts.reason,
      ...(opts.classifierOutput !== undefined ? { classifierOutput: opts.classifierOutput } : {}),
    }),
  );
}

export async function shouldRespond(
  event: GenericMessageEvent,
  botUserId: string,
): Promise<boolean> {
  const startedAt = Date.now();

  // If we're in a thread where the bot is already participating, always respond
  if (event.thread_ts) {
    try {
      const botInThread = await isBotInThread(event.channel, event.thread_ts, botUserId);
      if (botInThread) {
        logDecision(event.channel, "yes", startedAt, { reason: "thread_bypass" });
        return true;
      }
    } catch (error) {
      console.error("Failed to check thread participation:", error);
      // Fall through to classification
    }
  }

  const content = stripBotMention(event.text ?? "", botUserId);

  if (!content) {
    logDecision(event.channel, "no", startedAt, { reason: "empty_content" });
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

    const decision = text.trim().toUpperCase().startsWith("YES") ? "yes" : "no";
    logDecision(event.channel, decision, startedAt, {
      reason: "classifier",
      classifierOutput: text,
    });
    return decision === "yes";
  } catch (error) {
    console.error("Failed to classify message, defaulting to not respond:", error);
    logDecision(event.channel, "no", startedAt, { reason: "classifier_error" });
    return false;
  }
}
