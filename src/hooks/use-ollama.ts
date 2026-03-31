"use client"

import { useState, useEffect, useCallback } from "react"
import { checkOllamaHealth } from "@/lib/ollama"

/**
 * Hook to track Ollama connection status.
 * Checks on mount and provides a manual recheck function.
 */
export function useOllama() {
  const [isConnected, setIsConnected] = useState(false)
  const [isChecking, setIsChecking] = useState(true)

  const check = useCallback(async () => {
    setIsChecking(true)
    try {
      const { connected } = await checkOllamaHealth()
      setIsConnected(connected)
    } catch {
      setIsConnected(false)
    } finally {
      setIsChecking(false)
    }
  }, [])

  useEffect(() => {
    check()
  }, [check])

  return { isConnected, isChecking, recheck: check }
}
