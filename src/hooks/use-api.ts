"use client"

import { useState, useCallback, useEffect } from "react"

interface UseApiOptions<T> {
  /** Don't fetch until this is true (useful for waiting on params) */
  enabled?: boolean
  /** Transform the response before setting data */
  transform?: (response: any) => T
}

interface UseApiReturn<T> {
  data: T | null
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useApi<T>(
  endpoint: string,
  params?: Record<string, string | number | boolean | null | undefined>,
  options?: UseApiOptions<T>
): UseApiReturn<T> {
  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enabled = options?.enabled !== false
  const transform = options?.transform

  // Build URLSearchParams, skipping null/undefined/"all" values
  const buildUrl = useCallback((): string => {
    const url = new URL(endpoint, typeof window !== "undefined" ? window.location.origin : "http://localhost")
    const searchParams = new URLSearchParams()

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        // Skip null, undefined, and "all" values
        if (value !== null && value !== undefined && value !== "all") {
          searchParams.set(key, String(value))
        }
      })
    }

    if (searchParams.toString()) {
      return `${endpoint}?${searchParams.toString()}`
    }
    return endpoint
  }, [endpoint, params])

  const fetchData = useCallback(async () => {
    if (!enabled) return

    setIsLoading(true)
    setError(null)

    try {
      const url = buildUrl()
      const res = await globalThis.fetch(url)

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const response = await res.json()

      if (!response.success) {
        throw new Error(response.error || "API returned success: false")
      }

      // Apply transform or default to extracting response.data
      const transformedData = transform ? transform(response) : response.data
      setData(transformedData)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch data"
      setError(errorMessage)
      console.error(`Error fetching ${endpoint}:`, err)
    } finally {
      setIsLoading(false)
    }
  }, [enabled, buildUrl, transform])

  // Fetch on mount and when dependencies change
  // Use JSON.stringify for stable param comparison
  const paramsDeps = params ? JSON.stringify(params) : ""
  useEffect(() => {
    fetchData()
  }, [endpoint, paramsDeps, fetchData])

  const refetch = useCallback(() => {
    fetchData()
  }, [fetchData])

  return {
    data,
    isLoading,
    error,
    refetch,
  }
}
