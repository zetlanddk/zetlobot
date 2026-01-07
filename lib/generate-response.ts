import { openai } from "@ai-sdk/openai";
import { ModelMessage, generateText, stepCountIs } from "ai";
import { getTools as mainframeTools } from "./tools/mainframe";
import { getTools as chargebeeKnowledgeBaseTools } from "./tools/chargebee-knowledge-base";
import { getTools as chargebeeDataLookupTools } from "./tools/chargebee-data-lookup";
import { getSystemPrompt } from "./system-prompt";

export const generateResponse = async (
  messages: ModelMessage[],
  updateStatus?: (status: string) => void
) => {
  const tools = {
    ...(await mainframeTools()),
    ...(await chargebeeDataLookupTools()),
    ...(await chargebeeKnowledgeBaseTools()),
  };

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
