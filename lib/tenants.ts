import { getZetlandSystemPrompt } from "./system-prompts/zetland";

export type TenantConfig = {
  id: string;
  channelIds: string[];
  mainframeApiRoot: string;
  chargebeeDataLookup: string;
  chargebeeKnowledgeBase: string;
  getSystemPrompt: () => string;
};

export type TenantSecrets = {
  mainframeApiKey: string;
  chargebeeApiKey: string;
};

const tenants: TenantConfig[] = [
  {
    id: "zetland",
    channelIds: ["C09QRDLKV8F"],
    mainframeApiRoot: "https://api-staging.zetland.dk",
    chargebeeDataLookup: "https://zetland-test.mcp.eu.chargebee.com/data_lookup_agent",
    chargebeeKnowledgeBase: "https://zetland-test.mcp.eu.chargebee.com/knowledge_base_agent",
    getSystemPrompt: getZetlandSystemPrompt,
  },
];

export function getTenantByChannelId(channelId: string): TenantConfig | null {
  return tenants.find((t) => t.channelIds.includes(channelId)) ?? null;
}

export function getTenantById(tenantId: string): TenantConfig | null {
  return tenants.find((t) => t.id === tenantId) ?? null;
}

export function getTenantSecrets(tenantId: string): TenantSecrets {
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
