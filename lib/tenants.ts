import { buildSystemPrompt } from "./buildSystemPrompt";

export type Shortcut = { trigger: string; action: string };

const zetlandShortcuts: readonly Shortcut[] = [
  {
    trigger: "medlem <mail/id>",
    action: "Slå brugerens profil og abonnementsinfo op.",
  },
  {
    trigger: "virksomhed <id>",
    action:
      "Slå virksomhedsdetaljer op: navn, administratorer, medarbejdere og ChargeBee-link.",
  },
  {
    trigger: "send gave <gavekode> til <mail>",
    action:
      "Send en eksisterende gavekode til en e-mailadresse. Bekræft før afsendelse.",
  },
  {
    trigger: "lav <antal> gavekoder på <antal> måneder til <navn>",
    action: "Opret gavekoder. Maks 50 ad gangen. Bekræft før oprettelse.",
  },
  {
    trigger: "jeg er <medlem>",
    action: "Generér et impersonations-magic-link. Advar om at logge ud bagefter.",
  },
  {
    trigger: "<medlem> vil gerne logge ind med email",
    action: "Flet duplikerede brugerkonti. Bekræft før eksekvering.",
  },
  {
    trigger: "skift email fra <mail> til <mail>",
    action: "Skift brugerens e-mailadresse. Bekræft før eksekvering.",
  },
  {
    trigger: "lav GDPR-sletning for <id>",
    action:
      "Udfør GDPR-sletning. Bekræft altid først. Kan fejle hvis brugeren har aktive abonnementer.",
  },
] as const;

const tenants = [
  {
    id: "zetland",
    channels: [
      { id: "C09QRDLKV8F", autoRespond: true },
      { id: "GDNFV3SMP", autoRespond: true },
    ],
    mainframeApiRoot: "https://api.zetland.dk",
    supabaseUrl: "https://db.zetland.dk",
    chargebeeSite: "zetland",
    language: "Danish",
    shortcuts: zetlandShortcuts,
    getSystemPrompt: () =>
      buildSystemPrompt({
        chargebeeSite: "zetland",
        language: "Danish",
        shortcuts: zetlandShortcuts,
      }),
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
