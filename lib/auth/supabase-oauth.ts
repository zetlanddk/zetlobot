import { createClient } from "@supabase/supabase-js";
import { getTenantById, getTenantSecrets, type TenantConfig, type TenantId, type TenantSecrets } from "../tenants";
import { env } from "../env";
import {
  createSupabaseStorageAdapter,
  generateNonce,
  writeState,
  type OAuthStateBinding,
} from "./store";

function requireTenant(tenantId: TenantId): { tenant: TenantConfig; secrets: TenantSecrets } {
  const tenant = getTenantById(tenantId);
  if (!tenant) throw new Error(`Unknown tenant: ${tenantId}`);
  return { tenant, secrets: getTenantSecrets(tenantId) };
}

export type BeginOAuthParams = {
  tenantId: TenantId;
  slackTeamId: string;
  slackUserId: string;
  channelId: string;
  threadHint: string | null;
  loginHintEmail?: string;
};

export type BeginOAuthResult = { signInUrl: string };

export type ExchangedSession = {
  supabaseUserId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

function expiresAtMs(session: { expires_at?: number; expires_in?: number }): number {
  if (session.expires_at) return session.expires_at * 1000;
  const fallback = Math.floor(Date.now() / 1000) + (session.expires_in ?? 3600);
  return fallback * 1000;
}

export async function beginOAuth(params: BeginOAuthParams): Promise<BeginOAuthResult> {
  const { tenantId, slackTeamId, slackUserId, channelId, threadHint, loginHintEmail } = params;
  const { tenant, secrets } = requireTenant(tenantId);

  const nonce = generateNonce();
  const storage = createSupabaseStorageAdapter(nonce);

  const supabase = createClient(tenant.supabaseUrl, secrets.supabaseAnonKey, {
    auth: {
      flowType: "pkce",
      // persistSession must be true for the SDK to honor our custom storage
      // adapter — when false, GoTrueClient unconditionally uses an in-memory
      // adapter and our `storage` is ignored, which loses the PKCE
      // code_verifier between the begin handler and the callback handler.
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage,
    },
  });

  // Encode our nonce into redirectTo, NOT the OAuth state param. Supabase
  // generates and validates its own state for CSRF protection in PKCE flow;
  // overriding it via queryParams.state breaks Supabase's check, and Supabase
  // falls back to the project's Site URL with bad_oauth_state on failure.
  const callbackUrl = new URL("/api/auth/callback", env.BOT_PUBLIC_URL);
  callbackUrl.searchParams.set("nonce", nonce);

  const queryParams: Record<string, string> = {};
  if (loginHintEmail) queryParams.login_hint = loginHintEmail;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      skipBrowserRedirect: true,
      redirectTo: callbackUrl.toString(),
      queryParams,
    },
  });

  if (error || !data?.url) {
    throw new Error(`Failed to begin OAuth: ${error?.message ?? "no url returned"}`);
  }

  const binding: OAuthStateBinding = {
    tenantId,
    slackTeamId,
    slackUserId,
    channelId,
    threadHint,
  };
  await writeState(nonce, binding);

  return { signInUrl: data.url };
}

export async function exchangeCode(
  tenantId: TenantId,
  nonce: string,
  code: string,
): Promise<ExchangedSession> {
  const { tenant, secrets } = requireTenant(tenantId);
  const storage = createSupabaseStorageAdapter(nonce);

  const supabase = createClient(tenant.supabaseUrl, secrets.supabaseAnonKey, {
    auth: {
      flowType: "pkce",
      // persistSession must be true for the SDK to honor our custom storage
      // adapter — when false, GoTrueClient unconditionally uses an in-memory
      // adapter and our `storage` is ignored, which loses the PKCE
      // code_verifier between the begin handler and the callback handler.
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage,
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data?.session) {
    throw new Error(`Failed to exchange code: ${error?.message ?? "no session"}`);
  }

  const { session, user } = data;
  return {
    supabaseUserId: user?.id ?? session.user.id,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: expiresAtMs(session),
  };
}

export async function refreshSupabaseSession(
  tenantId: TenantId,
  refreshToken: string,
): Promise<ExchangedSession | null> {
  const { tenant, secrets } = requireTenant(tenantId);

  const supabase = createClient(tenant.supabaseUrl, secrets.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data?.session) {
    return null;
  }

  const { session } = data;
  return {
    supabaseUserId: session.user.id,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: expiresAtMs(session),
  };
}
