import { uniqueTerms, preferenceScope } from "./filterPresets"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import gmailLogo from "./assets/gmail-logo.svg"
import googleG from "./assets/google-g.svg"
import inboxToTaskLogo from "./assets/inbox-to-task-logo.png"
import {
  processingActivityFixture,
  type ScanState,
} from "./demoData"
import { previewAdapter } from "./previewAdapter"
import {
  loadOnboardingPreferences,
  saveOnboardingPreferences,
  supabase,
  type OnboardingPreferences,
} from "./supabase"
import type { Session } from "@supabase/supabase-js"
import ScanSettingsPanel from "./ScanSettingsPanel"
import ManualWorkspace from "./ManualWorkspace"

type Email = {
  sender: string
  subject: string
  received: string
  body: string[]
}

type Category = "Homework & assignments" | "Jobs & applications" | "Finances" | "Meetings & projects" | "Personal" | "Other"

type CategoryFilter = "All tasks" | Category

const categories: Category[] = [
  "Homework & assignments",
  "Jobs & applications",
  "Finances",
  "Meetings & projects",
  "Personal",
  "Other",
]

type Task = {
  id: string
  title: string
  caption: string
  context: string
  category: Category
  date: string
  dateLabel: string
  time?: string
  tone: "red" | "orange" | "amber" | "neutral"
  deadlineLabel: string
  email: Email
  reminder?: string
  updated?: {
    previous: string
    current: string
    excerpt: string
  }
}

type PassiveItem = {
  summary: string
  sender: string
  received: string
  email: Email
}

const tasksSeed: Task[] = [
  {
    id: "reading-response",
    title: "Submit Week 6 reading response",
    caption:
      "Write 300–400 words connecting Nguyen’s argument to last week’s class discussion.",
    context: "Research Methods · Weekly coursework",
    category: "Homework & assignments",
    date: "2026-10-08T17:00",
    dateLabel: "Oct 8",
    time: "5:00 p.m.",
    tone: "orange",
    deadlineLabel: "Due today",
    email: {
      sender: "Dr. Elena Morris <elena.morris@northbridge.edu>",
      subject: "Week 6 response: Nguyen and community-led research",
      received: "October 8, 2026 at 8:12 a.m.",
      body: [
        "Hi everyone,",
        "A quick reminder that your Week 6 response is due today, October 8, by 5 p.m. Please write 300–400 words connecting Nguyen’s argument about community-led research to a point from last week’s class discussion.",
        "Submit your response through the course portal under Week 6. You do not need to include a formal bibliography, but please cite the page number for any direct quotations.",
        "Best, Elena",
      ],
    },
  },
  {
    id: "meeting-questions",
    title: "Bring 3 research questions to project meeting",
    caption:
      "Focus the questions on participant recruitment, interview scope, and the revised timeline.",
    context: "Research team · Discussion preparation",
    category: "Meetings & projects",
    date: "2026-10-09T10:00",
    dateLabel: "Oct 9",
    time: "10:00 a.m.",
    tone: "amber",
    deadlineLabel: "Due this week",
    email: {
      sender: "Owen Clarke <owen.clarke@northbridge.edu>",
      subject: "Tomorrow’s project meeting: recruitment plan and timeline",
      received: "October 8, 2026 at 9:40 a.m.",
      body: [
        "Hi team,",
        "We’ll meet tomorrow, October 9, at 10 a.m. in the project room. We’ll use the first half of the meeting to review our participant recruitment plan and the second half to confirm the interview timeline.",
        "Please come prepared with three questions about the research direction. It would be especially useful to think about recruitment, the scope of our interviews, and whether the revised timeline gives us enough analysis time.",
        "Thanks, Owen",
      ],
    },
  },
  {
    id: "reimbursement-form",
    title: "Return signed conference reimbursement form",
    caption:
      "Sign the highlighted certification field and reply with the completed PDF attached.",
    context: "Finance Office · Conference reimbursement",
    category: "Finances",
    date: "2026-10-09T17:00",
    dateLabel: "Oct 9",
    time: "5:00 p.m.",
    tone: "amber",
    deadlineLabel: "Due this week",
    email: {
      sender: "Finance Office <reimbursements@northbridge.edu>",
      subject: "Action needed: sign conference reimbursement form",
      received: "October 7, 2026 at 3:18 p.m.",
      body: [
        "Hello,",
        "We reviewed your reimbursement request for the Regional Research Conference. Your receipts and expense totals are complete, but the certification field on page two is missing your signature.",
        "Please sign the highlighted field and reply to this message with the completed PDF attached by 5 p.m. on October 9. Once we receive it, we can send the request for final approval.",
        "Regards, Finance Office",
      ],
    },
  },
  {
    id: "project-proposal",
    title: "Submit revised community research proposal",
    caption:
      "Upload the five-page proposal with your research question, methods, and partner overview.",
    context: "Design Seminar · Final project",
    category: "Homework & assignments",
    date: "2026-10-09T23:59",
    dateLabel: "Oct 9",
    time: "11:59 p.m.",
    tone: "amber",
    deadlineLabel: "Due this week",
    updated: {
      previous: "October 9, 2026 at 11:59 p.m.",
      current: "October 12, 2026 · time not specified",
      excerpt:
        "To give everyone more time, I’ve moved the project proposal deadline from October 9 to Monday, October 12.",
    },
    email: {
      sender: "Professor Daniel Cho <daniel.cho@northbridge.edu>",
      subject: "New deadline: community research project proposal",
      received: "October 7, 2026 at 11:04 a.m.",
      body: [
        "Hello class,",
        "To give everyone more time to incorporate feedback from our partner conversations, I’ve moved the community research project proposal deadline from October 9 to Monday, October 12.",
        "The assignment requirements have not changed. Your five-page proposal should include a focused research question, a methods outline, a brief partner overview, and the two sources that most influenced your approach. Upload one PDF to the course portal.",
        "Best, Professor Cho",
      ],
    },
  },
  {
    id: "scholarship",
    title: "Complete Fall Leadership Scholarship application",
    caption:
      "Draft two short essays, confirm one faculty reference, and submit the online application.",
    context: "Student Opportunities · Leadership scholarship",
    category: "Jobs & applications",
    date: "2026-10-30T23:59",
    dateLabel: "Oct 30",
    tone: "neutral",
    deadlineLabel: "Later",
    reminder: "Start essays Oct 12",
    email: {
      sender: "Student Opportunities <opportunities@northbridge.edu>",
      subject: "Fall Leadership Scholarship: application details",
      received: "October 6, 2026 at 1:22 p.m.",
      body: [
        "Dear students,",
        "Applications for the Fall Leadership Scholarship are due October 30. The award supports students who have made a meaningful contribution to a campus or community organization.",
        "The application includes two 500-word essays, a short activities list, and one faculty reference. We recommend beginning your essays by October 12 so your reference has enough time to submit their recommendation. Applications must be completed through the Student Opportunities portal.",
        "Sincerely, Student Opportunities",
      ],
    },
  },
  {
    id: "research-assistant-application",
    title: "Apply for campus research assistant position",
    caption:
      "Tailor your résumé and submit a short statement describing your qualitative research experience.",
    context: "Sociology Department · Part-time campus role",
    category: "Jobs & applications",
    date: "2026-10-19T17:00",
    dateLabel: "Oct 19",
    time: "5:00 p.m.",
    tone: "neutral",
    deadlineLabel: "Later",
    reminder: "Draft statement Oct 12",
    email: {
      sender: "Dr. Priya Shah <priya.shah@northbridge.edu>",
      subject:
        "Student research assistant opening — applications due October 19",
      received: "October 8, 2026 at 11:16 a.m.",
      body: [
        "Hello,",
        "The Sociology Department is hiring a part-time student research assistant for our community access study. The role is approximately eight hours per week and will include interview transcription, qualitative coding, and scheduling participant sessions.",
        "To apply, please send a tailored résumé and a 250-word statement describing any relevant qualitative research or community-engagement experience by 5 p.m. on October 19. Previous coding experience is helpful but not required.",
        "Best, Priya",
      ],
    },
  },
]

const waitingEmail: Email = {
  sender: "Maya Patel <maya.patel@northbridge.edu>",
  subject: "Re: Draft for your feedback",
  received: "October 6, 2026 at 4:36 p.m.",
  body: [
    "Hi,",
    "I received your draft and plan to send feedback soon. I should be able to review it in the next couple of days.",
    "Maya",
  ],
}

