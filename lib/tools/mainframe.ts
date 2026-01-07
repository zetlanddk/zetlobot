import { getRequiredEnv } from "../utils";
import { createMCPTool } from "./create-mcp-tool";

const apiRoot = getRequiredEnv("MAINFRAME_API_ROOT");
const apiKey = getRequiredEnv("MAINFRAME_API_KEY");

const mainframeTool = createMCPTool({
  name: "Mainframe",
  transport: {
    type: "http",
    url: `${apiRoot}/api/v1/internal/mcp`,
    headers: { "X-Internal-Api-Key": apiKey },
  },
});

export const getTools = mainframeTool.getTools;
