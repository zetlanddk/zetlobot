import { createMCPClient, MCPClient } from "@ai-sdk/mcp";

type HttpTransportConfig = {
  type: "http";
  url: string;
  headers?: Record<string, string>;
};

interface MCPToolConfig {
  name: string;
  transport: HttpTransportConfig;
}

/**
 * Creates a cached MCP tool getter. The client and tools are lazily initialized
 * on first call and cached for subsequent calls.
 */
export function createMCPTool(config: MCPToolConfig) {
  let mcpClient: Awaited<ReturnType<typeof createMCPClient>> | null = null;
  let cachedTools: Awaited<ReturnType<MCPClient["tools"]>> | null = null;

  async function initializeClient() {
    if (mcpClient && cachedTools) {
      return { client: mcpClient, tools: cachedTools };
    }

    console.log(`Initializing MCP client: ${config.name}`);

    mcpClient = await createMCPClient({ transport: config.transport });
    cachedTools = await mcpClient.tools();

    console.log(`MCP client initialized: ${config.name}`);

    return { client: mcpClient, tools: cachedTools };
  }

  return {
    async getTools() {
      const { tools } = await initializeClient();
      return tools;
    },
  };
}
