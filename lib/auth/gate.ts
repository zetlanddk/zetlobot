import { ensureSupabaseSession, forceRefresh, type SessionInput } from "./session";
import { MCPUnauthorizedError } from "../tools";

export type GateResult<T> =
  | { kind: "ok"; result: T }
  | { kind: "needs_auth"; signInUrl: string }
  | { kind: "unauthorized" }
  | { kind: "error"; reason: string };

function logGate(
  input: SessionInput,
  decision: GateResult<unknown>["kind"],
  startedAt: number,
  reason?: string,
) {
  console.log(
    JSON.stringify({
      event: "auth_gate",
      tenantId: input.tenantId,
      slackTeamId: input.slackTeamId,
      slackUserId: input.slackUserId,
      decision,
      latencyMs: Date.now() - startedAt,
      ...(reason ? { reason } : {}),
    }),
  );
}

// Runs `doWork` with a fresh Supabase access token. If `doWork` throws
// MCPUnauthorizedError, force-refreshes the session once and retries. The four
// outcomes are: ok (work succeeded), needs_auth (post sign-in link),
// unauthorized (signed in but lacks editor role — different UX, no loop),
// error (everything else).
export async function withSupabaseGate<T>(
  input: SessionInput,
  doWork: (accessToken: string) => Promise<T>,
): Promise<GateResult<T>> {
  const startedAt = Date.now();

  const session = await ensureSupabaseSession(input);
  if (session.kind === "needs_auth") {
    logGate(input, "needs_auth", startedAt, "no_session_or_refresh_failed");
    return { kind: "needs_auth", signInUrl: session.signInUrl };
  }
  if (session.kind === "error") {
    logGate(input, "error", startedAt, session.reason);
    return { kind: "error", reason: session.reason };
  }

  try {
    const result = await doWork(session.accessToken);
    logGate(input, "ok", startedAt);
    return { kind: "ok", result };
  } catch (err) {
    if (!(err instanceof MCPUnauthorizedError)) throw err;

    console.log(
      JSON.stringify({
        event: "mcp_unauthorized",
        phase: "first_attempt",
        tenantId: input.tenantId,
        slackTeamId: input.slackTeamId,
        slackUserId: input.slackUserId,
      }),
    );

    const refresh = await forceRefresh(input);
    if (refresh.kind === "needs_auth") {
      logGate(input, "needs_auth", startedAt, "refresh_token_revoked");
      return { kind: "needs_auth", signInUrl: refresh.signInUrl };
    }
    if (refresh.kind === "error") {
      logGate(input, "error", startedAt, refresh.reason);
      return { kind: "error", reason: refresh.reason };
    }

    try {
      const result = await doWork(refresh.accessToken);
      logGate(input, "ok", startedAt, "ok_after_refresh");
      return { kind: "ok", result };
    } catch (err2) {
      if (!(err2 instanceof MCPUnauthorizedError)) throw err2;
      console.log(
        JSON.stringify({
          event: "mcp_unauthorized",
          phase: "after_refresh",
          tenantId: input.tenantId,
          slackTeamId: input.slackTeamId,
          slackUserId: input.slackUserId,
        }),
      );
      logGate(input, "unauthorized", startedAt, "fresh_jwt_rejected_by_mainframe");
      return { kind: "unauthorized" };
    }
  }
}
