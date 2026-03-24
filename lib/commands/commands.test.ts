import { describe, it, expect } from "vitest";
import { commands, getHelpText } from "./commands";

describe("commands", () => {
  it("should generate prompts with user input", () => {
    expect(commands["/member"].prompt("test@example.com")).toBe(
      "Look up user: test@example.com",
    );
    expect(commands["/impersonate"].prompt("test@example.com")).toBe(
      "Generate a magic login link for user: test@example.com",
    );
  });

  it("should include all commands in help text", () => {
    const help = getHelpText();
    for (const cmd of Object.values(commands)) {
      expect(help).toContain(cmd.usage);
      expect(help).toContain(cmd.description);
    }
    expect(help).toContain("/help");
  });
});
