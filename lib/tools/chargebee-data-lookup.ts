import { getRequiredEnv } from "../utils";
import { createMCPTool } from "./create-mcp-tool";

const url = getRequiredEnv("CHARGEBEE_DATA_LOOKUP");
const apiKey = getRequiredEnv("CHARGEBEE_DATA_LOOKUP_API_KEY");

const chargebeeDataLookup = createMCPTool({
  name: "Chargebee Data Lookup",
  transport: {
    type: "http",
    url,
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  },
});

export const getTools = chargebeeDataLookup.getTools;
