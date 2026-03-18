import { createMCPClient } from "@ai-sdk/mcp";
import { getTenantById, getTenantSecrets, TenantConfig, TenantSecrets, TenantId } from "../tenants";
import { env } from "../env";

export type ToolStatus = {
  name: string;
  status: "ok" | "error";
  error?: string;
};

export type MCPToolConfig = {
  name: string;
  url: string;
  headers?: Record<string, string>;
};

export type UserContext = {
  email?: string;
};

type MCPClient = Awaited<ReturnType<typeof createMCPClient>>;
type MCPClientTools = Awaited<ReturnType<MCPClient["tools"]>>;

// Status cache for getToolStatusesForTenant
const statusCache = new Map<TenantId, ToolStatus[]>();

function buildMainframeConfig(tenant: TenantConfig, secrets: TenantSecrets, userContext?: UserContext): MCPToolConfig {
  const headers: Record<string, string> = {
    "X-Internal-Api-Key": secrets.mainframeApiKey,
    "X-Slack-Bot-Token": env.SLACK_BOT_TOKEN,
  };

  if (userContext?.email) {
    headers["X-User-Email"] = userContext.email;
  }

  return {
    name: "mainframe",
    url: `${tenant.mainframeApiRoot}/api/v1/internal/mcp`,
    headers,
  };
}

async function initializeClient(config: MCPToolConfig): Promise<{ tools: MCPClientTools; close: () => Promise<void> }> {
  console.log(`Initializing MCP client: ${config.name}`);

  const client = await createMCPClient({
    transport: {
      type: "http",
      url: config.url,
      headers: config.headers,
    },
  });

  const tools = await client.tools();
  console.log(`MCP client ${config.name} initialized successfully`);

  return { tools, close: () => client.close() };
}

export async function getToolsForTenant(tenantId: TenantId, userContext?: UserContext): Promise<{ tools: MCPClientTools; close: () => Promise<void> }> {
  const tenant = getTenantById(tenantId);
  if (!tenant) {
    throw new Error(`Unknown tenant: ${tenantId}`);
  }
  const secrets = getTenantSecrets(tenantId);

  const mainframeConfig = buildMainframeConfig(tenant, secrets, userContext);

  const statuses: ToolStatus[] = [];
  let mainframeTools: MCPClientTools = {};
  let closeFn = async () => {};

  try {
    const result = await initializeClient(mainframeConfig);
    mainframeTools = result.tools;
    closeFn = result.close;
    statuses.push({ name: mainframeConfig.name, status: "ok" });
  } catch (error) {
    console.error(`Failed to initialize MCP client ${mainframeConfig.name}:`, error);
    statuses.push({
      name: mainframeConfig.name,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  statusCache.set(tenantId, statuses);

  return { tools: mainframeTools, close: closeFn };
}

export function getToolStatusesForTenant(tenantId: TenantId): ToolStatus[] {
  return statusCache.get(tenantId) ?? [];
}
