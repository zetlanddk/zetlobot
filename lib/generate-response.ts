import { openai } from "@ai-sdk/openai";
import { CoreMessage, generateText } from "ai";
import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";

const mainframe = createMCPClient({
  transport: {
    type: "http",
    url: "https://api-staging.zetland.dk/api/v1/internal/mcp",
    headers: { "X-Internal-Api-Key": process.env.MAINFRAME_API_KEY! },
  },
});

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
