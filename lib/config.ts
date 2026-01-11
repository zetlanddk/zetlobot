import { env } from "./env";

// Helper to get allowed channel IDs as an array
export function getAllowedChannelIds(): string[] | null {
  if (!env.ALLOWED_CHANNEL_IDS || env.ALLOWED_CHANNEL_IDS.trim() === "") {
    return null;
  }
  return env.ALLOWED_CHANNEL_IDS.split(",").map((id) => id.trim());
}

// MCP Tool configuration type
export type MCPToolConfig = {
  name: string;
  url: string;
  headers?: Record<string, string>;
};

// Get MCP tool configurations
export function getToolConfigs(): MCPToolConfig[] {
  return [
    {
      name: "mainframe",
      url: `${env.MAINFRAME_API_ROOT}/api/v1/internal/mcp`,
      headers: { "X-Internal-Api-Key": env.MAINFRAME_API_KEY },
    },
    {
      name: "chargebee-data-lookup",
      url: env.CHARGEBEE_DATA_LOOKUP,
      headers: { Authorization: `Bearer ${env.CHARGEBEE_DATA_LOOKUP_API_KEY}` },
    },
    {
      name: "chargebee-knowledge-base",
      url: env.CHARGEBEE_KNOWLEDGE_BASE,
    },
    {
      name: "pager duty",
      url: "https://mcp.pagerduty.com/mcp",
      headers: { Authorization: `Token ${env.PAGER_DUTY_API_KEY}` },
    },
  ];
}
