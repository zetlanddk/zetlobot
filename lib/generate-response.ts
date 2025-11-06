import { openai } from "@ai-sdk/openai";
import { CoreMessage, generateText } from "ai";
import { mainframe } from "./mainframe-mcp.js";

export const generateResponse = async (
  messages: CoreMessage[],
  updateStatus?: (status: string) => void
) => {
  const client = await mainframe;
  const tools = await client.tools();
  const { text } = await generateText({
    model: openai("gpt-4o"),
    system: `You are a Slack bot assistant for the Zetland media company. Keep your responses concise and to the point.
    - Do not tag users.
    - Current date is: ${new Date().toISOString().split("T")[0]}
    - Put sources inline if possible.`,
    messages,
    maxSteps: 10,
    tools: tools,
  });

  // Convert markdown to Slack mrkdwn format
  return text.replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>").replace(/\*\*/g, "*");
};
