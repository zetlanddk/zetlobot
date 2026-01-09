import { createMCPClient } from "@ai-sdk/mcp";
import { getToolConfigs, MCPToolConfig } from "./config";

export type ToolStatus = {
  name: string;
  status: "ok" | "error";
  error?: string;
};

type MCPClientTools = Awaited<ReturnType<Awaited<ReturnType<typeof createMCPClient>>["tools"]>>;

let cachedTools: MCPClientTools | null = null;
let toolStatuses: ToolStatus[] = [];

async function initializeClient(config: MCPToolConfig): Promise<MCPClientTools> {
  console.log(`Initializing MCP client: ${config.name}`);

  const client = await createMCPClient({
    transport: {
      type: "http",
      url: config.url,
      headers: config.headers,
    },
  });

  const tools = await client.tools();
  console.log(`MCP client ${config.name} initialized successfully`);

  return tools;
}

export async function getTools(): Promise<MCPClientTools> {
  if (cachedTools) {
    return cachedTools;
  }

  const configs = getToolConfigs();
  const collectedTools: MCPClientTools[] = [];
  toolStatuses = [];

  for (const config of configs) {
    try {
      const tools = await initializeClient(config);
      collectedTools.push(tools);
      toolStatuses.push({ name: config.name, status: "ok" });
    } catch (error) {
      console.error(`Failed to initialize MCP client ${config.name}:`, error);
      toolStatuses.push({
        name: config.name,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  cachedTools = Object.assign({}, ...collectedTools);
  return cachedTools;
}

export function getToolStatuses(): ToolStatus[] {
  return toolStatuses;
}
