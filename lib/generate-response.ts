import { openai } from "@ai-sdk/openai";
import { CoreMessage, generateText } from "ai";
import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export const generateResponse = async (
  messages: CoreMessage[],
  updateStatus?: (status: string) => void
) => {
  const transport = new StreamableHTTPClientTransport(
    new URL("/api/v1/internal/mcp", process.env.MAINFRAME_API_ROOT),
    {
      requestInit: {
        headers: { "X-Internal-Api-Key": process.env.MAINFRAME_API_KEY! },
      },
    }
  );

  const client = await createMCPClient({ transport });
  const tools = await client.tools();

  const { text } = await generateText({
    model: openai("gpt-4o"),
    system: `You are a Slack bot assistant for the Zetland media company. Keep your responses concise and to the point.
    - Do not tag users.
    - Current date is: ${new Date().toISOString().split("T")[0]}
    - Put sources inline if possible.`,
    messages,
    tools: tools,
  });

  // Convert markdown to Slack mrkdwn format
  return text.replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>").replace(/\*\*/g, "*");
};
