import { ensureSupabaseSession, forceRefresh, type SessionInput } from "./session";
import { MCPTransportError } from "../tools";

export type GateResult<T> =
  | { kind: "ok"; result: T }
  | { kind: "needs_auth"; signInUrl: string }
  | { kind: "error"; reason: string };

function logGate(
  input: SessionInput,
  decision: GateResult<unknown>["kind"],
  startedAt: number,
  opts?: { reason?: string; supabaseUserId?: string },
) {
  console.log(
    JSON.stringify({
      event: "auth_gate",
      tenantId: input.tenantId,
      slackTeamId: input.slackTeamId,
      slackUserId: input.slackUserId,
      ...(opts?.supabaseUserId ? { supabaseUserId: opts.supabaseUserId } : {}),
      decision,
      latencyMs: Date.now() - startedAt,
      ...(opts?.reason ? { reason: opts.reason } : {}),
    }),
  );
}

// Runs `doWork` with a fresh Supabase access token. If `doWork` throws
// MCPTransportError, force-refreshes the session once and retries. Three
// outcomes: ok (work succeeded), needs_auth (post sign-in link),
// error (transport keeps failing — could be a revoked editor role, a
// transient mainframe outage, or a network blip; the user gets a generic
// error and the session record stays in Redis so we don't loop them
// through OAuth).
export async function withSupabaseGate<T>(
  input: SessionInput,
  doWork: (accessToken: string) => Promise<T>,
): Promise<GateResult<T>> {
  const startedAt = Date.now();

  const session = await ensureSupabaseSession(input);
  if (session.kind === "needs_auth") {
    logGate(input, "needs_auth", startedAt, { reason: "no_session_or_refresh_failed" });
    return { kind: "needs_auth", signInUrl: session.signInUrl };
  }
  if (session.kind === "error") {
    logGate(input, "error", startedAt, { reason: session.reason });
    return { kind: "error", reason: session.reason };
  }

  try {
    const result = await doWork(session.accessToken);
    logGate(input, "ok", startedAt, { supabaseUserId: session.supabaseUserId });
    return { kind: "ok", result };
  } catch (err) {
    if (!(err instanceof MCPTransportError)) throw err;

    console.log(
      JSON.stringify({
        event: "mcp_transport_error",
        phase: "first_attempt",
        tenantId: input.tenantId,
        slackTeamId: input.slackTeamId,
        slackUserId: input.slackUserId,
        supabaseUserId: session.supabaseUserId,
        message: err.message,
      }),
    );

    const refresh = await forceRefresh(input);
    if (refresh.kind === "needs_auth") {
      logGate(input, "needs_auth", startedAt, { reason: "refresh_token_revoked" });
      return { kind: "needs_auth", signInUrl: refresh.signInUrl };
    }
    if (refresh.kind === "error") {
      logGate(input, "error", startedAt, { reason: refresh.reason });
      return { kind: "error", reason: refresh.reason };
    }

    try {
      const result = await doWork(refresh.accessToken);
      logGate(input, "ok", startedAt, {
        reason: "ok_after_refresh",
        supabaseUserId: refresh.supabaseUserId,
      });
      return { kind: "ok", result };
    } catch (err2) {
      if (!(err2 instanceof MCPTransportError)) throw err2;
      console.log(
        JSON.stringify({
          event: "mcp_transport_error",
          phase: "after_refresh",
          tenantId: input.tenantId,
          slackTeamId: input.slackTeamId,
          slackUserId: input.slackUserId,
          supabaseUserId: refresh.supabaseUserId,
          message: err2.message,
        }),
      );
      logGate(input, "error", startedAt, {
        reason: "transport_failed_after_refresh",
        supabaseUserId: refresh.supabaseUserId,
      });
      return { kind: "error", reason: err2.message };
    }
  }
}
