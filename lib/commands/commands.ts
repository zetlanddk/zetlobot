type Command = {
  prompt: (text: string) => string;
  description: string;
  usage: string;
};

export const commands: Record<string, Command> = {
  "/lookup": {
    prompt: (text) => `Look up user: ${text}`,
    description: "Look up a user in the system",
    usage: "/lookup <email or name>",
  },
  "/impersonate": {
    prompt: (text) => `Generate a magic login link for user: ${text}`,
    description: "Generate a magic login link for a user",
    usage: "/impersonate <email or name>",
  },
};

export function getHelpText(): string {
  const lines = Object.values(commands).map(
    (cmd) => `*${cmd.usage}*\n${cmd.description}`,
  );
  lines.push("*/help*\nShow this help message");
  return `*Available commands:*\n\n${lines.join("\n\n")}`;
}
