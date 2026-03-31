// ---------------------------------------------------------------------------
// Server-side Ollama Client — reads config from DB Settings or env vars
// ---------------------------------------------------------------------------

import { prisma } from "@/lib/prisma"

const DEFAULT_URL = "http://localhost:11434"
const DEFAULT_MODEL = "mistral"

interface ServerOllamaConfig {
  url: string
  model: string
}

async function getServerConfig(): Promise<ServerOllamaConfig> {
  // Try DB settings first
  try {
    const settings = await prisma.settings.findFirst()
    if (settings?.ollamaUrl && settings?.ollamaModel) {
      return { url: settings.ollamaUrl, model: settings.ollamaModel }
    }
  } catch {
    // Fall through to env vars
  }

  return {
    url: process.env.OLLAMA_URL || DEFAULT_URL,
    model: process.env.OLLAMA_MODEL || DEFAULT_MODEL,
  }
}

export async function checkServerOllamaHealth(): Promise<boolean> {
  const { url } = await getServerConfig()
  try {
    const res = await fetch(`${url}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function serverGenerate(options: {
  prompt: string
  system?: string
  temperature?: number
  format?: "json"
}): Promise<string> {
  const { url, model } = await getServerConfig()

  const res = await fetch(`${url}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: options.prompt,
      system: options.system,
      stream: false,
      options: { temperature: options.temperature ?? 0.3 },
      ...(options.format && { format: options.format }),
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Ollama generate failed: HTTP ${res.status} — ${text}`)
  }

  const data = await res.json()
  return data.response
}

export async function serverGenerateStream(options: {
  prompt: string
  system?: string
  temperature?: number
}): Promise<ReadableStream<Uint8Array>> {
  const { url, model } = await getServerConfig()

  const res = await fetch(`${url}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: options.prompt,
      system: options.system,
      stream: true,
      options: { temperature: options.temperature ?? 0.3 },
    }),
  })

  if (!res.ok || !res.body) {
    throw new Error(`Ollama stream failed: HTTP ${res.status}`)
  }

  // Transform Ollama's NDJSON stream into a text stream
  const reader = res.body.getReader()
  const decoder = new TextDecoder()

  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await reader.read()
      if (done) {
        controller.close()
        return
      }
      const text = decoder.decode(value)
      const lines = text.split("\n").filter(Boolean)
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line)
          if (parsed.response) {
            controller.enqueue(new TextEncoder().encode(parsed.response))
          }
          if (parsed.done) {
            controller.close()
            return
          }
        } catch {
          // Skip malformed lines
        }
      }
    },
  })
}
