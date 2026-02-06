const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL

export async function triggerN8nWebhook(
  event: string,
  data: Record<string, unknown>
) {
  if (!N8N_WEBHOOK_URL) return null

  try {
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        data,
        timestamp: new Date().toISOString(),
      }),
    })
    return response.ok
  } catch (error) {
    console.error("n8n webhook failed:", error)
    return false
  }
}
