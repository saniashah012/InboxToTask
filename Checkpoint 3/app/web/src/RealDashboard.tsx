// Sania's designed dashboard, fed by saved records for a signed-in account.
// Backend calls are the ones ManualWorkspace already uses; nothing here is simulated.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import inboxToTaskLogo from "./assets/inbox-to-task-logo.png"
import { Icon, Modal } from "./designedUi"
import { supabase } from "./supabase"
import { googleConnectionStatus, loadStorageSnapshot, reviewStoredRecord, type Deadline, type ScanSettings, type Snapshot, type StoredRow, type TaskFields } from "./storageAdapter"
import { manualScan, manualScanStatus, resolveTaskChange, reviewTaskChange, scanStopMessage, type ScanStatus } from "./manualScanAdapter"
import ManualChangeResolver, { canonical, draftFrom, fieldsFromDraft, type Draft } from "./ManualChangeResolver"
import { loadTaskSourceLinks, OpenInGmail, TaskSourceEmails, type TaskSourceLink } from "./SourceEmails"
import { loadRead, saveRead } from "./InformationTab"
import ExtractionReview from "./ExtractionReview"
import CalendarExport from "./CalendarExportPanel"
import type { GmailState } from "./scanSetup"
import {
  buildDashboardModel, canScan, deadlineDisplay, emptySnapshot, fieldText, localDate, scanPanelState,
  type ChangeItem, type ScanPanelState, type SuggestionItem, type TaskItem, type WaitingItem,
} from "./dashboardModel"
import "./storage.css"
import "./manual-workspace.css"
import "./real-dashboard.css"

type View = "suggestions" | "active" | "completed" | "dismissed"
type SettingsTarget = "sources" | "processing" | "connections" | "retention"
type Failure = { message: string }
type SourceView = { title: string; sender?: string | null; subject?: string | null; sentAt?: string | null; quote: string | null; messageId: string | null; taskId?: string; extraction?: StoredRow; summary?: string }
type Editing = { kind: "suggestion" | "task"; row: StoredRow; fields: TaskFields }

const viewerZone = Intl.DateTimeFormat().resolvedOptions().timeZone
const formatWhen = (value?: string | null) => {
  const parsed = value ? Date.parse(value) : NaN
  return Number.isNaN(parsed) ? null : new Date(parsed).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
}
const initials = (text: string) => text.replace(/<.*>/, "").split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?"

// A success message that stays 8 s, fades for 0.6 s, then closes. Hovering or
// focusing it holds it; leaving restarts the 8 s. Timers, not animation events,
// so it also closes when the page is in a background tab.
function FadeAway({ onDone, className, children, ...rest }: { onDone: () => void; className: string; children: ReactNode; role?: string; "aria-live"?: "polite" }) {
  const [fading, setFading] = useState(false)
  const [held, setHeld] = useState(false)
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    if (held) { setFading(false); return }
    const fade = window.setTimeout(() => setFading(true), 8000)
    const close = window.setTimeout(() => done.current(), 8600)
    return () => { window.clearTimeout(fade); window.clearTimeout(close) }
  }, [held])
  return (
    <div {...rest} className={`${className} rd-fade${fading ? " is-fading" : ""}`}
      onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false) }}>
      {children}
    </div>
  )
}

// Embedded working components keep the workspace's styling, scoped to this wrapper.
const Embedded = ({ children }: { children: ReactNode }) => <div className="storage-page manual-workspace rd-embedded">{children}</div>

