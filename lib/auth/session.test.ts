import { describe, it, expect, vi, beforeEach } from "vitest";

type SessionLike = {
  supabaseUserId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

const storeMock = vi.hoisted(() => ({
  readResult: null as SessionLike | null,
  writeCalls: [] as Array<[string, string, string, SessionLike]>,
  deleteCalls: [] as Array<[string, string, string]>,
}));

const oauthMock = vi.hoisted(() => ({
  beginCalls: [] as Array<unknown>,
  beginUrl: "https://example.com/signin",
  refreshResult: null as null | {
    supabaseUserId: string;
    email: string | null;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  },
}));

vi.mock("./store", () => ({
  readSession: vi.fn(async () => storeMock.readResult),
  writeSession: vi.fn(async (tenantId: string, teamId: string, userId: string, session: SessionLike) => {
    storeMock.writeCalls.push([tenantId, teamId, userId, session]);
  }),
  deleteSession: vi.fn(async (tenantId: string, teamId: string, userId: string) => {
    storeMock.deleteCalls.push([tenantId, teamId, userId]);
  }),
}));

vi.mock("./supabase-oauth", () => ({
  beginOAuth: vi.fn(async (params: unknown) => {
    oauthMock.beginCalls.push(params);
    return { signInUrl: oauthMock.beginUrl };
  }),
  refreshSupabaseSession: vi.fn(async () => oauthMock.refreshResult),
}));

import { ensureSupabaseSession, forceRefresh } from "./session";

beforeEach(() => {
  storeMock.readResult = null;
  storeMock.writeCalls = [];
  storeMock.deleteCalls = [];
  oauthMock.beginCalls = [];
  oauthMock.refreshResult = null;
});

const input = {
  tenantId: "zetland" as const,
  slackTeamId: "T1",
  slackUserId: "U1",
  channelId: "C1",
  threadHint: null,
};

describe("ensureSupabaseSession", () => {
  it("returns needs_auth + sign-in URL when no session row exists", async () => {
    const result = await ensureSupabaseSession(input);
    expect(result).toEqual({ kind: "needs_auth", signInUrl: oauthMock.beginUrl });
    expect(oauthMock.beginCalls).toHaveLength(1);
  });

  it("returns cached access token when session is fresh", async () => {
    storeMock.readResult = {
      supabaseUserId: "supa-u",
      accessToken: "fresh-jwt",
      refreshToken: "r-1",
      expiresAt: Date.now() + 600_000,
    };
    const result = await ensureSupabaseSession(input);
    expect(result).toEqual({ kind: "ok", accessToken: "fresh-jwt" });
    expect(storeMock.writeCalls).toHaveLength(0);
  });

  it("refreshes proactively when access token expires within the skew window", async () => {
    storeMock.readResult = {
      supabaseUserId: "supa-u",
      accessToken: "stale-jwt",
      refreshToken: "r-old",
      expiresAt: Date.now() + 30_000,
    };
    oauthMock.refreshResult = {
      supabaseUserId: "supa-u",
      email: null,
      accessToken: "new-jwt",
      refreshToken: "r-new",
      expiresAt: Date.now() + 3_600_000,
    };
    const result = await ensureSupabaseSession(input);
    expect(result).toEqual({ kind: "ok", accessToken: "new-jwt" });
    expect(storeMock.writeCalls).toHaveLength(1);
    expect(storeMock.writeCalls[0][3]).toMatchObject({
      accessToken: "new-jwt",
      refreshToken: "r-new",
    });
  });

  it("returns needs_auth when refresh fails (refresh token revoked)", async () => {
    storeMock.readResult = {
      supabaseUserId: "supa-u",
      accessToken: "stale-jwt",
      refreshToken: "r-old",
      expiresAt: Date.now() + 30_000,
    };
    oauthMock.refreshResult = null;
    const result = await ensureSupabaseSession(input);
    expect(result.kind).toBe("needs_auth");
    expect(storeMock.deleteCalls).toEqual([["zetland", "T1", "U1"]]);
    expect(oauthMock.beginCalls).toHaveLength(1);
  });
});

describe("forceRefresh", () => {
  it("returns needs_auth when there's nothing to refresh", async () => {
    const result = await forceRefresh(input);
    expect(result.kind).toBe("needs_auth");
  });

  it("skips the cache and refreshes even when expiresAt is far in the future", async () => {
    storeMock.readResult = {
      supabaseUserId: "supa-u",
      accessToken: "old",
      refreshToken: "r-old",
      expiresAt: Date.now() + 600_000,
    };
    oauthMock.refreshResult = {
      supabaseUserId: "supa-u",
      email: null,
      accessToken: "new",
      refreshToken: "r-new",
      expiresAt: Date.now() + 3_600_000,
    };
    const result = await forceRefresh(input);
    expect(result).toEqual({ kind: "ok", accessToken: "new" });
    expect(storeMock.writeCalls).toHaveLength(1);
  });
});
