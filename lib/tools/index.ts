import { createMCPClient } from "@ai-sdk/mcp";
import { getTenantById, getTenantSecrets, TenantConfig, TenantSecrets, TenantId } from "../tenants";
import { env } from "../env";

export type MCPToolConfig = {
  name: string;
  url: string;
  headers?: Record<string, string>;
};

export type UserContext = {
  email?: string;
  supabaseAccessToken?: string;
};

type MCPClient = Awaited<ReturnType<typeof createMCPClient>>;
type MCPClientTools = Awaited<ReturnType<MCPClient["tools"]>>;

export type ToolHandle = {
  tools: MCPClientTools;
  close: () => Promise<void>;
};

export class MCPUnauthorizedError extends Error {
  readonly code = "MCP_UNAUTHORIZED" as const;
  constructor(cause?: unknown) {
    super("MCP server returned 401", { cause });
    this.name = "MCPUnauthorizedError";
  }
}

// Substring match on the SDK error message; @ai-sdk/mcp's MCPClientError is
// internal. Pinned by the unit test below — replace with an instanceof check
// when typed transport errors land in the public API.
function isHttp401(err: unknown): boolean {
  return err instanceof Error && err.message.includes("HTTP 401");
}

function buildMainframeConfig(tenant: TenantConfig, secrets: TenantSecrets, userContext?: UserContext): MCPToolConfig {
  const headers: Record<string, string> = {
    "X-Internal-Api-Key": secrets.mainframeApiKey,
    "X-Slack-Bot-Token": env.SLACK_BOT_TOKEN,
  };

  if (userContext?.email) {
    // TODO: drop once Mainframe trusts the JWT email claim.
    headers["X-User-Email"] = userContext.email;
  }

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
    if (isHttp401(err)) throw new MCPUnauthorizedError(err);
    throw err;
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
    if (isHttp401(err)) throw new MCPUnauthorizedError(err);
    throw err;
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
