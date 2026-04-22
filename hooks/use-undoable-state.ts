"use client"

import { useState, useCallback, useRef } from "react"

const MAX_UNDO_DEPTH = 100

export function useUndoableState<T>(initial: T) {
  const [present, setPresent] = useState<T>(initial)
  const historyRef = useRef<T[]>([])

  const setState = useCallback(
    (valueOrUpdater: T | ((prev: T) => T), options?: { skipHistory?: boolean }) => {
      setPresent((prev) => {
        const next =
          typeof valueOrUpdater === "function"
            ? (valueOrUpdater as (p: T) => T)(prev)
            : valueOrUpdater
        if (!options?.skipHistory) {
          historyRef.current = [...historyRef.current, prev].slice(-MAX_UNDO_DEPTH)
        }
        return next
      })
    },
    []
  )

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return
    const prev = historyRef.current[historyRef.current.length - 1]
    historyRef.current = historyRef.current.slice(0, -1)
    setPresent(prev)
  }, [])

  const canUndo = () => historyRef.current.length > 0

  return { state: present, setState, undo, canUndo }
}
