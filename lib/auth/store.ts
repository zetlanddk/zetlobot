import { Redis } from "@upstash/redis";
import type { SupportedStorage } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import type { TenantId } from "../tenants";
import { env } from "../env";

const redis = new Redis({
  url: env.KV_REST_API_URL,
  token: env.KV_REST_API_TOKEN,
});

// 10 minutes is enough for a user to complete Google sign-in (account picker,
// possible 2FA) without being so long that abandoned flows clutter Redis.
const STATE_TTL_SECONDS = 600;

export type OAuthStateBinding = {
  tenantId: string;
  slackTeamId: string;
  slackUserId: string;
  channelId: string;
  threadHint: string | null;
};

export type SessionRecord = {
  supabaseUserId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

const stateKey = (nonce: string) => `oauth:state:${nonce}`;
const verifierKey = (nonce: string, suffix: string) => `oauth:verifier:${nonce}:${suffix}`;
const sessionKey = (tenantId: TenantId, slackTeamId: string, slackUserId: string) =>
  `session:${tenantId}:${slackTeamId}:${slackUserId}`;

export async function writeState(nonce: string, binding: OAuthStateBinding): Promise<void> {
  await redis.set(stateKey(nonce), binding, { ex: STATE_TTL_SECONDS });
}

export async function consumeState(nonce: string): Promise<OAuthStateBinding | null> {
  const result = await redis.getdel<OAuthStateBinding>(stateKey(nonce));
  return result ?? null;
}

export async function writeSession(
  tenantId: TenantId,
  slackTeamId: string,
  slackUserId: string,
  session: SessionRecord,
): Promise<void> {
  await redis.set(sessionKey(tenantId, slackTeamId, slackUserId), session);
}

export async function readSession(
  tenantId: TenantId,
  slackTeamId: string,
  slackUserId: string,
): Promise<SessionRecord | null> {
  const result = await redis.get<SessionRecord>(sessionKey(tenantId, slackTeamId, slackUserId));
  return result ?? null;
}

export async function deleteSession(
  tenantId: TenantId,
  slackTeamId: string,
  slackUserId: string,
): Promise<void> {
  await redis.del(sessionKey(tenantId, slackTeamId, slackUserId));
}

// Supabase writes the PKCE code_verifier under a project-specific key during
// signInWithOAuth and reads it back during exchangeCodeForSession. Scoping
// the storage by nonce isolates concurrent sign-in flows from each other.
export function createSupabaseStorageAdapter(nonce: string): SupportedStorage {
  return {
    isServer: true,
    getItem: async (key) => {
      const v = await redis.get<string>(verifierKey(nonce, key));
      return v ?? null;
    },
    setItem: async (key, value) => {
      await redis.set(verifierKey(nonce, key), value, { ex: STATE_TTL_SECONDS });
    },
    removeItem: async (key) => {
      await redis.del(verifierKey(nonce, key));
    },
  };
}

export function generateNonce(): string {
  return randomBytes(32).toString("hex");
}
