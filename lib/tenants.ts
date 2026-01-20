import { getZetlandSystemPrompt } from "./system-prompts/zetland";

const tenants = [
  {
    id: "zetland",
    channelIds: ["C09QRDLKV8F"],
    mainframeApiRoot: "https://api.zetland.dk",
    chargebeeDataLookup: "https://zetland.mcp.eu.chargebee.com/data_lookup_agent",
    chargebeeKnowledgeBase: "https://zetland.mcp.eu.chargebee.com/knowledge_base_agent",
    getSystemPrompt: getZetlandSystemPrompt,
  },
] as const;

export type TenantId = (typeof tenants)[number]["id"];

export type TenantConfig = (typeof tenants)[number];

export type TenantSecrets = {
  mainframeApiKey: string;
  chargebeeApiKey: string;
};

export function getTenantByChannelId(channelId: string): TenantConfig | null {
  return tenants.find((t) => (t.channelIds as readonly string[]).includes(channelId)) ?? null;
}

export function getTenantById(tenantId: TenantId): TenantConfig | null {
  return tenants.find((t) => t.id === tenantId) ?? null;
}

export function getTenantSecrets(tenantId: TenantId): TenantSecrets {
  const prefix = tenantId.toUpperCase();
  const mainframeApiKey = process.env[`${prefix}_MAINFRAME_API_KEY`];
  const chargebeeApiKey = process.env[`${prefix}_CHARGEBEE_DATA_LOOKUP_API_KEY`];

  if (!mainframeApiKey) {
    throw new Error(`Missing ${prefix}_MAINFRAME_API_KEY environment variable`);
  }
  if (!chargebeeApiKey) {
    throw new Error(`Missing ${prefix}_CHARGEBEE_DATA_LOOKUP_API_KEY environment variable`);
  }

  return { mainframeApiKey, chargebeeApiKey };
}
