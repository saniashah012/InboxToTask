// Screens and branding shared by sign-in, status, onboarding and settings.
import googleG from "./assets/google-g.svg"
import inboxToTaskLogo from "./assets/inbox-to-task-logo.png"
import ScanSettingsPanel from "./ScanSettingsPanel"

export function AppStatus({
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
export function LegacyReviewScreen({ email, onSaved, onSignOut }: { email: string; onSaved: () => void; onSignOut: () => void }) {
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
export function Brand({ onHome }: { onHome?: () => void }) {
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

// Google sign-in. Signed-out visitors see only this; there is no fictional preview.
export function SignInScreen({
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
