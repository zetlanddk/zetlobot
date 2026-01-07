import { getRequiredEnv } from "../utils";
import { createMCPTool } from "./create-mcp-tool";

const url = getRequiredEnv("CHARGEBEE_KNOWLEDGE_BASE");

const chargebeeKnowledgeBase = createMCPTool({
  name: "Chargebee Knowledge Base",
  transport: {
    type: "http",
    url,
  },
});

export const getTools = chargebeeKnowledgeBase.getTools;
