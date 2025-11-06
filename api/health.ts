export async function GET() {
  const timestamp = new Date().toISOString();

  const healthData = {
    status: "healthy",
    timestamp,
    service: "zetlobot",
    version: "1.0.0",
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "production",
  };

  return new Response(JSON.stringify(healthData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    },
    status: 200,
  });
}
