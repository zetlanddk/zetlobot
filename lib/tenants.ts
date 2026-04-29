import { buildSystemPrompt } from "./buildSystemPrompt";

const tenants = [
  {
    id: "zetland",
    channels: [
      { id: "C09QRDLKV8F", autoRespond: true },
      { id: "GDNFV3SMP" },
    ],
    mainframeApiRoot: "https://api.zetland.dk",
    supabaseUrl: "https://db.zetland.dk",
    chargebeeSite: "zetland",
    language: "Danish",
    getSystemPrompt: () =>
      buildSystemPrompt({ chargebeeSite: "zetland", language: "Danish" }),
  },
] as const;

export type TenantId = (typeof tenants)[number]["id"];

export type TenantConfig = (typeof tenants)[number];

export type TenantSecrets = {
  mainframeApiKey: string;
  supabaseAnonKey: string;
};

export function getTenantByChannelId(channelId: string): TenantConfig | null {
  return tenants.find((t) => t.channels.some((c) => c.id === channelId)) ?? null;
}

export function getTenantById(tenantId: TenantId): TenantConfig | null {
  return tenants.find((t) => t.id === tenantId) ?? null;
}

export function isAutoRespondEnabled(tenantId: TenantId, channelId: string): boolean {
  const tenant = getTenantById(tenantId);
  const channel = tenant?.channels.find((c) => c.id === channelId);
  return channel != null && "autoRespond" in channel && channel.autoRespond === true;
}

export function getTenantSecrets(tenantId: TenantId): TenantSecrets {
  const prefix = tenantId.toUpperCase();
  const mainframeApiKey = process.env[`${prefix}_MAINFRAME_API_KEY`];
  const supabaseAnonKey = process.env[`${prefix}_SUPABASE_ANON_KEY`];

  if (!mainframeApiKey) {
    throw new Error(`Missing ${prefix}_MAINFRAME_API_KEY environment variable`);
  }
  if (!supabaseAnonKey) {
    throw new Error(`Missing ${prefix}_SUPABASE_ANON_KEY environment variable`);
  }

  return { mainframeApiKey, supabaseAnonKey };
}
