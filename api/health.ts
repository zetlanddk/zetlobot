import { getTools, getToolStatuses } from "../lib/tools";

export async function GET() {
  const timestamp = new Date().toISOString();

  // Ensure tools are initialized before checking status
  await getTools();

  const toolStatuses = getToolStatuses();
  const allToolsHealthy = toolStatuses.every((t) => t.status === "ok");

  const healthData = {
    status: allToolsHealthy ? "healthy" : "degraded",
    timestamp,
    service: "zetlobot",
    version: "1.0.0",
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "production",
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
