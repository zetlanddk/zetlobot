export async function sendDeferredResponse(
  responseUrl: string,
  text: string,
  responseType: "ephemeral" | "in_channel" = "ephemeral",
) {
  try {
    const res = await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        response_type: responseType,
        replace_original: true,
      }),
    });

    if (!res.ok) {
      console.error(`Failed to send deferred response: ${res.status} ${res.statusText}`);
    }
  } catch (error) {
    console.error("Error sending deferred response:", error);
  }
}
