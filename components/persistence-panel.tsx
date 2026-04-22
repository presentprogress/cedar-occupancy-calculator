"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { Save, FolderOpen, Upload, GitCompare, Trash2, Clock } from "lucide-react"
import type { AppState } from "@/lib/types"
import { normalizeImportedJson } from "@/lib/normalizer"

interface VersionMeta {
  id: number
  name: string
  isAuto: boolean
  createdAt: string
}

interface Props {
  currentState: AppState
  onLoad: (state: AppState) => void
  onCompare: () => void
}

export function PersistencePanel({ currentState, onLoad, onCompare }: Props) {
  const [versions, setVersions] = useState<VersionMeta[]>([])
  const [saveName, setSaveName] = useState("")
  const [saving, setSaving] = useState(false)
  const [versionOpen, setVersionOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importJson, setImportJson] = useState("")
  const [importSaveName, setImportSaveName] = useState("")
  const [saveAfterImport, setSaveAfterImport] = useState(false)

  const fetchVersions = useCallback(async () => {
    try {
      const res = await fetch("/api/versions")
      if (res.ok) setVersions(await res.json())
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    fetchVersions()
  }, [fetchVersions])

  const handleSave = async () => {
    if (!saveName.trim()) return
    setSaving(true)
    try {
      await fetch("/api/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: saveName.trim(), state: currentState, isAuto: false }),
      })
      toast.success(`Saved "${saveName.trim()}"`)
      setSaveName("")
      fetchVersions()
    } catch {
      toast.error("Save failed")
    } finally {
      setSaving(false)
    }
  }

  const handleLoad = async (id: number, name: string) => {
    try {
      const res = await fetch(`/api/versions/${id}`)
      if (!res.ok) throw new Error()
      const row = await res.json()
      onLoad(row.state as AppState)
      toast.success(`Loaded "${name}"`)
      setVersionOpen(false)
    } catch {
      toast.error("Failed to load version")
    }
  }

  const handleDelete = async (id: number, name: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await fetch(`/api/versions/${id}`, { method: "DELETE" })
      toast.success(`Deleted "${name}"`)
      fetchVersions()
    } catch {
      toast.error("Delete failed")
    }
  }

  const handleImport = async () => {
    let parsed: unknown
    try {
      parsed = JSON.parse(importJson)
    } catch {
      toast.error("Invalid JSON — check syntax and try again")
      return
    }
    const result = normalizeImportedJson(parsed)
    if (!result.success) {
      toast.error(`Import error: ${result.errors[0]}`)
      return
    }
    onLoad(result.state)
    if (saveAfterImport && importSaveName.trim()) {
      try {
        await fetch("/api/versions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: importSaveName.trim(), state: result.state, isAuto: false }),
        })
        toast.success(`Imported and saved as "${importSaveName.trim()}"`)
        fetchVersions()
      } catch {
        toast.success("Imported — but save failed")
      }
    } else {
      toast.success("Imported successfully")
    }
    setImportOpen(false)
    setImportJson("")
    setImportSaveName("")
  }

  const named = versions.filter((v) => !v.isAuto)
  const auto = versions.filter((v) => v.isAuto)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Save */}
      <div className="flex items-center gap-1">
        <Input
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          placeholder="Version name…"
          className="h-8 w-44 text-sm"
        />
        <Button size="sm" variant="outline" onClick={handleSave} disabled={saving || !saveName.trim()}>
          <Save className="mr-1.5 h-3.5 w-3.5" />
          Save
        </Button>
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* Load */}
      <Popover open={versionOpen} onOpenChange={setVersionOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline">
            <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
            Versions
            {versions.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-xs">
                {versions.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <div className="max-h-96 overflow-y-auto">
            {named.length === 0 && auto.length === 0 && (
              <p className="p-4 text-center text-sm text-muted-foreground">No saved versions yet</p>
            )}
            {named.length > 0 && (
              <div>
                <p className="px-3 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Named Saves
                </p>
                {named.map((v) => (
                  <VersionRow key={v.id} v={v} onLoad={handleLoad} onDelete={handleDelete} />
                ))}
              </div>
            )}
            {auto.length > 0 && (
              <div>
                {named.length > 0 && <Separator className="my-1" />}
                <p className="px-3 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Auto Snapshots
                </p>
                {auto.map((v) => (
                  <VersionRow key={v.id} v={v} onLoad={handleLoad} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Import */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Import JSON
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import from JSON</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder='{"spaces": [...], "equipment": [...], "maxOccupants": 80}'
              className="h-48 font-mono text-xs"
            />
            <div className="flex items-center gap-2">
              <input
                id="save-after-import"
                type="checkbox"
                checked={saveAfterImport}
                onChange={(e) => setSaveAfterImport(e.target.checked)}
                className="h-4 w-4"
              />
              <label htmlFor="save-after-import" className="text-sm">
                Save as named version:
              </label>
              <Input
                value={importSaveName}
                onChange={(e) => setImportSaveName(e.target.value)}
                placeholder="Version name"
                className="h-7 flex-1 text-sm"
                disabled={!saveAfterImport}
              />
            </div>
            <Button onClick={handleImport} disabled={!importJson.trim()} className="w-full">
              Import
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Compare */}
      <Button size="sm" variant="outline" onClick={onCompare} disabled={versions.length < 2}>
        <GitCompare className="mr-1.5 h-3.5 w-3.5" />
        Compare
      </Button>

      <span className="text-xs text-muted-foreground">Ctrl+Z to undo</span>
    </div>
  )
}

function VersionRow({
  v,
  onLoad,
  onDelete,
}: {
  v: VersionMeta
  onLoad: (id: number, name: string) => void
  onDelete: (id: number, name: string, e: React.MouseEvent) => void
}) {
  return (
    <div
      className="flex cursor-pointer items-center justify-between px-3 py-2 hover:bg-muted/50"
      onClick={() => onLoad(v.id, v.name)}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{v.name}</p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {new Date(v.createdAt).toLocaleString()}
        </p>
      </div>
      <div className="ml-2 flex items-center gap-1">
        {v.isAuto && (
          <Badge variant="outline" className="h-5 px-1 text-xs">
            Auto
          </Badge>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => onDelete(v.id, v.name, e)}
        >
          <Trash2 className="h-3 w-3 text-muted-foreground" />
        </Button>
      </div>
    </div>
  )
}
