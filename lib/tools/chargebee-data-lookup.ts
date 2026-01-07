import { createMCPClient } from "@ai-sdk/mcp";
import { getRequiredEnv } from "../utils";

// Global variables to store the client and tools
let mcpClient: Awaited<ReturnType<typeof createMCPClient>> | null = null;
let cachedTools: any = null;

async function initializeMCPClient() {
  if (mcpClient && cachedTools) {
    return { client: mcpClient, tools: cachedTools };
  }

  console.log("Initializing CHARGEBEE Data Lookup");

  const url = getRequiredEnv("CHARGEBEE_DATA_LOOKUP");
  const apiKey = getRequiredEnv("CHARGEBEE_DATA_LOOKUP_API_KEY");

  mcpClient = await createMCPClient({
    transport: {
      type: "http",
      url,
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
