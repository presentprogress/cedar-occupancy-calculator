"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Moon, Sun } from "lucide-react"

export function ThemeToggle() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem("cedar-theme")
    if (stored === "dark") apply(true)
  }, [])

  function apply(next: boolean) {
    setDark(next)
    document.documentElement.classList.toggle("dark", next)
    localStorage.setItem("cedar-theme", next ? "dark" : "light")
  }

  return (
    <Button
      variant="outline"
      size="icon"
      className="h-8 w-8 shrink-0"
      onClick={() => apply(!dark)}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  )
}
