import { describe, it, expect, vi, beforeEach } from "vitest";

const mockState = vi.hoisted(() => ({
  capturedHeaders: null as Record<string, string> | undefined | null,
  closeCalled: 0,
  toolsError: null as Error | null,
  createError: null as Error | null,
}));

vi.mock("@ai-sdk/mcp", () => {
  return {
    createMCPClient: vi.fn(
      async ({ transport }: { transport: { headers?: Record<string, string> } }) => {
        mockState.capturedHeaders = transport.headers;
        if (mockState.createError) throw mockState.createError;
        return {
          tools: vi.fn(async () => {
            if (mockState.toolsError) throw mockState.toolsError;
            return {};
          }),
          close: vi.fn(async () => {
            mockState.closeCalled += 1;
          }),
        };
      },
    ),
  };
});

import { getToolsForTenant, MCPUnauthorizedError } from "./index";

beforeEach(() => {
  mockState.capturedHeaders = null;
  mockState.closeCalled = 0;
  mockState.toolsError = null;
  mockState.createError = null;
});

describe("getToolsForTenant", () => {
  it("always attaches X-Internal-Api-Key (client authentication, permanent)", async () => {
    await getToolsForTenant("zetland");
    expect(mockState.capturedHeaders?.["X-Internal-Api-Key"]).toBe("test-mainframe-key");
  });

  it("attaches Authorization: Bearer when supabaseAccessToken is in UserContext", async () => {
    await getToolsForTenant("zetland", { supabaseAccessToken: "tok-abc" });
    expect(mockState.capturedHeaders?.["Authorization"]).toBe("Bearer tok-abc");
    expect(mockState.capturedHeaders?.["X-Internal-Api-Key"]).toBe("test-mainframe-key");
  });

  it("omits Authorization when supabaseAccessToken is absent", async () => {
    await getToolsForTenant("zetland", { email: "u@example.com" });
    expect(mockState.capturedHeaders?.["Authorization"]).toBeUndefined();
    expect(mockState.capturedHeaders?.["X-User-Email"]).toBe("u@example.com");
  });

  it("returns a close callback that invokes client.close()", async () => {
    const handle = await getToolsForTenant("zetland");
    expect(typeof handle.close).toBe("function");
    await handle.close();
    expect(mockState.closeCalled).toBe(1);
  });

  it("throws MCPUnauthorizedError on 401 during client.tools()", async () => {
    mockState.toolsError = new Error(
      "MCP HTTP Transport Error: POSTing to endpoint (HTTP 401): unauthorized",
    );
    await expect(
      getToolsForTenant("zetland", { supabaseAccessToken: "stale" }),
    ).rejects.toBeInstanceOf(MCPUnauthorizedError);
    // The client should still be closed even though tools() threw.
    expect(mockState.closeCalled).toBe(1);
  });

  it("throws MCPUnauthorizedError on 401 during createMCPClient", async () => {
    mockState.createError = new Error(
      "MCP HTTP Transport Error: POSTing to endpoint (HTTP 401): unauthorized",
    );
    await expect(
      getToolsForTenant("zetland", { supabaseAccessToken: "stale" }),
    ).rejects.toBeInstanceOf(MCPUnauthorizedError);
  });

  it("propagates non-401 errors unchanged", async () => {
    mockState.toolsError = new Error("connection refused");
    await expect(getToolsForTenant("zetland")).rejects.toThrow("connection refused");
    await expect(getToolsForTenant("zetland")).rejects.not.toBeInstanceOf(
      MCPUnauthorizedError,
    );
  });
});
