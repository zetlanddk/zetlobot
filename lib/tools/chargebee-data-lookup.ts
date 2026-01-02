import { createMCPClient } from "@ai-sdk/mcp";

// Global variables to store the client and tools
let mcpClient: Awaited<ReturnType<typeof createMCPClient>> | null = null;
let cachedTools: any = null;

async function initializeMCPClient() {
  if (mcpClient && cachedTools) {
    return { client: mcpClient, tools: cachedTools };
  }

  console.log("Initializing CHARGEBEE Data Lookup");

  mcpClient = await createMCPClient({
    transport: {
      type: "http",
      url: process.env.CHARGEBEE_DATA_LOOKUP_API_URL!,
      headers: {
        Authorization: "Bearer " + process.env.CHARGEBEE_DATA_LOOKUP_API_KEY!,
      },
    },
  });
  cachedTools = await mcpClient.tools();

  console.log("CHARGEBEE Data Lookup tools initialized successfully");

  return { client: mcpClient, tools: cachedTools };
}

export async function getTools() {
  const { tools } = await initializeMCPClient();
  return tools;
}
