import { openai } from "@ai-sdk/openai";
import { CoreMessage, generateText, stepCountIs } from "ai";
import { getTools as mainframeTools } from "./tools/mainframe";
import { getTools as chargebeeKnowledgeBaseTools } from "./tools/chargebee-knowlege-base";
import { getTools as chargebeeDataLookupTools } from "./tools/chargebee-data-lookup";
import { getSystemPrompt } from "./system-prompt";

export const generateResponse = async (
  messages: CoreMessage[],
  updateStatus?: (status: string) => void
) => {
  const tools = {
    ...(await mainframeTools()),
    ...(await chargebeeKnowledgeBaseTools()),
    ...(await chargebeeDataLookupTools()),
  };

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
