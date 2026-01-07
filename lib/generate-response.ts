import { openai } from "@ai-sdk/openai";
import { ModelMessage, generateText, stepCountIs } from "ai";
import { getTools } from "./tools";
import { getSystemPrompt } from "./system-prompt";

export const generateResponse = async (messages: ModelMessage[]) => {
  const tools = await getTools();

  const { text } = await generateText({
    model: openai("gpt-5.2"),
    system: getSystemPrompt(),
    messages,
    tools,
    stopWhen: stepCountIs(7),
  });

  // Convert markdown to Slack mrkdwn format
  return text.replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>").replace(/\*\*/g, "*");
};
