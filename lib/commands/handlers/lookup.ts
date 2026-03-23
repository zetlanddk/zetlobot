import { CommandHandler } from "../types";
import { getToolsForTenant } from "../../tools";

export const lookupHandler: CommandHandler = async (payload, tenantId) => {
  if (!payload.text) {
    return {
      text: "Usage: `/lookup <email or name>`",
      response_type: "ephemeral",
    };
  }

  const tools = await getToolsForTenant(tenantId);
  const toolNames = Object.keys(tools);
  console.log(`Available MCP tools for /lookup: ${toolNames.join(", ")}`);

  // Find a user lookup tool — name may vary by mainframe implementation
  const lookupTool =
    tools["search_users"] ??
    tools["user_lookup"] ??
    tools["find_user"] ??
    tools["search_user"] ??
    tools["lookup_user"];

  if (!lookupTool) {
    console.error(`No lookup tool found. Available tools: ${toolNames.join(", ")}`);
    return {
      text: `No user lookup tool available. Available tools: ${toolNames.join(", ")}`,
      response_type: "ephemeral",
    };
  }

  try {
    const result = await lookupTool.execute({ query: payload.text }, { toolCallId: "slash-lookup", messages: [] });
    const formatted = typeof result === "string" ? result : JSON.stringify(result, null, 2);

    return {
      text: formatted,
      response_type: "ephemeral",
    };
  } catch (error) {
    console.error("Lookup tool execution failed:", error);
    return {
      text: `Lookup failed: ${error instanceof Error ? error.message : String(error)}`,
      response_type: "ephemeral",
    };
  }
};
