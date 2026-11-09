import { useCallback, useEffect, useRef, useState } from "react"
import { loadScanSettings, saveScanSettings, type ScanSettings } from "./storageAdapter"

type SettingsRecord = {
  userId: string
  status: "loading" | "error" | "ready"
  settings: ScanSettings | null
  refreshing: boolean
}

// Saved scan settings for the signed-in account. The record is tagged by user ID,
// so after an account switch the previous account's settings are never returned:
// the caller sees "loading" until the new account's read finishes. A reload for
// the same account keeps the last confirmed settings visible and flags refreshing.
export function useSavedScanSettings(userId: string | null) {
  const [record, setRecord] = useState<SettingsRecord | null>(null)
  const [reloadCount, setReloadCount] = useState(0)
  const currentUser = useRef(userId)
  currentUser.current = userId

  useEffect(() => {
    if (!userId) {
      setRecord(null)
      return
    }
    let active = true
    setRecord((previous) =>
      previous?.userId === userId && previous.settings
        ? { ...previous, refreshing: true }
        : { userId, status: "loading", settings: null, refreshing: false },
    )
    loadScanSettings()
      .then((settings) => {
        if (active) setRecord({ userId, status: "ready", settings, refreshing: false })
      })
      .catch(() => {
        if (active) setRecord({ userId, status: "error", settings: null, refreshing: false })
      })
    return () => { active = false }
  }, [userId, reloadCount])

  const reload = useCallback(() => setReloadCount((count) => count + 1), [])

  // Resolves only after the backend confirms the save; a late result for an
  // account that has since signed out or switched is not stored.
  const save = useCallback(async (next: ScanSettings) => {
    const owner = currentUser.current
    const saved = await saveScanSettings(next)
    if (owner && currentUser.current === owner) {
      setRecord({ userId: owner, status: "ready", settings: saved, refreshing: false })
    }
    return saved
  }, [])

  const current = record && record.userId === userId ? record : null
  return {
    status: userId ? current?.status ?? "loading" : "idle",
    settings: current?.settings ?? null,
    refreshing: current?.refreshing ?? false,
    reload,
    save,
  } as const
}
