import { useEffect, useMemo, useRef, useState } from "react"
import gmailLogo from "./assets/gmail-logo.svg"
import inboxToTaskLogo from "./assets/inbox-to-task-logo.png"
import { gmailLabels, scopeSummary, type SourceRules } from "./demoData"

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

type OnboardingPreferences = {
  includedTypes: string[]
  selectedSources: string[]
  excludedTypes: string[]
  excludedSources: string[]
}

const emptyOnboardingPreferences: OnboardingPreferences = {
  includedTypes: [],
  selectedSources: [],
  excludedTypes: [],
  excludedSources: [],
}

function App() {
  const [screen, setScreen] = useState<AppScreen>("onboarding")
  const [savedPreferences, setSavedPreferences] =
    useState<OnboardingPreferences>(emptyOnboardingPreferences)

  if (screen === "onboarding") {
    return (
      <Onboarding
        onExplore={() => {
          setSavedPreferences({
            includedTypes: ["School"],
            selectedSources: ["professor@illinois.edu"],
            excludedTypes: ["Financial"],
            excludedSources: [],
          })
          setScreen("dashboard")
        }}
      />
    )
  }

  return (
    <Dashboard
      onPreferencesChange={(preferences) => {
        setSavedPreferences(preferences)
      }}
      preferences={savedPreferences}
      onSignOut={() => {
        setScreen("onboarding")
        setSavedPreferences(emptyOnboardingPreferences)
      }}
    />
  )
}