const passiveGroups: Record<string, PassiveItem[]> = {
  FYI: [
    {
      summary: "Library opening hours will be extended next week.",
      sender: "Campus Library",
      received: "Oct 8",
      email: {
        sender: "Campus Library <library@northbridge.edu>",
        subject: "Extended library hours next week",
        received: "October 8, 2026 at 7:45 a.m.",
        body: [
          "Hello students,",
          "The main library will stay open until midnight Monday through Thursday next week. Weekend hours remain unchanged.",
          "Campus Library",
        ],
      },
    },
  ],
  "Event information": [
    {
      summary:
        "Optional career workshop on October 15; attendance is not required.",
      sender: "Career Center",
      received: "Oct 7",
      email: {
        sender: "Career Center <careers@northbridge.edu>",
        subject: "Optional workshop: Telling your story in interviews",
        received: "October 7, 2026 at 2:10 p.m.",
        body: [
          "Hi students,",
          "Join us on October 15 at 3 p.m. for a practical interview workshop. This is an optional event and attendance is not required. Drop-ins are welcome.",
          "Career Center",
        ],
      },
    },
  ],
  Reference: [
    {
      summary: "Course reading materials are available.",
      sender: "Dr. Elena Morris",
      received: "Oct 6",
      email: {
        sender: "Dr. Elena Morris <elena.morris@northbridge.edu>",
        subject: "Reading materials for weeks 7–9",
        received: "October 6, 2026 at 9:15 a.m.",
        body: [
          "Hi everyone,",
          "The reading materials for weeks 7 through 9 are now available in the course portal under Resources.",
          "Best, Elena",
        ],
      },
    },
  ],
  "Status updates": [
    {
      summary: "Reimbursement request was received and is being processed.",
      sender: "Finance Office",
      received: "Oct 8",
      email: {
        sender: "Finance Office <reimbursements@northbridge.edu>",
        subject: "Your reimbursement request is being processed",
        received: "October 8, 2026 at 10:28 a.m.",
        body: [
          "Hello,",
          "We’ve received your completed reimbursement request. It is now being processed; no further action is needed at this time.",
          "Regards, Finance Office",
        ],
      },
    },
  ],
}

