import { useEffect, useMemo, useState } from "react";
import inboxToTaskLogo from "./assets/inbox-to-task-logo.png";

type Email = {
  sender: string;
  subject: string;
  received: string;
  body: string[];
};

type Category =
  | "Homework & assignments"
  | "Jobs & applications"
  | "Finances"
  | "Meetings & projects"
  | "Personal"
  | "Other";

type CategoryFilter = "All tasks" | Category;

const categories: Category[] = [
  "Homework & assignments",
  "Jobs & applications",
  "Finances",
  "Meetings & projects",
  "Personal",
  "Other",
];

type Task = {
  id: string;
  title: string;
  caption: string;
  context: string;
  category: Category;
  date: string;
  dateLabel: string;
  time?: string;
  tone: "red" | "orange" | "amber" | "neutral";
  deadlineLabel: string;
  email: Email;
  reminder?: string;
  updated?: {
    previous: string;
    current: string;
    excerpt: string;
  };
};

type PassiveItem = {
  summary: string;
  sender: string;
  received: string;
  email: Email;
};

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
    date: "2026-10-12T23:59",
    dateLabel: "Oct 12",
    tone: "amber",
    deadlineLabel: "Due this week",
    updated: {
      previous: "October 9, 2026",
      current: "October 12, 2026",
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
      subject: "Student research assistant opening — applications due October 19",
      received: "October 8, 2026 at 11:16 a.m.",
      body: [
        "Hello,",
        "The Sociology Department is hiring a part-time student research assistant for our community access study. The role is approximately eight hours per week and will include interview transcription, qualitative coding, and scheduling participant sessions.",
        "To apply, please send a tailored résumé and a 250-word statement describing any relevant qualitative research or community-engagement experience by 5 p.m. on October 19. Previous coding experience is helpful but not required.",
        "Best, Priya",
      ],
    },
  },
];

const waitingEmail: Email = {
  sender: "Maya Patel <maya.patel@northbridge.edu>",
  subject: "Re: Draft for your feedback",
  received: "October 6, 2026 at 4:36 p.m.",
  body: [
    "Hi,",
    "I received your draft and plan to send feedback soon. I should be able to review it in the next couple of days.",
    "Maya",
  ],
};

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
};

function Icon({
  name,
  size = 18,
}: {
  name: "calendar" | "check" | "close" | "more" | "external" | "arrow" | "clock";
  size?: number;
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
  };
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
  );
}

function Modal({
  children,
  onClose,
  title,
  wide = false,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
  wide?: boolean;
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
  );
}

