// ---------------------------------------------------------------------------
// Ollama Client — Client-side only (browser → local Ollama instance)
// ---------------------------------------------------------------------------

const DEFAULT_OLLAMA_URL = "http://localhost:11434"
const DEFAULT_MODEL = "mistral"
const STORAGE_KEY_URL = "ollama-url"
const STORAGE_KEY_MODEL = "ollama-model"

export interface OllamaConfig {
  url: string
  model: string
}

export interface OllamaGenerateOptions {
  prompt: string
  system?: string
  temperature?: number
  format?: "json"
}

export interface OllamaGenerateResponse {
  model: string
  response: string
  done: boolean
  total_duration?: number
  eval_count?: number
}

export interface OllamaModel {
  name: string
  size: number
  modified_at: string
}

// ---------------------------------------------------------------------------
// Config helpers (persisted in localStorage)
// ---------------------------------------------------------------------------

export function getOllamaConfig(): OllamaConfig {
  if (typeof window === "undefined") {
    return { url: DEFAULT_OLLAMA_URL, model: DEFAULT_MODEL }
  }
  return {
    url: localStorage.getItem(STORAGE_KEY_URL) || DEFAULT_OLLAMA_URL,
    model: localStorage.getItem(STORAGE_KEY_MODEL) || DEFAULT_MODEL,
  }
}

export function setOllamaConfig(config: Partial<OllamaConfig>) {
  if (typeof window === "undefined") return
  if (config.url !== undefined) {
    localStorage.setItem(STORAGE_KEY_URL, config.url)
  }
  if (config.model !== undefined) {
    localStorage.setItem(STORAGE_KEY_MODEL, config.model)
  }
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export async function checkOllamaHealth(): Promise<{
  connected: boolean
  error?: string
}> {
  const { url } = getOllamaConfig()
  try {
    const res = await fetch(`${url}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      return { connected: false, error: `HTTP ${res.status}` }
    }
    return { connected: true }
  } catch (err) {
    return {
      connected: false,
      error: err instanceof Error ? err.message : "Connection failed",
    }
  }
}

// ---------------------------------------------------------------------------
// List available models
// ---------------------------------------------------------------------------

export async function listModels(): Promise<OllamaModel[]> {
  const { url } = getOllamaConfig()
  const res = await fetch(`${url}/api/tags`, {
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Failed to list models: HTTP ${res.status}`)
  const data = await res.json()
  return data.models || []
}

// ---------------------------------------------------------------------------
// Generate completion (non-streaming)
// ---------------------------------------------------------------------------

export async function generate(
  options: OllamaGenerateOptions
): Promise<OllamaGenerateResponse> {
  const { url, model } = getOllamaConfig()

  const res = await fetch(`${url}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: options.prompt,
      system: options.system,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.1,
      },
      ...(options.format && { format: options.format }),
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Ollama generate failed: HTTP ${res.status} — ${text}`)
  }

  return res.json()
}
