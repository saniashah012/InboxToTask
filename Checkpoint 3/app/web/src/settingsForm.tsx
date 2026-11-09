// Pieces shared by the onboarding and settings screens, which edit the same
// saved scan settings through scan_settings_save.
import { useEffect, useRef, useState } from "react"
import { googleConnectionStatus, ScanSettingsSaveError } from "./storageAdapter"
import { contextLimitFields, type ContextLimits, type GmailState } from "./scanSetup"

export type SaveError = { message: string; stale: boolean }

// Save state for a settings form. Results and errors apply only while the form
// is mounted; busy state clears in finally.
export function useSettingsSave() {
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<SaveError | null>(null)
  const live = useRef(true)
  useEffect(() => {
    live.current = true
    return () => { live.current = false }
  }, [])
  const run = async <T,>(operation: () => Promise<T>, onSaved?: (result: T) => void) => {
    setSaving(true)
    setSaveError(null)
    try {
      const result = await operation()
      if (live.current) onSaved?.(result)
    } catch (error) {
      if (!live.current) return
      setSaveError(
        error instanceof ScanSettingsSaveError
          ? { message: error.message, stale: error.stale }
          : { message: "Settings were not saved. Check your connection and retry.", stale: false },
      )
    } finally {
      if (live.current) setSaving(false)
    }
  }
  return { saving, saveError, setSaveError, run }
}

export function useGmailState(enabled: boolean, refreshKey: unknown) {
  const [state, setState] = useState<{ state: GmailState; email?: string; checking: boolean }>({ state: "unknown", checking: enabled })
  useEffect(() => {
    if (!enabled) return
    let active = true
    setState((current) => ({ ...current, checking: true }))
    googleConnectionStatus()
      .then((status) => { if (active) setState({ state: status.state, email: status.email, checking: false }) })
      .catch(() => { if (active) setState({ state: "unknown", checking: false }) })
    return () => { active = false }
  }, [enabled, refreshKey])
  return state
}

export function ContextLimitInputs({
  value,
  onChange,
  disabled = false,
}: {
  value: ContextLimits
  onChange: (value: ContextLimits) => void
  disabled?: boolean
}) {
  return (
    <div className="context-fields">
      {contextLimitFields.map((field) => (
        <label key={field.key}>
          <span>
            {field.label} ({field.min}–{field.max})
          </span>
          <div className={field.suffix ? "input-suffix" : undefined}>
            <input
              disabled={disabled}
              max={field.max}
              min={field.min}
              onChange={(event) =>
                onChange({ ...value, [field.key]: event.target.valueAsNumber })
              }
              required
              step="1"
              type="number"
              value={Number.isNaN(value[field.key]) ? "" : value[field.key]}
            />
            {field.suffix && <span>{field.suffix}</span>}
          </div>
        </label>
      ))}
    </div>
  )
}

export function SaveFailure({
  error,
  onReload,
  reloading,
}: {
  error: SaveError | null
  onReload: () => void
  reloading: boolean
}) {
  if (!error) return null
  return (
    <div className="notice warning" role="alert">
      <span>{error.message}</span>
      {error.stale && (
        <button className="secondary-button" disabled={reloading} onClick={onReload} type="button">
          {reloading ? "Reloading…" : "Reload saved settings (discards unsaved edits)"}
        </button>
      )}
    </div>
  )
}
