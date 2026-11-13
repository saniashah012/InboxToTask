import { useState } from "react"
import gmailLogo from "./assets/gmail-logo.svg"
import type { OnboardingPreferences } from "./supabase"
import GoogleConnectionPanel from "./GoogleConnectionPanel"
import type { ScanSettings } from "./storageAdapter"
import {
  accessScopeSummary,
  contextLimitError,
  hasScanSource,
  noSendersLabel,
  preferencesFromSettings,
  settingsWithPreferences,
  withConsentDecision,
  type ContextLimits,
  type GmailState,
} from "./scanSetup"
import {
  consentDecision,
  SCAN_CONSENT_LABEL,
  SCAN_DISCLOSURE,
  SCAN_DISCLOSURE_EFFECTS,
} from "./scanConsent"
import { Brand } from "./AppChrome"
import RulesEditor from "./RulesEditor"
import { ContextLimitInputs, SaveFailure, useGmailState, useSettingsSave } from "./settingsForm"

// Signed-in onboarding reads and writes saved scan settings.
type RealOnboarding = {
  settings: ScanSettings
  refreshing: boolean
  onSave: (next: ScanSettings) => Promise<void>
  onReload: () => void
  leaveLabel: string
  onLeave: () => void
}

function gmailStateLabel(state: GmailState, email?: string) {
  if (state === "connected") return `Connected${email ? ` · ${email}` : ""}`
  if (state === "reconnect_required") return "Reconnect required"
  if (state === "disconnecting") return "Disconnect pending"
  if (state === "disconnected") return "Not connected"
  return "Status unavailable"
}

