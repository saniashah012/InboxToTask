import { useEffect, useState } from "react"
import { Icon } from "./designedUi"
import GoogleConnectionPanel from "./GoogleConnectionPanel"
import type { ScanSettings } from "./storageAdapter"
import {
  accessScopeSummary,
  contextLimitError,
  preferencesFromSettings,
  sameSavedFields,
  scanBlockers,
  settingsWithPreferences,
  type ContextLimits,
} from "./scanSetup"
import {
  SCAN_CONSENT_LABEL,
  SCAN_DISCLOSURE,
  SCAN_DISCLOSURE_EFFECTS,
} from "./scanConsent"
import { Brand } from "./AppChrome"
import RulesEditor from "./RulesEditor"
import { ContextLimitInputs, SaveFailure, useGmailState, useSettingsSave } from "./settingsForm"

export type SettingsSection = "sources" | "processing" | "connections" | "retention"

// The designed settings screen for a signed-in account. It edits the same saved
// scan settings as onboarding and the workspace form, through scan_settings_save.
export default function RealSettingsScreen({
  settings,
  email,
  refreshing,
  initialSection,
  onSave,
  onReload,
  onRunSetup,
  onBack,
}: {
  settings: ScanSettings
  email: string
  refreshing: boolean
  initialSection: SettingsSection
  onSave: (next: ScanSettings) => Promise<ScanSettings>
  onReload: () => void
  onRunSetup: () => void
  onBack: () => void
}) {
  const [section, setSection] = useState<SettingsSection>(initialSection)
  const [preferences, setPreferences] = useState(() => preferencesFromSettings(settings))
  const [context, setContext] = useState<ContextLimits>(() => ({ ...settings.context_limits }))
  const [consent, setConsent] = useState(settings.consent)
  const [paused, setPaused] = useState(settings.paused)
  const { saving, saveError, setSaveError, run } = useSettingsSave()
  const [savedRevision, setSavedRevision] = useState<number | null>(null)
  // A confirmed save or a reload replaces the draft with what is actually stored.
  useEffect(() => {
    setPreferences(preferencesFromSettings(settings))
    setContext({ ...settings.context_limits })
    setConsent(settings.consent)
    setPaused(settings.paused)
  }, [settings])
  const gmail = useGmailState(true, section)

  const draft = { ...settingsWithPreferences(settings, preferences, context), consent, paused }
  const dirty = !sameSavedFields(draft, settings)
  const contextError = contextLimitError(context)
  const blockers = scanBlockers(settings, gmail.checking ? "unknown" : gmail.state)

  const save = async () => {
    if (saving || !dirty) return
    if (contextError) {
      setSaveError({ message: contextError, stale: false })
      return
    }
    setSavedRevision(null)
    await run(() => onSave(draft), (result) => setSavedRevision(result.revision))
  }

  const sections: [SettingsSection, string][] = [
    ["sources", "Sources & exclusions"],
    ["processing", "Consent & context"],
    ["connections", "Connections"],
    ["retention", "Data & retention"],
  ]

  const saveBar = (
    <div className="real-settings-save">
      {refreshing && <p className="save-confirmation" role="status">Reloading saved settings…</p>}
      {saving && <p className="save-confirmation" role="status">Saving settings…</p>}
      {!saving && savedRevision !== null && !dirty && (
        <p className="save-confirmation" role="status">
          Saved (revision {savedRevision}). No email was read and no scan was started.
        </p>
      )}
      {dirty && !saving && <p className="settings-footnote" role="status">Unsaved changes on this page.</p>}
      <SaveFailure error={saveError} onReload={() => { setSaveError(null); onReload() }} reloading={refreshing} />
      <div className="step-actions">
        <button
          className="secondary-button"
          disabled={saving || refreshing}
          onClick={() => { setSaveError(null); setSavedRevision(null); onReload() }}
          type="button"
        >
          Reload saved settings
        </button>
        <button
          className="primary-button"
          disabled={!dirty || saving || refreshing || Boolean(contextError)}
          onClick={() => void save()}
          type="button"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
      </div>
    </div>
  )

  return (
    <div className="settings-shell">
      <header className="topbar">
        <Brand onHome={() => {
          if (dirty && !window.confirm("Leave settings? Your unsaved changes will be discarded.")) return
          onBack()
        }} />
        <div className="topbar-actions">
          <span className="demo-mode-badge">Signed in · {email}</span>
          <button className="secondary-button" onClick={onBack}>
            <Icon name="arrow" size={15} /> {dirty ? "Back to dashboard (discard changes)" : "Back to dashboard"}
          </button>
        </div>
      </header>
      <main className="settings-main">
        <aside className="settings-nav">
          <p className="kicker">Account</p>
          <h1>Settings</h1>
          <nav aria-label="Settings sections">
            {sections.map(([key, label]) => (
              <button
                aria-current={section === key ? "page" : undefined}
                className={section === key ? "active" : ""}
                key={key}
                onClick={() => setSection(key)}
              >
                {label}
              </button>
            ))}
          </nav>
        </aside>
        <section className="settings-content">
          <div className={`notice ${blockers.length ? "warning" : "neutral"}`} role="status">
            <strong>{blockers.length ? "Scanning is off" : "Saved settings permit a manual scan"}</strong>
            <span>
              {blockers.length
                ? blockers.join(" ")
                : "Scans still start only when you request one from the dashboard."}
            </span>
          </div>
          {section === "sources" && (
            <>
              <SettingsHeading
                title="Email preferences"
                description="Saved to your account. Exact sender and domain permissions control access; topic word lists are checked before Gemini, to skip email or to require one of your topics."
              />
              <RulesEditor rules={preferences} onChange={setPreferences} />
              <p className="settings-footnote">{accessScopeSummary(preferences)} Topics never grant access.</p>
              {saveBar}
            </>
          )}
          {section === "processing" && (
            <>
              <SettingsHeading
                title="Consent and thread context"
                description="Consent, pause, and context limits are saved with your source rules."
              />
              <div className="settings-card">
                <div className="card-heading">
                  <div>
                    <strong>Scanning consent</strong>
                    <span>{SCAN_DISCLOSURE}</span>
                  </div>
                </div>
                <p className="settings-footnote">{SCAN_DISCLOSURE_EFFECTS}</p>
                <label className="real-settings-check">
                  <input checked={consent} disabled={saving} onChange={(event) => setConsent(event.target.checked)} type="checkbox" />
                  {SCAN_CONSENT_LABEL}
                </label>
                <label className="real-settings-check">
                  <input checked={paused} disabled={saving} onChange={(event) => setPaused(event.target.checked)} type="checkbox" />
                  Pause scanning
                </label>
              </div>
              <div className="settings-card">
                <div className="card-heading">
                  <div>
                    <strong>Earlier permitted messages</strong>
                    <span>
                      Each earlier message independently passes current source
                      rules before its body is retrieved. Zero turns off earlier
                      context. Quoted-text removal is imperfect.
                    </span>
                  </div>
                </div>
                <ContextLimitInputs value={context} onChange={setContext} disabled={saving} />
                {contextError && <p className="notice warning" role="alert">{contextError}</p>}
              </div>
              {saveBar}
            </>
          )}
          {section === "connections" && (
            <>
              <SettingsHeading
                title="Connections"
                description="Gmail access is separate from sign-in and from scanning consent."
              />
              <div className="storage-page onboarding-google">
                <GoogleConnectionPanel />
              </div>
              <div className="settings-card connection-setting">
                <div>
                  <span className="service-icon calendar-service">
                    <Icon name="calendar" size={17} />
                  </span>
                  <div>
                    <strong>Google Calendar</strong>
                    <span>Not connected · planned for a later release</span>
                  </div>
                </div>
                <button className="secondary-button" disabled>
                  Unavailable
                </button>
              </div>
              <p className="settings-footnote">
                Accepted tasks can be exported as calendar files from the
                dashboard. Nothing is written to Google Calendar.
              </p>
              <div className="settings-card split-card">
                <div>
                  <strong>Guided setup</strong>
                  <span>Walk through connection, sources, exclusions, and consent again, starting from your saved settings.</span>
                </div>
                <button className="secondary-button" disabled={saving} onClick={onRunSetup}>
                  Run setup again
                </button>
              </div>
            </>
          )}
          {section === "retention" && (
            <>
              <SettingsHeading
                title="Data and retention"
                description="What is kept when a manual scan processes permitted email."
              />
              <p>{SCAN_DISCLOSURE}</p>
              <p className="settings-footnote">
                Completing or deleting an InboxToTask record does not delete
                Gmail messages. Account deletion is not available in this
                release.
              </p>
            </>
          )}
        </section>
      </main>
    </div>
  )
}

function SettingsHeading({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="settings-heading">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  )
}
