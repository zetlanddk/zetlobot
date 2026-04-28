import { describe, it, expect, vi, beforeEach } from "vitest";

const storeMock = vi.hoisted(() => ({
  consumeResult: null as null | {
    tenantId: string;
    slackTeamId: string;
    slackUserId: string;
    channelId: string;
    threadHint: string | null;
  },
  writeSessionCalls: [] as Array<unknown>,
}));

const oauthMock = vi.hoisted(() => ({
  exchangeError: null as Error | null,
  exchangeResult: {
    supabaseUserId: "supa-u",
    accessToken: "at",
    refreshToken: "rt",
    expiresAt: Date.now() + 3_600_000,
  },
}));

const slackMock = vi.hoisted(() => ({
  ephemeralCalls: [] as Array<unknown>,
  ephemeralError: null as Error | null,
  dmCalls: [] as Array<unknown>,
}));

vi.mock("../../lib/auth/store", () => ({
  consumeState: vi.fn(async () => storeMock.consumeResult),
  writeSession: vi.fn(async (...args: unknown[]) => {
    storeMock.writeSessionCalls.push(args);
  }),
}));

vi.mock("../../lib/auth/supabase-oauth", () => ({
  exchangeCode: vi.fn(async () => {
    if (oauthMock.exchangeError) throw oauthMock.exchangeError;
    return oauthMock.exchangeResult;
  }),
}));

vi.mock("../../lib/slack-utils", () => ({
  client: {
    chat: {
      postEphemeral: vi.fn(async (args: unknown) => {
        if (slackMock.ephemeralError) throw slackMock.ephemeralError;
        slackMock.ephemeralCalls.push(args);
      }),
      postMessage: vi.fn(async (args: unknown) => {
        slackMock.dmCalls.push(args);
      }),
    },
    conversations: {
      open: vi.fn(async () => ({ channel: { id: "D-DM" } })),
    },
  },
}));

import { GET } from "./callback";

beforeEach(() => {
  storeMock.consumeResult = {
    tenantId: "zetland",
    slackTeamId: "T1",
    slackUserId: "U1",
    channelId: "C1",
    threadHint: "1700000000.000100",
  };
  storeMock.writeSessionCalls = [];
  oauthMock.exchangeError = null;
  oauthMock.exchangeResult = {
    supabaseUserId: "supa-u",
    accessToken: "at",
    refreshToken: "rt",
    expiresAt: Date.now() + 3_600_000,
  };
  slackMock.ephemeralCalls = [];
  slackMock.ephemeralError = null;
  slackMock.dmCalls = [];
});

const callback = (qs: string) =>
  GET(new Request(`https://bot.test/api/auth/callback${qs}`));

describe("OAuth callback", () => {
  it("returns 400 when code or nonce is missing", async () => {
    const noCode = await callback("?nonce=abc");
    expect(noCode.status).toBe(400);
    const noNonce = await callback("?code=xyz");
    expect(noNonce.status).toBe(400);
  });

  it("returns 400 when nonce is unknown or replayed", async () => {
    storeMock.consumeResult = null;
    const res = await callback("?code=xyz&nonce=stale");
    expect(res.status).toBe(400);
  });

  it("returns 400 when binding references an unknown tenant", async () => {
    storeMock.consumeResult = {
      tenantId: "ghost",
      slackTeamId: "T1",
      slackUserId: "U1",
      channelId: "C1",
      threadHint: null,
    };
    const res = await callback("?code=xyz&nonce=ok");
    expect(res.status).toBe(400);
  });

  it("returns 502 when exchangeCode throws", async () => {
    oauthMock.exchangeError = new Error("supabase refused");
    const res = await callback("?code=xyz&nonce=ok");
    expect(res.status).toBe(502);
  });

  it("on success: persists session, posts Slack ephemeral, returns 200 HTML", async () => {
    const res = await callback("?code=xyz&nonce=ok");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/html/);
    expect(await res.text()).toContain("You're signed in");

    expect(storeMock.writeSessionCalls).toHaveLength(1);
    const [tenantId, teamId, userId, session] = storeMock.writeSessionCalls[0] as [
      string, string, string, { accessToken: string; refreshToken: string }
    ];
    expect([tenantId, teamId, userId]).toEqual(["zetland", "T1", "U1"]);
    expect(session.accessToken).toBe("at");
    expect(session.refreshToken).toBe("rt");

    expect(slackMock.ephemeralCalls).toHaveLength(1);
  });

  it("falls back to DM when ephemeral posting fails", async () => {
    slackMock.ephemeralError = new Error("user_not_in_channel");
    const res = await callback("?code=xyz&nonce=ok");
    expect(res.status).toBe(200);
    expect(slackMock.dmCalls).toHaveLength(1);
  });
});
