import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";

export const mainframe = createMCPClient({
  transport: {
    type: "http",
    url: "https://api-staging.zetland.dk/api/v1/internal/mcp",
    headers: { "X-Internal-Api-Key": process.env.MAINFRAME_API_KEY! },
  },
});