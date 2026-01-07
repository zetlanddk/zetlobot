import { createMCPClient, MCPClient } from "@ai-sdk/mcp";
import { getRequiredEnv } from "../utils";

type HttpTransportConfig = {
  type: "http";
  url: string;
  headers?: Record<string, string>;
};

interface MCPToolConfig {
  name: string;
  transport: HttpTransportConfig;
}

const toolConfigs: MCPToolConfig[] = [
  {
    name: "Mainframe",
    transport: {
      type: "http",
      url: `${getRequiredEnv("MAINFRAME_API_ROOT")}/api/v1/internal/mcp`,
      headers: { "X-Internal-Api-Key": getRequiredEnv("MAINFRAME_API_KEY") },
    },
  },
  {
    name: "Chargebee Knowledge Base",
    transport: {
      type: "http",
      url: getRequiredEnv("CHARGEBEE_KNOWLEDGE_BASE"),
    },
  },
  {
    name: "Chargebee Data Lookup",
    transport: {
      type: "http",
      url: getRequiredEnv("CHARGEBEE_DATA_LOOKUP"),
      headers: {
        Authorization: `Bearer ${getRequiredEnv(
          "CHARGEBEE_DATA_LOOKUP_API_KEY"
        )}`,
      },
    },
  },
];

let cachedTools: Awaited<ReturnType<MCPClient["tools"]>> | null = null;

export async function getTools() {
  if (cachedTools) {
    return cachedTools;
  }

  console.log("Initializing all MCP tools...");

  const allTools: Awaited<ReturnType<MCPClient["tools"]>> = {};

  for (const config of toolConfigs) {
    console.log(`  - ${config.name}`);
    const client = await createMCPClient({ transport: config.transport });
    const tools = await client.tools();
    Object.assign(allTools, tools);
  }

  cachedTools = allTools;
  console.log("All MCP tools initialized");

  return cachedTools;
}
