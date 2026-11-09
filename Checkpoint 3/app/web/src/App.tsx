import {
  excludedTopicSuggestions,
  includedTopicSuggestions,
} from "./filterPresets"
import { lazy, Suspense, useEffect, useId, useRef, useState } from "react"
import gmailLogo from "./assets/gmail-logo.svg"
import googleG from "./assets/google-g.svg"
import inboxToTaskLogo from "./assets/inbox-to-task-logo.png"
import { Icon } from "./designedUi"
import {
  supabase,
  type OnboardingPreferences,
} from "./supabase"
import type { Session } from "@supabase/supabase-js"
import ScanSettingsPanel from "./ScanSettingsPanel"
import RealDashboard from "./RealDashboard"
import GoogleConnectionPanel from "./GoogleConnectionPanel"
import {
  googleConnectionStatus,
  ScanSettingsSaveError,
  type ScanSettings,
} from "./storageAdapter"
import { useSavedScanSettings } from "./useSavedScanSettings"
import {
  accessScopeSummary,
  contextLimitError,
  contextLimitFields,
  hasSourcePermission,
  preferencesFromSettings,
  sameSavedFields,
  scanBlockers,
  settingsWithPreferences,
  signedInRoute,
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

// Development builds only. Vite replaces DEV at build time, so production bundles
// leave out the older testing workspace and the components only it uses.
const ManualWorkspace = import.meta.env.DEV ? lazy(() => import("./ManualWorkspace")) : null

type SettingsSection = "sources" | "processing" | "connections" | "retention"

// What a signed-in account sees. "auto" follows saved settings: a first save goes
// through onboarding, otherwise the designed dashboard ("workspace"). "google-return"
// is Google's redirect back to the root after a connection attempt. "dev-workspace"
// is the older ManualWorkspace testing screen, reachable only in development builds.
type SignedInView =
  | { kind: "auto" }
  | { kind: "google-return" }
  | { kind: "setup" }
  | { kind: "settings"; section: SettingsSection }
  | { kind: "workspace"; notice: string }
  | { kind: "dev-workspace" }
  | { kind: "legacy-review" }

function setupSavedNotice(result: ScanSettings) {
  const blockers = scanBlockers(result, "connected")
  return `Setup saved (revision ${result.revision}). No email was read. ${
    blockers.length
      ? `Scanning stays off: ${blockers.join(" ")}`
      : "A scan still needs a connected Gmail account and an explicit manual request."
  }`
}

function App() {
  const [authInitialized, setAuthInitialized] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [authError, setAuthError] = useState("")
  const [authPending, setAuthPending] = useState(false)
  const [googleReturn] = useState(() =>
    new URLSearchParams(window.location.search).has("google"),
  )
  // Tagged by account so one user's screen choice never carries to another.
  const [viewRecord, setViewRecord] = useState<{
    userId: string
    view: SignedInView
  } | null>(null)

  const userId = session?.user.id ?? null
  const saved = useSavedScanSettings(userId)
  const view: SignedInView =
    viewRecord && viewRecord.userId === userId
      ? viewRecord.view
      : googleReturn
        ? { kind: "google-return" }
        : { kind: "auto" }

  useEffect(() => {
    if (!supabase) {
      setAuthInitialized(true)
      return
    }

    let active = true
    let authVersion = 0
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      authVersion++; setAuthInitialized(true)
      setSession(nextSession)
      setAuthError("")
      if (!nextSession) setViewRecord(null)
    })

    const restoringVersion=authVersion
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active || authVersion!==restoringVersion) return
        if (error) {
          setAuthError("Could not restore your sign-in session.")
          setSession(null)
        } else {
          setSession(data.session)
        }
        setAuthInitialized(true)
      })
      .catch(() => {
        if (!active) return
        setAuthError("Could not restore your sign-in session.")
        setAuthInitialized(true)
      })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const signInWithGoogle = async () => {
    if (!supabase) return
    setAuthPending(true)
    setAuthError("")
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          scopes: "openid email profile",
          redirectTo: window.location.origin,
        },
      })
      if (error) throw error
    } catch (error) {
      setAuthError("Google sign-in could not be started. Please try again.")
      setAuthPending(false)
    }
  }

  const signOut = async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) {
      setAuthError("Could not sign out. Please try again.")
    }
  }

  if (!authInitialized) {
    return <AppStatus message="Restoring your InboxToTask session…" />
  }

  if (session) {
    const owner = session.user.id
    const email = session.user.email ?? "Signed-in account"
    const show = (next: SignedInView, reload = false) => {
      setViewRecord({ userId: owner, view: next })
      if (reload) saved.reload()
    }
    if (saved.status === "error") {
      return (
        <AppStatus
          actionLabel="Retry"
          message="Could not load your saved settings. Nothing was changed. Check your connection, then retry."
          onAction={saved.reload}
          secondaryActionLabel="Sign out"
          onSecondaryAction={() => void signOut()}
        />
      )
    }
    if (!saved.settings) {
      return <AppStatus message="Loading your saved settings…" />
    }
    const settings = saved.settings
    const route = signedInRoute(settings)
    let kind = view.kind
    if (kind === "google-return") kind = route === "onboarding" ? "setup" : "settings"
    if (kind === "auto") kind = route === "onboarding" ? "setup" : "workspace"
    // Only the workspace form can confirm review of previous phrase rules.
    if (route === "review-legacy") kind = "legacy-review"
    if (kind === "dev-workspace" && !ManualWorkspace) kind = "workspace"

    if (kind === "setup") {
      return (
        <Onboarding
          key={`${owner}-${settings.revision}`}
          authEmail={email}
          real={{
            settings,
            refreshing: saved.refreshing,
            onSave: async (next) => {
              const result = await saved.save(next)
              show({
                kind: "workspace",
                notice: setupSavedNotice(result),
              })
            },
            // Stay in setup after a stale-save reload, even if another tab's
            // save means this account now has saved settings.
            onReload: () => show({ kind: "setup" }, true),
            leaveLabel:
              settings.revision === 0
                ? "Skip setup for now"
                : "Back to dashboard without saving",
            onLeave: () => show({ kind: "workspace", notice: "" }),
          }}
          onSignOut={() => void signOut()}
        />
      )
    }
    if (kind === "settings") {
      return (
        <RealSettingsScreen
          key={owner}
          settings={settings}
          email={email}
          refreshing={saved.refreshing}
          initialSection={view.kind === "settings" ? view.section : "connections"}
          onSave={saved.save}
          onReload={saved.reload}
          onRunSetup={() => show({ kind: "setup" }, true)}
          onBack={() => show({ kind: "workspace", notice: "" })}
        />
      )
    }
    if (kind === "legacy-review") {
      return (
        <LegacyReviewScreen
          key={owner}
          email={email}
          onSaved={saved.reload}
          onSignOut={() => void signOut()}
        />
      )
    }
    if (kind === "dev-workspace" && ManualWorkspace) {
      return (
        <Suspense fallback={<AppStatus message="Loading the developer workspace…" />}>
          <ManualWorkspace
            key={owner}
            userId={owner}
            email={email}
            onSignOut={() => void signOut()}
            onOpenSettings={() => show({ kind: "settings", section: "sources" }, true)}
            onRunSetup={() => show({ kind: "setup" }, true)}
            initialNotice="Developer workspace: the older testing screen. Product users see the designed dashboard."
          />
        </Suspense>
      )
    }
    return (
      <RealDashboard
        key={owner}
        userId={owner}
        email={email}
        settings={settings}
        initialNotice={view.kind === "workspace" ? view.notice : ""}
        onSignOut={() => void signOut()}
        onOpenSettings={(section) => show({ kind: "settings", section }, true)}
        onRunSetup={() => show({ kind: "setup" }, true)}
        onOpenDevWorkspace={import.meta.env.DEV ? () => show({ kind: "dev-workspace" }) : undefined}
      />
    )
  }

  return (
    <SignInScreen
      authConfigured={Boolean(supabase)}
      authError={authError}
      authPending={authPending}
      onSignIn={() => void signInWithGoogle()}
    />
  )
}

