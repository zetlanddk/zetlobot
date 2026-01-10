import { z } from "zod";

const envSchema = z.object({
  // Slack configuration
  SLACK_BOT_TOKEN: z.string().min(1, "SLACK_BOT_TOKEN is required"),
  SLACK_SIGNING_SECRET: z.string().min(1, "SLACK_SIGNING_SECRET is required"),

  // MCP Tool configurations
  MAINFRAME_API_ROOT: z.string().url("MAINFRAME_API_ROOT must be a valid URL"),
  MAINFRAME_API_KEY: z.string().min(1, "MAINFRAME_API_KEY is required"),
  CHARGEBEE_DATA_LOOKUP: z.string().url("CHARGEBEE_DATA_LOOKUP must be a valid URL"),
  CHARGEBEE_DATA_LOOKUP_API_KEY: z.string().min(1, "CHARGEBEE_DATA_LOOKUP_API_KEY is required"),
  CHARGEBEE_KNOWLEDGE_BASE: z.string().url("CHARGEBEE_KNOWLEDGE_BASE must be a valid URL"),
  PAGER_DUTY_API_KEY: z.string().min(1, "PAGER_DUTY_API_KEY is required"),

  // Optional: Channel whitelist (comma-separated channel IDs)
  ALLOWED_CHANNEL_IDS: z.string().optional(),
});

function parseEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.format();
    const errors = Object.entries(formatted)
      .filter(([key]) => key !== "_errors")
      .map(([key, value]) => {
        const messages = (value as { _errors: string[] })._errors;
        return `  ${key}: ${messages.join(", ")}`;
      })
      .join("\n");

    throw new Error(`Environment validation failed:\n${errors}`);
  }

  return result.data;
}

// Parse and export the validated config
export const env = parseEnv();

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
