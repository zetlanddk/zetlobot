import { openai } from "@ai-sdk/openai";
import { ModelMessage, generateText, stepCountIs } from "ai";
import { getTools } from "./tools";
import { getSystemPrompt } from "./system-prompt";
import { google } from "@ai-sdk/google";

export const generateResponse = async (messages: ModelMessage[]) => {
  const tools = await getTools();

  const { text } = await generateText({
    model: google("gemini-flash-latest"),
    system: getSystemPrompt(),
    messages,
    tools,
    stopWhen: stepCountIs(7),
  });

  // Convert markdown to Slack mrkdwn format
  return text.replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>").replace(/\*\*/g, "*");
};
