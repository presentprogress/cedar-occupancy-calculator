"use client"

import { useEffect, useRef } from "react"
import type { AppState } from "@/lib/types"

const AUTO_SAVE_INTERVAL_MS = 60_000

export function useAutoSnapshot(state: AppState, enabled = true) {
  const stateRef = useRef(state)
  const lastSavedRef = useRef<string | null>(null)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    if (!enabled) return

    const interval = setInterval(async () => {
      const serialized = JSON.stringify(stateRef.current)
      if (serialized === lastSavedRef.current) return

      try {
        await fetch("/api/versions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `Auto snapshot – ${new Date().toLocaleString()}`,
            state: stateRef.current,
            isAuto: true,
          }),
        })
        lastSavedRef.current = serialized
      } catch {
        // best-effort, silent fail
      }
    }, AUTO_SAVE_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [enabled])
}