export default function RealDashboard({ userId, email, settings, initialNotice, onSignOut, onOpenSettings, onRunSetup, onOpenDevWorkspace }: {
  userId: string
  email: string
  settings: ScanSettings
  initialNotice: string
  onSignOut: () => void
  onOpenSettings: (section: SettingsTarget) => void
  onRunSetup: () => void
  onOpenDevWorkspace?: () => void
}) {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot)
  const [links, setLinks] = useState<TaskSourceLink[] | null>([])
  const [status, setStatus] = useState<ScanStatus | null>(null)
  const [statusFailed, setStatusFailed] = useState(false)
  const [gmail, setGmail] = useState<{ state: GmailState; checking: boolean }>({ state: "unknown", checking: true })
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [notice, setNotice] = useState(initialNotice)
  const [activeTab, setActiveTab] = useState<"tasks" | "passive">("tasks")
  const [view, setView] = useState<View>("suggestions")
  const [menuId, setMenuId] = useState<string | null>(null)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [source, setSource] = useState<SourceView | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [changeId, setChangeId] = useState<string | null>(null)
  const [exportTask, setExportTask] = useState<TaskItem | null>(null)
  const [reminderFor, setReminderFor] = useState<StoredRow | null>(null)
  const [toast, setToast] = useState<{ kind: "dismissed" | "completed"; id: string } | null>(null)
  const [activityOpen, setActivityOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  // epoch changes when this account's dashboard unmounts; sequence orders reloads.
  const epoch = useRef(0), sequence = useRef(0)

  const reload = useCallback(async () => {
    const current = epoch.current, request = ++sequence.current
    const fresh = () => current === epoch.current && request === sequence.current
    const [records, progress, connection] = await Promise.allSettled([
      loadStorageSnapshot(supabase), manualScanStatus(), googleConnectionStatus(),
    ])
    // A failed link lookup must not hide saved tasks, so it has its own visible state.
    const nextLinks = records.status === "fulfilled"
      ? await loadTaskSourceLinks(records.value.tasks.map((t) => t.id)).catch(() => null)
      : null
    if (!fresh()) return
    if (records.status === "fulfilled") { setSnapshot(records.value); setLinks(nextLinks); setLoadFailed(false) }
    else setLoadFailed(true)
    if (progress.status === "fulfilled") { setStatus(progress.value); setStatusFailed(false) } else setStatusFailed(true)
    setGmail({ state: connection.status === "fulfilled" ? connection.value.state : "unknown", checking: false })
    setLoading(false)
  }, [])

  useEffect(() => {
    void reload()
    return () => { epoch.current++; sequence.current++ }
  }, [reload, userId])

  const cooldownEnd = status?.cooldownUntil ? Date.parse(status.cooldownUntil) : 0
  const cooldownLeft = Math.max(0, Math.ceil((cooldownEnd - now) / 1000))
  useEffect(() => {
    setNow(Date.now())
    if (cooldownEnd <= Date.now()) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [cooldownEnd])
  useEffect(() => {
    if (!scanning && !status?.running) return
    const current = epoch.current
    const timer = window.setInterval(() => {
      manualScanStatus().then((next) => { if (current === epoch.current) setStatus(next) }).catch(() => {})
    }, 3000)
    return () => window.clearInterval(timer)
  }, [scanning, status?.running])

  // Messages appear only after the backend confirms the save. Every outcome reloads saved state.
  async function perform(operation: () => Promise<unknown>, message: string, after?: () => void) {
    const current = epoch.current
    setBusy(true); setFailure(null); setNotice(""); setMenuId(null)
    try {
      await operation()
      if (current !== epoch.current) return false
      setNotice(message); after?.()
      await reload()
      return true
    } catch (err) {
      if (current === epoch.current) { setFailure({ message: (err as Error).message }); await reload() }
      return false
    } finally {
      // Unconditional: the dashboard is keyed by account, so a previous account's
      // instance is unmounted and this is a no-op there.
      setBusy(false)
    }
  }

  async function scan(mode: "initial" | "more") {
    setScanning(true)
    try {
      await perform(async () => {
        const result = await manualScan(mode)
        if (result.executionMode !== "GMAIL_PERSISTENT_MANUAL") throw new Error("The backend is in retrieval-only mode. No suggestions were extracted or saved.")
        if (result.error) throw new Error(`${scanStopMessage(result.error)} Saved results remain available.`)
      }, "This check finished. New suggestions, if any, are under Suggestions.")
    } finally { setScanning(false) }
  }

  const model = useMemo(() => buildDashboardModel(snapshot, links), [snapshot, links])
  const today = localDate(new Date(now))
  const reviewCount = model.suggestions.length + model.changes.length + model.unresolvedChanges.length
  const counts: Record<View, number> = { suggestions: reviewCount, active: model.active.length, completed: model.closed.length, dismissed: model.dismissed.length }
  const pendingUpdates = model.active.filter((t) => t.pendingChanges > 0).length
  const openWaiting = model.waiting.filter((w) => !w.row.resolved).length
  const openTasks = model.active.filter((t) => t.row.status === "approved")
  const change = changeId ? [...model.changes].find((c) => c.row.id === changeId) ?? null : null

  const sourceForSuggestion = (s: SuggestionItem | ChangeItem | WaitingItem, title: string): SourceView => ({
    title, sender: s.source?.sender, subject: s.source?.subject, sentAt: s.source?.sent_at, quote: s.quote, messageId: s.messageId, extraction: s.extraction,
  })
  const sourceForTask = (t: TaskItem): SourceView => ({
    title: t.fields.action, sender: t.primary?.sender, subject: t.primary?.subject, sentAt: t.primary?.sentAt,
    quote: null, messageId: t.primary?.messageId ?? null, taskId: t.row.id,
  })

  const blockers = {
    sources: settings.rules.allow.senders.length + settings.rules.allow.domains.length === 0,
    consent: !settings.consent,
    paused: settings.paused,
    gmail: !gmail.checking && gmail.state !== "connected",
  }
  const panelState: ScanPanelState = gmail.checking && !status ? "loading" : scanPanelState({ status, loadError: statusFailed, scanning, cooldownLeft, blockers })
  const needsReconnect = status?.result?.error === "GMAIL_RECONNECT_REQUIRED" || gmail.state === "reconnect_required"

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><img alt="" src={inboxToTaskLogo} /></div>
          <span className="brand-name">InboxToTask</span>
        </div>
        <div className="topbar-actions">
          <div className="date-context">
            <span className="date-dot" />
            {new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(now))}
          </div>
          <span className="demo-mode-badge">Signed in</span>
          <div className="account-menu-wrap">
            <button aria-expanded={accountMenuOpen} aria-label="Open account menu" className="account-avatar" onClick={() => setAccountMenuOpen((c) => !c)}>
              {email.split("@")[0].slice(0, 2).toUpperCase()}
            </button>
            {accountMenuOpen && (
              <div className="account-menu">
                <div><strong>{email}</strong></div>
                <button onClick={() => { setAccountMenuOpen(false); onOpenSettings("sources") }}>Settings</button>
                <button onClick={() => { setAccountMenuOpen(false); onRunSetup() }}>Run setup again</button>
                {onOpenDevWorkspace && <button onClick={() => { setAccountMenuOpen(false); onOpenDevWorkspace() }}>Developer workspace</button>}
                <button onClick={onSignOut}>Sign out</button>
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
              {activeTab === "tasks" ? "Action items from permitted emails. Nothing becomes a task until you add it." : "Summaries of permitted emails that don’t need action."}
            </p>
          </div>
          {activeTab === "tasks" && <div className="task-count"><strong>{loading ? "–" : model.active.length}</strong><span>Open tasks</span></div>}
        </div>

        <nav aria-label="Inbox categories" className="tabs">
          <button aria-selected={activeTab === "tasks"} className={activeTab === "tasks" ? "tab active" : "tab"} onClick={() => setActiveTab("tasks")} role="tab">
            Tasks<span className="tab-count">{reviewCount + model.active.length}</span>
          </button>
          <button aria-selected={activeTab === "passive"} className={activeTab === "passive" ? "tab active" : "tab"} onClick={() => setActiveTab("passive")} role="tab">
            Passive communication<span className="tab-count">{model.information.length}</span>
          </button>
        </nav>

        <RealScanStatus
          state={panelState} status={status} cooldownLeft={cooldownLeft} busy={busy} scanning={scanning}
          settings={settings} gmail={gmail.state} needsReconnect={needsReconnect} activityOpen={activityOpen}
          onToggleActivity={() => setActivityOpen((c) => !c)}
          onScan={(mode) => void scan(mode)}
          onSettings={() => onOpenSettings(panelState === "missing-sources" ? "sources" : panelState === "paused" ? "processing" : "connections")}
        />

        {failure && (
          <div className="notice warning rd-notice" role="alert">
            <span>{failure.message}</span>
            <button className="text-link" disabled={busy} onClick={() => { setFailure(null); void reload() }}>Reload saved results</button>
          </div>
        )}
        {loadFailed && (
          <div className="notice warning rd-notice" role="alert">
            <span>{snapshot.tasks.length ? "Could not refresh saved results. Showing what was last loaded." : "Could not load your saved results. Nothing was changed."}</span>
            <button className="text-link" disabled={busy} onClick={() => { setLoading(true); void reload() }}>Retry</button>
          </div>
        )}
        {links === null && !loadFailed && <div className="notice warning rd-notice" role="status"><span>Source emails could not be loaded. Tasks are shown without them.</span></div>}

        {activeTab === "tasks" ? (
          <div className="content-grid">
            <section className="task-section">
              <div className="review-tabs" role="tablist" aria-label="Task review status">
                {(["suggestions", "active", "completed", "dismissed"] as const).map((v) => (
                  <button aria-selected={view === v} className={view === v ? "review-tab active" : "review-tab"} key={v} onClick={() => { setView(v); setMenuId(null) }} role="tab">
                    {v[0].toUpperCase() + v.slice(1)}<span>{counts[v]}</span>
                    {v === "active" && pendingUpdates > 0 && <span className="pending-update-count">{pendingUpdates} update</span>}
                  </button>
                ))}
              </div>
              <div className="section-head">
                <h2>{view === "suggestions" ? "Needs your review" : view === "active" ? "Upcoming" : view === "completed" ? "Completed and cancelled" : "Dismissed suggestions"}</h2>
                <span className="rd-sort-note">{view === "active" || view === "suggestions" ? "Sorted by deadline" : "Newest first"}</span>
              </div>

              {loading ? (
                <div className="empty-state" role="status"><span className="spinner" aria-hidden="true" /><h3>Loading your saved tasks…</h3></div>
              ) : loadFailed && !snapshot.tasks.length && !snapshot.suggestions.length ? null : (
                <>
                  {view === "suggestions" && <>
                    {model.suggestions.length > 0 && <div className="task-list">{model.suggestions.map((s) => (
                      <RealTaskRow key={s.row.id} kind="suggestion" fields={s.fields} today={today} busy={busy}
                        context={s.source?.sender ?? "Source unavailable"} menuOpen={menuId === s.row.id}
                        badges={<>{s.sibling && <span className="task-context">{s.sibling.index} of {s.sibling.of} from this email</span>}{s.edited && <span className="updated-badge">Edited by you</span>}{s.extraction?.needs_review && <span className="provisional-badge">Needs verification</span>}{!s.quote && <span className="updated-badge">Evidence expired</span>}</>}
                        onMenu={() => setMenuId((c) => (c === s.row.id ? null : s.row.id))}
                        onSource={() => setSource(sourceForSuggestion(s, s.fields.action))}
                        primary={<button className="primary-button row-button" disabled={busy || !s.quote} title={s.quote ? undefined : "The supporting excerpt expired, so this suggestion can only be dismissed."}
                          onClick={() => void perform(() => reviewStoredRecord("suggestion", s.row.id, "approve", s.row.revision), "Task added. No Calendar event was created.")}>Add task</button>}
                        menu={<><button onClick={() => { setMenuId(null); setEditing({ kind: "suggestion", row: s.row, fields: s.fields }) }}>Edit before adding</button>
                          <button className="danger-action" onClick={() => void perform(() => reviewStoredRecord("suggestion", s.row.id, "dismiss", s.row.revision), "Suggestion dismissed.", () => { setNotice(""); setToast({ kind: "dismissed", id: s.row.id }) })}>Dismiss suggestion</button></>}
                      />))}</div>}
                    {model.changes.length > 0 && <>
                      <h3 className="rd-subhead">Proposed changes to your tasks</h3>
                      <div className="task-list">{model.changes.map((c) => (
                        <article className="task-row is-suggestion" key={c.row.id}>
                          <div className="task-main">
                            <div className="task-title-line">
                              <h3>{c.row.kind === "cancel" ? "Proposed cancellation" : "Proposed edit"}: {c.target?.accepted_fields?.action ?? c.row.baseline?.action ?? "Task"}</h3>
                              <span className="updated-badge">{c.row.kind === "cancel" ? "Cancellation detected" : `${c.row.changed_fields?.length ?? 0} field${c.row.changed_fields?.length === 1 ? "" : "s"} changed`}</span>
                              {c.stale && <span className="provisional-badge">Task changed since</span>}
                              {!c.open && <span className="provisional-badge">Task no longer open</span>}
                            </div>
                            <p className="task-caption">{c.row.reason}</p>
                          </div>
                          <button className="email-link" onClick={() => setSource(sourceForSuggestion(c, "Proposed change"))}>View source email</button>
                          <button className="primary-button row-button" onClick={() => setChangeId(c.row.id)}>Review change</button>
                        </article>))}</div>
                    </>}
                    {model.unresolvedChanges.length > 0 && <>
                      <h3 className="rd-subhead">Changes that need you to choose the task</h3>
                      <Embedded>{model.unresolvedChanges.map((c) => (
                        <ManualChangeResolver key={`${c.row.id}-${c.row.revision}`} change={c.row} source={c.source} quote={c.quote} tasks={openTasks.map((t) => t.row)} email={email} busy={busy}
                          onResolve={(taskId, taskRevision, fields) => void perform(() => resolveTaskChange(c.row.id, c.row.revision, taskId, taskRevision, fields), fields ? "Your values were saved to the task. No Calendar write was authorized." : "The task was marked cancelled. No Calendar write was authorized.")}
                          onDismiss={() => void perform(() => reviewTaskChange(c.row.id, c.row.revision, "dismiss"), "Item dismissed.")} />))}</Embedded>
                    </>}
                    {!reviewCount && <EmptyState title="Nothing waiting for review" detail={status?.lastSuccessful ? "New suggestions from a manual check appear here." : "Run a manual check once Gmail is connected and sources are permitted."} />}
                  </>}

                  {view === "active" && <>
                    {model.active.length > 0 && <div className="task-list">{model.active.map((t) => (
                      <RealTaskRow key={t.row.id} kind="active" fields={t.fields} today={today} busy={busy}
                        context={t.primary?.sender ?? ""} menuOpen={menuId === t.row.id}
                        badges={t.pendingChanges > 0 ? <><span className="updated-badge">Change proposed</span><button className="review-change-link" onClick={() => setChangeId(model.changes.find((c) => c.row.target_task_id === t.row.id)?.row.id ?? null)}>Review change</button></> : null}
                        onComplete={() => void perform(() => reviewStoredRecord("task", t.row.id, "complete", t.row.revision), "Task completed.", () => { setNotice(""); setToast({ kind: "completed", id: t.row.id }) })}
                        onMenu={() => setMenuId((c) => (c === t.row.id ? null : t.row.id))}
                        onSource={() => setSource(sourceForTask(t))}
                        primary={<button className="calendar-button" disabled={busy} onClick={() => setExportTask(t)}><Icon name="calendar" size={16} />Export calendar file</button>}
                        menu={<button onClick={() => { setMenuId(null); setEditing({ kind: "task", row: t.row, fields: t.fields }) }}>Edit task</button>}
                      />))}</div>}
                    <WaitingSection items={model.waiting} openCount={openWaiting} busy={busy} today={today}
                      onSource={(w) => setSource(sourceForSuggestion(w, w.row.action))}
                      onToggle={(w) => void perform(() => reviewStoredRecord("waiting", w.row.id, w.row.resolved ? "reopen" : "resolve", w.row.revision), w.row.resolved ? "Marked as still waiting." : "Marked resolved. Its dashboard reminder was cleared.")}
                      onReminder={setReminderFor} />
                    {!model.active.length && !model.waiting.length && <EmptyState title="No open tasks" detail="Tasks you add from Suggestions appear here." />}
                  </>}

                  {view === "completed" && <>
                    {model.closed.length > 0 && <div className="task-list">{model.closed.map((t) => (
                      <RealTaskRow key={t.row.id} kind={t.cancelled ? "cancelled" : "completed"} fields={t.fields} today={today} busy={busy}
                        context={t.primary?.sender ?? ""} menuOpen={false}
                        onComplete={t.cancelled ? undefined : () => void perform(() => reviewStoredRecord("task", t.row.id, "undo", t.row.revision), "Completion undone. The task is open again.")}
                        onSource={() => setSource(sourceForTask(t))}
                        primary={<span className="deletion-date">{t.cancelled ? "Cancelled" : t.row.delete_after ? `Removed after ${formatWhen(t.row.delete_after)}` : "Completed"}</span>}
                      />))}</div>}
                    {!model.closed.length && <EmptyState title="No completed tasks" detail="Completed tasks are kept for 30 days, then removed." />}
                  </>}

                  {view === "dismissed" && <>
                    {model.dismissed.length > 0 && <div className="task-list">{model.dismissed.map((s) => (
                      <RealTaskRow key={s.row.id} kind="dismissed" fields={s.fields} today={today} busy={busy}
                        context={s.source?.sender ?? ""} menuOpen={false}
                        onSource={() => setSource(sourceForSuggestion(s, s.fields.action))}
                        primary={<button className="secondary-button row-button" disabled={busy} onClick={() => void perform(() => reviewStoredRecord("suggestion", s.row.id, "restore", s.row.revision), "Suggestion restored to Suggestions.")}>Restore</button>}
                      />))}</div>}
                    {!model.dismissed.length && <EmptyState title="No dismissed suggestions" detail="Dismissed suggestions can be restored until they expire after 30 days." />}
                  </>}
                </>
              )}
            </section>
          </div>
        ) : (
          loading ? <div className="empty-state" role="status"><span className="spinner" aria-hidden="true" /><h3>Loading summaries…</h3></div>
            : model.information.length ? <PassiveSection key={`info-${userId}`} userId={userId} items={model.information} sources={snapshot.sources} evidence={snapshot.evidence} onSource={setSource} />
              : <EmptyState title="No informational summaries" detail="Summaries of permitted emails that don’t need action appear here after a manual check." />
        )}
      </main>

      {source && <SourceModal source={source} email={email} links={links} onClose={() => setSource(null)} />}
      {editing && <EditFieldsModal editing={editing} busy={busy} onCancel={() => setEditing(null)}
        onSave={(fields) => void perform(() => reviewStoredRecord(editing.kind, editing.row.id, "edit", editing.row.revision, fields),
          editing.kind === "suggestion" ? "Your edits were saved. The suggestion still needs you to add it." : "Task updated. No Calendar write was authorized.", () => setEditing(null))} />}
      {change && <ChangeModal item={change} email={email} busy={busy} onClose={() => setChangeId(null)}
        onApprove={() => void perform(() => reviewTaskChange(change.row.id, change.row.revision, "approve"), "Task change approved. No Calendar write was authorized.", () => setChangeId(null))}
        onDismiss={() => void perform(() => reviewTaskChange(change.row.id, change.row.revision, "dismiss"), "Proposal dismissed. The task is unchanged.", () => setChangeId(null))}
        onRebase={() => change.target && void perform(() => reviewTaskChange(change.row.id, change.row.revision, "rebase", change.target!.revision), "Proposal refreshed against the current task. Review the new comparison before approving.")} />}
      {exportTask && (
        <Modal onClose={() => setExportTask(null)} title="Export calendar file" wide>
          <p className="calendar-separation-note">Google Calendar is not connected (planned for a later release). This downloads a file you import yourself; nothing is written to any calendar.</p>
          <Embedded><CalendarExport key={`${exportTask.row.id}-${exportTask.row.revision}`} task={exportTask.row} fields={exportTask.fields} close={() => setExportTask(null)}
            onDownloaded={() => { setExportTask(null); setNotice("Calendar file download started. Import it into your chosen calendar.") }} /></Embedded>
        </Modal>
      )}
      {reminderFor && <ReminderModal followup={reminderFor} busy={busy} onCancel={() => setReminderFor(null)}
        onSave={(iso) => void perform(() => reviewStoredRecord("followup", reminderFor.id, "remind", reminderFor.revision, { reminderAt: iso }), "Dashboard reminder saved. No email or notification is sent.", () => setReminderFor(null))} />}

      {/* Success messages float at the bottom like the Undo pop-up, so the page never shifts. */}
      {notice && !toast && !failure && (
        <FadeAway key={notice} aria-live="polite" className="undo-toast rd-toast-message" onDone={() => setNotice("")}>
          <span>{notice}</span>
          <button aria-label="Dismiss message" className="toast-close" onClick={() => setNotice("")}><Icon name="close" size={16} /></button>
        </FadeAway>
      )}
      {toast && (() => {
        const dismissedRow = toast.kind === "dismissed" ? model.dismissed.find((s) => s.row.id === toast.id)?.row : undefined
        const completedRow = toast.kind === "completed" ? model.closed.find((t) => t.row.id === toast.id)?.row : undefined
        const row = dismissedRow ?? completedRow
        return (
          <FadeAway aria-live="polite" className="undo-toast" key={`${toast.kind}-${toast.id}`} onDone={() => setToast(null)}>
            <span>{toast.kind === "dismissed" ? "Suggestion dismissed" : "Task completed"}</span>
            {row && <button disabled={busy} onClick={() => {
              setToast(null)
              void (toast.kind === "dismissed"
                ? perform(() => reviewStoredRecord("suggestion", row.id, "restore", row.revision), "Suggestion restored.")
                : perform(() => reviewStoredRecord("task", row.id, "undo", row.revision), "Completion undone."))
            }}>Undo</button>}
            <button aria-label="Close" className="toast-close" onClick={() => setToast(null)}><Icon name="close" size={16} /></button>
          </FadeAway>
        )
      })()}
    </div>
  )
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><div className="empty-state-mark"><Icon name="check" /></div><h3>{title}</h3><p>{detail}</p></div>
}

function RealTaskRow({ kind, fields, today, busy, context, badges, menuOpen, onMenu, onSource, onComplete, primary, menu }: {
  kind: "suggestion" | "active" | "completed" | "cancelled" | "dismissed"
  fields: TaskFields
  today: string
  busy: boolean
  context: string
  badges?: ReactNode
  menuOpen: boolean
  onMenu?: () => void
  onSource: () => void
  onComplete?: () => void
  primary: ReactNode
  menu?: ReactNode
}) {
  const due = deadlineDisplay(fields.deadline, today, viewerZone)
  const done = kind === "completed" || kind === "cancelled"
  const caption = [fields.condition && `Condition: ${fields.condition}`, ...fields.requirements].filter(Boolean).join(" · ")
  return (
    <article className={`task-row ${done ? "is-complete" : ""} ${kind === "suggestion" || kind === "dismissed" ? "is-suggestion" : ""}`}>
      {(kind === "active" || kind === "completed") && onComplete && (
        <button aria-label={kind === "completed" ? `Undo completion of ${fields.action}` : `Complete ${fields.action}`} aria-pressed={kind === "completed"} className="checkbox" disabled={busy} onClick={onComplete}>
          {kind === "completed" && <Icon name="check" size={15} />}
        </button>
      )}
      <div className="task-main">
        <div className="task-title-line">
          <h3>{fields.action}</h3>
          {context && <span className="task-context">{context}</span>}
          {badges}
        </div>
        {caption && <p className="task-caption">{caption}</p>}
        <div className="task-meta">
          <span className="date">{due.dateLabel}{due.timeLabel && <> · {due.timeLabel}</>}</span>
          {!done && <span className={`deadline ${due.tone}`}><span />{due.status}</span>}
          {fields.deadline?.wording && <span className="rd-wording" title="Timing as stated in the email">“{fields.deadline.wording}”</span>}
        </div>
      </div>
      <button className="email-link" onClick={onSource}>View source email</button>
      {primary}
      {menu && onMenu && (
        <div className="menu-wrap">
          <button aria-expanded={menuOpen} aria-label={`Actions for ${fields.action}`} className="icon-button more-button" disabled={busy} onClick={onMenu}><Icon name="more" /></button>
          {menuOpen && <div className="action-menu">{menu}</div>}
        </div>
      )}
    </article>
  )
}

// Passive communication: informational emails as cards in the Tasks style, with
// Unread/Read tabs. Read marks stay in this browser (same storage as before).
function PassiveSection({ userId, items, sources, evidence, onSource }: {
  userId: string
  items: StoredRow[]
  sources: StoredRow[]
  evidence: StoredRow[]
  onSource: (view: SourceView) => void
}) {
  const [read, setRead] = useState(() => loadRead(userId))
  const [view, setView] = useState<"unread" | "read">("unread")
  const mark = (sourceId: string, isRead: boolean) => {
    const next = new Set(read)
    if (isRead) next.add(sourceId); else next.delete(sourceId)
    setRead(next); saveRead(userId, next)
  }
  const cards = items.map((e) => {
    const src = sources.find((s) => s.id === e.source_id)
    const quote = evidence.find((q) => q.extraction_id === e.id && q.quote)
    return { e, src, quote }
  }).sort((a, b) => Date.parse(b.src?.sent_at ?? b.e.created_at) - Date.parse(a.src?.sent_at ?? a.e.created_at))
  const shown = cards.filter((c) => read.has(c.e.source_id) === (view === "read"))
  const counts = { unread: cards.filter((c) => !read.has(c.e.source_id)).length, read: cards.filter((c) => read.has(c.e.source_id)).length }
  return (
    <section className="task-section">
      <div className="review-tabs" role="tablist" aria-label="Read status">
        {(["unread", "read"] as const).map((v) => (
          <button aria-selected={view === v} className={view === v ? "review-tab active" : "review-tab"} key={v} onClick={() => setView(v)} role="tab">
            {v === "unread" ? "Unread" : "Read"}<span>{counts[v]}</span>
          </button>
        ))}
      </div>
      <p className="rd-sort-note">Newest first · read marks are remembered in this browser</p>
      {shown.length > 0 ? <div className="task-list">{shown.map(({ e, src, quote }) => {
        const isRead = read.has(e.source_id)
        const title = src?.subject || "(no subject)"
        return (
          <article className={`task-row rd-info-row${isRead ? " rd-is-read" : ""}`} key={e.id}>
            <div className="task-main">
              <div className="task-title-line">
                <h3>{title}</h3>
                {src?.sender && <span className="task-context">{src.sender}</span>}
                {e.needs_review && <span className="rd-chip">Needs verification</span>}
              </div>
              <p className="task-caption rd-info-summary">{e.summary}</p>
              {src?.sent_at && <div className="task-meta"><span className="date">Received {friendlyTime(src.sent_at)}</span></div>}
            </div>
            <button className="email-link" onClick={() => {
              onSource({ title, sender: src?.sender, subject: src?.subject, sentAt: src?.sent_at, quote: quote?.quote ?? null, messageId: quote?.message_id ?? src?.message_id ?? null, extraction: e, summary: e.summary })
              if (!isRead) mark(e.source_id, true)
            }}>View source email</button>
            <button className="secondary-button row-button" onClick={() => mark(e.source_id, !isRead)}>{isRead ? "Mark as unread" : "Mark as read"}</button>
          </article>
        )
      })}</div> : <EmptyState title={view === "unread" ? "No unread summaries" : "No read summaries"} detail={view === "unread" ? "You’re caught up. Summaries you open or mark as read move to Read." : "Summaries you open or mark as read appear here."} />}
    </section>
  )
}

// "today at 2:57 PM", "yesterday at 9:10 AM", or "Nov 6 at 4:00 PM".
function friendlyTime(iso: string, now = new Date()): string {
  const when = new Date(iso)
  if (Number.isNaN(when.getTime())) return "unknown"
  const clock = when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diff = Math.round((day(now) - day(when)) / 86_400_000)
  if (diff === 0) return `today at ${clock}`
  if (diff === 1) return `yesterday at ${clock}`
  const date = when.toLocaleDateString("en-US", { month: "short", day: "numeric", year: when.getFullYear() === now.getFullYear() ? undefined : "numeric" })
  return `${date} at ${clock}`
}

const stateCopy = (state: ScanPanelState, settings: ScanSettings, gmail: GmailState, status: ScanStatus | null, cooldownLeft: number): [string, string] => {
  switch (state) {
    case "loading": return ["Loading scan status…", "Checking saved settings and the Gmail connection."]
    case "processing": return ["Checking permitted Gmail…", "Counts update when the batch finishes. You can keep reviewing."]
    case "missing-sources": return ["No sources permitted", "Add an exact sender or domain in Settings. Topics never grant access, so nothing is processed."]
    case "paused": return settings.consent ? ["Scanning paused", "Resume in Settings to run a manual check."] : ["Scanning consent needed", "Give scanning consent in Settings before a manual check."]
    case "disconnected": return gmail === "reconnect_required" ? ["Reconnect Gmail", "Gmail access is no longer valid. Reconnect in Settings → Connections."] : gmail === "unknown" ? ["Gmail status unavailable", "Could not confirm the Gmail connection. Reload, or check Settings → Connections."] : ["Gmail not connected", "Connect Gmail in Settings → Connections. No mailbox was accessed."]
    case "cooldown": return ["Cooling down", `You can check again in ${cooldownLeft} s.`]
    case "failed": return status?.result?.error ? ["Last check stopped", `${scanStopMessage(status.result.error)} Saved results remain available.`] : ["Scan status unavailable", "Could not load scan status. Saved tasks below are unaffected."]
    case "empty": return ["Ready for your first scan", ""]
    default: return ["Ready to scan", ""]
  }
}

function RealScanStatus({ state, status, cooldownLeft, busy, scanning, settings, gmail, needsReconnect, activityOpen, onToggleActivity, onScan, onSettings }: {
  state: ScanPanelState
  status: ScanStatus | null
  cooldownLeft: number
  busy: boolean
  scanning: boolean
  settings: ScanSettings
  gmail: GmailState
  needsReconnect: boolean
  activityOpen: boolean
  onToggleActivity: () => void
  onScan: (mode: "initial" | "more") => void
  onSettings: () => void
}) {
  // One button: it continues unfinished work when an earlier check left some,
  // otherwise it starts a new 7-day check. A reconnect always starts fresh.
  const resume = Boolean(status?.backlog) && !needsReconnect
  const [title, detail] = stateCopy(state, settings, gmail, status, cooldownLeft)
  const counts = status?.result?.counts
  const allowed = canScan(state) && !busy && !scanning && !status?.running
  const blocked = state === "missing-sources" || state === "paused" || state === "disconnected"
  return (
    <section aria-label="Processing status" className={`processing-status state-${state}`}>
      <div className="processing-status-copy">
        {state === "processing" ? <span className="manual-spinner" aria-hidden="true" />
          : state === "cooldown" ? <span className="manual-cooldown" aria-hidden="true" style={{ "--cooldown-progress": `${Math.min(100, (cooldownLeft / 60) * 100)}%` } as CSSProperties}><span>{cooldownLeft}</span></span>
            : <span className="status-pulse" />}
        <div role="status">
          <strong>{title}</strong>
          {detail && <span id="rd-scan-why">{detail}</span>}
          <span className="scan-last-checked">
            {status?.lastSuccessful ? `Last scan ${friendlyTime(status.lastSuccessful)}` : "No scans yet"}
            {resume ? " · more email to process" : " · covers the past 7 days"}
          </span>
        </div>
      </div>
      <div className="processing-status-actions">
        {blocked && <button className="text-link" onClick={onSettings}>Open Settings</button>}
        <button
          aria-describedby={allowed ? undefined : "rd-scan-why"}
          className="primary-button rd-scan-button"
          disabled={!allowed}
          onClick={() => onScan(resume ? "more" : "initial")}
          title={allowed ? (resume ? "Continue where the last check stopped" : "Check permitted Gmail from the past 7 days") : title}
        >
          <Icon name="refresh" size={16} />
          {scanning || status?.running ? "Scanning…" : "Scan now"}
        </button>
        <button aria-expanded={activityOpen} className="text-link" onClick={onToggleActivity}>{activityOpen ? "Hide activity" : "View activity"}</button>
      </div>
      {activityOpen && (
        <div className="scan-activity">
          {counts ? <>
            <strong>Last batch</strong>
            <span>{counts.candidates ?? 0} candidates · {counts.permitted ?? 0} permitted · {counts.blocked ?? 0} excluded by your rules · {counts.prepared ?? 0} processed · {counts.reused ?? 0} reused without a model call · {counts.failed ?? 0} could not be processed · {counts.modelCalls ?? 0} model calls</span>
            {(counts.failed ?? 0) > 0 && <span>{(status?.result?.unresolved ?? 0) > 0 ? `${status?.result?.unresolved} messages stopped after repeated attempts; a new 7-day check tries them again. ` : ""}Other failed messages are retried by the next scan.</span>}
          </> : <><strong>No batch recorded</strong><span>Activity appears after your first manual check.</span></>}
          <span>Scans run only when you press Scan now; automatic scanning is not enabled. Each scan covers the past 7 days, inspects up to 100 permitted messages and makes up to two model calls, within daily limits.</span>
        </div>
      )}
    </section>
  )
}

function WaitingSection({ items, openCount, busy, today, onSource, onToggle, onReminder }: {
  items: WaitingItem[]
  openCount: number
  busy: boolean
  today: string
  onSource: (item: WaitingItem) => void
  onToggle: (item: WaitingItem) => void
  onReminder: (followup: StoredRow) => void
}) {
  if (!items.length) return null
  return (
    <div className="waiting-section">
      <div className="section-head waiting-head">
        <div><span className="waiting-label">Waiting for</span><h2>Pending replies</h2></div>
        <span>{openCount} open</span>
      </div>
      {items.map((w) => {
        const promised = w.row.promised_deadline as Deadline | null
        const due = promised ? deadlineDisplay(promised, today, viewerZone) : null
        const followup = w.followups[0]
        const owner = String(w.row.external_owner ?? "Someone else")
        return (
          <div className={`waiting-row${w.row.resolved ? " rd-resolved" : ""}`} key={w.row.id}>
            <div className="waiting-avatar">{initials(owner)}</div>
            <div className="waiting-copy">
              <h3>{w.row.action}{w.row.resolved && " · Resolved"}</h3>
              <div className="waiting-meta">
                <span>{owner}</span>
                {due && <span>Promised {due.dateLabel}{due.timeLabel && due.timeLabel !== "Date only" ? ` · ${due.timeLabel}` : ""}</span>}
                {!w.row.resolved && followup?.confirmed_reminder_at && <span><Icon name="clock" size={15} />Follow up {formatWhen(followup.confirmed_reminder_at)}</span>}
                {!w.row.resolved && followup && <span>Suggested: {followup.action}</span>}
                <button className="text-link" onClick={() => onSource(w)}>View source email</button>
              </div>
            </div>
            <div className="rd-waiting-actions">
              {!w.row.resolved && followup && <button className="secondary-button" disabled={busy} onClick={() => onReminder(followup)}>{followup.confirmed_reminder_at ? "Edit reminder" : "Set reminder"}</button>}
              <button className="secondary-button" disabled={busy} onClick={() => onToggle(w)}>{w.row.resolved ? "Reopen" : "Mark resolved"}</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SourceModal({ source, email, links, onClose }: { source: SourceView; email: string; links: TaskSourceLink[] | null; onClose: () => void }) {
  const own = source.taskId ? (links ? links.filter((l) => l.taskId === source.taskId) : null) : undefined
  return (
    <Modal className="rd-source-modal" onClose={onClose} title="Source email" wide>
      <div className="email-details">
        <div><span>From</span><strong>{source.sender ?? "Unavailable"}</strong></div>
        <div><span>Subject</span><strong>{source.subject || "(no subject)"}</strong></div>
        <div><span>Received</span><strong>{formatWhen(source.sentAt) ?? "Unavailable"}</strong></div>
      </div>
      {source.summary && (
        <div className="excerpt rd-summary"><span>Executive summary</span><p>{source.summary}</p>
          {source.extraction && <p className="rd-detail-meta">
            Classified as informational ({Number(source.extraction.classification_confidence ?? 0)}% confidence)
            {source.extraction.topic_relevance === "uncertain" ? " · may be outside your selected topics" : ""}
          </p>}
        </div>
      )}
      {own === undefined && <div className="excerpt"><span>Saved excerpt</span><blockquote>{source.quote ? `“${source.quote}”` : "The saved excerpt has expired."}</blockquote></div>}
      <div className="rd-modal-body">
        {source.extraction && <Embedded><ExtractionReview extraction={source.extraction} /></Embedded>}
        {own !== undefined && <Embedded><TaskSourceEmails email={email} links={own} /></Embedded>}
        {own === undefined && <div className="rd-gmail-link"><OpenInGmail email={email} messageId={source.messageId} /></div>}
        <p className="form-hint">InboxToTask keeps only a short excerpt. Gmail opens the whole conversation, which can include messages your rules excluded.</p>
      </div>
      <div className="modal-actions"><button className="primary-button" onClick={onClose}>Close</button></div>
    </Modal>
  )
}

function EditFieldsModal({ editing, busy, onSave, onCancel }: { editing: Editing; busy: boolean; onSave: (fields: TaskFields) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(editing.fields))
  const [error, setError] = useState("")
  const set = (patch: Partial<Draft>) => { setDraft((d) => ({ ...d, ...patch })); setError("") }
  const submit = () => {
    if (!draft.action.trim()) return setError("Enter the task action.")
    const fields = fieldsFromDraft(draft, editing.fields)
    if (canonical(fields) === canonical(editing.fields)) return setError("Change at least one value, or cancel.")
    onSave(fields)
  }
  return (
    <Modal onClose={onCancel} title={editing.kind === "suggestion" ? "Edit suggestion" : "Edit task"}>
      <form className="form-stack" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <label><span>Action</span><input value={draft.action} maxLength={350} disabled={busy} onChange={(e) => set({ action: e.target.value })} /></label>
        <label><span>Deadline date (optional)</span><input type="date" value={draft.date} disabled={busy} onChange={(e) => set({ date: e.target.value })} /></label>
        <label><span>Time (optional; leave empty for date only)</span><input type="time" value={draft.time} disabled={busy || !draft.date} onChange={(e) => set({ time: e.target.value })} /></label>
        <label><span>Timing</span><select value={draft.boundary} disabled={busy || !draft.date} onChange={(e) => set({ boundary: e.target.value as Deadline["boundary"] })}>
          <option value="by">By</option><option value="before">Before</option><option value="on">On</option><option value="unspecified">Unspecified</option></select></label>
        <label><span>Condition (optional)</span><input value={draft.condition} maxLength={350} disabled={busy} onChange={(e) => set({ condition: e.target.value })} /></label>
        <label><span>Requirements (one per line)</span><textarea value={draft.requirements} disabled={busy} onChange={(e) => set({ requirements: e.target.value })} /></label>
        {editing.kind === "suggestion" && <p className="form-hint">The original suggestion is kept. Your edits are saved separately and used when you add the task.</p>}
        {error && <p className="inline-validation" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </form>
    </Modal>
  )
}

function ChangeModal({ item, email, busy, onClose, onApprove, onDismiss, onRebase }: {
  item: ChangeItem; email: string; busy: boolean; onClose: () => void; onApprove: () => void; onDismiss: () => void; onRebase: () => void
}) {
  const c = item.row, current = item.target?.accepted_fields
  return (
    <Modal onClose={onClose} title={c.kind === "cancel" ? "Review proposed cancellation" : "Review proposed edit"} wide>
      <div className="deadline-review-task"><span>Task</span><strong>{current?.action ?? c.baseline?.action ?? "Task unavailable"}</strong></div>
      <p>{c.reason}</p>
      {c.kind === "edit" && (
        <table className="rd-change-table">
          <thead><tr><th scope="col">Field</th><th scope="col">Accepted when proposed</th><th scope="col">Proposed</th></tr></thead>
          <tbody>{(c.changed_fields ?? []).map((field: string) => (
            <tr key={field}><th scope="row">{field}</th><td>{fieldText(field, c.baseline?.[field])}</td><td>{fieldText(field, c.fields?.[field])}</td></tr>
          ))}</tbody>
        </table>
      )}
      {c.kind === "cancel" && <p>If you approve, the task keeps its accepted values and is marked cancelled.</p>}
      {!item.open && <div className="deadline-review-warning"><strong>The task is no longer open</strong><span>This proposal cannot be applied. You can dismiss it.</span></div>}
      {item.stale && current && (
        <div className="deadline-review-warning">
          <strong>The task changed since this proposal</strong>
          <span>Current accepted values: {["action", "deadline", "condition"].map((f) => `${f}: ${fieldText(f, (current as any)[f])}`).join(" · ")}</span>
          <div><button className="secondary-button" disabled={busy} onClick={onRebase}>Compare with current task</button></div>
        </div>
      )}
      <div className="excerpt">
        <span>Source excerpt</span>
        <blockquote>{item.quote ? `“${item.quote}”` : "The saved excerpt has expired, so this proposal cannot be approved."}</blockquote>
        <OpenInGmail email={email} messageId={item.messageId} />
      </div>
      <p className="calendar-separation-note">Approving this change does not create or change any calendar entry.</p>
      <div className="modal-actions">
        <button className="secondary-button" disabled={busy} onClick={onDismiss}>Dismiss proposal</button>
        <button className="primary-button" disabled={busy || !item.open || item.stale || !item.quote} onClick={onApprove}>{c.kind === "cancel" ? "Approve cancellation" : "Approve edit"}</button>
      </div>
    </Modal>
  )
}

function ReminderModal({ followup, busy, onSave, onCancel }: { followup: StoredRow; busy: boolean; onSave: (iso: string) => void; onCancel: () => void }) {
  const initial = followup.confirmed_reminder_at ? (() => {
    const d = new Date(followup.confirmed_reminder_at), pad = (n: number) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  })() : ""
  const [value, setValue] = useState(initial)
  const valid = value && !Number.isNaN(new Date(value).getTime())
  return (
    <Modal onClose={onCancel} title="Follow-up reminder">
      <div className="form-stack">
        <p>{followup.action}{followup.recipient ? ` · ${followup.recipient}` : ""}</p>
        <label><span>Remind me on this dashboard ({viewerZone})</span><input type="datetime-local" value={value} disabled={busy} onChange={(e) => setValue(e.target.value)} /></label>
        <p className="form-hint">The reminder is shown here only. No email or notification is sent.</p>
      </div>
      <div className="modal-actions">
        <button className="secondary-button" onClick={onCancel}>Cancel</button>
        <button className="primary-button" disabled={busy || !valid} onClick={() => onSave(new Date(value).toISOString())}>Save reminder</button>
      </div>
    </Modal>
  )
}
