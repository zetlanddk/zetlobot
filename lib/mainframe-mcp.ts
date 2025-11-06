import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";

const mcpClient = await createMCPClient({
  transport: {
    type: "http",
    url: "https://api-staging.zetland.dk/api/v1/internal/mcp",
    headers: { "X-Internal-Api-Key": process.env.MAINFRAME_API_KEY! },
  },
});

export const tools = await mcpClient.tools();