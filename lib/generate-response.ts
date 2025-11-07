import { openai } from "@ai-sdk/openai";
import { CoreMessage, generateText, stepCountIs } from "ai";
import { getTools } from "./tools";
import { getSystemPrompt } from "./system-prompt";

export const generateResponse = async (
  messages: CoreMessage[],
  updateStatus?: (status: string) => void
) => {
  const tools = await getTools();

  const { text } = await generateText({
    model: openai("gpt-4o"),
    system: getSystemPrompt(),
    messages,
    tools,
    stopWhen: stepCountIs(5),
  });

  // Convert markdown to Slack mrkdwn format
  return text.replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>").replace(/\*\*/g, "*");
};
