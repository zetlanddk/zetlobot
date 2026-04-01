import { config } from "dotenv";
import { resolve } from "path";

// Load .env.local for local development
config({ path: resolve(__dirname, ".env.local") });

// Provide test defaults for required env vars so env-validating modules
// can be imported without a real env file.
const testDefaults: Record<string, string> = {
  SLACK_BOT_TOKEN: "xoxb-test",
  SLACK_SIGNING_SECRET: "test-signing-secret",
  PAGER_DUTY_API_KEY: "test-pagerduty-key",
};

for (const [key, value] of Object.entries(testDefaults)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}