function Icon({
  name,
  size = 18,
}: {
  name: "calendar" | "check" | "close" | "more" | "external" | "arrow" | "clock"
  size?: number
}) {
  const paths = {
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="M18 6 6 18M6 6l12 12" />,
    more: (
      <>
        <circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    external: (
      <>
        <path d="M14 3h7v7" />
        <path d="m10 14 11-11" />
        <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
      </>
    ),
    arrow: <path d="m15 18-6-6 6-6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  }
  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      {paths[name]}
    </svg>
  )
}

function Modal({
  children,
  onClose,
  title,
  wide = false,
}: {
  children: React.ReactNode
  onClose: () => void
  title: string
  wide?: boolean
}) {
  return (
    <div className="overlay" role="presentation" onMouseDown={onClose}>
      <section
        aria-label={title}
        aria-modal="true"
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">InboxToTask</span>
            <h2>{title}</h2>
          </div>
          <button aria-label="Close" className="icon-button" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        {children}
      </section>
    </div>
  )
}

type AppScreen = "onboarding" | "dashboard"

const emptyOnboardingPreferences: OnboardingPreferences = {
  includedTypes: [],
  selectedSenders: [],
  selectedDomains: [],
  excludedTypes: [],
  excludedSenders: [],
  excludedDomains: [],
  excludedSubjects: [],
}

function App() {
  const [screen, setScreen] = useState<AppScreen>("onboarding")
  const [authInitialized, setAuthInitialized] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [authError, setAuthError] = useState("")
  const [authPending, setAuthPending] = useState(false)
  const [preferenceStatus, setPreferenceStatus] =
    useState<"idle" | "loading" | "missing" | "saved" | "error">("idle")
  const [preferenceError, setPreferenceError] = useState("")
  const [preferenceReloadCount, setPreferenceReloadCount] = useState(0)
  const [savingPreferences, setSavingPreferences] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const [previewGmailAccount, setPreviewGmailAccount] = useState<string | null>(
    null,
  )
  const [previewCalendarAccount, setPreviewCalendarAccount] =
    useState<string | null>(null)
  const [processingEnabled, setProcessingEnabled] = useState(false)
  const [savedPreferences, setSavedPreferences] =
    useState<OnboardingPreferences>(emptyOnboardingPreferences)

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
      if (!nextSession) {
        setPreferenceStatus("idle")
        setSavedPreferences(emptyOnboardingPreferences)
        setScreen("onboarding")
      }
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
      .catch((error: unknown) => {
        if (!active) return
        setAuthError("Could not restore your sign-in session.")
        setAuthInitialized(true)
      })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session || !previewMode) return
    let active = true
    setPreferenceStatus("loading")
    setPreferenceError("")
    void loadOnboardingPreferences(session.user.id)
      .then((preferences) => {
        if (!active) return
        if (preferences) {
          setSavedPreferences(preferences)
          setPreferenceStatus("saved")
          setScreen("dashboard")
        } else {
          setSavedPreferences(emptyOnboardingPreferences)
          setPreferenceStatus("missing")
          setScreen("onboarding")
        }
      })
      .catch((error: unknown) => {
        if (!active) return
        setPreferenceError(
          "Could not load your preferences. Check that the database migration has been applied, then retry.",
        )
        setPreferenceStatus("error")
      })

    return () => {
      active = false
    }
  }, [session?.user.id, preferenceReloadCount, previewMode])

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

  const persistOnboardingPreferences = async (
    preferences: OnboardingPreferences,
  ) => {
    if (!session) throw new Error("A signed-in session is required.")
    setSavingPreferences(true)
    setPreferenceError("")
    try {
      const saved = await saveOnboardingPreferences(
        session.user.id,
        preferences,
      )
      setSavedPreferences(saved)
      setPreferenceStatus("saved")
      setProcessingEnabled(false)
      setScreen("dashboard")
    } catch (error) {
      setPreferenceError(
        error instanceof Error ? error.message : "Preferences were not saved. Check your connection and try again.",
      )
      throw error
    } finally {
      setSavingPreferences(false)
    }
  }

  const signOut = async () => {
    if (previewMode) {
      setScreen("onboarding")
      setPreviewMode(false)
      setPreviewGmailAccount(null)
      setPreviewCalendarAccount(null)
      setProcessingEnabled(false)
      setSavedPreferences(emptyOnboardingPreferences)
      return
    }
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) {
      setAuthError("Could not sign out. Please try again.")
    }
  }

  if (authInitialized && session && !previewMode) return <ManualWorkspace key={session.user.id} userId={session.user.id} email={session.user.email ?? "Signed-in account"} onSignOut={() => void signOut()} />

  if (
    !authInitialized ||
    (session && !["missing", "saved", "error"].includes(preferenceStatus))
  ) {
    return <AppStatus message="Restoring your InboxToTask session…" />
  }

  if (session && preferenceStatus === "error") {
    return (
      <AppStatus
        actionLabel="Retry"
        message={preferenceError}
        onAction={() => setPreferenceReloadCount((count) => count + 1)}
        secondaryActionLabel="Sign out"
        onSecondaryAction={() => void signOut()}
      />
    )
  }

  if (screen === "onboarding" || (!previewMode && !session)) {
    return (
      <Onboarding
        authConfigured={Boolean(supabase)}
        authEmail={session?.user.email ?? null}
        authError={authError}
        authPending={authPending}
        isAuthenticated={Boolean(session)}
        onConnectGmail={setPreviewGmailAccount}
        onSavePreferences={persistOnboardingPreferences}
        onSignIn={() => void signInWithGoogle()}
        onSignOut={() => void signOut()}
        onFinish={(preferences) => {
          setSavedPreferences(preferences)
          setProcessingEnabled(true)
          setScreen("dashboard")
        }}
        previewMode={previewMode}
        savingPreferences={savingPreferences}
        onExplore={() => {
          setPreviewMode(true)
          setPreviewGmailAccount(null)
          setPreviewCalendarAccount(null)
          setProcessingEnabled(true)
          setSavedPreferences({
            ...emptyOnboardingPreferences,
            includedTypes: ["School"],
            selectedSenders: ["professor@illinois.edu"],
            excludedTypes: ["Financial"],
          })
          setScreen("dashboard")
        }}
        onPreviewOnboarding={() => setPreviewMode(true)}
      />
    )
  }

  return (
    <Dashboard
      key={previewMode ? "preview" : session?.user.id ?? "signed-out"}
      calendarAccount={previewCalendarAccount}
      gmailAccount={previewGmailAccount}
      onCalendarAccountChange={setPreviewCalendarAccount}
      onGmailAccountChange={setPreviewGmailAccount}
      onProcessingChange={setProcessingEnabled}
      onPreferencesChange={(preferences) => {
        if (previewMode || !session) {
          setSavedPreferences(preferences)
          return Promise.resolve()
        }
        return saveOnboardingPreferences(session.user.id, preferences)
          .then((saved) => {
            setSavedPreferences(saved)
            setPreferenceError("")
          })
          .catch((error: unknown) => {
            throw error
          })
      }}
      previewMode={previewMode}
      processingEnabled={processingEnabled}
      preferences={savedPreferences}
      userEmail={session?.user.email ?? null}
      onSignOut={() => void signOut()}
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

function Dashboard({
  previewMode,
  gmailAccount,
  calendarAccount,
  processingEnabled,
  onGmailAccountChange,
  onCalendarAccountChange,
  onProcessingChange,
  preferences,
  onPreferencesChange,
  onSignOut,
  userEmail,
}: {
  previewMode: boolean
  gmailAccount: string | null
  calendarAccount: string | null
  processingEnabled: boolean
  onGmailAccountChange: (email: string | null) => void
  onCalendarAccountChange: (email: string | null) => void
  onProcessingChange: (enabled: boolean) => void
  preferences: OnboardingPreferences
  onPreferencesChange: (preferences: OnboardingPreferences) => Promise<void>
  onSignOut: () => void
  userEmail: string | null
}) {
  const [activeTab, setActiveTab] = useState<"tasks" | "passive">("tasks")
  const [taskView, setTaskView] =
    useState<"suggestions" | "active" | "completed">("suggestions")
  const [tasks, setTasks] = useState(previewMode ? tasksSeed : [])
  const [completed, setCompleted] = useState<string[]>([])
  const [completionPending, setCompletionPending] = useState<string[]>([])
  const [completionToast, setCompletionToast] = useState<string | null>(null)
  const completionTimers = useRef<Record<string, number>>({})
  const [approved, setApproved] = useState<string[]>(["project-proposal"])
  const [menuId, setMenuId] = useState<string | null>(null)
  const [email, setEmail] = useState<Email | null>(null)
  const [editing, setEditing] = useState<Task | null>(null)
  const [deadlineTask, setDeadlineTask] = useState<Task | null>(null)
  const [dismissed, setDismissed] = useState<Task | null>(null)
  const [waitingReminder, setWaitingReminder] = useState(
    "October 9, 2026 at 9:00 a.m.",
  )
  const [editingWaiting, setEditingWaiting] = useState(false)
  const [categoryFilter, setCategoryFilter] =
    useState<CategoryFilter>("All tasks")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [scanState, setScanState] = useState<ScanState>(
    previewMode ? "ready" : "disconnected",
  )
  const [calendarPreview, setCalendarPreview] = useState<Task | null>(null)
  const [calendarEvents, setCalendarEvents] = useState<Record<string, string>>(
    {},
  )
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)

  useEffect(() => {
    if (!completionToast) return
    const timer = window.setTimeout(() => setCompletionToast(null), 8000)
    return () => window.clearTimeout(timer)
  }, [completionToast])

  useEffect(
    () => () => {
      Object.values(completionTimers.current).forEach(window.clearTimeout)
    },
    [],
  )

  const filteredTasks = useMemo(
    () =>
      [...tasks]
        .filter(
          (task) =>
            categoryFilter === "All tasks" || task.category === categoryFilter,
        )
        .filter((task) => {
          if (taskView === "completed") return completed.includes(task.id)
          if (taskView === "active")
            return approved.includes(task.id) && !completed.includes(task.id)
          return !approved.includes(task.id) && !completed.includes(task.id)
        })
        .sort((a, b) => a.date.localeCompare(b.date)),
    [approved, categoryFilter, completed, taskView, tasks],
  )
  const waitingMatches =
    previewMode &&
    (categoryFilter === "All tasks" || categoryFilter === "Meetings & projects")
  const hasFilteredResults =
    filteredTasks.length > 0 || (waitingMatches && taskView === "active")
  const pendingUpdateCount = tasks.filter(
    (task) =>
      approved.includes(task.id) &&
      !completed.includes(task.id) &&
      Boolean(task.updated),
  ).length

  const dismissTask = (task: Task) => {
    setTasks((current) => current.filter((item) => item.id !== task.id))
    setDismissed(task)
    setMenuId(null)
  }

  const undoCompletion = (taskId: string) => {
    const timer = completionTimers.current[taskId]
    if (timer) {
      window.clearTimeout(timer)
      delete completionTimers.current[taskId]
    }
    setCompletionPending((current) => current.filter((id) => id !== taskId))
    setCompleted((current) => current.filter((id) => id !== taskId))
    setCompletionToast((current) => (current === taskId ? null : current))
  }

  const completeTask = (taskId: string) => {
    if (
      completionPending.includes(taskId) ||
      completed.includes(taskId) ||
      completionTimers.current[taskId]
    )
      return
    setCompletionPending((current) => [...current, taskId])
    setCompletionToast(taskId)
    completionTimers.current[taskId] = window.setTimeout(() => {
      setCompletionPending((current) => current.filter((id) => id !== taskId))
      setCompleted((current) => [...new Set([...current, taskId])])
      delete completionTimers.current[taskId]
    }, 2000)
  }

  const refreshPreview = async () => {
    if (!previewMode || !processingEnabled) return
    setScanState("processing")
    try {
      const state = await previewAdapter.refreshProcessing()
      setScanState(state)
      return state
    } catch (error) {
      setScanState("failed")
      return "failed" as const
    }
  }

  if (settingsOpen) {
    return (
      <SettingsScreen
        calendarAccount={calendarAccount}
        gmailAccount={gmailAccount}
        onBack={() => setSettingsOpen(false)}
        onCalendarAccountChange={onCalendarAccountChange}
        onGmailAccountChange={onGmailAccountChange}
        onPreferencesChange={onPreferencesChange}
        onProcessingChange={onProcessingChange}
        previewMode={previewMode}
        processingEnabled={processingEnabled}
        preferences={preferences}
      />
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <img alt="" src={inboxToTaskLogo} />
          </div>
          <span className="brand-name">InboxToTask</span>
        </div>
        <div className="topbar-actions">
          <div className="date-context">
            <span className="date-dot" />
            {previewMode
              ? "Thursday, October 8, 2026"
              : new Intl.DateTimeFormat("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                }).format(new Date())}
          </div>
          <span className="demo-mode-badge">
            {previewMode ? "Preview mode · sample data" : "Signed in"}
          </span>
          <div className="account-menu-wrap">
            <button
              aria-expanded={accountMenuOpen}
              aria-label="Open account menu"
              className="account-avatar"
              onClick={() => setAccountMenuOpen((current) => !current)}
            >
              {previewMode
                ? "MP"
                : (userEmail?.split("@")[0].slice(0, 2).toUpperCase() ?? "U")}
            </button>
            {accountMenuOpen && (
              <div className="account-menu">
                <div>
                  <strong>
                    {previewMode
                      ? "Maya Patel"
                      : (userEmail ?? "Signed-in user")}
                  </strong>
                  {previewMode && (
                    <span>maya.patel@example.com · fictional preview</span>
                  )}
                </div>
                <button
                  onClick={() => {
                    setAccountMenuOpen(false)
                    setSettingsOpen(true)
                  }}
                >
                  Settings
                </button>
                <button onClick={onSignOut}>
                  {previewMode ? "Exit preview" : "Sign out"}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="main">
        <div className="page-heading">
          <div>
            <p className="kicker">Your inbox, organized</p>
            <h1>{activeTab === "tasks" ? "Tasks" : "Passive communication"}</h1>
            <p className="subtitle">
              {activeTab === "tasks"
                ? "Action items gathered from your recent emails."
                : "Useful updates that don’t need action right now."}
            </p>
          </div>
          {activeTab === "tasks" && (
            <div className="task-count">
              <strong>{tasks.length + (previewMode ? 1 : 0)}</strong>
              <span>Open items</span>
            </div>
          )}
        </div>

        <nav aria-label="Inbox categories" className="tabs">
          <button
            aria-selected={activeTab === "tasks"}
            className={activeTab === "tasks" ? "tab active" : "tab"}
            onClick={() => setActiveTab("tasks")}
            role="tab"
          >
            Tasks
            <span className="tab-count">{tasks.length}</span>
          </button>
          <button
            aria-selected={activeTab === "passive"}
            className={activeTab === "passive" ? "tab active" : "tab"}
            onClick={() => setActiveTab("passive")}
            role="tab"
          >
            Passive communication
            <span className="tab-count">{previewMode ? 4 : 0}</span>
          </button>
        </nav>

        <ScanStatus
          backlogCount={
            previewMode ? processingActivityFixture.initialBacklog : 0
          }
          onAction={() => setSettingsOpen(true)}
          onRefresh={refreshPreview}
          onToggleProcessing={() => {
            if (!previewMode) return
            onProcessingChange(!processingEnabled)
            setScanState(!processingEnabled ? "ready" : "paused")
          }}
          previewMode={previewMode}
          state={
            !previewMode
              ? "disconnected"
              : !processingEnabled
                ? "paused"
                : preferences.selectedSenders.length +
                      preferences.selectedDomains.length ===
                    0
                  ? "missing-sources"
                  : scanState
          }
        />

        {activeTab === "tasks" ? (
          <div className="content-grid">
            <section className="task-section">
              <div
                className="review-tabs"
                role="tablist"
                aria-label="Task review status"
              >
                {(["suggestions", "active", "completed"] as const).map(
                  (view) => (
                    <button
                      aria-selected={taskView === view}
                      className={
                        taskView === view ? "review-tab active" : "review-tab"
                      }
                      key={view}
                      onClick={() => setTaskView(view)}
                      role="tab"
                    >
                      {view[0].toUpperCase() + view.slice(1)}
                      <span>
                        {view === "suggestions"
                          ? tasks.filter(
                              (task) =>
                                !approved.includes(task.id) &&
                                !completed.includes(task.id),
                            ).length
                          : view === "active"
                            ? tasks.filter(
                                (task) =>
                                  approved.includes(task.id) &&
                                  !completed.includes(task.id),
                              ).length
                            : completed.length}
                      </span>
                      {view === "active" && pendingUpdateCount > 0 && (
                        <span className="pending-update-count">
                          {pendingUpdateCount} update
                        </span>
                      )}
                    </button>
                  ),
                )}
              </div>
              <div className="section-head">
                <h2>
                  {taskView === "suggestions"
                    ? "Needs your review"
                    : taskView === "active"
                      ? "Upcoming"
                      : "Completed"}
                </h2>
                <div className="list-controls">
                  <label className="category-filter">
                    <span>Category:</span>
                    <select
                      aria-label="Filter tasks by category"
                      value={categoryFilter}
                      onChange={(event) =>
                        setCategoryFilter(event.target.value as CategoryFilter)
                      }
                    >
                      <option>All tasks</option>
                      {categories.map((category) => (
                        <option key={category}>{category}</option>
                      ))}
                    </select>
                  </label>
                  {categoryFilter !== "All tasks" && (
                    <button
                      className="clear-filter"
                      onClick={() => setCategoryFilter("All tasks")}
                    >
                      Clear filter
                    </button>
                  )}
                </div>
              </div>
              {filteredTasks.length > 0 && (
                <div className="task-list">
                  {filteredTasks.map((task) => (
                    <TaskRow
                      completed={
                        completed.includes(task.id) ||
                        completionPending.includes(task.id)
                      }
                      calendarAdded={Boolean(calendarEvents[task.id])}
                      key={task.id}
                      menuOpen={menuId === task.id}
                      onAdd={() => setCalendarPreview(task)}
                      onApprove={() =>
                        setApproved((current) => [
                          ...new Set([...current, task.id]),
                        ])
                      }
                      onComplete={() =>
                        completed.includes(task.id) ||
                        completionPending.includes(task.id)
                          ? undoCompletion(task.id)
                          : completeTask(task.id)
                      }
                      onDeadline={() => setDeadlineTask(task)}
                      onDismiss={() => dismissTask(task)}
                      onEdit={() => {
                        setEditing(task)
                        setMenuId(null)
                      }}
                      onMenu={() =>
                        setMenuId((current) =>
                          current === task.id ? null : task.id,
                        )
                      }
                      onViewEmail={() => setEmail(task.email)}
                      task={task}
                      status={taskView}
                    />
                  ))}
                </div>
              )}

              {waitingMatches && taskView === "active" && (
                <div className="waiting-section">
                  <div className="section-head waiting-head">
                    <div>
                      <span className="waiting-label">Waiting for</span>
                      <h2>Pending replies</h2>
                    </div>
                    <span>1 item</span>
                  </div>
                  <div className="waiting-row">
                    <div className="waiting-avatar">MP</div>
                    <div className="waiting-copy">
                      <h3>Waiting for Maya’s draft feedback</h3>
                      <div className="waiting-meta">
                        <span className="category-tag">
                          Meetings &amp; projects
                        </span>
                        <span>
                          <Icon name="clock" size={15} />
                          Follow up {waitingReminder}
                        </span>
                        <button
                          className="text-link"
                          onClick={() => setEmail(waitingEmail)}
                        >
                          View original email
                        </button>
                      </div>
                    </div>
                    <button
                      className="secondary-button"
                      onClick={() => setEditingWaiting(true)}
                    >
                      Edit reminder
                    </button>
                  </div>
                </div>
              )}

              {!hasFilteredResults && (
                <div className="empty-state">
                  <div className="empty-state-mark">
                    <Icon name="check" />
                  </div>
                  <h3>No {taskView} tasks in this category</h3>
                  <p>
                    Try another category or return to the complete task list.
                  </p>
                  <button
                    className="primary-button"
                    onClick={() => setCategoryFilter("All tasks")}
                  >
                    Show all tasks
                  </button>
                </div>
              )}
            </section>
          </div>
        ) : (
          <PassiveCommunication
            onViewEmail={setEmail}
            previewMode={previewMode}
          />
        )}
      </main>

      {email && (
        <Modal onClose={() => setEmail(null)} title="Original email" wide>
          <div className="email-details">
            <div>
              <span>From</span>
              <strong>{email.sender}</strong>
            </div>
            <div>
              <span>Subject</span>
              <strong>{email.subject}</strong>
            </div>
            <div>
              <span>Received</span>
              <strong>{email.received}</strong>
            </div>
          </div>
          <div className="email-body">
            {email.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <div className="modal-actions">
            <button className="primary-button" onClick={() => setEmail(null)}>
              Close
            </button>
          </div>
        </Modal>
      )}

      {editing && (
        <EditTaskModal
          onCancel={() => setEditing(null)}
          onSave={(updated) => {
            setTasks((current) =>
              current.map((task) => (task.id === updated.id ? updated : task)),
            )
            setEditing(null)
          }}
          task={editing}
        />
      )}

      {deadlineTask?.updated && (
        <DeadlineReviewModal
          onApprove={(timeChoice) => {
            setTasks((current) =>
              current.map((task) =>
                task.id === deadlineTask.id
                  ? {
                      ...task,
                      date:
                        timeChoice === "keep"
                          ? "2026-10-12T23:59"
                          : "2026-10-12T00:00",
                      dateLabel: "Oct 12",
                      time: timeChoice === "keep" ? "11:59 p.m." : undefined,
                      updated: undefined,
                    }
                  : task,
              ),
            )
            setDeadlineTask(null)
          }}
          onClose={() => setDeadlineTask(null)}
          onViewSource={() => {
            setEmail(deadlineTask.email)
            setDeadlineTask(null)
          }}
          task={deadlineTask}
        />
      )}

      {editingWaiting && (
        <WaitingModal
          initial={waitingReminder}
          onCancel={() => setEditingWaiting(false)}
          onSave={(value) => {
            setWaitingReminder(value)
            setEditingWaiting(false)
          }}
        />
      )}

      {calendarPreview && (
        <CalendarPreviewModal
          calendarAccount={calendarAccount}
          onCalendarAccountChange={onCalendarAccountChange}
          onCancel={() => setCalendarPreview(null)}
          previewMode={previewMode}
          task={calendarPreview}
          onSuccess={(eventId) => {
            setCalendarEvents((current) => ({
              ...current,
              [calendarPreview.id]: eventId,
            }))
            setCalendarPreview(null)
          }}
        />
      )}

      {dismissed && (
        <div aria-live="polite" className="undo-toast">
          <span>Suggestion dismissed</span>
          <button
            onClick={() => {
              setTasks((current) => [...current, dismissed])
              setDismissed(null)
            }}
          >
            Undo
          </button>
          <button
            aria-label="Close"
            className="toast-close"
            onClick={() => setDismissed(null)}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      {completionToast && (
        <div aria-live="polite" className="undo-toast">
          <span>Task completed</span>
          <button onClick={() => undoCompletion(completionToast)}>Undo</button>
          <button
            aria-label="Dismiss completion message"
            className="toast-close"
            onClick={() => setCompletionToast(null)}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

function TaskRow({
  task,
  status,
  completed,
  calendarAdded,
  menuOpen,
  onComplete,
  onViewEmail,
  onAdd,
  onMenu,
  onEdit,
  onDismiss,
  onDeadline,
  onApprove,
}: {
  task: Task
  status: "suggestions" | "active" | "completed"
  completed: boolean
  calendarAdded: boolean
  menuOpen: boolean
  onComplete: () => void
  onViewEmail: () => void
  onAdd: () => void
  onMenu: () => void
  onEdit: () => void
  onDismiss: () => void
  onDeadline: () => void
  onApprove: () => void
}) {
  return (
    <article
      className={`task-row ${completed ? "is-complete" : ""} ${
        status === "suggestions" ? "is-suggestion" : ""
      }`}
    >
      {status !== "suggestions" && (
        <button
          aria-label={
            completed
              ? `Undo completion of ${task.title}`
              : `Complete ${task.title}`
          }
          aria-pressed={completed}
          className="checkbox"
          onClick={onComplete}
        >
          {completed && <Icon name="check" size={15} />}
        </button>
      )}
      <div className="task-main">
        <div className="task-title-line">
          <h3>{task.title}</h3>
          <span className="task-context">{task.context}</span>
          {task.updated && status === "active" && (
            <>
              <span className="updated-badge">Deadline change detected</span>
              <button className="review-change-link" onClick={onDeadline}>
                Review change
              </button>
            </>
          )}
        </div>
        <p className="task-caption">{task.caption}</p>
        <div className="task-meta">
          <span className="category-tag">{task.category}</span>
          <span className="date">
            {task.dateLabel}
            {task.time && <> · {task.time}</>}
          </span>
          <span className={`deadline ${task.tone}`}>
            <span />
            {task.deadlineLabel}
          </span>
          {task.reminder && (
            <span className="reminder">
              <Icon name="clock" size={14} />
              Reminder: {task.reminder}
            </span>
          )}
        </div>
      </div>
      <button className="email-link" onClick={onViewEmail}>
        View original email
      </button>
      {status === "suggestions" ? (
        <button className="primary-button row-button" onClick={onApprove}>
          Add task
        </button>
      ) : status === "active" ? (
        <button className="calendar-button" onClick={onAdd}>
          <Icon name="calendar" size={16} />
          {calendarAdded ? "Preview event added" : "Preview calendar event"}
        </button>
      ) : (
        <span className="deletion-date">Demo only</span>
      )}
      <div className="menu-wrap">
        <button
          aria-expanded={menuOpen}
          aria-label={`Actions for ${task.title}`}
          className="icon-button more-button"
          onClick={onMenu}
        >
          <Icon name="more" />
        </button>
        {menuOpen && (
          <div className="action-menu">
            <button onClick={onEdit}>Edit task</button>
            {status === "suggestions" && (
              <button className="danger-action" onClick={onDismiss}>
                Dismiss suggestion
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

function DeadlineReviewModal({
  task,
  onClose,
  onViewSource,
  onApprove,
}: {
  task: Task
  onClose: () => void
  onViewSource: () => void
  onApprove: (timeChoice: "keep" | "clear") => void
}) {
  const [timeChoice, setTimeChoice] = useState<"keep" | "clear" | null>(null)
  if (!task.updated) return null

  return (
    <Modal onClose={onClose} title="Review deadline change" wide>
      <div className="deadline-review-task">
        <span>Task</span>
        <strong>{task.title}</strong>
      </div>
      <div className="deadline-change">
        <div>
          <span>Current accepted deadline</span>
          <strong>{task.updated.previous}</strong>
        </div>
        <div className="change-arrow">→</div>
        <div>
          <span>Proposed deadline</span>
          <strong>{task.updated.current}</strong>
        </div>
      </div>
      <div className="deadline-review-warning">
        <strong>Time needs your decision</strong>
        <span>
          The new date is explicit, but no time was provided. Should the
          accepted 11:59 p.m. time be kept or cleared?
        </span>
        <div>
          <label>
            <input
              checked={timeChoice === "keep"}
              name="deadline-time-choice"
              onChange={() => setTimeChoice("keep")}
              type="radio"
            />
            Keep 11:59 p.m.
          </label>
          <label>
            <input
              checked={timeChoice === "clear"}
              name="deadline-time-choice"
              onChange={() => setTimeChoice("clear")}
              type="radio"
            />
            Clear the accepted time
          </label>
        </div>
      </div>
      <div className="excerpt">
        <span>Source excerpt</span>
        <blockquote>“{task.updated.excerpt}”</blockquote>
        <button className="text-link" onClick={onViewSource}>
          View original email
        </button>
      </div>
      <p className="calendar-separation-note">
        Approving this task update will not change or create a calendar entry.
        Calendar actions require separate approval.
      </p>
      <div className="modal-actions">
        <button className="secondary-button" onClick={onClose}>
          Keep current
        </button>
        <button
          className="primary-button"
          disabled={!timeChoice}
          onClick={() => timeChoice && onApprove(timeChoice)}
        >
          Approve update
        </button>
      </div>
    </Modal>
  )
}

function EditTaskModal({
  task,
  onSave,
  onCancel,
}: {
  task: Task
  onSave: (task: Task) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(task.title)
  const [deadline, setDeadline] = useState(task.date)
  const [reminder, setReminder] = useState(task.reminder ?? "")
  const [category, setCategory] = useState<Category>(task.category)
  return (
    <Modal onClose={onCancel} title="Edit task">
      <div className="form-stack">
        <label>
          <span>Task title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          <span>Deadline</span>
          <input
            type="datetime-local"
            value={deadline}
            onChange={(event) => setDeadline(event.target.value)}
          />
        </label>
        <label>
          <span>Category</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as Category)}
          >
            {categories.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Reminder</span>
          <input
            placeholder="Optional reminder"
            value={reminder}
            onChange={(event) => setReminder(event.target.value)}
          />
        </label>
      </div>
      <div className="modal-actions">
        <button className="secondary-button" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="primary-button"
          disabled={!title.trim()}
          onClick={() =>
            onSave({ ...task, title, date: deadline, reminder, category })
          }
        >
          Save changes
        </button>
      </div>
    </Modal>
  )
}

function WaitingModal({
  initial,
  onSave,
  onCancel,
}: {
  initial: string
  onSave: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <Modal onClose={onCancel} title="Edit follow-up reminder">
      <div className="form-stack">
        <label>
          <span>Follow up date and time</span>
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <p className="form-hint">
          You’ll be reminded to follow up if Maya hasn’t responded.
        </p>
      </div>
      <div className="modal-actions">
        <button className="secondary-button" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="primary-button"
          disabled={!value.trim()}
          onClick={() => onSave(value)}
        >
          Save reminder
        </button>
      </div>
    </Modal>
  )
}

function PassiveCommunication({
  onViewEmail,
  previewMode,
}: {
  onViewEmail: (email: Email) => void
  previewMode: boolean
}) {
  if (!previewMode) {
    return (
      <div className="empty-state">
        <div className="empty-state-mark">
          <Icon name="check" />
        </div>
        <h3>No analyzed messages</h3>
        <p>
          Gmail access has not been separately authorized. No messages have been
          read.
        </p>
      </div>
    )
  }

  return (
    <div className="passive-grid">
      {Object.entries(passiveGroups).map(([group, items]) => (
        <section className="passive-card" key={group}>
          <div className="passive-card-head">
            <span className="category-mark" />
            <h2>{group}</h2>
            <span>{items.length}</span>
          </div>
          {items.map((item) => (
            <article className="passive-item" key={item.summary}>
              <span className="bullet" />
              <div>
                <h3>{item.summary}</h3>
                <div className="passive-meta">
                  <span>
                    {item.sender} · Received {item.received}
                  </span>
                  <button
                    className="text-link"
                    onClick={() => onViewEmail(item.email)}
                  >
                    View original email
                    <Icon name="external" size={13} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      ))}
    </div>
  )
}

function Brand() {
  return (
    <div className="brand-lockup">
      <div className="brand-mark">
        <img alt="" src={inboxToTaskLogo} />
      </div>
      <span className="brand-name">InboxToTask</span>
    </div>
  )
}

function Onboarding({
  authConfigured,
  authEmail,
  authError,
  authPending,
  isAuthenticated,
  previewMode,
  onExplore,
  onPreviewOnboarding,
  onConnectGmail,
  onSignIn,
  onSignOut,
  onSavePreferences,
  onFinish,
  savingPreferences,
}: {
  authConfigured: boolean
  authEmail: string | null
  authError: string
  authPending: boolean
  isAuthenticated: boolean
  previewMode: boolean
  onExplore: () => void
  onPreviewOnboarding: () => void
  onConnectGmail: (email: string | null) => void
  onSignIn: () => void
  onSignOut: () => void
  onSavePreferences: (preferences: OnboardingPreferences) => Promise<void>
  onFinish: (preferences: OnboardingPreferences) => void
  savingPreferences: boolean
}) {
  const [step, setStep] = useState(isAuthenticated ? 1 : 0)
  const [gmailConnected, setGmailConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [starting, setStarting] = useState(false)
  const [setupError, setSetupError] = useState("")
  const [preferences, setPreferences] = useState<OnboardingPreferences>(
    emptyOnboardingPreferences,
  )
  const setupSteps = ["Connect", "Choose emails", "Privacy", "Review"]
  const hasPreferences =
      preferences.selectedSenders.length +
      preferences.selectedDomains.length >
    0

  return (
    <div className="onboarding-shell">
      <header className="onboarding-header">
        <Brand />
        {isAuthenticated && (
          <div className="topbar-actions">
            <span className="demo-mode-badge">
              Signed in{authEmail ? ` · ${authEmail}` : ""}
            </span>
            <button className="text-link" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        )}
      </header>
      <main
        className={`onboarding-main ${
          step === 0 ? "sign-in-main" : "setup-main"
        }`}
      >
        <section
          className={`onboarding-card ${
            step === 0 ? "sign-in-card" : "setup-card"
          }`}
          aria-live="polite"
        >
          {step === 0 && (
            <>
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
                    {authPending
                      ? "Redirecting to Google…"
                      : "Continue with Google"}
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
                <button
                  className="text-link sign-in-demo-link"
                  onClick={() => {
                    onPreviewOnboarding()
                    setStep(1)
                  }}
                >
                  Preview onboarding
                </button>
                <button
                  className="text-link sign-in-demo-link"
                  onClick={onExplore}
                >
                  Explore demo
                </button>
              </div>
            </>
          )}

          {step > 0 && (
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
          )}

          {step === 1 && (
            <>
              <div className="setup-icon">
                <img alt="" src={gmailLogo} />
              </div>
              <h2>Connect your inbox</h2>
              <p className="setup-description">
                Connect Gmail to find tasks and deadlines automatically.
              </p>
              <div
                className={`setup-connection ${gmailConnected ? "connected" : "unavailable"}`}
                role="status"
              >
                {gmailConnected && (
                  <span className="connected-check" aria-hidden="true">
                    <Icon name="check" size={22} />
                  </span>
                )}
                <div>
                  <strong>
                    {gmailConnected
                      ? "Preview inbox connected"
                      : "Gmail connection is unavailable"}
                  </strong>
                  <span>
                    {gmailConnected
                      ? "Fictional account only. No real mailbox was accessed."
                      : previewMode
                        ? "Use the fictional preview inbox to continue this walkthrough."
                        : "Gmail authorization is separate from Google sign-in and is not configured. No mailbox has been accessed."}
                  </span>
                </div>
              </div>
              {previewMode && !gmailConnected && (
                <button
                  className="setup-gmail-cta"
                  disabled={connecting}
                  onClick={async () => {
                    setConnecting(true)
                    setSetupError("")
                    try {
                      const account = await previewAdapter.connectGmail()
                      onConnectGmail(account.email)
                      setGmailConnected(true)
                    } catch (error) {
                      setSetupError(
                        "Could not connect the fictional preview inbox. Please try again.",
                      )
                    } finally {
                      setConnecting(false)
                    }
                  }}
                >
                  {connecting ? "Connecting preview inbox…" : "Connect Gmail"}
                </button>
              )}
              <p className="setup-helper">
                {gmailConnected
                  ? "This fictional connection is isolated from real Gmail."
                  : isAuthenticated
                    ? "You can save preferences now. Scanning stays off until Gmail is separately authorized."
                    : "Nothing is scanned until you finish setup and start."}
              </p>
              <FooterActions
                back={() => setStep(0)}
                next={() => setStep(2)}
                nextDisabled={
                  !isAuthenticated && !(previewMode && gmailConnected)
                }
              />
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
                Choose at least one sender or domain. Topics alone permit nothing. Real Gmail scanning is not connected yet.
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
                Add semantic topics, exact senders, or domains to exclude from your
                preferences.
              </p>
              <RulesEditor rules={preferences} onChange={setPreferences} section="excluded" />
              <p className="setup-helper requirement-helper">
                Any matching exclusion blocks an email, even if it matches an inclusion. Real Gmail scanning is not connected yet.
              </p>
              <details className="privacy-disclosure">
                <summary>How privacy filtering works</summary>
                <ul>
                  <li>Exact source exclusions override inclusions before body retrieval. Semantic topics are evaluated after Gemini receives permitted content.</li>
                  <li>The extraction pipeline supports metadata rules; real Gmail scanning and authorization are not connected here.</li>
                  <li>Metadata rules cannot guarantee that all health or financial content is excluded.</li>
                  <li>This preview uses fictional data and does not retrieve or send real email.</li>
                </ul>
              </details>
              <FooterActions back={() => setStep(2)} next={() => setStep(4)} />
            </>
          )}

          {step === 4 && (
            <>
              <h2>Ready to organize your inbox?</h2>
              <p className="setup-description">
                {previewMode
                  ? "Review your choices before the simulated preview checks begin."
                  : "Review your choices. Saving preferences does not authorize Gmail or start scanning."}
              </p>
              <div className="review-preferences">
                <ReviewPreference
                  label="Gmail status"
                  onEdit={() => setStep(1)}
                  values={[
                    isAuthenticated
                      ? "Not authorized · Gmail access requires separate consent"
                      : gmailConnected
                        ? "Fictional preview account · no real mailbox accessed"
                        : "Unavailable in this deployment",
                  ]}
                />
                <ReviewPreference
                  label="Topics of interest"
                  onEdit={() => setStep(2)}
                  values={preferences.includedTypes}
                  emptyLabel="No words or phrases selected"
                />
                <ReviewPreference
                  label="Included senders and domains"
                  onEdit={() => setStep(2)}
                  values={[
                    ...preferences.selectedSenders.map((value) => `From: ${value}`),
                    ...preferences.selectedDomains.map((value) => `Domain: ${value}`),
                  ]}
                  emptyLabel="No senders or domains selected"
                />
                <ReviewPreference
                  label="Semantic topics to omit"
                  onEdit={() => setStep(3)}
                  values={preferences.excludedTypes}
                  emptyLabel="No words or phrases excluded"
                />
                <ReviewPreference
                  label="Excluded senders and domains"
                  onEdit={() => setStep(3)}
                  values={[
                    ...preferences.excludedSenders.map((value) => `From: ${value}`),
                    ...preferences.excludedDomains.map((value) => `Domain: ${value}`),
                    ...preferences.excludedSubjects.map((value) => `Subject contains: ${value}`),
                  ]}
                  emptyLabel="No senders, domains, or subjects excluded"
                />
              </div>
              <p className="setup-helper requirement-helper">
                Topics never grant source access. Real Gmail scanning
                is not connected yet.
              </p>
              <div className="scan-plan">
                <div>
                  <span>Initial scan</span>
                  <strong>
                    {previewMode
                      ? "Past 7 days · simulated preview only"
                      : "Not started · Gmail authorization required"}
                  </strong>
                </div>
                <div>
                  <span>Automatic checks</span>
                  <strong>
                    {previewMode
                      ? "Simulated preview checks"
                      : "Off until Gmail is separately authorized"}
                  </strong>
                </div>
              </div>
              <p className="approval-reminder">
                You review task suggestions before approving them. Calendar
                entries require separate approval.
              </p>
              <p className="setup-helper">
                {previewMode
                  ? "Preview only. No account is accessed and these preferences are not saved to Supabase."
                  : "Google sign-in does not grant Gmail access. Scanning remains disabled until Gmail is separately authorized."}
              </p>
              <FooterActions
                back={() => setStep(3)}
                next={async () => {
                  if (starting || savingPreferences) return
                  setSetupError("")
                  if (isAuthenticated) {
                    try {
                      await onSavePreferences(preferences)
                    } catch {
                      setSetupError(
                        "Could not save your preferences. Please try again.",
                      )
                    }
                    return
                  }
                  if (previewMode) {
                    setStarting(true)
                    try {
                      await previewAdapter.startProcessing()
                      onFinish(preferences)
                    } catch (error) {
                      setSetupError(
                        "Could not start the preview flow. Please try again.",
                      )
                    } finally {
                      setStarting(false)
                    }
                  }
                }}
                nextDisabled={!hasPreferences || starting || savingPreferences}
                nextLabel={
                  savingPreferences
                    ? "Saving preferences…"
                    : starting
                      ? "Starting preview…"
                      : isAuthenticated
                        ? "Save preferences"
                        : "Review and start"
                }
              />
            </>
          )}
          {setupError && (
            <div className="notice warning" role="alert">
              {setupError}
            </div>
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
  next,
  nextDisabled = false,
  nextLabel = "Continue",
}: {
  back: () => void
  next: () => void
  nextDisabled?: boolean
  nextLabel?: string
}) {
  return (
    <div className="step-actions">
      <button className="secondary-button" onClick={back}>
        Back
      </button>
      <button className="primary-button" disabled={nextDisabled} onClick={next}>
        {nextLabel}
      </button>
    </div>
  )
}

type RuleKey = Exclude<keyof OnboardingPreferences, "scanRevision">

type RuleField = {
  key: RuleKey
  label: string
  placeholder: string
}

type RuleChip = {
  key: RuleKey
  value: string
  raw?: string
  prefix: string
}

type RetentionRowProps = {
  title: string
  value: string
}

function FilterHelp() {
  const [open, setOpen] = useState(false)
  const id = useId()
  return <span className="scan-help" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
    <button type="button" className="text-link" aria-label="About these filters" aria-expanded={open} aria-controls={id}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen(true)}
      onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false) } }}>About these filters (i)</button>
    {open && <span id={id} role="tooltip">Exact sender/domain inclusions combine with OR. Exact exclusions and literal subject exclusions override access. Domains do not include subdomains. Topics describe semantic relevance after permitted content reaches Gemini, so semantic exclusions cannot prevent transmission.</span>}
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
          suggestions={["School", "Job applications", "Research", "Meetings"]}
          value={rules.includedTypes}
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
          suggestions={["Financial", "Health", "Promotions", "Family & friends"]}
          value={rules.excludedTypes}
          onChange={(excludedTypes) => onChange({ ...rules, excludedTypes })}
        />
        <div className="rule-heading">
          <div>
            <strong>Excluded senders and domains</strong>
            <span>Exact address or domain matches. Domains do not include subdomains.</span>
          </div>
        </div>
        {rules.excludedSubjects.length > 0 && <div className="notice"><p>Previous subject-only exclusions (kept at their original scope):</p><Chips entries={rules.excludedSubjects.map(value => ({ key: "excludedSubjects" as RuleKey, value, prefix: "Subject only" }))} onRemove={remove} /></div>}
        {fields.slice(2, 4).map((field) => {
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
      <div className="scope-summary live" aria-live="polite"><span>Effective scope</span><strong>{preferenceScope(rules)}</strong></div>
      {ruleError && <p className="notice warning" role="alert">{ruleError}</p>}
    </div>
  )
}

function CategorySelector({
  label,
  categoryKey,
  suggestions,
  value,
  onChange,
}: {
  label: string
  categoryKey: "includedTypes" | "excludedTypes"
  suggestions: string[]
  value: string[]
  onChange: (value: string[]) => void
}) {
  const [draft, setDraft] = useState("")
  const [error, setError] = useState("")

  const add = (rawValue = draft) => {
    const category = rawValue.trim()
    if (!category) return
    if (category.length > 254 || /[\x00-\x1f\x7f]/.test(category) || value.length >= 200) { setError("Use up to 200 terms, each 1-254 characters without control characters."); return }
    if (value.some((current) => current.toLowerCase() === category.toLowerCase())) {
      setError("That word or phrase is already selected.")
      return
    }
    onChange([...value, category])
    setDraft("")
    setError("")
  }

  return (
    <div className="category-preferences">
      <div className="rule-input">
        <span>{label}</span>
        <div>
          <input
            aria-label={label}
            placeholder="Type a word or phrase"
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
        entries={value.map((category) => ({
          key: categoryKey,
          value: category,
          prefix: "Topic",
        }))}
        onRemove={(_key, category) =>
          onChange(value.filter((current) => current !== category))
        }
      />
      {suggestions.some(
        (suggestion) =>
          !value.some((selected) => selected.toLowerCase() === suggestion.toLowerCase()),
      ) && (
        <div className="category-suggestions">
          <p className="suggestions-label">Suggestions — unselected by default.</p>
          <div className="selection-chips">
            {suggestions
              .filter(
                (suggestion) =>
                !value.some((selected) => selected.toLowerCase() === suggestion.toLowerCase()),
              )
              .map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => { const next = uniqueTerms([...value, suggestion]); if (next.length > 200) { setError("Use up to 200 terms."); return } onChange(next); setError("") }}
                  type="button"
                >
                  <span aria-hidden="true" className="chip-plus">+</span>
                  {suggestion}
                </button>
              ))}
          </div>
        </div>
      )}
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
  onRemove: (key: RuleKey, value: string) => void
}) {
  if (!entries.length) return null
  return (
    <div className="rule-chips">
      {entries.map((entry) => (
        <span className="rule-chip" key={`${entry.key}-${entry.value}`}>
          <small>{entry.prefix}</small>
          <span className="rule-chip-value">{entry.value}</span>
          <button
            aria-label={`Remove ${entry.value}`}
            onClick={() => onRemove(entry.key, entry.raw ?? entry.value)}
            type="button"
          >
            <Icon name="close" size={12} />
          </button>
        </span>
      ))}
    </div>
  )
}

function ScanStatus({
  state,
  previewMode,
  backlogCount,
  onAction,
  onRefresh,
  onToggleProcessing,
}: {
  state: ScanState
  previewMode: boolean
  backlogCount: number
  onAction: () => void
  onRefresh: () => Promise<ScanState | undefined>
  onToggleProcessing: () => void
}) {
  const [activityOpen, setActivityOpen] = useState(false)
  const [lastChecked, setLastChecked] = useState(
    previewMode
      ? `Preview fixture · ${processingActivityFixture.lastChecked}`
      : null,
  )
  const stateCopy: Record<ScanState, [string, string]> = {
    ready: ["Auto-check on", "Preview inbox is ready for a simulated check."],
    processing: ["Checking preview inbox…", "Simulated scan in progress."],
    running: ["Checking preview inbox…", "Simulated scan in progress."],
    cooldown: ["Cooling down", "Try another simulated check in a moment."],
    empty: ["Preview check complete", "No new sample messages were processed."],
    failed: [
      "Preview check failed",
      "The simulated scan encountered an error.",
    ],
    paused: ["Auto-check paused", "Preview scans are paused."],
    "missing-sources": [
      "No sources selected",
      "Add a sender or domain rule in Settings. Topics never grant access; scanning is not connected yet.",
    ],
    disconnected: [
      "Scanning unavailable",
      "Gmail is not configured. No mailbox was accessed.",
    ],
  }
  const [title, detail] = stateCopy[state]

  return (
    <section
      aria-label="Processing status"
      className={`processing-status state-${state}`}
    >
      <div className="processing-status-copy" aria-live="polite">
        <span className="status-pulse" />
        <div>
          <strong>{title}</strong>
          <span>{detail}</span>
          <span className="scan-last-checked">
            Last checked:{" "}
            {previewMode ? (lastChecked ?? "Not yet") : "Unavailable"}
            {previewMode &&
              backlogCount > 0 &&
              ` · ${backlogCount} sample items`}
          </span>
        </div>
      </div>
      <div className="processing-status-actions">
        {previewMode && (
          <button className="text-link" onClick={onToggleProcessing}>
            {state === "paused" ? "Resume" : "Pause"}
          </button>
        )}
        <button
          className="secondary-button scan-refresh"
          disabled={
            !previewMode ||
            state === "processing" ||
            state === "running" ||
            state === "paused" ||
            state === "missing-sources"
          }
          onClick={async () => {
            const result = await onRefresh()
            if (result && result !== "cooldown") {
              setLastChecked("Just now (simulated)")
            }
          }}
        >
          Refresh
        </button>
        <button
          className="text-link"
          onClick={() => setActivityOpen((current) => !current)}
        >
          {activityOpen ? "Hide activity" : "View activity"}
        </button>
      </div>
      {activityOpen && (
        <div className="scan-activity" aria-live="polite">
          {previewMode ? (
            <>
              <strong>Preview activity · sample only</strong>
              <span>
                {processingActivityFixture.processed} sample messages checked ·{" "}
                {processingActivityFixture.excluded} excluded ·{" "}
                {processingActivityFixture.failed} simulated failure
              </span>
              <span>
                {backlogCount} sample messages remain in the preview backlog.
              </span>
              <button
                className="text-link"
                onClick={() => previewAdapter.simulateNextScanFailure()}
              >
                Simulate next scan error
              </button>
            </>
          ) : (
            <>
              <strong>Activity unavailable</strong>
              <span>
                No real inbox activity is available because Gmail is not
                configured.
              </span>
            </>
          )}
        </div>
      )}
    </section>
  )
}

function SettingsPreferenceControls({ preferences, onChange }: {
  preferences: OnboardingPreferences
  onChange: (preferences: OnboardingPreferences) => void
}) {
  return <RulesEditor rules={preferences} onChange={onChange} />
}

function SettingsScreen({
  onBack,
  preferences,
  onPreferencesChange,
  previewMode,
  gmailAccount,
  calendarAccount,
  processingEnabled,
  onGmailAccountChange,
  onCalendarAccountChange,
  onProcessingChange,
}: {
  onBack: () => void
  preferences: OnboardingPreferences
  onPreferencesChange: (preferences: OnboardingPreferences) => Promise<void>
  previewMode: boolean
  gmailAccount: string | null
  calendarAccount: string | null
  processingEnabled: boolean
  onGmailAccountChange: (email: string | null) => void
  onCalendarAccountChange: (email: string | null) => void
  onProcessingChange: (enabled: boolean) => void
}) {
  const [section, setSection] = useState("sources")
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [connectionError, setConnectionError] = useState("")

  const sections = [
    ["sources", "Sources & exclusions"],
    ["processing", "Processing & context"],
    ["connections", "Connections"],
    ["retention", "Data & retention"],
  ]

  return (
    <div className="settings-shell">
      <header className="topbar">
        <Brand />
        <div className="topbar-actions">
          <span className="demo-mode-badge">
            {previewMode ? "Preview mode · sample data" : "Live mode"}
          </span>
          <button className="secondary-button" onClick={onBack}>
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
          {!previewMode && (section === "sources" || section === "processing") && <ScanSettingsPanel />}
          {section === "sources" && previewMode && (
            <>
              <SettingsHeading
                title="Email preferences"
                description={
                  previewMode
                    ? "Changes are kept in this preview session only."
                    : "Preferences are saved to your signed-in account. Gmail remains unauthorized."
                }
              />
              <div className="notice neutral">
                <strong>
                  {previewMode ? "Preview only" : "Preferences only"}
                </strong>
                <span>
                  {previewMode
                    ? "These sample settings do not screen or retrieve any real messages."
                    : "Exact sender/domain permissions control access. Topics are evaluated by Gemini afterward. Saving rules does not grant consent or start scanning."}
                </span>
              </div>
              <SettingsPreferenceControls
                onChange={async (next) => {
                  setSaving(true)
                  setSaved(false)
                  setSaveError("")
                  try {
                    await onPreferencesChange(next)
                    setSaved(true)
                  } catch (error) {
                    setSaveError(
                      error instanceof Error ? error.message : "Preferences were not saved. Check your connection and try again.",
                    )
                  } finally {
                    setSaving(false)
                  }
                }}
                preferences={preferences}
              />
              {saving && (
                <div className="save-confirmation" role="status">
                  Saving preferences…
                </div>
              )}
              {saved && (
                <div className="save-confirmation" role="status">
                  {previewMode
                    ? "Updated for this preview session only. No messages were read or saved to Supabase."
                    : "Preferences saved. No messages were read and scanning remains off."}
                </div>
              )}
              {saveError && (
                <div className="notice warning" role="alert">
                  {saveError}
                </div>
              )}
            </>
          )}
          {section === "processing" && previewMode && (
            <>
              <SettingsHeading
                title="Processing and thread context"
                description={
                  previewMode
                    ? "Only simulated controls are available; no real inbox processing is configured."
                    : "Background processing controls are unavailable because Gmail is not configured."
                }
              />
              <div className="settings-card split-card">
                <div>
                  <strong>Automatic processing</strong>
                  <span>
                    {previewMode
                      ? "Preview checks change simulated status only and do not read real messages."
                      : "Background processing is not configured. This preview does not read or process messages."}
                  </span>
                </div>
                <button
                  className="secondary-button"
                  disabled={!previewMode}
                  onClick={() => onProcessingChange(!processingEnabled)}
                >
                  {previewMode
                    ? processingEnabled
                      ? "Pause preview checks"
                      : "Resume preview checks"
                    : "Unavailable"}
                </button>
              </div>
              <div className="settings-card">
                <div className="card-heading">
                  <div>
                    <strong>Earlier permitted messages</strong>
                    <span>
                      Only necessary context is included; five is a ceiling.
                    </span>
                  </div>
                  <span className="provisional-badge">
                    Provisional defaults
                  </span>
                </div>
                <div className="context-fields">
                  <label>
                    <span>Earlier-message ceiling</span>
                    <input defaultValue="5" min="0" type="number" />
                  </label>
                  <label>
                    <span>Maximum age</span>
                    <div className="input-suffix">
                      <input defaultValue="30" min="1" type="number" />
                      <span>days</span>
                    </div>
                  </label>
                  <label>
                    <span>Text-size limit</span>
                    <input disabled value="Not yet decided" />
                  </label>
                </div>
                <p className="settings-footnote">
                  Each earlier message independently passes current source rules
                  before its body is retrieved. Quoted history and signatures
                  are removed where practical, but removal is imperfect; inline
                  copied private content may remain. Server-enforced limits
                  still apply.
                </p>
              </div>
              <div className="review-flag">
                <strong>Needs review</strong>
                <span>
                  Earlier thread context was truncated by the provider, so the
                  proposed deadline remains empty.
                </span>
              </div>
            </>
          )}
          {section === "connections" && (
            <>
              <SettingsHeading
                title="Connections"
                description={
                  previewMode
                    ? "Fictional connections are local to this preview."
                    : "No external accounts are connected in this deployment."
                }
              />
              <div className="settings-card connection-setting">
                <div>
                  <span className="service-icon">G</span>
                  <div>
                    <strong>Gmail</strong>
                    <span>
                      {previewMode && gmailAccount
                        ? `${gmailAccount} · fictional preview`
                        : "Not configured"}
                    </span>
                  </div>
                </div>
                <button
                  className="secondary-button"
                  disabled={!previewMode}
                  onClick={async () => {
                    setConnectionError("")
                    try {
                      const account = await previewAdapter.connectGmail()
                      onGmailAccountChange(account.email)
                    } catch (error) {
                      setConnectionError("Could not connect the preview inbox.")
                    }
                  }}
                >
                  {previewMode
                    ? gmailAccount
                      ? "Reconnect preview inbox"
                      : "Connect preview inbox"
                    : "Unavailable"}
                </button>
              </div>
              <div className="settings-card connection-setting">
                <div>
                  <span className="service-icon calendar-service">
                    <Icon name="calendar" size={17} />
                  </span>
                  <div>
                    <strong>Google Calendar</strong>
                    <span>
                      {previewMode && calendarAccount
                        ? `${calendarAccount} · fictional preview`
                        : "Not configured"}
                    </span>
                  </div>
                </div>
                <button
                  className="secondary-button"
                  disabled={!previewMode}
                  onClick={async () => {
                    setConnectionError("")
                    try {
                      const account =
                        await previewAdapter.connectGoogleCalendar()
                      onCalendarAccountChange(account.email)
                    } catch (error) {
                      setConnectionError(
                        "Could not connect the preview calendar.",
                      )
                    }
                  }}
                >
                  {previewMode
                    ? calendarAccount
                      ? "Reconnect preview calendar"
                      : "Connect preview calendar"
                    : "Unavailable"}
                </button>
              </div>
              {connectionError && (
                <div className="notice warning" role="alert">
                  {connectionError}
                </div>
              )}
              <div className="notice neutral">
                <strong>
                  {previewMode
                    ? "Preview connections only"
                    : "Integrations are unavailable"}
                </strong>
                <span>
                  {previewMode
                    ? "These fictional accounts do not access Gmail or create real Calendar events."
                    : "Gmail and Google Calendar are not connected in this deployment. The demo uses local sample data only."}
                </span>
              </div>
              <p className="settings-footnote">
                Completing or deleting an InboxToTask record does not delete
                Gmail messages or calendar entries.
              </p>
              <p className="settings-footnote">
                Exiting preview mode does not connect or disconnect any external
                service.
              </p>
            </>
          )}
          {section === "retention" && (
            <>
              <SettingsHeading
                title="Data and retention"
                description="Illustrative controls only; no real inbox or service data is stored by this demo."
              />
              <div className="retention-list">
                <RetentionRow
                  title="Full message bodies"
                  value="No real messages are retrieved or stored."
                />
                <RetentionRow
                  title="Active approved tasks"
                  value="Sample tasks are shown only in this demo and are not persisted."
                />
                <RetentionRow
                  title="Completed tasks"
                  value="No scheduled deletion is active. Dates shown in the demo are illustrative."
                />
                <RetentionRow
                  title="Supporting excerpts"
                  value="Fixture text only; no source email access is available."
                />
                <RetentionRow
                  title="Gmail credentials"
                  value="No Gmail credentials are configured or stored in this demo."
                />
                <RetentionRow
                  title="Technical logs"
                  value="No InboxToTask backend logging is configured in this deployment."
                />
              </div>
              <div className="expired-example">
                <strong>Example expired-item state</strong>
                <span>
                  This is a static preview. No original email is available.
                </span>
              </div>
              <p className="settings-footnote">
                These examples are not an active retention policy and do not
                describe configured external-provider behavior.
              </p>
              <div className="danger-zone">
                <div>
                  <strong>No previous results</strong>
                  <span>No server-backed results exist in this demo.</span>
                </div>
                <button className="secondary-button" disabled>
                  No stored data
                </button>
              </div>
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

function RetentionRow({ title, value }: RetentionRowProps) {
  return (
    <div className="retention-row">
      <strong>{title}</strong>
      <span>{value}</span>
    </div>
  )
}

function CalendarPreviewModal({
  task,
  onCancel,
  previewMode,
  calendarAccount,
  onCalendarAccountChange,
  onSuccess,
}: {
  task: Task
  onCancel: () => void
  previewMode: boolean
  calendarAccount: string | null
  onCalendarAccountChange: (email: string | null) => void
  onSuccess: (eventId: string) => void
}) {
  const [kind, setKind] = useState<"all-day" | "timed">("timed")
  const [title, setTitle] = useState(task.title)
  const [destination, setDestination] = useState("Primary")
  const [startDate, setStartDate] = useState(task.date.slice(0, 10))
  const [endDate, setEndDate] = useState(task.date.slice(0, 10))
  const [start, setStart] = useState(task.date.slice(11) || "")
  const [zone, setZone] = useState("America/Chicago")
  const [duration, setDuration] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  return (
    <Modal onClose={onCancel} title="Preview calendar event" wide>
      <div className="calendar-disclosure">
        <strong>
          {previewMode && calendarAccount
            ? "Fictional preview calendar connected"
            : "Google Calendar is unavailable"}
        </strong>
        <span>
          {previewMode
            ? "Preview actions stay local; no real Calendar account is accessed or changed."
            : "Calendar integration is not configured. This preview will not connect an account or create an event."}
        </span>
      </div>
      <div className="form-stack calendar-form">
        <label>
          <span>Title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          <span>Destination calendar</span>
          <select
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
          >
            <option>Primary</option>
            <option>School</option>
            <option>Tasks</option>
          </select>
        </label>
        <fieldset>
          <legend>Event type</legend>
          <label>
            <input
              checked={kind === "all-day"}
              name="event-kind"
              onChange={() => setKind("all-day")}
              type="radio"
            />{" "}
            All-day
          </label>
          <label>
            <input
              checked={kind === "timed"}
              name="event-kind"
              onChange={() => setKind("timed")}
              type="radio"
            />{" "}
            Timed
          </label>
        </fieldset>
        <div className="calendar-field-grid">
          <label>
            <span>Start date</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <label>
            <span>End date</span>
            <input
              min={startDate}
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
        </div>
        {kind === "timed" && (
          <div className="calendar-field-grid">
            <label>
              <span>Start time</span>
              <input
                type="time"
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            </label>
            <label>
              <span>Time zone</span>
              <select
                value={zone}
                onChange={(event) => setZone(event.target.value)}
              >
                <option>America/Chicago</option>
                <option>America/New_York</option>
                <option>UTC</option>
              </select>
            </label>
            <label>
              <span>Duration</span>
              <select
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              >
                <option value="">Choose duration</option>
                <option>30 minutes</option>
                <option>1 hour</option>
                <option>2 hours</option>
              </select>
            </label>
          </div>
        )}
        {kind === "timed" && !duration && (
          <p className="form-hint review-text">
            Needs review: an explicit email due time may prefill the start, but
            duration is never assumed.
          </p>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions calendar-modal-actions">
        <button className="secondary-button" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="primary-button"
          disabled={
            !previewMode ||
            submitting ||
            Boolean(calendarAccount && kind === "timed" && !duration)
          }
          onClick={async () => {
            if (!previewMode || submitting) return
            setSubmitting(true)
            setError("")
            try {
              if (!calendarAccount) {
                const account = await previewAdapter.connectGoogleCalendar()
                onCalendarAccountChange(account.email)
                return
              }
              const event = await previewAdapter.createCalendarEvent(
                {
                  title,
                  calendar: destination,
                  allDay: kind === "all-day",
                  startDate,
                  endDate,
                  startTime: kind === "timed" ? start : undefined,
                  duration: kind === "timed" ? duration : undefined,
                  timeZone: zone,
                },
                task.id,
              )
              onSuccess(event.id)
            } catch (caught) {
              setError("Could not create the local preview event.")
            } finally {
              setSubmitting(false)
            }
          }}
        >
          {!previewMode
            ? "Unavailable"
            : submitting
              ? "Working…"
              : calendarAccount && kind === "timed" && !duration
                ? "Choose duration first"
                : calendarAccount
                  ? "Add preview event"
                  : "Connect preview Calendar"}
        </button>
      </div>
    </Modal>
  )
}

export default App
