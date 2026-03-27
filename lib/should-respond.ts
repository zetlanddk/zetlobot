import type { GenericMessageEvent } from "@slack/web-api";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { isBotInThread } from "./slack-utils";

const CLASSIFICATION_PROMPT = `Du er en klassificeringsmodel for Zetlobot, Zetlands interne tekniske support-bot i Slack.

Din opgave: Afgør om følgende besked i en Slack-kanal er noget botten bør svare på.

Botten kan hjælpe med:
- Brugeropslag og kontoproblemer
- Abonnementer og medlemskaber
- Betalinger og fakturering (ChargeBee, MobilePay)
- Tekniske supportspørgsmål relateret til Zetlands systemer
- Spørgsmål rettet direkte til botten

Botten bør IKKE svare på:
- Generel snak og smalltalk mellem kolleger
- Beskeder der tydeligvis er rettet til andre mennesker
- Interne diskussioner om redaktionelt indhold, artikler eller journalistik
- Spørgsmål der ikke relaterer til teknisk support eller brugerhåndtering
- Simple bekræftelser, tak-beskeder, emojis eller reaktioner
- Jokes, memes eller uformel kommunikation

Svar KUN med "YES" eller "NO".`;

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
