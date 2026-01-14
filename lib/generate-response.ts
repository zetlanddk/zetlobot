import { openai } from "@ai-sdk/openai";
import { ModelMessage, generateText, stepCountIs } from "ai";
import { getTools } from "./tools";
import { getSystemPrompt } from "./system-prompt";
import { google } from "@ai-sdk/google";

const MAX_STEPS = 10;

export const generateResponse = async (messages: ModelMessage[]) => {
  const tools = await getTools();

  const { text, steps } = await generateText({
    model: google("gemini-2.5-pro"),
    system: getSystemPrompt(),
    messages,
    tools,
    stopWhen: stepCountIs(MAX_STEPS),
    temperature: 0.3,
  });

  const hitStepLimit = steps.length >= MAX_STEPS;

  if (hitStepLimit) {
    console.warn(`Step limit reached (${steps.length} steps)`);
  }

  if (!text) {
    if (hitStepLimit) {
      return "I ran out of steps before completing. Try simplifying your request.";
    }
    return "I processed your request but have nothing to add.";
  }

  // Convert markdown to Slack mrkdwn format
  return text.replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>").replace(/\*\*/g, "*");
};
