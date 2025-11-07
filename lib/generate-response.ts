import { openai } from "@ai-sdk/openai";
import { CoreMessage, generateText, stepCountIs } from "ai";
import { getTools } from "./tools";

export const generateResponse = async (
  messages: CoreMessage[],
  updateStatus?: (status: string) => void
) => {
  const tools = await getTools();

  const { text } = await generateText({
    model: openai("gpt-4o"),
    system: `You are a Slack bot assistant for the Zetland media company. 
    - Keep your responses concise and to the point.
    - Use a friendly and professional tone.
    - Use Slack markdown formatting.
    - When relevant, use the provided tools to fetch up-to-date information.
    - Cite your sources when providing factual information.
    - If you use a tool, mention it in your response.
    - If you don't know the answer, admit it instead of making something up.
    - Be honest about your limitations.
    - Use lots of emojis to make your messages engaging.
    - Do not tag users.
    - Current date is: ${new Date().toISOString().split("T")[0]}
    - Put sources inline if possible.`,
    messages,
    tools,
    stopWhen: stepCountIs(5),
  });

  // Convert markdown to Slack mrkdwn format
  return text.replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>").replace(/\*\*/g, "*");
};
