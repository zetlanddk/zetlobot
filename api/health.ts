import { getTenantById, getTenantSecrets, TenantId } from "../lib/tenants";

export async function GET() {
  const timestamp = new Date().toISOString();
  const tenantId: TenantId = "zetland";
  const tenant = getTenantById(tenantId);
  const secrets = getTenantSecrets(tenantId);

  // Lightweight health check: ping mainframe MCP endpoint directly instead of
  // creating a full MCP client on every health check
  let mainframeStatus: "ok" | "error" = "error";
  let mainframeError: string | undefined;

  if (tenant) {
    try {
      const res = await fetch(`${tenant.mainframeApiRoot}/api/v1/internal/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Api-Key": secrets.mainframeApiKey,
        },
        body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: "health-check", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "zetlobot-health", version: "1.0.0" } } }),
        signal: AbortSignal.timeout(5000),
      });
      mainframeStatus = res.ok ? "ok" : "error";
      if (!res.ok) {
        mainframeError = `HTTP ${res.status}`;
      }
    } catch (error) {
      mainframeError = error instanceof Error ? error.message : String(error);
    }
  }

  const toolStatuses = [{ name: "mainframe", status: mainframeStatus, ...(mainframeError && { error: mainframeError }) }];
  const allToolsHealthy = mainframeStatus === "ok";

  const healthData = {
    status: allToolsHealthy ? "healthy" : "degraded",
    timestamp,
    service: "zetlobot",
    version: "1.0.0",
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "production",
    tenant: tenantId,
    tools: toolStatuses,
  };

  return new Response(JSON.stringify(healthData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    },
    status: 200,
  });
}
