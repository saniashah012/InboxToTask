// Pieces shared by the onboarding and settings screens, which edit the same
// saved scan settings through scan_settings_save.
import { useEffect, useState } from "react"
import { googleConnectionStatus } from "./storageAdapter"
import { contextLimitFields, type ContextLimits, type GmailState } from "./scanSetup"

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
  error: { message: string; stale: boolean } | null
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
