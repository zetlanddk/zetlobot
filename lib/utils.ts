const ThinkingEmojis = ["🤔", "💭", "🧐", "🔍", "🤖"];

export const randomThinkingEmoji = () => {
  return ThinkingEmojis[Math.floor(Math.random() * ThinkingEmojis.length)];
};

const ThinkingReactions = [
  "thinking_face",
  "thought_balloon",
  "face_with_monocle",
  "mag",
  "robot_face",
];

export const randomThinkingReaction = () => {
  return ThinkingReactions[Math.floor(Math.random() * ThinkingReactions.length)];
};
