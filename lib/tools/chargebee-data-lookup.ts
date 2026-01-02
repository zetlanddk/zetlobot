import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Global variables to store the client and tools
let mcpClient: Awaited<ReturnType<typeof createMCPClient>> | null = null;
let cachedTools: any = null;

async function initializeMCPClient() {
  if (mcpClient && cachedTools) {
    return { client: mcpClient, tools: cachedTools };
  }

  console.log("Initializing MCP client and tools...");
  
  const transport = new StreamableHTTPClientTransport(
    new URL(process.env.CHARGEBEE_DATA_LOOKUP!),
    {
      requestInit: {
        headers: { "Authorization": `Bearer ${process.env.CHARGEBEE_DATA_LOOKUP_API_KEY!}` },
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
