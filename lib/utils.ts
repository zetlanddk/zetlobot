const ThinkingEmojis = ["🤔", "💭", "🧐", "🔍", "🤖"]; 

export const randomThinkingEmoji = () => {
  return ThinkingEmojis[Math.floor(Math.random() * ThinkingEmojis.length)];
}

/**
 * Get a required environment variable or throw if missing
 */
export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Validate that all required environment variables are set
 * Call this at startup to fail fast
 */
export function validateRequiredEnvVars(names: string[]): void {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

/**
 * Check if a channel is whitelisted.
 * Whitelist is defined via ALLOWED_CHANNEL_IDS env variable as comma-separated channel IDs.
 * If no whitelist is configured, all channels are allowed.
 */
export const isChannelWhitelisted = (channelId: string): boolean => {
  const allowedChannels = process.env.ALLOWED_CHANNEL_IDS;
  
  // If no whitelist is configured, allow all channels
  if (!allowedChannels || allowedChannels.trim() === "") {
    return true;
  }
  
  const channelList = allowedChannels.split(",").map((id) => id.trim());
  return channelList.includes(channelId);
}
