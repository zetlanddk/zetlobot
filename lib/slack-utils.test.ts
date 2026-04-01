import { describe, it, expect } from "vitest";
import { stripSlackLinks } from "./slack-utils";

describe("stripSlackLinks", () => {
  it("unwraps mailto links to the label (the bug this PR fixes)", () => {
    expect(stripSlackLinks("Email <mailto:joern@zetland.dk|joern@zetland.dk>")).toBe(
      "Email joern@zetland.dk",
    );
  });

  it("unwraps labeled URL links", () => {
    expect(stripSlackLinks("Visit <https://example.com|example.com>")).toBe(
      "Visit example.com",
    );
  });

  it("uses the display label when it differs from the URL", () => {
    expect(stripSlackLinks("<mailto:joern@zetland.dk|Jørn Sandager>")).toBe(
      "Jørn Sandager",
    );
  });

  it("handles multiple links in one string", () => {
    expect(
      stripSlackLinks("<mailto:a@b.com|a@b.com> and <https://x.com|x>"),
    ).toBe("a@b.com and x");
  });

  it("unwraps user mentions with a display name", () => {
    expect(stripSlackLinks("<@U123|joern> ping")).toBe("joern ping");
  });

  it("unwraps channel mentions with a name", () => {
    expect(stripSlackLinks("Posted in <#C123|general>")).toBe("Posted in general");
  });

  it("leaves text without links unchanged", () => {
    expect(stripSlackLinks("plain text with no links")).toBe("plain text with no links");
  });

  it("returns the empty string unchanged", () => {
    expect(stripSlackLinks("")).toBe("");
  });

  // The patterns below are NOT handled (the regex only matches labeled forms).
  // Pinning current behavior so future regex changes are intentional.
  it("does NOT unwrap bare URLs (no pipe/label)", () => {
    expect(stripSlackLinks("<https://example.com>")).toBe("<https://example.com>");
  });

  it("does NOT unwrap bare user mentions", () => {
    expect(stripSlackLinks("Hi <@U123>!")).toBe("Hi <@U123>!");
  });

  it("does NOT unwrap special mentions like <!here>", () => {
    expect(stripSlackLinks("<!here> please review")).toBe("<!here> please review");
  });
});
