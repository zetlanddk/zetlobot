import { createMCPClient } from "@ai-sdk/mcp";
import { getTenantById, getTenantSecrets, TenantConfig, TenantSecrets } from "../tenants";
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

type MCPClient = Awaited<ReturnType<typeof createMCPClient>>;
type MCPClientTools = Awaited<ReturnType<MCPClient["tools"]>>;

// Per-tenant caches
const toolsCache = new Map<string, MCPClientTools>();
const statusCache = new Map<string, ToolStatus[]>();

function buildToolConfigs(tenant: TenantConfig, secrets: TenantSecrets): MCPToolConfig[] {
  return [
    {
      name: "mainframe",
      url: `${tenant.mainframeApiRoot}/api/v1/internal/mcp`,
      headers: { "X-Internal-Api-Key": secrets.mainframeApiKey },
    },
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

export async function getToolsForTenant(tenantId: string): Promise<MCPClientTools> {
  if (toolsCache.has(tenantId)) {
    return toolsCache.get(tenantId)!;
  }

  const tenant = getTenantById(tenantId);
  if (!tenant) {
    throw new Error(`Unknown tenant: ${tenantId}`);
  }

  const secrets = getTenantSecrets(tenantId);
  const configs = buildToolConfigs(tenant, secrets);

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

  toolsCache.set(tenantId, tools);
  statusCache.set(tenantId, statuses);

  return tools;
}

export function getToolStatusesForTenant(tenantId: string): ToolStatus[] {
  return statusCache.get(tenantId) ?? [];
}
