import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getRequiredEnv } from "../utils";

// Global variables to store the client and tools
let mcpClient: Awaited<ReturnType<typeof createMCPClient>> | null = null;
let cachedTools: any = null;

async function initializeMCPClient() {
  if (mcpClient && cachedTools) {
    return { client: mcpClient, tools: cachedTools };
  }

  console.log("Initializing MCP client and tools...");

  const apiRoot = getRequiredEnv("MAINFRAME_API_ROOT");
  const apiKey = getRequiredEnv("MAINFRAME_API_KEY");
  
  const transport = new StreamableHTTPClientTransport(
    new URL("/api/v1/internal/mcp", apiRoot),
    {
      requestInit: {
        headers: { "X-Internal-Api-Key": apiKey },
      },
    }
  );

  mcpClient = await createMCPClient({ transport });
  cachedTools = await mcpClient.tools();
  
  console.log("MCP client and tools initialized successfully");
  
  return { client: mcpClient, tools: cachedTools };
}

export async function getTools() {
  const { tools } = await initializeMCPClient();
  return tools;
}
