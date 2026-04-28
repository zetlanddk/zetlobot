// Liveness probe. By the time this handler runs, env validation has already
// passed (it runs at module load), so reaching this code path is itself the
// signal that the function is healthy enough to respond. Backing services
// (Mainframe, Supabase, Redis, Anthropic) are not probed here — their health
// surfaces through actual request paths and their own status pages.
export async function GET() {
  const body = {
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "zetlobot",
    version: "1.0.0",
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "production",
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    },
    status: 200,
  });
}
