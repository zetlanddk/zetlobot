import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type SessionLikeResult =
  | { kind: "ok"; accessToken: string; supabaseUserId: string }
  | { kind: "needs_auth"; signInUrl: string }
  | { kind: "error"; reason: string };

const sessionMock = vi.hoisted(() => ({
  ensureResult: null as SessionLikeResult | null,
  forceRefreshResult: null as SessionLikeResult | null,
  ensureCalls: 0,
  forceRefreshCalls: 0,
}));

vi.mock("./session", () => ({
  ensureSupabaseSession: vi.fn(async () => {
    sessionMock.ensureCalls += 1;
    return sessionMock.ensureResult;
  }),
  forceRefresh: vi.fn(async () => {
    sessionMock.forceRefreshCalls += 1;
    return sessionMock.forceRefreshResult;
  }),
}));

import { withSupabaseGate } from "./gate";
import { MCPTransportError } from "../tools";

const input = {
  tenantId: "zetland" as const,
  slackTeamId: "T1",
  slackUserId: "U1",
  channelId: "C1",
  threadHint: null,
};

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  sessionMock.ensureResult = null;
  sessionMock.forceRefreshResult = null;
  sessionMock.ensureCalls = 0;
  sessionMock.forceRefreshCalls = 0;
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
});

function gateLogs(): Array<Record<string, unknown>> {
  return logSpy.mock.calls
    .map((c) => {
      try {
        return JSON.parse(c[0] as string) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter(
      (l): l is Record<string, unknown> => l != null && l.event === "auth_gate",
    );
}

describe("withSupabaseGate", () => {
  it("returns ok with the doWork result on the happy path", async () => {
    sessionMock.ensureResult = {
      kind: "ok",
      accessToken: "jwt-1",
      supabaseUserId: "supa-u",
    };

    const result = await withSupabaseGate(input, async (token) => {
      expect(token).toBe("jwt-1");
      return "the-result";
    });

    expect(result).toEqual({ kind: "ok", result: "the-result" });
    expect(sessionMock.forceRefreshCalls).toBe(0);

    const log = gateLogs().find((l) => l.decision === "ok");
    expect(log?.supabaseUserId).toBe("supa-u");
  });

  it("returns needs_auth without invoking doWork when no session exists", async () => {
    sessionMock.ensureResult = { kind: "needs_auth", signInUrl: "https://signin/" };

    let doWorkCalled = false;
    const result = await withSupabaseGate(input, async () => {
      doWorkCalled = true;
      return "x";
    });

    expect(result).toEqual({ kind: "needs_auth", signInUrl: "https://signin/" });
    expect(doWorkCalled).toBe(false);
  });

  it("returns error when ensureSupabaseSession reports error", async () => {
    sessionMock.ensureResult = { kind: "error", reason: "redis-down" };

    const result = await withSupabaseGate(input, async () => "x");

    expect(result).toEqual({ kind: "error", reason: "redis-down" });
  });

  it("force-refreshes and retries on MCPTransportError, succeeding on retry", async () => {
    sessionMock.ensureResult = {
      kind: "ok",
      accessToken: "stale-jwt",
      supabaseUserId: "supa-u",
    };
    sessionMock.forceRefreshResult = {
      kind: "ok",
      accessToken: "fresh-jwt",
      supabaseUserId: "supa-u",
    };

    let attempts = 0;
    const result = await withSupabaseGate(input, async (token) => {
      attempts += 1;
      if (attempts === 1) {
        expect(token).toBe("stale-jwt");
        throw new MCPTransportError(new Error("HTTP 401"));
      }
      expect(token).toBe("fresh-jwt");
      return "ok-after-refresh";
    });

    expect(result).toEqual({ kind: "ok", result: "ok-after-refresh" });
    expect(attempts).toBe(2);
    expect(sessionMock.forceRefreshCalls).toBe(1);

    const log = gateLogs().find((l) => l.decision === "ok");
    expect(log?.reason).toBe("ok_after_refresh");
    expect(log?.supabaseUserId).toBe("supa-u");
  });

  it("returns needs_auth when force-refresh signals refresh-token revoked", async () => {
    sessionMock.ensureResult = {
      kind: "ok",
      accessToken: "stale-jwt",
      supabaseUserId: "supa-u",
    };
    sessionMock.forceRefreshResult = {
      kind: "needs_auth",
      signInUrl: "https://signin-again/",
    };

    const result = await withSupabaseGate(input, async () => {
      throw new MCPTransportError(new Error("HTTP 401"));
    });

    expect(result).toEqual({
      kind: "needs_auth",
      signInUrl: "https://signin-again/",
    });
  });

  it("returns error when retry also throws MCPTransportError with 401", async () => {
    sessionMock.ensureResult = {
      kind: "ok",
      accessToken: "stale-jwt",
      supabaseUserId: "supa-u",
    };
    sessionMock.forceRefreshResult = {
      kind: "ok",
      accessToken: "fresh-jwt",
      supabaseUserId: "supa-u",
    };

    const result = await withSupabaseGate(input, async () => {
      throw new MCPTransportError(new Error("HTTP 401: unauthorized"));
    });

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.reason).toContain("HTTP 401");
    }

    const log = gateLogs().find((l) => l.decision === "error");
    expect(log?.reason).toBe("transport_failed_after_refresh");
    expect(log?.supabaseUserId).toBe("supa-u");
  });

  it("force-refreshes on first-attempt 403 and returns ok if the retry succeeds", async () => {
    sessionMock.ensureResult = {
      kind: "ok",
      accessToken: "pre-grant-jwt",
      supabaseUserId: "supa-u",
    };
    sessionMock.forceRefreshResult = {
      kind: "ok",
      accessToken: "post-grant-jwt",
      supabaseUserId: "supa-u",
    };

    let attempts = 0;
    const result = await withSupabaseGate(input, async (token) => {
      attempts += 1;
      if (attempts === 1) {
        expect(token).toBe("pre-grant-jwt");
        throw new MCPTransportError(
          new Error("MCP HTTP Transport Error: POSTing to endpoint (HTTP 403): forbidden"),
        );
      }
      expect(token).toBe("post-grant-jwt");
      return "ok-after-refresh";
    });

    expect(result).toEqual({ kind: "ok", result: "ok-after-refresh" });
    expect(sessionMock.forceRefreshCalls).toBe(1);
    expect(attempts).toBe(2);
  });

  it("returns forbidden when retry-after-refresh also yields 403", async () => {
    sessionMock.ensureResult = {
      kind: "ok",
      accessToken: "stale-jwt",
      supabaseUserId: "supa-u",
    };
    sessionMock.forceRefreshResult = {
      kind: "ok",
      accessToken: "fresh-jwt",
      supabaseUserId: "supa-u",
    };

    let attempts = 0;
    const result = await withSupabaseGate(input, async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new MCPTransportError(
          new Error("MCP HTTP Transport Error: POSTing to endpoint (HTTP 401): expired"),
        );
      }
      throw new MCPTransportError(
        new Error("MCP HTTP Transport Error: POSTing to endpoint (HTTP 403): forbidden"),
      );
    });

    expect(result).toEqual({ kind: "forbidden" });
    expect(sessionMock.forceRefreshCalls).toBe(1);
    expect(attempts).toBe(2);
  });

  it("propagates non-MCPTransportError throws as-is (not caught by retry loop)", async () => {
    sessionMock.ensureResult = {
      kind: "ok",
      accessToken: "jwt",
      supabaseUserId: "supa-u",
    };

    await expect(
      withSupabaseGate(input, async () => {
        throw new Error("unrelated bug");
      }),
    ).rejects.toThrow("unrelated bug");

    expect(sessionMock.forceRefreshCalls).toBe(0);
  });
});
