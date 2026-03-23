import { CommandHandler } from "../types";
import { getToolsForTenant } from "../../tools";

export const impersonateHandler: CommandHandler = async (payload, tenantId) => {
  if (!payload.text) {
    return {
      text: "Usage: `/impersonate <email or name>`",
      response_type: "ephemeral",
    };
  }

  const tools = await getToolsForTenant(tenantId);
  const toolNames = Object.keys(tools);
  console.log(`Available MCP tools for /impersonate: ${toolNames.join(", ")}`);

  // Find the magic login / impersonation tool
  const impersonateTool =
    tools["impersonate_user"] ??
    tools["magic_login"] ??
    tools["generate_magic_link"] ??
    tools["create_magic_link"] ??
    tools["impersonate"];

  if (!impersonateTool) {
    console.error(`No impersonate tool found. Available tools: ${toolNames.join(", ")}`);
    return {
      text: `No impersonation tool available. Available tools: ${toolNames.join(", ")}`,
      response_type: "ephemeral",
    };
  }

  try {
    const result = await impersonateTool.execute({ query: payload.text }, { toolCallId: "slash-impersonate", messages: [] });
    const formatted = typeof result === "string" ? result : JSON.stringify(result, null, 2);

    return {
      text: formatted,
      response_type: "ephemeral",
    };
  } catch (error) {
    console.error("Impersonate tool execution failed:", error);
    return {
      text: `Impersonation failed: ${error instanceof Error ? error.message : String(error)}`,
      response_type: "ephemeral",
    };
  }
};
