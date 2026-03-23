import { waitUntil } from "@vercel/functions";
import { verifyRequest } from "../lib/slack-utils";
import { getTenantByChannelId } from "../lib/tenants";
import { parseSlashCommandPayload } from "../lib/commands/types";
import { getHandler } from "../lib/commands/registry";
import { sendDeferredResponse } from "../lib/commands/respond";

export async function POST(request: Request) {
  const rawBody = await request.text();

  // Verify Slack signature
  try {
    await verifyRequest({ request, rawBody });
  } catch (error) {
    console.error("Slash command request verification failed:", error);
    return new Response("Invalid request signature", { status: 401 });
  }

  const payload = parseSlashCommandPayload(rawBody);

  // Resolve tenant from channel
  const tenant = getTenantByChannelId(payload.channel_id);
  if (!tenant) {
    return Response.json({
      response_type: "ephemeral",
      text: "This command is not available in this channel.",
    });
  }

  // Find handler
  const handler = getHandler(payload.command);
  if (!handler) {
    return Response.json({
      response_type: "ephemeral",
      text: `Unknown command: ${payload.command}`,
    });
  }

  // Run handler in background, send result via response_url
  waitUntil(
    handler(payload, tenant.id).then(
      (response) =>
        sendDeferredResponse(
          payload.response_url,
          response.text,
          response.response_type ?? "ephemeral",
        ),
      (error) => {
        console.error(`Command ${payload.command} failed:`, error);
        return sendDeferredResponse(
          payload.response_url,
          `Command failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      },
    ),
  );

  // Immediate acknowledgment
  return Response.json({
    response_type: "ephemeral",
    text: "Working on it...",
  });
}