function Dashboard({
  preferences,
  onPreferencesChange,
  onSignOut,
}: {
  preferences: OnboardingPreferences
  onPreferencesChange: (preferences: OnboardingPreferences) => void
  onSignOut: () => void
}) {
  const [activeTab, setActiveTab] = useState<"tasks" | "passive">("tasks")
  const [taskView, setTaskView] =
    useState<"suggestions" | "active" | "completed">("suggestions")
  const [tasks, setTasks] = useState(tasksSeed)
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
  const [calendarPreview, setCalendarPreview] = useState<Task | null>(null)
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
    categoryFilter === "All tasks" || categoryFilter === "Meetings & projects"
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

  if (settingsOpen) {
    return (
      <SettingsScreen
        onBack={() => setSettingsOpen(false)}
        onPreferencesChange={onPreferencesChange}
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
            Thursday, October 8, 2026
          </div>
          <span className="demo-mode-badge">Demo mode · sample data</span>
          <div className="account-menu-wrap">
            <button
              aria-expanded={accountMenuOpen}
              aria-label="Open account menu"
              className="account-avatar"
              onClick={() => setAccountMenuOpen((current) => !current)}
            >
              MP
            </button>
            {accountMenuOpen && (
              <div className="account-menu">
                <div>
                  <strong>Maya Patel</strong>
                  <span>maya.patel@example.com</span>
                </div>
                <button
                  onClick={() => {
                    setAccountMenuOpen(false)
                    setSettingsOpen(true)
                  }}
                >
                  Settings
                </button>
                <button onClick={onSignOut}>Exit demo</button>
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
              <strong>{tasks.length + 1}</strong>
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
            <span className="tab-count">4</span>
          </button>
        </nav>

        <ScanStatus onAction={() => setSettingsOpen(true)} />

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
          <PassiveCommunication onViewEmail={setEmail} />
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
          onCancel={() => setCalendarPreview(null)}
          task={calendarPreview}
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
          Preview calendar event
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
}: {
  onViewEmail: (email: Email) => void
}) {
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

function Onboarding({ onExplore }: { onExplore: () => void }) {
  const [step, setStep] = useState(0)
  const [preferences, setPreferences] = useState<OnboardingPreferences>(
    emptyOnboardingPreferences,
  )
  const [sourceDraft, setSourceDraft] = useState("")
  const [sourceError, setSourceError] = useState("")
  const [includedTypeDraft, setIncludedTypeDraft] = useState("")
  const [customIncludedTypes, setCustomIncludedTypes] = useState<string[]>([])
  const [excludedSourceDraft, setExcludedSourceDraft] = useState("")
  const [excludedSourceError, setExcludedSourceError] = useState("")
  const [customTypeDraft, setCustomTypeDraft] = useState("")
  const [customExcludedTypes, setCustomExcludedTypes] = useState<string[]>([])
  const setupSteps = ["Connect", "Choose emails", "Privacy", "Review"]

  const isValidSource = (value: string) => {
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const domain = /^(?!-)(?:[a-z0-9-]+\.)+[a-z]{2,}$/i
    return email.test(value) || domain.test(value)
  }

  const addSource = (
    key: "selectedSources" | "excludedSources",
    rawValue: string,
    setDraft: (value: string) => void,
    setError: (value: string) => void,
  ) => {
    const value = rawValue.trim().toLowerCase().replace(/^@/, "")
    if (!isValidSource(value)) {
      setError("Enter a complete email address or domain.")
      return
    }
    if (
      preferences[key].some(
        (item) => item.toLowerCase() === value.toLowerCase(),
      )
    ) {
      setError("That source is already included.")
      return
    }
    setPreferences((current) => ({
      ...current,
      [key]: [...current[key], value],
    }))
    setDraft("")
    setError("")
  }

  const toggleValue = (key: "includedTypes" | "excludedTypes", value: string) =>
    setPreferences((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((item) => item !== value)
        : [...current[key], value],
    }))

  const removeValue = (key: keyof OnboardingPreferences, value: string) =>
    setPreferences((current) => ({
      ...current,
      [key]: current[key].filter((item) => item !== value),
    }))

  const hasSources =
    preferences.includedTypes.length + preferences.selectedSources.length > 0

  return (
    <div className="onboarding-shell">
      <header className="onboarding-header">
        <Brand />
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
                <div className="sign-in-unavailable" role="status">
                  <strong>Google sign-in is unavailable</strong>
                  <span>
                    Authentication is not configured in this deployment. No
                    account has been connected.
                  </span>
                </div>
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
              <div className="setup-connection unavailable">
                <div>
                  <strong>Gmail connection is unavailable</strong>
                  <span>
                    Gmail integration is not configured. No mailbox has been
                    accessed.
                  </span>
                </div>
              </div>
              <p className="setup-helper">
                Nothing is scanned until you finish setup and start.
              </p>
              <FooterActions
                back={() => setStep(0)}
                next={() => setStep(2)}
                nextDisabled
              />
            </>
          )}

          {step === 2 && (
            <>
              <h2>Which emails should we check?</h2>
              <p className="setup-description">
                Choose email types or senders you’d like InboxToTask to check.
              </p>
              <div className="setup-field-group">
                <div className="setup-field-heading">
                  <strong>Email types.</strong>
                </div>
                <TagInput
                  label="Add an email type"
                  onAdd={() => {
                    const value = includedTypeDraft.trim()
                    if (
                      value &&
                      ![
                        "School",
                        "Job applications",
                        "Research",
                        "Meetings",
                        ...customIncludedTypes,
                      ].some(
                        (item) => item.toLowerCase() === value.toLowerCase(),
                      )
                    ) {
                      setPreferences((current) => ({
                        ...current,
                        includedTypes: [...current.includedTypes, value],
                      }))
                      setCustomIncludedTypes((current) => [...current, value])
                      setIncludedTypeDraft("")
                    }
                  }}
                  onChange={setIncludedTypeDraft}
                  placeholder="Type an email category…"
                  value={includedTypeDraft}
                  visuallyHiddenLabel
                />
                <p className="suggestions-label">
                  Suggestions — select any that apply.
                </p>
                <SelectableTypeChips
                  custom={customIncludedTypes}
                  onRemove={(value) => {
                    removeValue("includedTypes", value)
                    setCustomIncludedTypes((current) =>
                      current.filter((item) => item !== value),
                    )
                  }}
                  onToggle={(value) => toggleValue("includedTypes", value)}
                  selected={preferences.includedTypes}
                  suggested={[
                    "School",
                    "Job applications",
                    "Research",
                    "Meetings",
                  ]}
                />
              </div>
              <TagInput
                error={sourceError}
                label="Sender email address or domain"
                onAdd={() =>
                  addSource(
                    "selectedSources",
                    sourceDraft,
                    setSourceDraft,
                    setSourceError,
                  )
                }
                onChange={(value) => {
                  setSourceDraft(value)
                  setSourceError("")
                }}
                placeholder="professor@illinois.edu or illinois.edu"
                value={sourceDraft}
              />
              <PreferenceTags
                onRemove={(value) => removeValue("selectedSources", value)}
                values={preferences.selectedSources}
              />
              <p className="setup-helper">
                We use email subjects and senders to identify the types you
                choose.
              </p>
              <p className="setup-helper requirement-helper">
                Select at least one email type or add a sender or domain to
                continue.
              </p>
              <FooterActions
                back={() => setStep(1)}
                next={() => setStep(3)}
                nextDisabled={!hasSources}
              />
            </>
          )}

          {step === 3 && (
            <>
              <h2>What would you like to keep private?</h2>
              <p className="setup-description">
                Choose email types or senders you want us to skip, even when
                they match your selected sources.
              </p>
              <div className="setup-field-group">
                <div className="setup-field-heading">
                  <strong>Email types.</strong>
                </div>
                <TagInput
                  label="Add an email type"
                  onAdd={() => {
                    const value = customTypeDraft.trim()
                    if (
                      value &&
                      ![
                        "Financial",
                        "Promotional",
                        "Health",
                        ...customExcludedTypes,
                      ].some(
                        (item) => item.toLowerCase() === value.toLowerCase(),
                      )
                    ) {
                      setPreferences((current) => ({
                        ...current,
                        excludedTypes: [...current.excludedTypes, value],
                      }))
                      setCustomExcludedTypes((current) => [...current, value])
                      setCustomTypeDraft("")
                    }
                  }}
                  onChange={setCustomTypeDraft}
                  placeholder="Type an email category…"
                  value={customTypeDraft}
                  visuallyHiddenLabel
                />
                <p className="suggestions-label">
                  Suggestions — select any that apply.
                </p>
                <SelectableTypeChips
                  custom={customExcludedTypes}
                  onRemove={(value) => {
                    removeValue("excludedTypes", value)
                    setCustomExcludedTypes((current) =>
                      current.filter((item) => item !== value),
                    )
                  }}
                  onToggle={(value) => toggleValue("excludedTypes", value)}
                  selected={preferences.excludedTypes}
                  suggested={["Financial", "Promotional", "Health"]}
                />
              </div>
              <TagInput
                error={excludedSourceError}
                label="Exclude a sender or domain"
                onAdd={() =>
                  addSource(
                    "excludedSources",
                    excludedSourceDraft,
                    setExcludedSourceDraft,
                    setExcludedSourceError,
                  )
                }
                onChange={(value) => {
                  setExcludedSourceDraft(value)
                  setExcludedSourceError("")
                }}
                placeholder="sender@example.com or example.com"
                value={excludedSourceDraft}
              />
              <PreferenceTags
                onRemove={(value) => removeValue("excludedSources", value)}
                values={preferences.excludedSources}
              />
              <p className="setup-helper">
                Exclusions always override included types or senders.
              </p>
              <details className="privacy-disclosure">
                <summary>How privacy filtering works</summary>
                <ul>
                  <li>
                    Subjects and senders may be sent to the AI provider to
                    screen messages against your choices.
                  </li>
                  <li>
                    Message bodies are retrieved only after screening permits
                    them.
                  </li>
                  <li>Uncertain screening results are skipped.</li>
                  <li>
                    Vague subjects can cause missed or misclassified messages.
                  </li>
                  <li>
                    Earlier messages used as thread context follow the same
                    rules.
                  </li>
                </ul>
              </details>
              <FooterActions back={() => setStep(2)} next={() => setStep(4)} />
            </>
          )}

          {step === 4 && (
            <>
              <h2>Ready to organize your inbox?</h2>
              <p className="setup-description">
                Review your choices before automatic checks begin.
              </p>
              <div className="review-preferences">
                <ReviewPreference
                  label="Gmail status"
                  onEdit={() => setStep(1)}
                  values={["Unavailable in this deployment"]}
                />
                <ReviewPreference
                  label="Emails to check"
                  onEdit={() => setStep(2)}
                  values={[
                    ...preferences.includedTypes,
                    ...preferences.selectedSources,
                  ]}
                />
                <ReviewPreference
                  label="Emails to skip"
                  onEdit={() => setStep(3)}
                  values={[
                    ...preferences.excludedTypes,
                    ...preferences.excludedSources,
                  ]}
                  emptyLabel="No exclusions selected"
                />
              </div>
              <div className="scan-plan">
                <div>
                  <span>Initial scan</span>
                  <strong>Past 7 days, up to 100 eligible messages</strong>
                </div>
                <div>
                  <span>Automatic checks</span>
                  <strong>Approximately every 15 minutes</strong>
                </div>
              </div>
              <p className="approval-reminder">
                You review task suggestions before approving them. Calendar
                entries require separate approval.
              </p>
              <FooterActions
                back={() => setStep(3)}
                next={() => undefined}
                nextDisabled
                nextLabel="Processing unavailable"
              />
            </>
          )}
        </section>
      </main>
    </div>
  )
}

function TagInput({
  label,
  placeholder,
  value,
  error,
  onChange,
  onAdd,
  visuallyHiddenLabel = false,
}: {
  label: string
  placeholder: string
  value: string
  error?: string
  onChange: (value: string) => void
  onAdd: () => void
  visuallyHiddenLabel?: boolean
}) {
  return (
    <label className="setup-tag-input">
      <span className={visuallyHiddenLabel ? "visually-hidden" : ""}>
        {label}
      </span>
      <div>
        <input
          aria-invalid={Boolean(error)}
          placeholder={placeholder}
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
      {error && <small role="alert">{error}</small>}
    </label>
  )
}

function PreferenceTags({
  values,
  onRemove,
}: {
  values: string[]
  onRemove: (value: string) => void
}) {
  if (!values.length) return null
  return (
    <div className="preference-tags">
      {values.map((value) => (
        <span key={value}>
          {value}
          <button
            aria-label={`Remove ${value}`}
            onClick={() => onRemove(value)}
            type="button"
          >
            <Icon name="close" size={12} />
          </button>
        </span>
      ))}
    </div>
  )
}

function SelectableTypeChips({
  suggested,
  custom,
  selected,
  onToggle,
  onRemove,
}: {
  suggested: string[]
  custom: string[]
  selected: string[]
  onToggle: (value: string) => void
  onRemove: (value: string) => void
}) {
  return (
    <div
      className="selection-chips type-selection-chips"
      role="group"
      aria-label="Email type preferences"
    >
      {[...suggested, ...custom].map((value) => {
        const isSelected = selected.includes(value)
        const isCustom = custom.includes(value)
        return (
          <span
            className={isSelected ? "type-chip selected" : "type-chip"}
            key={value}
          >
            <button
              aria-pressed={isSelected}
              className="type-chip-toggle"
              onClick={() => onToggle(value)}
              type="button"
            >
              {isSelected ? (
                <Icon name="check" size={15} />
              ) : (
                <span aria-hidden="true" className="chip-plus">
                  +
                </span>
              )}
              {value}
            </button>
            {isSelected && (
              <button
                aria-label={
                  isCustom
                    ? `Remove custom email type ${value}`
                    : `Remove selected email type ${value}`
                }
                className="type-chip-remove"
                onClick={() => (isCustom ? onRemove(value) : onToggle(value))}
                type="button"
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </span>
        )
      })}
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

type RuleKey = keyof SourceRules

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

function RulesEditor({
  rules,
  onChange,
  compact = false,
}: {
  rules: SourceRules
  onChange: (rules: SourceRules) => void
  compact?: boolean
}) {
  const [drafts, setDrafts] = useState<Record<RuleKey, string>>({
    allowedLabels: "",
    allowedSenders: "",
    allowedDomains: "",
    excludedLabels: "",
    excludedSenders: "",
    excludedDomains: "",
    excludedSubjects: "",
  })

  const add = (key: RuleKey, rawValue?: string) => {
    const value = (rawValue ?? drafts[key]).trim()
    if (!value || rules[key].includes(value)) return
    onChange({ ...rules, [key]: [...rules[key], value] })
    setDrafts((current) => ({ ...current, [key]: "" }))
  }

  const remove = (key: RuleKey, value: string) =>
    onChange({ ...rules, [key]: rules[key].filter((item) => item !== value) })

  const fields: RuleField[] = [
    {
      key: "allowedSenders",
      label: "Sender address",
      placeholder: "name@example.edu",
    },
    {
      key: "allowedDomains",
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
      label: "Subject keyword",
      placeholder: "e.g. confidential",
    },
  ]

  return (
    <div className={`rules-editor ${compact ? "compact" : ""}`}>
      <div className="rule-group">
        <div className="rule-heading">
          <div>
            <strong>Allowed sources</strong>
            <span>One or more required</span>
          </div>
        </div>
        <label className="rule-input">
          <span>Gmail label</span>
          <div>
            <select
              aria-label="Select allowed Gmail label"
              value={drafts.allowedLabels}
              onChange={(event) => {
                setDrafts((current) => ({
                  ...current,
                  allowedLabels: event.target.value,
                }))
                add("allowedLabels", event.target.value)
              }}
            >
              <option value="">Choose fictional label</option>
              {gmailLabels.map((label) => (
                <option key={label}>{label}</option>
              ))}
            </select>
          </div>
        </label>
        {fields.slice(0, 2).map((field) => (
          <RuleInput
            field={field}
            key={field.key}
            onAdd={() => add(field.key)}
            onChange={(value) =>
              setDrafts((current) => ({ ...current, [field.key]: value }))
            }
            value={drafts[field.key]}
          />
        ))}
        <Chips
          entries={[
            ...rules.allowedLabels.map((value) => ({
              key: "allowedLabels" as RuleKey,
              value,
              prefix: "Label",
            })),
            ...rules.allowedSenders.map((value) => ({
              key: "allowedSenders" as RuleKey,
              value,
              prefix: "From",
            })),
            ...rules.allowedDomains.map((value) => ({
              key: "allowedDomains" as RuleKey,
              value: `@${value}`,
              raw: value,
              prefix: "Domain",
            })),
          ]}
          onRemove={remove}
        />
      </div>
      <div className="rule-group exclusion">
        <div className="rule-heading">
          <div>
            <strong>Exclusions</strong>
            <span>Always override allowed sources</span>
          </div>
        </div>
        <label className="rule-input">
          <span>Blocked Gmail label</span>
          <div>
            <select
              aria-label="Select excluded Gmail label"
              value={drafts.excludedLabels}
              onChange={(event) => {
                setDrafts((current) => ({
                  ...current,
                  excludedLabels: event.target.value,
                }))
                add("excludedLabels", event.target.value)
              }}
            >
              <option value="">Choose fictional label</option>
              {gmailLabels.map((label) => (
                <option key={label}>{label}</option>
              ))}
            </select>
          </div>
        </label>
        {fields.slice(2).map((field) => (
          <RuleInput
            field={field}
            key={field.key}
            onAdd={() => add(field.key)}
            onChange={(value) =>
              setDrafts((current) => ({ ...current, [field.key]: value }))
            }
            value={drafts[field.key]}
          />
        ))}
        <Chips
          entries={[
            ...rules.excludedLabels.map((value) => ({
              key: "excludedLabels" as RuleKey,
              value,
              prefix: "Label",
            })),
            ...rules.excludedSenders.map((value) => ({
              key: "excludedSenders" as RuleKey,
              value,
              prefix: "From",
            })),
            ...rules.excludedDomains.map((value) => ({
              key: "excludedDomains" as RuleKey,
              value: `@${value}`,
              raw: value,
              prefix: "Domain",
            })),
            ...rules.excludedSubjects.map((value) => ({
              key: "excludedSubjects" as RuleKey,
              value,
              prefix: "Subject",
            })),
          ]}
          onRemove={remove}
        />
      </div>
      <div className="scope-summary live" aria-live="polite">
        <span>Effective scope</span>
        <strong>{scopeSummary(rules)}</strong>
      </div>
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
          <small>{entry.prefix}</small> {entry.value}
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

function ScanStatus({ onAction }: { onAction: () => void }) {
  return (
    <section
      aria-label="Processing status"
      className="processing-status state-disconnected"
    >
      <div className="processing-status-copy" aria-live="polite">
        <span className="status-pulse" />
        <div>
          <strong>Gmail integration unavailable</strong>
          <span>No mailbox was accessed or processed.</span>
        </div>
      </div>
      <div className="processing-status-actions">
        <button className="text-link" onClick={onAction}>
          View settings
        </button>
      </div>
    </section>
  )
}

function SettingsPreferenceControls({
  preferences,
  onChange,
}: {
  preferences: OnboardingPreferences
  onChange: (preferences: OnboardingPreferences) => void
}) {
  const includedSuggested = [
    "School",
    "Job applications",
    "Research",
    "Meetings",
  ]
  const excludedSuggested = ["Financial", "Promotional", "Health"]
  const [includedDraft, setIncludedDraft] = useState("")
  const [excludedDraft, setExcludedDraft] = useState("")
  const [includedSourceDraft, setIncludedSourceDraft] = useState("")
  const [excludedSourceDraft, setExcludedSourceDraft] = useState("")
  const [sourceError, setSourceError] = useState("")
  const [customIncluded, setCustomIncluded] = useState(
    preferences.includedTypes.filter(
      (value) => !includedSuggested.includes(value),
    ),
  )
  const [customExcluded, setCustomExcluded] = useState(
    preferences.excludedTypes.filter(
      (value) => !excludedSuggested.includes(value),
    ),
  )

  const toggle = (key: "includedTypes" | "excludedTypes", value: string) =>
    onChange({
      ...preferences,
      [key]: preferences[key].includes(value)
        ? preferences[key].filter((item) => item !== value)
        : [...preferences[key], value],
    })

  const addType = (
    key: "includedTypes" | "excludedTypes",
    draft: string,
    suggested: string[],
    custom: string[],
    setCustom: (value: string[]) => void,
    setDraft: (value: string) => void,
  ) => {
    const value = draft.trim()
    if (
      !value ||
      [...suggested, ...custom].some(
        (item) => item.toLowerCase() === value.toLowerCase(),
      )
    )
      return
    setCustom([...custom, value])
    onChange({ ...preferences, [key]: [...preferences[key], value] })
    setDraft("")
  }

  const addSource = (
    key: "selectedSources" | "excludedSources",
    draft: string,
    setDraft: (value: string) => void,
  ) => {
    const value = draft.trim().toLowerCase().replace(/^@/, "")
    const valid =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ||
      /^(?!-)(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(value)
    if (!valid) {
      setSourceError("Enter a complete email address or domain.")
      return
    }
    if (
      preferences[key].some(
        (item) => item.toLowerCase() === value.toLowerCase(),
      )
    ) {
      setSourceError("That source is already included.")
      return
    }
    onChange({ ...preferences, [key]: [...preferences[key], value] })
    setDraft("")
    setSourceError("")
  }

  const remove = (key: keyof OnboardingPreferences, value: string) =>
    onChange({
      ...preferences,
      [key]: preferences[key].filter((item) => item !== value),
    })

  return (
    <div className="settings-preferences">
      <section className="settings-card">
        <div className="card-heading">
          <div>
            <strong>Emails to check</strong>
            <span>Email types</span>
          </div>
        </div>
        <TagInput
          label="Add an included email type"
          onAdd={() =>
            addType(
              "includedTypes",
              includedDraft,
              includedSuggested,
              customIncluded,
              setCustomIncluded,
              setIncludedDraft,
            )
          }
          onChange={setIncludedDraft}
          placeholder="Type an email category…"
          value={includedDraft}
          visuallyHiddenLabel
        />
        <p className="suggestions-label">
          Suggestions — select any that apply.
        </p>
        <SelectableTypeChips
          custom={customIncluded}
          onRemove={(value) => {
            remove("includedTypes", value)
            setCustomIncluded((current) =>
              current.filter((item) => item !== value),
            )
          }}
          onToggle={(value) => toggle("includedTypes", value)}
          selected={preferences.includedTypes}
          suggested={includedSuggested}
        />
        <TagInput
          error={sourceError}
          label="Optional sender or domain"
          onAdd={() =>
            addSource(
              "selectedSources",
              includedSourceDraft,
              setIncludedSourceDraft,
            )
          }
          onChange={(value) => {
            setIncludedSourceDraft(value)
            setSourceError("")
          }}
          placeholder="professor@illinois.edu or illinois.edu"
          value={includedSourceDraft}
        />
        <PreferenceTags
          onRemove={(value) => remove("selectedSources", value)}
          values={preferences.selectedSources}
        />
      </section>
      <section className="settings-card">
        <div className="card-heading">
          <div>
            <strong>Emails to skip</strong>
            <span>Email types</span>
          </div>
        </div>
        <TagInput
          label="Add an excluded email type"
          onAdd={() =>
            addType(
              "excludedTypes",
              excludedDraft,
              excludedSuggested,
              customExcluded,
              setCustomExcluded,
              setExcludedDraft,
            )
          }
          onChange={setExcludedDraft}
          placeholder="Type an email category…"
          value={excludedDraft}
          visuallyHiddenLabel
        />
        <p className="suggestions-label">
          Suggestions — select any that apply.
        </p>
        <SelectableTypeChips
          custom={customExcluded}
          onRemove={(value) => {
            remove("excludedTypes", value)
            setCustomExcluded((current) =>
              current.filter((item) => item !== value),
            )
          }}
          onToggle={(value) => toggle("excludedTypes", value)}
          selected={preferences.excludedTypes}
          suggested={excludedSuggested}
        />
        <TagInput
          error={sourceError}
          label="Optional excluded sender or domain"
          onAdd={() =>
            addSource(
              "excludedSources",
              excludedSourceDraft,
              setExcludedSourceDraft,
            )
          }
          onChange={(value) => {
            setExcludedSourceDraft(value)
            setSourceError("")
          }}
          placeholder="sender@example.com or example.com"
          value={excludedSourceDraft}
        />
        <PreferenceTags
          onRemove={(value) => remove("excludedSources", value)}
          values={preferences.excludedSources}
        />
      </section>
    </div>
  )
}

function SettingsScreen({
  onBack,
  preferences,
  onPreferencesChange,
}: {
  onBack: () => void
  preferences: OnboardingPreferences
  onPreferencesChange: (preferences: OnboardingPreferences) => void
}) {
  const [section, setSection] = useState("sources")
  const [saved, setSaved] = useState(false)

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
          <span className="demo-mode-badge">Demo mode · sample data</span>
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
          {section === "sources" && (
            <>
              <SettingsHeading
                title="Email preferences"
                description="Preview preference controls. Changes are kept in this demo session only."
              />
              <div className="notice neutral">
                <strong>Preview only</strong>
                <span>
                  These sample settings do not screen or retrieve any real
                  messages.
                </span>
              </div>
              <SettingsPreferenceControls
                onChange={(next) => {
                  onPreferencesChange(next)
                  setSaved(true)
                }}
                preferences={preferences}
              />
              {saved && (
                <div className="save-confirmation" role="status">
                  Updated for this demo session only. No messages were read.
                </div>
              )}
            </>
          )}
          {section === "processing" && (
            <>
              <SettingsHeading
                title="Processing and thread context"
                description="Background processing controls are unavailable because Gmail is not configured."
              />
              <div className="settings-card split-card">
                <div>
                  <strong>Automatic processing</strong>
                  <span>
                    Background processing is not configured. This demo does not
                    read or process messages.
                  </span>
                </div>
                <button className="secondary-button" disabled>
                  Unavailable
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
                description="No external accounts are connected in this deployment."
              />
              <div className="settings-card connection-setting">
                <div>
                  <span className="service-icon">G</span>
                  <div>
                    <strong>Gmail</strong>
                    <span>Not configured</span>
                  </div>
                </div>
                <button className="secondary-button" disabled>
                  Unavailable
                </button>
              </div>
              <div className="settings-card connection-setting">
                <div>
                  <span className="service-icon calendar-service">
                    <Icon name="calendar" size={17} />
                  </span>
                  <div>
                    <strong>Google Calendar</strong>
                    <span>Not configured</span>
                  </div>
                </div>
                <button className="secondary-button" disabled>
                  Unavailable
                </button>
              </div>
              <div className="notice neutral">
                <strong>Integrations are unavailable</strong>
                <span>
                  Gmail and Google Calendar are not connected in this
                  deployment. The demo uses local sample data only.
                </span>
              </div>
              <p className="settings-footnote">
                Completing or deleting an InboxToTask record does not delete
                Gmail messages or calendar entries.
              </p>
              <p className="settings-footnote">
                Exiting demo mode does not connect or disconnect any external
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
}: {
  task: Task
  onCancel: () => void
}) {
  const [kind, setKind] = useState<"all-day" | "timed">("timed")
  const [title, setTitle] = useState(task.title)
  const [destination, setDestination] = useState("Primary")
  const [startDate, setStartDate] = useState(task.date.slice(0, 10))
  const [endDate, setEndDate] = useState(task.date.slice(0, 10))
  const [start, setStart] = useState(task.date.slice(11) || "")
  const [zone, setZone] = useState("America/Chicago")
  const [duration, setDuration] = useState("")

  return (
    <Modal onClose={onCancel} title="Preview calendar event" wide>
      <div className="calendar-disclosure">
        <strong>Google Calendar is unavailable</strong>
        <span>
          Calendar integration is not configured. This preview will not connect
          an account or create an event.
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
      <div className="modal-actions calendar-modal-actions">
        <button className="secondary-button" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary-button" disabled>
          Unavailable
        </button>
      </div>
    </Modal>
  )
}

export default App
