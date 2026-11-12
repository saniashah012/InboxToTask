import { useEffect, useState } from "react"
import { Icon, Modal } from "./designedUi"
import GoogleConnectionPanel from "./GoogleConnectionPanel"
import type { ScanSettings } from "./storageAdapter"
import {
  accessScopeSummary,
  contextLimitError,
  NO_SETTINGS_CHANGES,
  preferencesFromSettings,
  sameSavedFields,
  scanBlockers,
  settingsChanges,
  settingsSavedNotice,
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
  onSaveAutoScan,
  onReload,
  onRunSetup,
  onBack,
  onSaved,
}: {
  settings: ScanSettings
  email: string
  refreshing: boolean
  initialSection: SettingsSection
  onSave: (next: ScanSettings) => Promise<ScanSettings>
  onSaveAutoScan: (enabled: boolean) => Promise<ScanSettings>
  onReload: () => void
  onRunSetup: () => void
  onBack: () => void
  // Back to the dashboard with a message saying what the save changed.
  onSaved: (notice: string) => void
}) {
  const [section, setSection] = useState<SettingsSection>(initialSection)
  const [preferences, setPreferences] = useState(() => preferencesFromSettings(settings))
  const [context, setContext] = useState<ContextLimits>(() => ({ ...settings.context_limits }))
  const [consent, setConsent] = useState(settings.consent)
  const [paused, setPaused] = useState(settings.paused)
  const { saving, saveError, setSaveError, run } = useSettingsSave()
  const [savedRevision, setSavedRevision] = useState<number | null>(null)
  // Automatic scanning saves on its own, immediately, without the Save button.
  const [autoSaving, setAutoSaving] = useState(false)
  const [autoMessage, setAutoMessage] = useState<{ text: string; error: boolean } | null>(null)
  const toggleAutoScan = async (enabled: boolean) => {
    setAutoSaving(true); setAutoMessage(null)
    try {
      await onSaveAutoScan(enabled)
      setAutoMessage({ text: enabled ? "Automatic scanning is on." : "Automatic scanning is off.", error: false })
    } catch (err) {
      setAutoMessage({ text: (err as Error).message, error: true })
    } finally { setAutoSaving(false) }
  }
  // A confirmed save or a reload replaces the draft with what is actually stored.
  useEffect(() => {
    setPreferences(preferencesFromSettings(settings))
    setContext({ ...settings.context_limits })
    setConsent(settings.consent)
    setPaused(settings.paused)
    // Keyed by revision: saving automatic scanning returns new settings at the same
    // revision, and must not discard unsaved edits to the other fields.
  }, [settings.revision])
  const gmail = useGmailState(true, section)

  const draft = { ...settingsWithPreferences(settings, preferences, context), consent, paused }
  const dirty = !sameSavedFields(draft, settings)
  const contextError = contextLimitError(context)
  const blockers = scanBlockers(settings, gmail.checking ? "unknown" : gmail.state)

  // Every way back to the dashboard goes through leave(): with unsaved changes it
  // asks first. Closing or reloading the tab gets the browser's own warning.
  const [leaving, setLeaving] = useState(false)
  const leave = () => (dirty ? setLeaving(true) : onBack())
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  // Saving always returns to the dashboard. With nothing changed, nothing is sent,
  // so the revision and any unfinished scan work are left alone.
  const save = async () => {
    if (saving) return
    if (contextError) {
      setSaveError({ message: contextError, stale: false })
      return
    }
    if (!dirty) {
      onSaved(NO_SETTINGS_CHANGES)
      return
    }
    setSavedRevision(null)
    const before = settings
    await run(() => onSave(draft), (result) => {
      setSavedRevision(result.revision)
      onSaved(settingsSavedNotice(settingsChanges(before, result)))
    })
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
        {/* An easy way out from the bottom of the page. Its label says what happens. */}
        <button className="secondary-button settings-leave" disabled={saving} onClick={onBack} type="button">
          {dirty ? "Leave without saving" : "Back to dashboard"}
        </button>
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
          disabled={saving || refreshing || Boolean(contextError)}
          onClick={() => void save()}
          type="button"
        >
          {saving ? "Saving…" : dirty ? "Save settings" : "Save and return"}
        </button>
      </div>
    </div>
  )

  return (
    <div className="settings-shell">
      <header className="topbar">
        <Brand onHome={leave} />
        <div className="topbar-actions">
          <span className="demo-mode-badge">Signed in · {email}</span>
          <button className="secondary-button" onClick={leave}>
            <Icon name="arrow" size={15} /> Back to dashboard
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
                description="Saved to your account. Exact senders and domains control access. Without any, categories to check do: email from any sender that is not blocked must use one of their words. Topic word lists are checked before Gemini."
              />
              <RulesEditor rules={preferences} onChange={setPreferences} />
              <p className="settings-footnote">{accessScopeSummary(preferences)}</p>
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
                    <strong>Automatic scanning</strong>
                    <span>
                      Checks for new email when you open InboxToTask and every minute while
                      it stays open, a few emails at a time. Each check looks only at email
                      since the last one. It never runs with the app closed, and stops at
                      your daily limit. Scan now still checks right away. Saved as soon as
                      you change it.
                    </span>
                  </div>
                </div>
                <label className="real-settings-check">
                  <input checked={settings.auto_scan ?? false} disabled={autoSaving} onChange={(event) => void toggleAutoScan(event.target.checked)} type="checkbox" />
                  Check for new email automatically while the app is open
                </label>
                {autoMessage && <p className={autoMessage.error ? "notice warning" : "settings-footnote"} role={autoMessage.error ? "alert" : "status"}>{autoMessage.text}</p>}
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
      {leaving && (
        <Modal onClose={() => setLeaving(false)} title="Unsaved changes">
          <p className="rd-leave-text">Save your changes before leaving?</p>
          <div className="modal-actions">
            <button className="secondary-button" disabled={saving} onClick={() => setLeaving(false)} type="button">Cancel</button>
            <button className="secondary-button" disabled={saving} onClick={() => { setLeaving(false); onBack() }} type="button">Discard</button>
            <button className="primary-button" disabled={saving || Boolean(contextError)} onClick={() => { setLeaving(false); void save() }} type="button">
              Save
            </button>
          </div>
        </Modal>
      )}
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
