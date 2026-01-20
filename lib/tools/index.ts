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

// Per-tenant caches for non-user-specific tools
const staticToolsCache = new Map<TenantId, MCPClientTools>();
const staticStatusCache = new Map<TenantId, ToolStatus[]>();

// Combined status cache (static + mainframe) for getToolStatusesForTenant
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

function buildStaticToolConfigs(tenant: TenantConfig, secrets: TenantSecrets): MCPToolConfig[] {
  return [
    {
      name: "chargebee-data-lookup",
      url: tenant.chargebeeDataLookup,
      headers: { Authorization: `Bearer ${secrets.chargebeeApiKey}` },
    },
    {
      name: "chargebee-knowledge-base",
      url: tenant.chargebeeKnowledgeBase,
    },
    {
      name: "pager-duty",
      url: "https://mcp.pagerduty.com/mcp",
      headers: { Authorization: `Token ${env.PAGER_DUTY_API_KEY}` },
    },
  ];
}

async function getStaticToolsForTenant(tenantId: TenantId, tenant: TenantConfig, secrets: TenantSecrets): Promise<{ tools: MCPClientTools; statuses: ToolStatus[] }> {
  if (staticToolsCache.has(tenantId)) {
    return {
      tools: staticToolsCache.get(tenantId)!,
      statuses: staticStatusCache.get(tenantId) ?? [],
    };
  }

  const configs = buildStaticToolConfigs(tenant, secrets);
  let tools: MCPClientTools = {};
  const statuses: ToolStatus[] = [];

  for (const config of configs) {
    try {
      const clientTools = await initializeClient(config);
      tools = { ...tools, ...clientTools };
      statuses.push({ name: config.name, status: "ok" });
    } catch (error) {
      console.error(`Failed to initialize MCP client ${config.name}:`, error);
      statuses.push({
        name: config.name,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  staticToolsCache.set(tenantId, tools);
  staticStatusCache.set(tenantId, statuses);

  return { tools, statuses };
}

async function initializeClient(config: MCPToolConfig): Promise<MCPClientTools> {
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

  return tools;
}

export async function getToolsForTenant(tenantId: TenantId, userContext?: UserContext): Promise<MCPClientTools> {
  const tenant = getTenantById(tenantId);
  if (!tenant) {
    throw new Error(`Unknown tenant: ${tenantId}`);
  }
  const secrets = getTenantSecrets(tenantId);

  // Get cached static tools (chargebee, pagerduty)
  const { tools: staticTools, statuses: staticStatuses } = await getStaticToolsForTenant(tenantId, tenant, secrets);

  // Build mainframe client fresh each time (has user-specific headers)
  const mainframeConfig = buildMainframeConfig(tenant, secrets, userContext);

  const allStatuses = [...staticStatuses];
  let mainframeTools: MCPClientTools = {};
  try {
    mainframeTools = await initializeClient(mainframeConfig);
    allStatuses.push({ name: mainframeConfig.name, status: "ok" });
  } catch (error) {
    console.error(`Failed to initialize MCP client ${mainframeConfig.name}:`, error);
    allStatuses.push({
      name: mainframeConfig.name,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Update status cache with all statuses
  statusCache.set(tenantId, allStatuses);

  return { ...staticTools, ...mainframeTools };
}

export function getToolStatusesForTenant(tenantId: TenantId): ToolStatus[] {
  return statusCache.get(tenantId) ?? [];
}
