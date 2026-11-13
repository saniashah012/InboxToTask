import { lazy, Suspense, useEffect, useState } from "react"
import { supabase } from "./supabase"
import type { Session } from "@supabase/supabase-js"
import RealDashboard from "./RealDashboard"
import { calendarReviewPending } from "./TaskCalendarControl"
import type { ScanSettings } from "./storageAdapter"
import { useSavedScanSettings } from "./useSavedScanSettings"
import { scanBlockers, signedInRoute } from "./scanSetup"
import { AppStatus, LegacyReviewScreen, SignInScreen } from "./AppChrome"
import Onboarding from "./Onboarding"
import RealSettingsScreen, { type SettingsSection } from "./RealSettingsScreen"

// Development builds only. Vite replaces DEV at build time, so production bundles
// leave out the older testing workspace and the components only it uses.
const ManualWorkspace = import.meta.env.DEV ? lazy(() => import("./ManualWorkspace")) : null

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
          // Always show Google's account picker so sign-in never silently
          // reuses whichever Google account the browser is already using.
          queryParams: { prompt: "select_account" },
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
    // A Calendar authorization started from a task returns to that task's review.
    if (kind === "google-return") kind = route === "onboarding" ? "setup" : calendarReviewPending(owner) ? "workspace" : "settings"
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
              // Saved separately so it never bumps the settings revision.
              if (next.auto_scan !== undefined && next.auto_scan !== (result.auto_scan ?? false)) await saved.saveAuto(next.auto_scan)
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
          onSaveAutoScan={saved.saveAuto}
          onReload={saved.reload}
          onRunSetup={() => show({ kind: "setup" }, true)}
          onBack={() => show({ kind: "workspace", notice: "" })}
          onSaved={(notice) => show({ kind: "workspace", notice })}
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

export default App
