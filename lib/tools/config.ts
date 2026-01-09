import { getRequiredEnv } from "../utils";

export type MCPToolConfig = {
  name: string;
  url: string;
  headers?: Record<string, string>;
};

export function getToolConfigs(): MCPToolConfig[] {
  return [
    {
      name: "mainframe",
      url: `${getRequiredEnv("MAINFRAME_API_ROOT")}/api/v1/internal/mcp`,
      headers: { "X-Internal-Api-Key": getRequiredEnv("MAINFRAME_API_KEY") },
    },
    {
      name: "chargebee-data-lookup",
      url: getRequiredEnv("CHARGEBEE_DATA_LOOKUP"),
      headers: { Authorization: `Bearer ${getRequiredEnv("CHARGEBEE_DATA_LOOKUP_API_KEY")}` },
    },
    {
      name: "chargebee-knowledge-base",
      url: getRequiredEnv("CHARGEBEE_KNOWLEDGE_BASE"),
    },
    {
      name: "pager duty",
      url: "https://mcp.pagerduty.com/mcp",
      headers: { Authorization: `Token ${getRequiredEnv("PAGER_DUTY_API_KEY")}` },
    }
  ];
}
