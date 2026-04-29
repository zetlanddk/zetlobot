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

// @ai-sdk/mcp's HTTP transport stuffs the response status into the error
// message (`... (HTTP NNN): ...`) without exposing it as a structured field.
// Tight enough to skip mainframe error bodies that don't use parens; loose
// enough to survive small upstream wording changes. If it ever stops
// matching, status is undefined and the gate falls through to today's
// 401/transient-error handling rather than misclassifying.
const HTTP_STATUS_FROM_MESSAGE = /\(HTTP (\d{3})\)/;

export class MCPTransportError extends Error {
  readonly code = "MCP_TRANSPORT_ERROR" as const;
  readonly status?: number;
  constructor(cause?: unknown) {
    const message = cause instanceof Error ? cause.message : "MCP transport error";
    super(message, { cause });
    this.name = "MCPTransportError";
    const match = message.match(HTTP_STATUS_FROM_MESSAGE);
    if (match) this.status = Number(match[1]);
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
