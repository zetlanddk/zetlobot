import { getToolsForTenant, getToolStatusesForTenant, ToolStatus } from "../lib/tools";

export async function GET() {
  const timestamp = new Date().toISOString();

  // Check tools for the default tenant (zetland)
  const tenantId = "zetland";
  await getToolsForTenant(tenantId);

  const toolStatuses = getToolStatusesForTenant(tenantId);
  const allToolsHealthy = toolStatuses.every((t: ToolStatus) => t.status === "ok");

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
