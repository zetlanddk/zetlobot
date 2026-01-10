import { getAllowedChannelIds } from "./config";

const ThinkingEmojis = ["🤔", "💭", "🧐", "🔍", "🤖"]; 

export const randomThinkingEmoji = () => {
  return ThinkingEmojis[Math.floor(Math.random() * ThinkingEmojis.length)];
}

/**
 * Check if a channel is whitelisted.
 * Whitelist is defined via ALLOWED_CHANNEL_IDS env variable as comma-separated channel IDs.
 * If no whitelist is configured, all channels are allowed.
 */
export const isChannelWhitelisted = (channelId: string): boolean => {
  const allowedChannels = getAllowedChannelIds();
  
  // If no whitelist is configured, allow all channels
  if (!allowedChannels) {
    return true;
  }
  
  return allowedChannels.includes(channelId);
}
