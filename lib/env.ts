import { z } from "zod";

const envSchema = z.object({
  // Global Slack configuration
  SLACK_BOT_TOKEN: z.string().min(1, "SLACK_BOT_TOKEN is required"),
  SLACK_SIGNING_SECRET: z.string().min(1, "SLACK_SIGNING_SECRET is required"),

  // Public origin used to build OAuth redirect URLs (e.g. https://bot.zetland.dk).
  // Trailing slash is fine — paths are joined via `new URL(path, base)`.
  BOT_PUBLIC_URL: z.string().url("BOT_PUBLIC_URL must be a fully qualified URL"),

  // Upstash Redis (provisioned via Vercel Marketplace; legacy "Vercel KV" naming)
  KV_REST_API_URL: z.string().url("KV_REST_API_URL must be a fully qualified URL"),
  KV_REST_API_TOKEN: z.string().min(1, "KV_REST_API_TOKEN is required"),
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

// Parse and export the validated env
export const env = parseEnv();
