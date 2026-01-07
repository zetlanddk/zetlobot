import { createMCPClient } from "@ai-sdk/mcp";
import { getRequiredEnv } from "../utils";

// Global variables to store the client and tools
let mcpClient: Awaited<ReturnType<typeof createMCPClient>> | null = null;
let cachedTools: any = null;

async function initializeMCPClient() {
  if (mcpClient && cachedTools) {
    return { client: mcpClient, tools: cachedTools };
  }

  console.log("Initializing CHARGEBEE Knowledge Base");

  const url = getRequiredEnv("CHARGEBEE_KNOWLEDGE_BASE");

  mcpClient = await createMCPClient({
    transport: {
      type: "http",
      url,
    },
  });
  cachedTools = await mcpClient.tools();

  console.log("CHARGEBEE Knowledge Base tools initialized successfully");

  return { client: mcpClient, tools: cachedTools };
}

export async function getTools() {
  const { tools } = await initializeMCPClient();
  return tools;
}
