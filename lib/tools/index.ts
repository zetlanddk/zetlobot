import { createMCPClient } from "@ai-sdk/mcp";
import { getTenantById, getTenantSecrets, TenantConfig, TenantSecrets, TenantId } from "../tenants";
import { env } from "../env";

export type MCPToolConfig = {
  name: string;
  url: string;
  headers?: Record<string, string>;
};

export type UserContext = {
  supabaseAccessToken?: string;
};

type MCPClient = Awaited<ReturnType<typeof createMCPClient>>;
type MCPClientTools = Awaited<ReturnType<MCPClient["tools"]>>;

export type ToolHandle = {
  tools: MCPClientTools;
  close: () => Promise<void>;
};

// Wraps any throw from createMCPClient or client.tools(). The caller (the
// auth gate) refreshes the Supabase token once and retries; on a second
// failure, propagates as a generic error. We can't distinguish 401 from
// other transport failures because @ai-sdk/mcp surfaces them as a plain
// Error with no structured status. The cost of refreshing on a transient
// non-auth failure is one extra Supabase call — cheap.
export class MCPTransportError extends Error {
  readonly code = "MCP_TRANSPORT_ERROR" as const;
  constructor(cause?: unknown) {
    super(cause instanceof Error ? cause.message : "MCP transport error", { cause });
    this.name = "MCPTransportError";
  }
}

function buildMainframeConfig(tenant: TenantConfig, secrets: TenantSecrets, userContext?: UserContext): MCPToolConfig {
  const headers: Record<string, string> = {
    "X-Internal-Api-Key": secrets.mainframeApiKey,
  };

  if (userContext?.supabaseAccessToken) {
    headers["Authorization"] = `Bearer ${userContext.supabaseAccessToken}`;
  }

  return {
    name: "mainframe",
    url: `${tenant.mainframeApiRoot}/api/v1/internal/mcp`,
    headers,
  };
}

async function initializeClient(config: MCPToolConfig): Promise<ToolHandle> {
  console.log(`Initializing MCP client: ${config.name}`);

  let client: MCPClient;
  try {
    client = await createMCPClient({
      transport: {
        type: "http",
        url: config.url,
        headers: config.headers,
      },
    });
  } catch (err) {
    throw new MCPTransportError(err);
  }

  try {
    const tools = await client.tools();
    console.log(`MCP client ${config.name} initialized successfully`);
    return {
      tools,
      close: async () => {
        try {
          await client.close();
        } catch (err) {
          console.error(`Error closing MCP client ${config.name}:`, err);
        }
      },
    };
  } catch (err) {
    await client.close().catch(() => {});
    throw new MCPTransportError(err);
  }
}

export async function getToolsForTenant(tenantId: TenantId, userContext?: UserContext): Promise<ToolHandle> {
  const tenant = getTenantById(tenantId);
  if (!tenant) {
    throw new Error(`Unknown tenant: ${tenantId}`);
  }
  const secrets = getTenantSecrets(tenantId);

  const mainframeConfig = buildMainframeConfig(tenant, secrets, userContext);
  return initializeClient(mainframeConfig);
}