function AppStatus({
  message,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}: {
  message: string
  actionLabel?: string
  onAction?: () => void
  secondaryActionLabel?: string
  onSecondaryAction?: () => void
}) {
  return (
    <main className="onboarding-shell">
      <section className="onboarding-card sign-in-card" role="status">
        <Brand />
        <p>{message}</p>
        {actionLabel && onAction && (
          <button className="secondary-button" onClick={onAction}>
            {actionLabel}
          </button>
        )}
        {secondaryActionLabel && onSecondaryAction && (
          <button className="text-link" onClick={onSecondaryAction}>
            {secondaryActionLabel}
          </button>
        )}
      </section>
    </main>
  )
}

// Previous phrase rules must be reviewed before scanning. Only ScanSettingsPanel can
// send that review (p_reviewed), so it is shown on its own until the review is saved.
function LegacyReviewScreen({ email, onSaved, onSignOut }: { email: string; onSaved: () => void; onSignOut: () => void }) {
  return (
    <main className="storage-page manual-workspace">
      <header className="manual-topbar">
        <div className="manual-brand"><img alt="" src={inboxToTaskLogo} /><span>InboxToTask</span></div>
        <div className="manual-account"><span>{email}</span><button onClick={onSignOut}>Sign out</button></div>
      </header>
      <div className="manual-intro">
        <h1>Review your previous rules</h1>
        <p role="status">Previous phrase rules need your review before scanning. Review and save them below; your dashboard opens afterwards.</p>
      </div>
      <ScanSettingsPanel onSaved={onSaved} />
    </main>
  )
}

