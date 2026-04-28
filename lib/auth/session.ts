import type { TenantId } from "../tenants";
import {
  readSession,
  writeSession,
  deleteSession,
  type SessionRecord,
} from "./store";
import {
  beginOAuth,
  refreshSupabaseSession,
  type BeginOAuthParams,
} from "./supabase-oauth";

const REFRESH_SKEW_MS = 60_000;

export type SessionInput = {
  tenantId: TenantId;
  slackTeamId: string;
  slackUserId: string;
  channelId: string;
  threadHint: string | null;
  loginHintEmail?: string;
};

export type SessionResult =
  | { kind: "ok"; accessToken: string }
  | { kind: "needs_auth"; signInUrl: string }
  | { kind: "error"; reason: string };

function logRefresh(
  input: SessionInput,
  outcome: "success" | "rotated" | "failed",
) {
  console.log(
    JSON.stringify({
      event: "auth_refresh",
      tenantId: input.tenantId,
      slackTeamId: input.slackTeamId,
      slackUserId: input.slackUserId,
      outcome,
    }),
  );
}

async function startOAuthAndReturnNeedsAuth(input: SessionInput): Promise<SessionResult> {
  try {
    const beginParams: BeginOAuthParams = {
      tenantId: input.tenantId,
      slackTeamId: input.slackTeamId,
      slackUserId: input.slackUserId,
      channelId: input.channelId,
      threadHint: input.threadHint,
      loginHintEmail: input.loginHintEmail,
    };
    const { signInUrl } = await beginOAuth(beginParams);
    return { kind: "needs_auth", signInUrl };
  } catch (e) {
    return {
      kind: "error",
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

async function refreshAndPersist(
  input: SessionInput,
  existing: SessionRecord,
): Promise<SessionResult> {
  const refreshed = await refreshSupabaseSession(input.tenantId, existing.refreshToken);
  if (!refreshed) {
    // The refresh token we tried may have been rotated out by a concurrent
    // refresh in another invocation. Re-read before declaring revocation:
    // if the stored refresh token has changed since we read it, another flow
    // already succeeded and we should adopt those tokens rather than nuking.
    const current = await readSession(input.tenantId, input.slackTeamId, input.slackUserId);
    if (
      current &&
      current.refreshToken !== existing.refreshToken &&
      current.expiresAt - Date.now() > REFRESH_SKEW_MS
    ) {
      logRefresh(input, "rotated");
      return { kind: "ok", accessToken: current.accessToken };
    }
    logRefresh(input, "failed");
    await deleteSession(input.tenantId, input.slackTeamId, input.slackUserId);
    return startOAuthAndReturnNeedsAuth(input);
  }

  const rotated = refreshed.refreshToken !== existing.refreshToken;
  await writeSession(input.tenantId, input.slackTeamId, input.slackUserId, {
    supabaseUserId: refreshed.supabaseUserId,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    expiresAt: refreshed.expiresAt,
  });
  logRefresh(input, rotated ? "rotated" : "success");

  return { kind: "ok", accessToken: refreshed.accessToken };
}

export async function ensureSupabaseSession(input: SessionInput): Promise<SessionResult> {
  const existing = await readSession(input.tenantId, input.slackTeamId, input.slackUserId);
  if (!existing) {
    return startOAuthAndReturnNeedsAuth(input);
  }

  if (existing.expiresAt - Date.now() < REFRESH_SKEW_MS) {
    return refreshAndPersist(input, existing);
  }

  return { kind: "ok", accessToken: existing.accessToken };
}

// Skips the cache and forces a refresh against Supabase. Used after a 401 from
// Mainframe to rule out a stale cached access token before deciding whether
// the user is signed-in-but-unauthorized vs. needs to re-auth entirely.
export async function forceRefresh(input: SessionInput): Promise<SessionResult> {
  const existing = await readSession(input.tenantId, input.slackTeamId, input.slackUserId);
  if (!existing) {
    return startOAuthAndReturnNeedsAuth(input);
  }
  return refreshAndPersist(input, existing);
}
