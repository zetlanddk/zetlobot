import { TenantId } from "../tenants";

export type SlashCommandPayload = {
  command: string;
  text: string;
  response_url: string;
  trigger_id: string;
  user_id: string;
  user_name: string;
  channel_id: string;
  channel_name: string;
  team_id: string;
  team_domain: string;
};

export type CommandResponse = {
  text: string;
  response_type?: "ephemeral" | "in_channel";
};

export type CommandHandler = (
  payload: SlashCommandPayload,
  tenantId: TenantId,
) => Promise<CommandResponse>;

export function parseSlashCommandPayload(body: string): SlashCommandPayload {
  const params = new URLSearchParams(body);
  return {
    command: params.get("command") ?? "",
    text: (params.get("text") ?? "").trim(),
    response_url: params.get("response_url") ?? "",
    trigger_id: params.get("trigger_id") ?? "",
    user_id: params.get("user_id") ?? "",
    user_name: params.get("user_name") ?? "",
    channel_id: params.get("channel_id") ?? "",
    channel_name: params.get("channel_name") ?? "",
    team_id: params.get("team_id") ?? "",
    team_domain: params.get("team_domain") ?? "",
  };
}
