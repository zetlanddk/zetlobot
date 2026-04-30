import type { GenericMessageEvent } from "@slack/web-api";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { isBotInThread, stripBotMention } from "./slack-utils";
import type { Shortcut } from "./tenants";

function buildClassificationPrompt(shortcuts: readonly Shortcut[]): string {
  const shortcutLines = shortcuts.map((s) => `- "${s.trigger}"`).join("\n");
  return `You are a classification model for an internal technical support bot in Slack.

Your task: Decide whether the following Slack channel message is something the bot should respond to.

The bot's own @-mention has already been removed before you see the message. Any remaining \`<@U…>\` token is therefore a mention of *another* human, not the bot.

ALWAYS respond YES if the message matches one of these shortcut patterns (in any language, even if abbreviated or with extra words):
${shortcutLines}

Otherwise, the bot can help with:
- User and account lookups
- Subscriptions, memberships, and payment status
- Gift codes, impersonation links, account merges, email changes, GDPR deletion
- Company lookups
- Technical support questions related to internal systems

Respond NO if ANY of these apply:
- The message addresses another human rather than the bot. This includes any leading "@name" (with or without angle brackets, e.g. \`@niels\`, \`<@U123>\`, \`<@U123|niels>\`) AND messages that open with a person's name as a vocative (e.g. "Niels, ..." or "Silje – ..."). Even if such a message contains a question, it is a follow-up to that human, not a request to the bot.
- The message is a statement, observation, or comment with no actionable request and no question. Containing an email or member ID does NOT make it a request — there must be an explicit ask or question.
- The message is general chat, smalltalk, jokes, memes, or casual reactions.
- It's a confirmation, thank-you, single emoji, or follow-up that doesn't ask anything new.
- The topic is unrelated to user management or technical support.

When in doubt, default to NO. The bot should err on the side of staying silent rather than interrupting a human conversation.

Examples:
- "@silje Har du adgang til Zetland? :smile:" → NO (directed at another user)
- "<@U123ABC> kan du tjekke det her?" → NO (directed at another user)
- "@niels Fik du svar på dit spørgsmål?" → NO (follow-up directed at another user, even though it's a question)
- "Silje, kan du lige tjekke det her?" → NO (vocative address to another human)
- "hahha, jeg har medlemskab på siljebroenderup@gmail.com" → NO (statement, no question or request)
- "tak!" → NO (acknowledgement)
- "medlem niels@zetland.dk" → YES (matches shortcut)
- "kan I lave en gavekode til kunde@x.dk?" → YES (explicit request)

Respond ONLY with "YES" or "NO".`;
}

// Matches a leading address to another human: a Slack user mention
// (`<@U…>` / `<@U…|display>`) or a plain-text "@name" typed without going
// through Slack's autocomplete picker. stripBotMention has already removed
// the bot's own mention, so anything matched here is directed at someone else.
const LEADING_USER_MENTION =
  /^(?:<@[UW][A-Z0-9]+(?:\|[^>]*)?>|@[A-Za-z][\w.-]{0,30})/;

function startsWithOtherUserMention(content: string): boolean {
  return LEADING_USER_MENTION.test(content.trimStart());
}

function logDecision(
  channelId: string,
  decision: "yes" | "no",
  startedAt: number,
  opts: {
    reason:
      | "thread_bypass"
      | "empty_content"
      | "directed_at_other_user"
      | "classifier"
      | "classifier_error";
    classifierOutput?: string;
  },
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
  shortcuts: readonly Shortcut[],
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

  if (startsWithOtherUserMention(content)) {
    logDecision(event.channel, "no", startedAt, { reason: "directed_at_other_user" });
    return false;
  }

  try {
    const { text } = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      system: buildClassificationPrompt(shortcuts),
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
