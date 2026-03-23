import { waitUntil } from "@vercel/functions";
import { verifyRequest } from "../lib/slack-utils";
import { getTenantByChannelId } from "../lib/tenants";
import { generateResponse } from "../lib/generate-response";
import { commands, getHelpText } from "../lib/commands/commands";
import { sendDeferredResponse } from "../lib/commands/respond";

function parsePayload(body: string) {
  const params = new URLSearchParams(body);
  return {
    command: params.get("command") ?? "",
    text: (params.get("text") ?? "").trim(),
    response_url: params.get("response_url") ?? "",
    user_id: params.get("user_id") ?? "",
    channel_id: params.get("channel_id") ?? "",
  };
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  try {
    await verifyRequest({ request, rawBody });
  } catch (error) {
    console.error("Slash command verification failed:", error);
    return new Response("Invalid request signature", { status: 401 });
  }

  const payload = parsePayload(rawBody);

  // Resolve tenant from channel
  const tenant = getTenantByChannelId(payload.channel_id);
  if (!tenant) {
    return Response.json({
      response_type: "ephemeral",
      text: "This command is not available in this channel.",
    });
  }

  // /help responds immediately — no LLM needed
  if (payload.command === "/help") {
    return Response.json({
      response_type: "ephemeral",
      text: getHelpText(),
    });
  }

  // Look up command
  const command = commands[payload.command];
  if (!command) {
    return Response.json({
      response_type: "ephemeral",
      text: `Unknown command: ${payload.command}`,
    });
  }

  if (!payload.text) {
    return Response.json({
      response_type: "ephemeral",
      text: `Usage: \`${command.usage}\``,
    });
  }

  // Build prompt and run through the normal LLM pipeline in the background
  const prompt = command.prompt(payload.text);

  waitUntil(
    generateResponse(
      [{ role: "user", content: prompt }],
      tenant.id,
      { currentUserId: payload.user_id },
    ).then(
      (text) => sendDeferredResponse(payload.response_url, text),
      (error) => {
        console.error(`Command ${payload.command} failed:`, error);
        return sendDeferredResponse(
          payload.response_url,
          `Command failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      },
    ),
  );

  return Response.json({
    response_type: "ephemeral",
    text: "Working on it...",
  });
}
