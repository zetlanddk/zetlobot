import { google } from '@ai-sdk/google';
import { ModelMessage, generateText, stepCountIs } from "ai";
import { getTools as mainframeTools } from "./tools/mainframe";
import { getTools as chargebeeKnowledgeBaseTools } from "./tools/chargebee-knowledge-base";
import { getTools as chargebeeDataLookupTools } from "./tools/chargebee-data-lookup";
import { getSystemPrompt } from "./system-prompt";

export const generateResponse = async (messages: ModelMessage[]) => {
  const tools = {
    ...(await mainframeTools()),
    ...(await chargebeeDataLookupTools()),
    ...(await chargebeeKnowledgeBaseTools()),
  };

  const { text } = await generateText({
    model: google("gemini-2.5-flash"),
    system: getSystemPrompt(),
    messages,
    tools,
    stopWhen: stepCountIs(7),
  });

  // Convert markdown to Slack mrkdwn format
  return text.replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>").replace(/\*\*/g, "*");
};
