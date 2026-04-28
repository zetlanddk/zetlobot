import { consumeState, writeSession } from "../../lib/auth/store";
import { exchangeCode } from "../../lib/auth/supabase-oauth";
import { client } from "../../lib/slack-utils";
import { getTenantById, type TenantId } from "../../lib/tenants";

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function plainError(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

const successPage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Signed in</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1rem; color: #111; }
  h1 { font-size: 1.25rem; }
  p { line-height: 1.5; }
</style>
</head><body>
<h1>You're signed in.</h1>
<p>You can close this tab and return to Slack to retry your message.</p>
</body></html>`;

async function postSlackConfirmation(
  channelId: string,
  slackUserId: string,
  threadHint: string | null,
): Promise<void> {
  const text = "You're signed in — try your message again.";
  try {
    await client.chat.postEphemeral({
      channel: channelId,
      user: slackUserId,
      text,
      ...(threadHint ? { thread_ts: threadHint } : {}),
    });
  } catch (err) {
    console.error("Failed to post ephemeral confirmation, falling back to DM:", err);
    try {
      const im = await client.conversations.open({ users: slackUserId });
      const dmChannel = im.channel?.id;
      if (dmChannel) {
        await client.chat.postMessage({ channel: dmChannel, text });
      }
    } catch (fallbackErr) {
      console.error("Failed to send DM confirmation:", fallbackErr);
    }
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  // `nonce` is our own binding key; the OAuth `state` param is owned by
  // Supabase for CSRF — see beginOAuth for why we don't piggy-back on it.
  const nonce = url.searchParams.get("nonce");

  if (!code || !nonce) {
    return plainError(400, "Missing code or nonce");
  }

  const binding = await consumeState(nonce);
  if (!binding) {
    return plainError(400, "Invalid or expired nonce");
  }

  if (!getTenantById(binding.tenantId as TenantId)) {
    return plainError(400, "Unknown tenant in state binding");
  }
  const tenantId = binding.tenantId as TenantId;

  let session;
  try {
    session = await exchangeCode(tenantId, nonce, code);
  } catch (err) {
    console.error("exchangeCodeForSession failed:", err);
    return plainError(502, "Authentication failed");
  }

  await writeSession(tenantId, binding.slackTeamId, binding.slackUserId, {
    supabaseUserId: session.supabaseUserId,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: session.expiresAt,
  });

  // Slack confirmation is best-effort — never fail the OAuth flow because of it.
  await postSlackConfirmation(binding.channelId, binding.slackUserId, binding.threadHint);

  console.log(
    JSON.stringify({
      event: "auth_callback_success",
      tenantId,
      slackTeamId: binding.slackTeamId,
      slackUserId: binding.slackUserId,
    }),
  );

  return html(successPage);
}
