import { describe, it, expect, vi, beforeEach } from "vitest";

type RedisCall =
  | { kind: "set"; key: string; value: unknown; opts?: { ex?: number } }
  | { kind: "get"; key: string }
  | { kind: "getdel"; key: string }
  | { kind: "del"; key: string };

const redisMock = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  ttls: new Map<string, number>(),
  calls: [] as RedisCall[],
}));

vi.mock("@upstash/redis", () => {
  class MockRedis {
    constructor(_: unknown) {}
    async set(key: string, value: unknown, opts?: { ex?: number }): Promise<void> {
      redisMock.calls.push({ kind: "set", key, value, opts });
      redisMock.store.set(key, value);
      if (opts?.ex) redisMock.ttls.set(key, opts.ex);
    }
    async get<T>(key: string): Promise<T | null> {
      redisMock.calls.push({ kind: "get", key });
      return (redisMock.store.get(key) as T) ?? null;
    }
    async getdel<T>(key: string): Promise<T | null> {
      redisMock.calls.push({ kind: "getdel", key });
      const v = (redisMock.store.get(key) as T) ?? null;
      redisMock.store.delete(key);
      return v;
    }
    async del(key: string): Promise<number> {
      redisMock.calls.push({ kind: "del", key });
      const had = redisMock.store.has(key);
      redisMock.store.delete(key);
      return had ? 1 : 0;
    }
    async ping(): Promise<string> {
      return "PONG";
    }
  }
  return { Redis: MockRedis };
});

const supabaseMock = vi.hoisted(() => ({
  oauthUrl:
    "https://db.zetland.dk/auth/v1/authorize?provider=google&state=NONCE",
}));

vi.mock("@supabase/supabase-js", () => {
  return {
    createClient: vi.fn(() => ({
      auth: {
        signInWithOAuth: vi.fn(async () => ({
          data: { provider: "google", url: supabaseMock.oauthUrl },
          error: null,
        })),
      },
    })),
  };
});

import { beginOAuth } from "./supabase-oauth";
import { consumeState, writeSession, writeState } from "./store";

beforeEach(() => {
  redisMock.store.clear();
  redisMock.ttls.clear();
  redisMock.calls = [];
});

describe("beginOAuth", () => {
  it("writes the state binding with a 5-minute TTL and returns the Supabase URL", async () => {
    const result = await beginOAuth({
      tenantId: "zetland",
      slackTeamId: "T-ZETLAND",
      slackUserId: "U-JOERN",
      channelId: "C09QRDLKV8F",
      threadHint: "1700000000.000100",
    });

    expect(result.signInUrl).toBe(supabaseMock.oauthUrl);

    const stateSets = redisMock.calls.filter(
      (c) => c.kind === "set" && c.key.startsWith("oauth:state:"),
    ) as Extract<RedisCall, { kind: "set" }>[];
    expect(stateSets).toHaveLength(1);
    expect(stateSets[0].opts?.ex).toBe(300);
    expect(stateSets[0].value).toMatchObject({
      tenantId: "zetland",
      slackTeamId: "T-ZETLAND",
      slackUserId: "U-JOERN",
      channelId: "C09QRDLKV8F",
      threadHint: "1700000000.000100",
    });
  });
});

describe("consumeState", () => {
  it("returns the binding once and null thereafter (single-use semantics)", async () => {
    await writeState("abc123", {
      tenantId: "zetland",
      slackTeamId: "T1",
      slackUserId: "U1",
      channelId: "C1",
      threadHint: null,
    });

    const first = await consumeState("abc123");
    expect(first).toMatchObject({ tenantId: "zetland", slackUserId: "U1" });

    const second = await consumeState("abc123");
    expect(second).toBeNull();
  });
});

describe("writeSession", () => {
  it("writes session records with a 30-day sliding TTL", async () => {
    await writeSession("zetland", "T1", "U1", {
      supabaseUserId: "supa-u",
      accessToken: "at",
      refreshToken: "rt",
      expiresAt: Date.now() + 3_600_000,
    });

    const sets = redisMock.calls.filter(
      (c) => c.kind === "set" && c.key.startsWith("session:"),
    ) as Extract<RedisCall, { kind: "set" }>[];
    expect(sets).toHaveLength(1);
    expect(sets[0].opts?.ex).toBe(60 * 60 * 24 * 30);
  });
});