function App() {
  const [activeTab, setActiveTab] = useState<"tasks" | "passive">("tasks");
  const [tasks, setTasks] = useState(tasksSeed);
  const [completed, setCompleted] = useState<string[]>([]);
  const [added, setAdded] = useState<string[]>([]);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [email, setEmail] = useState<Email | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deadlineTask, setDeadlineTask] = useState<Task | null>(null);
  const [dismissed, setDismissed] = useState<Task | null>(null);
  const [calendarFlow, setCalendarFlow] = useState<{
    task: Task;
    stage: "adding" | "added";
  } | null>(null);
  const [calendarTask, setCalendarTask] = useState<Task | null>(null);
  const [waitingReminder, setWaitingReminder] = useState(
    "October 9, 2026 at 9:00 a.m.",
  );
  const [editingWaiting, setEditingWaiting] = useState(false);
  const [categoryFilter, setCategoryFilter] =
    useState<CategoryFilter>("All tasks");

  useEffect(() => {
    if (calendarFlow?.stage !== "adding") return;
    const timer = window.setTimeout(() => {
      setAdded((current) => [...new Set([...current, calendarFlow.task.id])]);
      setCalendarFlow({ task: calendarFlow.task, stage: "added" });
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [calendarFlow]);

  const filteredTasks = useMemo(
    () =>
      [...tasks]
        .filter(
          (task) =>
            categoryFilter === "All tasks" ||
            task.category === categoryFilter,
        )
        .sort((a, b) => a.date.localeCompare(b.date)),
    [categoryFilter, tasks],
  );
  const waitingMatches =
    categoryFilter === "All tasks" ||
    categoryFilter === "Meetings & projects";
  const hasFilteredResults = filteredTasks.length > 0 || waitingMatches;

  const dismissTask = (task: Task) => {
    setTasks((current) => current.filter((item) => item.id !== task.id));
    setDismissed(task);
    setMenuId(null);
  };

  if (calendarTask) {
    return (
      <CalendarScreen
        task={calendarTask}
        onBack={() => setCalendarTask(null)}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <img alt="" src={inboxToTaskLogo} />
          </div>
          <span className="brand-name">InboxToTask</span>
          <span className="demo-badge">Demo data</span>
        </div>
        <div className="date-context">
          <span className="date-dot" />
          Thursday, October 8, 2026
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

        {activeTab === "tasks" ? (
          <div className="content-grid">
            <section className="task-section">
              <div className="section-head">
                <h2>Upcoming</h2>
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
                    added={added.includes(task.id)}
                    completed={completed.includes(task.id)}
                    key={task.id}
                    menuOpen={menuId === task.id}
                    onAdd={() =>
                      setCalendarFlow({ task, stage: "adding" })
                    }
                    onComplete={() =>
                      setCompleted((current) =>
                        current.includes(task.id)
                          ? current.filter((id) => id !== task.id)
                          : [...current, task.id],
                      )
                    }
                    onDeadline={() => setDeadlineTask(task)}
                    onDismiss={() => dismissTask(task)}
                    onEdit={() => {
                      setEditing(task);
                      setMenuId(null);
                    }}
                    onMenu={() =>
                      setMenuId((current) =>
                        current === task.id ? null : task.id,
                      )
                    }
                    onViewEmail={() => setEmail(task.email)}
                    task={task}
                  />
                  ))}
                </div>
              )}

              {waitingMatches && (
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
                  <h3>No tasks in this category</h3>
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
            <button
              className="primary-button"
              onClick={() => setEmail(null)}
            >
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
              current.map((task) =>
                task.id === updated.id ? updated : task,
              ),
            );
            setEditing(null);
          }}
          task={editing}
        />
      )}

      {deadlineTask?.updated && (
        <Modal
          onClose={() => setDeadlineTask(null)}
          title="Deadline updated"
        >
          <div className="deadline-change">
            <div>
              <span>Previous deadline</span>
              <strong>{deadlineTask.updated.previous}</strong>
            </div>
            <div className="change-arrow">→</div>
            <div>
              <span>New deadline</span>
              <strong>{deadlineTask.updated.current}</strong>
            </div>
          </div>
          <div className="excerpt">
            <span>From the latest email</span>
            <blockquote>“{deadlineTask.updated.excerpt}”</blockquote>
          </div>
          <div className="modal-actions">
            <button
              className="secondary-button"
              onClick={() => {
                setEmail(deadlineTask.email);
                setDeadlineTask(null);
              }}
            >
              View original email
            </button>
            <button
              className="primary-button"
              onClick={() => setDeadlineTask(null)}
            >
              Got it
            </button>
          </div>
        </Modal>
      )}

      {editingWaiting && (
        <WaitingModal
          initial={waitingReminder}
          onCancel={() => setEditingWaiting(false)}
          onSave={(value) => {
            setWaitingReminder(value);
            setEditingWaiting(false);
          }}
        />
      )}

      {calendarFlow && (
        <div
          aria-live="polite"
          className="calendar-popup"
          role="status"
        >
          {calendarFlow.stage === "adding" ? (
            <>
              <div className="spinner" />
              <div>
                <strong>Adding task to your calendar…</strong>
                <span>{calendarFlow.task.title}</span>
              </div>
            </>
          ) : (
            <div className="calendar-success">
              <div className="success-icon">
                <Icon name="check" />
              </div>
              <div className="success-copy">
                <strong>Task added to calendar.</strong>
                <span>{calendarFlow.task.title}</span>
              </div>
              <div className="popup-actions">
                <button
                  className="secondary-button"
                  onClick={() => {
                    setCalendarTask(calendarFlow.task);
                    setCalendarFlow(null);
                  }}
                >
                  View in calendar
                </button>
                <button
                  className="primary-button"
                  onClick={() => setCalendarFlow(null)}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {dismissed && (
        <div aria-live="polite" className="undo-toast">
          <span>Suggestion dismissed</span>
          <button
            onClick={() => {
              setTasks((current) => [...current, dismissed]);
              setDismissed(null);
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
    </div>
  );
}

function TaskRow({
  task,
  completed,
  added,
  menuOpen,
  onComplete,
  onViewEmail,
  onAdd,
  onMenu,
  onEdit,
  onDismiss,
  onDeadline,
}: {
  task: Task;
  completed: boolean;
  added: boolean;
  menuOpen: boolean;
  onComplete: () => void;
  onViewEmail: () => void;
  onAdd: () => void;
  onMenu: () => void;
  onEdit: () => void;
  onDismiss: () => void;
  onDeadline: () => void;
}) {
  return (
    <article className={`task-row ${completed ? "is-complete" : ""}`}>
      <button
        aria-label={completed ? `Mark ${task.title} incomplete` : `Complete ${task.title}`}
        aria-pressed={completed}
        className="checkbox"
        onClick={onComplete}
      >
        {completed && <Icon name="check" size={15} />}
      </button>
      <div className="task-main">
        <div className="task-title-line">
          <h3>{task.title}</h3>
          <span className="task-context">{task.context}</span>
          {task.updated && (
            <button className="updated-badge" onClick={onDeadline}>
              Deadline updated
            </button>
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
      <button
        className={`calendar-button ${added ? "added" : ""}`}
        disabled={added}
        onClick={onAdd}
      >
        <Icon name={added ? "check" : "calendar"} size={16} />
        {added ? "Added to calendar" : "Add to calendar"}
      </button>
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
            <button className="danger-action" onClick={onDismiss}>
              Dismiss suggestion
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function EditTaskModal({
  task,
  onSave,
  onCancel,
}: {
  task: Task;
  onSave: (task: Task) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [deadline, setDeadline] = useState(task.date);
  const [reminder, setReminder] = useState(task.reminder ?? "");
  const [category, setCategory] = useState<Category>(task.category);
  return (
    <Modal onClose={onCancel} title="Edit task">
      <div className="form-stack">
        <label>
          <span>Task title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
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
            onChange={(event) =>
              setCategory(event.target.value as Category)
            }
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
  );
}

function WaitingModal({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Modal onClose={onCancel} title="Edit follow-up reminder">
      <div className="form-stack">
        <label>
          <span>Follow up date and time</span>
          <input value={value} onChange={(event) => setValue(event.target.value)} />
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
  );
}

function PassiveCommunication({
  onViewEmail,
}: {
  onViewEmail: (email: Email) => void;
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
  );
}

function CalendarScreen({
  task,
  onBack,
}: {
  task: Task;
  onBack: () => void;
}) {
  const days = [
    ["Mon", "5"],
    ["Tue", "6"],
    ["Wed", "7"],
    ["Thu", "8"],
    ["Fri", "9"],
    ["Sat", "10"],
    ["Sun", "11"],
    ["Mon", "12"],
    ["Tue", "13"],
    ["Wed", "14"],
    ["Thu", "15"],
    ["Fri", "16"],
    ["Sat", "17"],
    ["Sun", "18"],
    ["Mon", "19"],
    ["Tue", "20"],
    ["Wed", "21"],
    ["Thu", "22"],
    ["Fri", "23"],
    ["Sat", "24"],
    ["Sun", "25"],
    ["Mon", "26"],
    ["Tue", "27"],
    ["Wed", "28"],
    ["Thu", "29"],
    ["Fri", "30"],
    ["Sat", "31"],
    ["Sun", "1"],
  ];
  const dueDay = String(Number(task.date.slice(8, 10)));
  return (
    <div className="calendar-shell">
      <header className="calendar-topbar">
        <div className="calendar-brand">
          <div className="calendar-logo">
            <Icon name="calendar" size={21} />
          </div>
          <strong>Calendar</strong>
          <span className="demo-badge">Demo data</span>
        </div>
        <button className="back-button" onClick={onBack}>
          <Icon name="arrow" size={17} />
          Back to InboxToTask
        </button>
      </header>
      <main className="calendar-main">
        <div className="calendar-heading">
          <div>
            <span>2026</span>
            <h1>October</h1>
          </div>
          <div className="calendar-controls">
            <button>Today</button>
            <button aria-label="Previous month">‹</button>
            <button aria-label="Next month">›</button>
          </div>
        </div>
        <div className="month-grid">
          {days.map(([day, date], index) => (
            <div
              className={`calendar-day ${date === "8" ? "today" : ""}`}
              key={`${date}-${index}`}
            >
              <div className="day-number">
                <span>{day}</span>
                <strong>{date}</strong>
              </div>
              {date === dueDay && (
                <div className="calendar-event">
                  <span>Deadline reminder</span>
                  <strong>{task.title}</strong>
                  <small>{task.time ?? "All day"}</small>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default App;