export default function Onboarding({
  authEmail,
  onSignOut,
  real,
}: {
  authEmail: string
  onSignOut: () => void
  real: RealOnboarding
}) {
  const [step, setStep] = useState(1)
  const [preferences, setPreferences] = useState<OnboardingPreferences>(() =>
    preferencesFromSettings(real.settings),
  )
  const [context, setContext] = useState<ContextLimits>(() => ({ ...real.settings.context_limits }))
  // Unchecked unless consent is already saved; connecting Google never checks it.
  const initialConsent = real.settings.consent
  const [consentChecked, setConsentChecked] = useState(initialConsent)
  const [autoScan, setAutoScan] = useState(real.settings.auto_scan ?? false)
  const { saving, saveError, setSaveError, run } = useSettingsSave()
  const gmail = useGmailState(step === 4, step)
  const setupSteps = ["Connect", "Choose emails", "Privacy", "Review"]
  // A sender or domain is required unless a category to check is chosen.
  const hasPreferences = hasScanSource(preferences)
  const contextError = contextLimitError(context)

  const saveReal = async () => {
    if (saving) return
    if (contextError) {
      setSaveError({ message: contextError, stale: false })
      return
    }
    await run(() => real.onSave({
      ...withConsentDecision(
        settingsWithPreferences(real.settings, preferences, context),
        consentDecision(initialConsent, consentChecked),
      ),
      auto_scan: autoScan,
    }))
  }

  return (
    <div className="onboarding-shell">
      <header className="onboarding-header">
        <Brand onHome={saving ? undefined : real.onLeave} />
        <div className="topbar-actions">
          <span className="demo-mode-badge">Signed in · {authEmail}</span>
          <button className="text-link onboarding-return" disabled={saving} onClick={real.onLeave}>
            {real.leaveLabel}
          </button>
          <button className="text-link" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>
      <main className="onboarding-main setup-main">
        <section className="onboarding-card setup-card" aria-live="polite">
          <div
            className="setup-progress"
            aria-label={`Setup step ${step} of 4`}
          >
            <span>Step {step} of 4</span>
            <div aria-hidden="true">
              {setupSteps.map((label, index) => (
                <i
                  className={index < step ? "active" : ""}
                  key={label}
                  title={label}
                />
              ))}
            </div>
          </div>

          {step === 1 && (
            <>
              <div className="setup-icon">
                <img alt="" src={gmailLogo} />
              </div>
              <h2>Connect your inbox</h2>
              <p className="setup-description">
                Gmail read access is separate from Google sign-in. Connecting
                Gmail does not give scanning consent, start a scan, or send
                email to a model.
              </p>
              <div className="storage-page onboarding-google">
                <GoogleConnectionPanel />
              </div>
              <p className="setup-helper">
                You can save your sources and consent before or after
                connecting. Google Calendar is not connected in this release.
              </p>
              <FooterActions back={real.onLeave} backLabel={real.leaveLabel} next={() => setStep(2)} />
            </>
          )}

          {step === 2 && (
            <>
              <h2>Which email categories should we check?</h2>
              <p className="setup-description">
                Choose exact senders or domains, categories to check, or both. Categories to check need one of their words in an email. With no sender or domain, email from any sender that is not blocked is checked for those words.
              </p>
              <RulesEditor rules={preferences} onChange={setPreferences} section="allowed" />
              <p className="setup-helper requirement-helper">
                Choose at least one sender, domain or category to check.
                 Nothing is saved until the last step.
              </p>
              <FooterActions
                back={() => setStep(1)}
                next={() => setStep(3)}
                nextDisabled={!hasPreferences}
              />
            </>
          )}

          {step === 3 && (
            <>
              <h2>What would you like to keep private?</h2>
              <p className="setup-description">
                Add semantic topics, exact senders, domains, or subject phrases to exclude.
              </p>
              <RulesEditor rules={preferences} onChange={setPreferences} section="excluded" />
              <p className="setup-helper requirement-helper">
                Any matching sender, domain, or subject exclusion blocks an email, even if it matches an inclusion.
              </p>
              {(
                <div className="settings-card onboarding-context">
                  <div className="card-heading">
                    <div>
                      <strong>Earlier messages in a thread</strong>
                      <span>
                        Each earlier message must pass these same rules on its
                        own before its text is read. Zero turns off earlier
                        context. Quoted-text removal is imperfect.
                      </span>
                    </div>
                  </div>
                  <ContextLimitInputs value={context} onChange={setContext} disabled={saving} />
                  {contextError && <p className="notice warning" role="alert">{contextError}</p>}
                </div>
              )}
              <details className="privacy-disclosure">
                <summary>How privacy filtering works</summary>
                <ul>
                  <li>Exact source and subject exclusions override inclusions before an email body is retrieved. Topics are word lists checked before anything is sent to Gemini: an email using a skipped topic's words is skipped, and with topics to check saved, an email using none of their words is skipped too. With topics to check and no permitted sender or domain, the subject and body of email from any sender that is not blocked are read by our backend to look for those words; only matching email is sent to Gemini.</li>
                  <li>Neither metadata rules nor word lists can guarantee that all health or financial content is excluded: email that uses none of the words can still be sent. Blocking a sender or domain is the complete protection.</li>
                </ul>
              </details>
              <FooterActions back={() => setStep(2)} next={() => setStep(4)} nextDisabled={Boolean(contextError)} />
            </>
          )}

          {step === 4 && (
            <>
              <h2>Ready to organize your inbox?</h2>
              <p className="setup-description">
                Review your choices. Saving stores them on your account; it does not start a scan.
              </p>
              <div className="review-preferences">
                <ReviewPreference
                  label="Gmail status"
                  onEdit={() => setStep(1)}
                  values={[
                    gmail.checking
                      ? "Checking…"
                      : gmailStateLabel(gmail.state, gmail.email),
                  ]}
                />
                <ReviewPreference
                  label="Topics of interest"
                  onEdit={() => setStep(2)}
                  values={preferences.includedTypes}
                  emptyLabel="None, so every permitted topic qualifies"
                />
                <ReviewPreference
                  label="Included senders and domains"
                  onEdit={() => setStep(2)}
                  values={[
                    ...preferences.selectedSenders.map((value) => `From: ${value}`),
                    ...preferences.selectedDomains.map((value) => `Domain: ${value}`),
                  ]}
                  emptyLabel={noSendersLabel(preferences)}
                />
                <ReviewPreference
                  label="Semantic topics to omit"
                  onEdit={() => setStep(3)}
                  values={preferences.excludedTypes}
                  emptyLabel="No topics omitted"
                />
                <ReviewPreference
                  label="Excluded senders, domains, and subjects"
                  onEdit={() => setStep(3)}
                  values={[
                    ...preferences.excludedSenders.map((value) => `From: ${value}`),
                    ...preferences.excludedDomains.map((value) => `Domain: ${value}`),
                    ...preferences.excludedSubjects.map((value) => `Subject contains: ${value}`),
                  ]}
                  emptyLabel="No senders, domains, or subjects excluded"
                />
                {(
                  <ReviewPreference
                    label="Earlier messages in a thread"
                    onEdit={() => setStep(3)}
                    values={[
                      `Up to ${context.maxMessages} within ${context.maxAgeDays} days`,
                      `${context.maxMessageChars} characters each, ${context.maxTotalChars} total`,
                    ]}
                  />
                )}
              </div>
              <p className="setup-helper requirement-helper">
                {accessScopeSummary(preferences)}
              </p>
              {(
                <div className="onboarding-consent">
                  <p>{SCAN_DISCLOSURE}</p>
                  <p>{SCAN_DISCLOSURE_EFFECTS}</p>
                  <label>
                    <input
                      checked={consentChecked}
                      disabled={saving}
                      onChange={(event) => setConsentChecked(event.target.checked)}
                      type="checkbox"
                    />
                    {SCAN_CONSENT_LABEL}
                  </label>
                  <p className="setup-helper">
                    {consentChecked
                      ? initialConsent
                        ? "Consent is already saved. Your saved pause setting is kept."
                        : "Saving records your consent and unpauses scanning. Nothing is scanned until you start a manual scan."
                      : initialConsent
                        ? "Saving will revoke your saved consent."
                        : "Without consent you can save your rules now; scanning stays off."}
                  </p>
                </div>
              )}
              <div className="onboarding-consent">
                <label>
                  <input
                    checked={autoScan}
                    disabled={saving}
                    onChange={(event) => setAutoScan(event.target.checked)}
                    type="checkbox"
                  />
                  Check for new email automatically while the app is open
                </label>
                <p className="setup-helper">
                  {autoScan
                    ? "InboxToTask checks for new email when you open it and every minute while it stays open, a few emails at a time. It never runs with the app closed and stops at your daily limit. You can turn this off in Settings."
                    : "Scans run only when you press Scan now, a few emails at a time. You can turn on automatic checks later in Settings."}
                </p>
              </div>
              <p className="approval-reminder">
                You review task suggestions before approving them. Calendar
                entries require separate approval.
              </p>
              <p className="setup-helper">
                Google sign-in and Gmail connection do not grant scanning consent. Google Calendar is not connected.
              </p>
              {real.refreshing && <p className="save-confirmation" role="status">Reloading saved settings…</p>}
              {saving && <p className="save-confirmation" role="status">Saving settings…</p>}
              {<SaveFailure error={saveError} onReload={real.onReload} reloading={real.refreshing} />}
              <FooterActions
                back={() => setStep(3)}
                next={() => void saveReal()}
                nextDisabled={!hasPreferences || saving || real.refreshing || Boolean(contextError)}
                nextLabel={saving ? "Saving…" : "Save settings"}
              />
            </>
          )}
        </section>
      </main>
    </div>
  )
}

function ReviewPreference({
  label,
  values,
  emptyLabel,
  onEdit,
}: {
  label: string
  values: string[]
  emptyLabel?: string
  onEdit: () => void
}) {
  return (
    <div className="review-preference">
      <div>
        <strong>{label}</strong>
        <button className="text-link" onClick={onEdit}>
          Edit
        </button>
      </div>
      {values.length ? (
        <div className="review-tags">
          {values.map((value) => (
            <span key={value}>{value}</span>
          ))}
        </div>
      ) : (
        <span className="empty-preference">{emptyLabel}</span>
      )}
    </div>
  )
}

function FooterActions({
  back,
  backLabel = "Back",
  next,
  nextDisabled = false,
  nextLabel = "Continue",
}: {
  back: () => void
  backLabel?: string
  next: () => void
  nextDisabled?: boolean
  nextLabel?: string
}) {
  return (
    <div className="step-actions">
      <button className="secondary-button" onClick={back}>
        {backLabel}
      </button>
      <button className="primary-button" disabled={nextDisabled} onClick={next}>
        {nextLabel}
      </button>
    </div>
  )
}
