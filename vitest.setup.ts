import { config } from "dotenv";
import { resolve } from "path";

// Load .env.local for local development
config({ path: resolve(__dirname, ".env.local") });

// Stub env vars that tests assert against, so runs are hermetic regardless
// of what `.env.local` contains on the developer's machine.
const testDefaults: Record<string, string> = {
  SLACK_BOT_TOKEN: "xoxb-test",
  SLACK_SIGNING_SECRET: "test-signing-secret",
  BOT_PUBLIC_URL: "https://bot.test",
  KV_REST_API_URL: "https://kv.test",
  KV_REST_API_TOKEN: "kv-test-token",
  ZETLAND_MAINFRAME_API_KEY: "test-mainframe-key",
  ZETLAND_SUPABASE_ANON_KEY: "test-anon-key",
};

for (const [key, value] of Object.entries(testDefaults)) {
  process.env[key] = value;
}