// With onHome, the logo and name become a button back to the dashboard.
function Brand({ onHome }: { onHome?: () => void }) {
  const lockup = (
    <>
      <div className="brand-mark">
        <img alt="" src={inboxToTaskLogo} />
      </div>
      <span className="brand-name">InboxToTask</span>
    </>
  )
  if (!onHome) return <div className="brand-lockup">{lockup}</div>
  return (
    <button aria-label="InboxToTask: back to dashboard" className="brand-lockup brand-home" onClick={onHome} type="button">
      {lockup}
    </button>
  )
}

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

function useGmailState(enabled: boolean, refreshKey: unknown) {
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

function ContextLimitInputs({
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

function SaveFailure({
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

// Google sign-in. Signed-out visitors see only this; there is no fictional preview.
function SignInScreen({
  authConfigured,
  authError,
  authPending,
  onSignIn,
}: {
  authConfigured: boolean
  authError: string
  authPending: boolean
  onSignIn: () => void
}) {
  return (
    <div className="onboarding-shell">
      <header className="onboarding-header">
        <Brand />
      </header>
      <main className="onboarding-main sign-in-main">
        <section className="onboarding-card sign-in-card" aria-live="polite">
          <h1>Sign in to InboxToTask</h1>
          <p className="sign-in-supporting">
            Turn email into clear next steps.
          </p>
          <div className="sign-in-actions">
            <button
              className="google-button"
              disabled={!authConfigured || authPending}
              onClick={onSignIn}
            >
              <img alt="" src={googleG} />
              <span>
                {authPending ? "Redirecting to Google…" : "Continue with Google"}
              </span>
            </button>
            {!authConfigured && (
              <div className="sign-in-unavailable" role="status">
                <strong>Google sign-in is unavailable</strong>
                <span>
                  Supabase Auth is not configured in this deployment. No
                  account has been connected.
                </span>
              </div>
            )}
            {authError && (
              <div className="notice warning" role="alert">
                {authError}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

function Onboarding({
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
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<{ message: string; stale: boolean } | null>(null)
  const gmail = useGmailState(step === 4, step)
  const live = useRef(true)
  useEffect(() => {
    live.current = true
    return () => { live.current = false }
  }, [])
  const setupSteps = ["Connect", "Choose emails", "Privacy", "Review"]
  // Topics alone permit nothing, so a sender or domain is required to continue.
  const hasPreferences = hasSourcePermission(preferences)
  const contextError = contextLimitError(context)

  const saveReal = async () => {
    if (saving) return
    if (contextError) {
      setSaveError({ message: contextError, stale: false })
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const next = withConsentDecision(
        settingsWithPreferences(real.settings, preferences, context),
        consentDecision(initialConsent, consentChecked),
      )
      await real.onSave(next)
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

  return (
    <div className="onboarding-shell">
      <header className="onboarding-header">
        <Brand />
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
                Choose exact sender or domain permissions. Topics describe relevance within permitted email.
              </p>
              <RulesEditor rules={preferences} onChange={setPreferences} section="allowed" />
              <p className="setup-helper requirement-helper">
                Choose at least one sender or domain. Topics alone permit nothing.
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
                  <li>Exact source and subject exclusions override inclusions before an email body is retrieved. Semantic topics are evaluated after Gemini receives permitted content.</li>
                  <li>Metadata rules cannot guarantee that all health or financial content is excluded.</li>
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
                  emptyLabel="None, so nothing will be processed"
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
                {accessScopeSummary(preferences)} Topics never grant source access.
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

type RuleKey =
  | "includedTypes"
  | "selectedSenders"
  | "selectedDomains"
  | "excludedTypes"
  | "excludedSenders"
  | "excludedDomains"
  | "excludedSubjects"

type RuleField = {
  key: RuleKey
  label: string
  placeholder: string
}

type RuleChip = {
  key: RuleKey
  value: string
  raw?: string
  prefix?: string
  selected?: boolean
  id?: string
  removeIndex?: number
}

function FilterHelp() {
  const [open, setOpen] = useState(false)
  const id = useId()
  return <span className="scan-help" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
    <button type="button" className="text-link" aria-label="About these filters" aria-expanded={open} aria-controls={id}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen(true)}
      onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false) } }}>About these filters (i)</button>
    {open && <span id={id} role="tooltip" className="scan-help-tip">
      <span>An email is checked if it matches <strong>any</strong> included sender or domain.</span>
      <span>Excluded senders, domains and subject phrases <strong>always win</strong> over inclusions.</span>
      <span>A domain does not cover its subdomains (example.edu is not mail.example.edu).</span>
      <span>Topics are judged by Gemini <strong>after</strong> a permitted email is sent to it, so excluding a topic hides results but does not keep the email from Gemini.</span>
    </span>}
  </span>
}

function RulesEditor({
  rules,
  onChange,
  compact = false,
  section = "all",
}: {
  rules: OnboardingPreferences
  onChange: (rules: OnboardingPreferences) => void
  compact?: boolean
  section?: "allowed" | "excluded" | "all"
}) {
  const [drafts, setDrafts] = useState<Record<RuleKey, string>>({
    includedTypes: "",
    selectedSenders: "",
    selectedDomains: "",
    excludedTypes: "",
    excludedSenders: "",
    excludedDomains: "",
    excludedSubjects: "",
  })

  const [ruleError, setRuleError] = useState("")
  const add = (key: RuleKey, rawValue?: string) => {
    let value = (rawValue ?? drafts[key]).trim()
    if (!value) return
    const isSender = key === "selectedSenders" || key === "excludedSenders"
    const isDomain = key === "selectedDomains" || key === "excludedDomains"
    if (isSender || isDomain) value = value.toLowerCase()
    if (isDomain) value = value.replace(/^@/, "")
    if (key === "excludedSubjects" && (value.length > 254 || /[\x00-\x1f\x7f]/.test(value))) {
      setRuleError("Subject phrases must be 1-254 characters without control characters.")
      return
    }
    if ((isSender && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) ||
        (isDomain && !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(value))) {
      setRuleError(isSender ? "Enter a complete sender email address." : "Enter a valid domain, such as example.edu.")
      return
    }
    if (rules[key].some((item) => item.toLowerCase() === value.toLowerCase())) {
      setRuleError("That rule is already included.")
      return
    }
    onChange({ ...rules, [key]: [...rules[key], value] })
    setDrafts((current) => ({ ...current, [key]: "" }))
    setRuleError("")
  }

  const remove = (key: RuleKey, value: string) =>
    onChange({ ...rules, [key]: rules[key].filter((item) => item !== value) })

  const fields: RuleField[] = [
    {
      key: "selectedSenders",
      label: "Sender address",
      placeholder: "name@example.edu",
    },
    {
      key: "selectedDomains",
      label: "Sender domain",
      placeholder: "example.edu",
    },
    {
      key: "excludedSenders",
      label: "Blocked sender",
      placeholder: "sender@example.com",
    },
    {
      key: "excludedDomains",
      label: "Blocked domain",
      placeholder: "example.com",
    },
    {
      key: "excludedSubjects",
      label: "Subject contains",
      placeholder: "Literal phrase, such as payroll",
    },
  ]

  return (
    <div className={`rules-editor ${compact ? "compact" : ""}`}>
      {section !== "excluded" && <div className="rule-group">
        <div className="rule-heading">
          <div>
            <strong>Email categories to check</strong>
            <span>Topics describe relevance after source permission; they never grant access.</span>
          </div>
        </div>
        <CategorySelector
          label="Add an included email category"
          categoryKey="includedTypes"
          suggestions={includedTopicSuggestions}
          customKeywords={rules.includedTypes}
          onChange={(includedTypes) => onChange({ ...rules, includedTypes })}
        />
        <div className="rule-heading">
          <div>
            <strong>Sender and domain preferences</strong>
            <span>Exact address or domain matches. Domains do not include subdomains.</span>
          </div>
        </div>
        {fields.slice(0, 2).map((field) => {
          const entries = rules[field.key].map((value) => ({
            key: field.key,
            value,
            prefix: field.label,
          }))
          return (
            <div className="rule-field" key={field.key}>
              <RuleInput
                field={field}
                onAdd={() => add(field.key)}
                onChange={(value) =>
                  setDrafts((current) => ({ ...current, [field.key]: value }))
                }
                value={drafts[field.key]}
              />
              <Chips entries={entries} onRemove={remove} />
            </div>
          )
        })}
      </div>}
      {section !== "allowed" && <div className="rule-group exclusion">
        <div className="rule-heading">
          <div>
            <strong>Email categories to skip</strong>
            <span>Semantic exclusions affect results after Gemini has received permitted content.</span>
          </div>
        </div>
        <CategorySelector
          label="Add an excluded email category"
          categoryKey="excludedTypes"
          suggestions={excludedTopicSuggestions}
          customKeywords={rules.excludedTypes}
          onChange={(excludedTypes) => onChange({ ...rules, excludedTypes })}
        />
        <div className="rule-heading">
          <div>
            <strong>Excluded senders, domains, and subjects</strong>
            <span>Exact address or domain matches; domains do not include subdomains. Subject phrases match literal text in the subject only, ignoring case.</span>
          </div>
        </div>
        {fields.slice(2, 5).map((field) => {
          const entries = rules[field.key].map((value) => ({
            key: field.key,
            value,
            prefix: field.label,
          }))
          return (
            <div className="rule-field" key={field.key}>
              <RuleInput
                field={field}
                onAdd={() => add(field.key)}
                onChange={(value) =>
                  setDrafts((current) => ({ ...current, [field.key]: value }))
                }
                value={drafts[field.key]}
              />
              <Chips entries={entries} onRemove={remove} />
            </div>
          )
        })}
      </div>}
      <FilterHelp />
      {ruleError && <p className="notice warning" role="alert">{ruleError}</p>}
    </div>
  )
}

function CategorySelector({
  label,
  categoryKey,
  suggestions,
  customKeywords,
  onChange,
}: {
  label: string
  categoryKey: "includedTypes" | "excludedTypes"
  suggestions: string[]
  customKeywords: string[]
  onChange: (customKeywords: string[]) => void
}) {
  const [draft, setDraft] = useState("")
  const [error, setError] = useState("")

  const add = (rawValue = draft) => {
    const category = rawValue.trim()
    if (!category) return
    if (
      category.length > 254 ||
      /[\x00-\x1f\x7f]/.test(category) ||
      customKeywords.length >= 200
    ) {
      setError("Use up to 200 terms, each 1-254 characters without control characters.")
      return
    }
    onChange([...customKeywords, category])
    setDraft("")
    setError("")
  }

  const toggleSuggestion = (suggestion: string) => {
    const selected = customKeywords.some(
      (keyword) => keyword.toLowerCase() === suggestion.toLowerCase(),
    )
    onChange(
      selected
        ? customKeywords.filter(
            (keyword) => keyword.toLowerCase() !== suggestion.toLowerCase(),
          )
        : [...customKeywords, suggestion],
    )
    setError("")
  }

  const visibleCustomKeywords = customKeywords
    .map((keyword, index) => ({ keyword, index }))
    .filter(
      ({ keyword }) =>
        !suggestions.some(
          (suggestion) =>
            suggestion.toLowerCase() === keyword.toLowerCase(),
        ),
    )

  return (
    <div className="category-preferences">
      <div className="rule-input">
        <span>{label}</span>
        <div>
          <input
            aria-label={label}
            placeholder="Type a word or phrase."
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              setError("")
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                add()
              }
            }}
          />
          <button
            className="secondary-button"
            disabled={!draft.trim()}
            onClick={() => add()}
            type="button"
          >
            Add
          </button>
        </div>
      </div>
      <Chips
        entries={visibleCustomKeywords.map(({ keyword, index }) => ({
          key: categoryKey,
          value: keyword,
          selected: true,
          id: `${categoryKey}-${index}`,
          removeIndex: index,
        }))}
        onRemove={(_key, _category, index) =>
          onChange(
            customKeywords.filter(
              (_current, currentIndex) => currentIndex !== index,
            ),
          )
        }
      />
      <div className="category-suggestions">
        <p className="suggestions-label">Suggestions</p>
        <div className="type-selection-chips">
          {suggestions.map((suggestion) => {
            const selected = customKeywords.some(
              (keyword) => keyword.toLowerCase() === suggestion.toLowerCase(),
            )
            return (
              <span
                className={`type-chip ${selected ? "selected" : ""}`}
                key={suggestion}
              >
                <button
                  aria-pressed={selected}
                  className="type-chip-toggle"
                  onClick={() => toggleSuggestion(suggestion)}
                  type="button"
                >
                  {!selected && (
                    <span aria-hidden="true" className="chip-plus">
                      +
                    </span>
                  )}
                  {suggestion}
                </button>
                {selected && (
                  <button
                    aria-label={`Remove ${suggestion}`}
                    className="type-chip-remove"
                    onClick={() => toggleSuggestion(suggestion)}
                    type="button"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                )}
              </span>
            )
          })}
        </div>
      </div>
      {error && <p className="notice warning" role="alert">{error}</p>}
    </div>
  )
}

function RuleInput({
  field,
  value,
  onChange,
  onAdd,
}: {
  field: RuleField
  value: string
  onChange: (value: string) => void
  onAdd: () => void
}) {
  return (
    <label className="rule-input">
      <span>{field.label}</span>
      <div>
        <input
          placeholder={field.placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              onAdd()
            }
          }}
        />
        <button
          className="secondary-button"
          disabled={!value.trim()}
          onClick={onAdd}
          type="button"
        >
          Add
        </button>
      </div>
    </label>
  )
}

function Chips({
  entries,
  onRemove,
}: {
  entries: RuleChip[]
  onRemove: (key: RuleKey, value: string, index: number) => void
}) {
  if (!entries.length) return null
  return (
    <div className="rule-chips">
      {entries.map((entry, index) => (
        <span
          className={`rule-chip ${entry.selected ? "selected" : ""}`}
          key={entry.id ?? `${entry.key}-${entry.value}-${index}`}
        >
          {entry.prefix && <small>{entry.prefix}</small>}
          <span className="rule-chip-value">{entry.value}</span>
          <button
            aria-label={`Remove ${entry.value}`}
            onClick={() =>
              onRemove(entry.key, entry.raw ?? entry.value, entry.removeIndex ?? index)
            }
            type="button"
          >
            <Icon name="close" size={12} />
          </button>
        </span>
      ))}
    </div>
  )
}

// The designed settings screen for a signed-in account. It edits the same saved
// scan settings as onboarding and the workspace form, through scan_settings_save.
function RealSettingsScreen({
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
  const [saving, setSaving] = useState(false)
  const [savedRevision, setSavedRevision] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<{ message: string; stale: boolean } | null>(null)
  const live = useRef(true)
  useEffect(() => {
    live.current = true
    return () => { live.current = false }
  }, [])
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
    setSaving(true)
    setSaveError(null)
    setSavedRevision(null)
    try {
      const result = await onSave(draft)
      if (live.current) setSavedRevision(result.revision)
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
                description="Saved to your account. Exact sender and domain permissions control access; topics are evaluated by Gemini afterward."
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

export default App
