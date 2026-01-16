const ThinkingEmojis = ["🤔", "💭", "🧐", "🔍", "🤖"];

export const randomThinkingEmoji = () => {
  return ThinkingEmojis[Math.floor(Math.random() * ThinkingEmojis.length)];
};
