import { CommandHandler } from "../types";

const commands = [
  { command: "/lookup", usage: "/lookup <email or name>", description: "Look up a user in the system" },
  { command: "/impersonate", usage: "/impersonate <email or name>", description: "Generate a magic login link for a user" },
  { command: "/help", usage: "/help", description: "Show this help message" },
];

export const helpHandler: CommandHandler = async () => {
  const lines = commands.map(
    (cmd) => `*${cmd.usage}*\n${cmd.description}`,
  );

  return {
    text: `*Available commands:*\n\n${lines.join("\n\n")}`,
    response_type: "ephemeral",
  };
};
