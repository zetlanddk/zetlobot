import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { GenericMessageEvent } from "@slack/web-api";

const aiMock = vi.hoisted(() => ({
  generateTextCalls: 0,
}));

vi.mock("ai", () => ({
  generateText: vi.fn(async () => {
    aiMock.generateTextCalls += 1;
    throw new Error(
      "generateText should not be invoked when a deterministic short-circuit applies",
    );
  }),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn(() => ({})),
}));

vi.mock("./slack-utils", async () => {
  const actual = await vi.importActual<typeof import("./slack-utils")>("./slack-utils");
  return {
    ...actual,
    isBotInThread: vi.fn(async () => false),
  };
});

import { shouldRespond } from "./should-respond";

const BOT_ID = "UBOT";
const SHORTCUTS = [{ trigger: "medlem <mail/id>", action: "..." }] as const;

function makeEvent(text: string, overrides: Partial<GenericMessageEvent> = {}): GenericMessageEvent {
  return {
    type: "message",
    channel: "C1",
    user: "U1",
    text,
    ts: "1",
    event_ts: "1",
    channel_type: "channel",
    ...overrides,
  } as GenericMessageEvent;
}

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  aiMock.generateTextCalls = 0;
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
});

describe("shouldRespond deterministic short-circuits", () => {
  it("returns false for an empty message after stripping the bot mention", async () => {
    const result = await shouldRespond(makeEvent(`<@${BOT_ID}>`), BOT_ID, SHORTCUTS);
    expect(result).toBe(false);
    expect(aiMock.generateTextCalls).toBe(0);
  });

  it("returns false when the message starts with another user's mention", async () => {
    const result = await shouldRespond(
      makeEvent("<@U987SILJE> Har du adgang til Zetland? :smile:"),
      BOT_ID,
      SHORTCUTS,
    );
    expect(result).toBe(false);
    expect(aiMock.generateTextCalls).toBe(0);
  });

  it("returns false for a leading other-user mention with display name", async () => {
    const result = await shouldRespond(
      makeEvent("<@U987SILJE|silje> kan du tjekke det?"),
      BOT_ID,
      SHORTCUTS,
    );
    expect(result).toBe(false);
    expect(aiMock.generateTextCalls).toBe(0);
  });

  it("returns false for a leading plain-text @name (typed without autocomplete)", async () => {
    const result = await shouldRespond(
      makeEvent("@niels Fik du svar på dit spørgsmål?"),
      BOT_ID,
      SHORTCUTS,
    );
    expect(result).toBe(false);
    expect(aiMock.generateTextCalls).toBe(0);
  });

  it("returns false for a leading plain-text @name with dots/hyphens", async () => {
    const result = await shouldRespond(
      makeEvent("@niels.kloster kan du tjekke?"),
      BOT_ID,
      SHORTCUTS,
    );
    expect(result).toBe(false);
    expect(aiMock.generateTextCalls).toBe(0);
  });

  it("does not short-circuit on a mid-message email containing @", async () => {
    const result = await shouldRespond(
      makeEvent("medlem niels@zetland.dk"),
      BOT_ID,
      SHORTCUTS,
    );
    // No leading @name → classifier runs (and throws in tests).
    expect(result).toBe(false);
    expect(aiMock.generateTextCalls).toBe(1);
  });

  it("falls through to the classifier when the message starts with text, not a mention", async () => {
    // The mocked classifier throws; that's how we assert the short-circuits
    // didn't fire. The function catches the error and returns false via the
    // classifier_error branch.
    const result = await shouldRespond(
      makeEvent("hahha, jeg har medlemskab på siljebroenderup@gmail.com"),
      BOT_ID,
      SHORTCUTS,
    );
    expect(result).toBe(false);
    expect(aiMock.generateTextCalls).toBe(1);
  });

  it("does not short-circuit when another user is mentioned mid-message", async () => {
    const result = await shouldRespond(
      makeEvent("kan <@U987> hjælpe med en gavekode?"),
      BOT_ID,
      SHORTCUTS,
    );
    // Short-circuit should not trigger; classifier runs (and throws in tests).
    expect(result).toBe(false);
    expect(aiMock.generateTextCalls).toBe(1);
  });
});
