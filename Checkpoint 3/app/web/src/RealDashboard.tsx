// Sania's designed dashboard, fed by saved records for a signed-in account.
// Backend calls are the ones ManualWorkspace already uses; nothing here is simulated.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react"
import inboxToTaskLogo from "./assets/inbox-to-task-logo.png"
import { Icon, Modal } from "./designedUi"
import { supabase } from "./supabase"
import { googleConnectionStatus, loadStorageSnapshot, reviewStoredRecord, type Deadline, type ScanSettings, type Snapshot, type StoredRow, type TaskFields } from "./storageAdapter"
import { isScanBusy, manualScan, manualScanStatus, ScanRequestError, resolveTaskChange, reviewTaskChange, scanStopMessage, type ScanStatus } from "./manualScanAdapter"
import ManualChangeResolver, { canonical, draftFrom, fieldsFromDraft, type Draft } from "./ManualChangeResolver"
import { gmailConversationUrl, loadTaskSourceLinks, TaskSourceEmails, type TaskSourceLink } from "./SourceEmails"
import { dateChoicesFromNotes, sentDayHint, sentLabel, shortDateLabel } from "./reviewNotes"
import { USER_ENTERED_WORDING } from "./passiveTask"
import { loadRead, rememberPriorRead, restorePriorRead, saveRead } from "./readMarks"
import CreateTaskFromEmail from "./CreateTaskFromEmail"
import { changeKey, countAdded, NOTHING_ADDED, scanSummary, suggestionKey } from "./newItems"
import { useNewItems } from "./useNewItems"
import ExtractionReview from "./ExtractionReview"
import CalendarExport from "./CalendarExportPanel"
import TaskCalendarControl, { calendarEventsEnabled, clearCalendarDraft, pendingCalendarTask } from "./TaskCalendarControl"
import { calendarEventAction, calendarMessage, CalendarError, loadCalendarStatuses, needsCalendarAuthorization, type CalendarEventStatus, type CalendarResult } from "./calendarApi"
import { deadlineLabel, deadlineMoved, draftFrom as calendarDraftFrom, eventSummary, initialDraft, oneClickMove, payloadOf, timeRange, type Draft as CalendarDraft } from "./calendarForm"
import { settingsHaveScanSource, type GmailState } from "./scanSetup"
import {
  autoNextCheck, quietStop, skippedByCategories, TRANSIENT_STOPS, TROUBLE_AFTER, BATCH_LIMIT_STOPS, checkedAgo, checkedNoNewEmail, batchMadeProgress, DAILY_LIMIT_STOP,
  AUTO_CHECK_INTERVAL_MS, buildDashboardModel, canScan, deadlineDisplay, emptySnapshot, fieldText, localDate, scanPanelState,
  type ChangeItem, type ScanPanelState, type SuggestionItem, type TaskItem, type WaitingItem,
} from "./dashboardModel"
import "./storage.css"
import "./manual-workspace.css"
import "./real-dashboard.css"
import "./calendar-cards.css"

type View = "suggestions" | "active" | "completed" | "dismissed"
type SettingsTarget = "sources" | "processing" | "connections" | "retention"
type Failure = { message: string }
// passive: opened from Passive communication, with the email's read state from before
// this opening (View details marks it read), so "Turn into task" can restore it later.
type SourceView = { title: string; sender?: string | null; subject?: string | null; sentAt?: string | null; quote: string | null; messageId: string | null; taskId?: string; extraction?: StoredRow; summary?: string
  passive?: { sourceId: string; wasRead: boolean } }
// adding: the editor was opened by Add task, for a suggestion that needs verification or
// has no deadline. Saving it adds the task; reasons are what the scan asked the user to check.
// context: the suggestion's email as already loaded, so the user can judge it without Gmail.
type EmailContext = { sender: string | null; subject: string | null; sentAt: string | null; quote: string | null; messageId: string | null }
type Editing = { kind: "suggestion" | "task"; row: StoredRow; fields: TaskFields; adding?: boolean; reasons?: string[]; context?: EmailContext }
type Category = "suggestions" | "active" | "completed" | "dismissed"
// A question shown after a task change when the task has a Google Calendar event.
type CalendarFollowUp =
  | { kind: "deadline"; task: TaskItem; deadline: Deadline; draft: CalendarEventStatus["draft"] }
  | { kind: "cancelled"; task: TaskItem }
  | { kind: "delete"; task: TaskItem; from: Category; to: Category; suggestionId: string }
  // Move back to Passive removes the task, so its event is kept or removed first.
  | { kind: "passive"; task: TaskItem }
// Stored states in which the task has an event the user can manage.
const hasCalendarEvent = (status?: CalendarEventStatus) => Boolean(status && ["succeeded", "updating", "removing"].includes(status.state))
// With Calendar events on, the follow-ups say what happens to the event; without, the old ending stays.
const noCalendarWrite = calendarEventsEnabled ? "" : " No Calendar write was authorized."
// A stored event link is used only when it points to Google Calendar.
const googleCalendarUrl = (url?: string | null) => (url && /^https:\/\/(www\.)?google\.com\/calendar\//.test(url) ? url : null)
type NoticeLink = { label: string; url: string; taskId: string }
const eventLink = (url: string | null | undefined, taskId: string): NoticeLink | null => {
  const valid = googleCalendarUrl(url)
  return valid ? { label: "View in Google Calendar", url: valid, taskId } : null
}
// Reads the event from Google; an event that was never added or is already gone counts as removed.
const readEvent = (taskId: string): Promise<CalendarResult> => calendarEventAction({ action: "read", taskId }).then(
  (result) => result,
  (err) => { if (err instanceof CalendarError && err.code === "CALENDAR_NOT_ADDED") return { state: "removed" }; throw err })
// Opens a link in a new tab through a temporary anchor (used when a blank tab could not be opened).
const openInNewTab = (url: string) => {
  const anchor = document.createElement("a")
  anchor.href = url; anchor.target = "_blank"; anchor.rel = "noopener noreferrer"
  document.body.appendChild(anchor); anchor.click(); anchor.remove()
}
const categoryLabel: Record<Category, string> = { suggestions: "Suggestions", active: "Active", completed: "Completed", dismissed: "Dismissed" }

// Moves an item between any two categories using the backend's own steps, so an
// accidental click can be reversed. Suggestions and dismissed items are suggestion
// rows; active and completed items are tasks created from a suggestion.
async function runMove(from: Category, row: StoredRow, to: Category) {
  let rev = Number(row.revision)
  if (from === "suggestions" || from === "dismissed") {
    if (to === "dismissed") return reviewStoredRecord("suggestion", row.id, "dismiss", rev)
    if (from === "dismissed") {
      await reviewStoredRecord("suggestion", row.id, "restore", rev)
      rev += 1
      if (to === "suggestions") return
    }
    const added = await reviewStoredRecord("suggestion", row.id, "approve", rev) as { taskId: string }
    if (to === "completed") await reviewStoredRecord("task", added.taskId, "complete", 0)
    return
  }
  if (to === "completed") return reviewStoredRecord("task", row.id, "complete", rev)
  if (to === "active") return reviewStoredRecord("task", row.id, "undo", rev)
  return reviewStoredRecord("task", row.id, to === "suggestions" ? "return_to_suggestions" : "return_to_dismissed", rev)
}

// Times end in "p.m.", so a sentence built from one must not gain a second period.
const endSentence = (text: string) => (text.endsWith(".") ? text : `${text}.`)
const viewerZone = Intl.DateTimeFormat().resolvedOptions().timeZone
const formatWhen = (value?: string | null) => {
  const parsed = value ? Date.parse(value) : NaN
  return Number.isNaN(parsed) ? null : new Date(parsed).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
}
const initials = (text: string) => text.replace(/<.*>/, "").split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?"

// A success message that stays 4 s, fades for 0.6 s, then closes. Hovering or
// focusing it holds it; leaving restarts the 4 s. Timers, not animation events,
// so it also closes when the page is in a background tab.
function FadeAway({ onDone, className, children, ...rest }: { onDone: () => void; className: string; children: ReactNode; role?: string; "aria-live"?: "polite" }) {
  const [fading, setFading] = useState(false)
  const [held, setHeld] = useState(false)
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    if (held) { setFading(false); return }
    const fade = window.setTimeout(() => setFading(true), 4000)
    const close = window.setTimeout(() => done.current(), 4600)
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
  // Automatic scanning (saved preference). It stops for this page when the user
  // stops it, or after repeated batches that make no progress.
  const [autoHalt, setAutoHalt] = useState<null | "user" | "stalled">(null)
  const stalls = useRef(0)
  // Whether a check has started on this page (the first automatic check runs on
  // opening), and when an automatic check last failed to run (it then waits a
  // full interval instead of retrying at once).
  const checkedThisPage = useRef(false)
  const autoFailedAt = useRef<number | null>(null)
  // Automatic checks in a row that stopped on a passing Gmail or AI-service problem.
  const [quietRetries, setQuietRetries] = useState(0)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [notice, setNoticeText] = useState(initialNotice)
  // An optional link beside the notice; only Calendar confirmations set one.
  const [noticeLink, setNoticeLink] = useState<NoticeLink | null>(null)
  // Counts notices, so a link found after a reload attaches only to the notice it was found for.
  const noticeCount = useRef(0)
  // Replacing or clearing a notice always drops the previous notice's link.
  const setNotice = useCallback((message: string) => { noticeCount.current += 1; setNoticeLink(null); setNoticeText(message) }, [])
  const [activeTab, setActiveTab] = useState<"tasks" | "passive">("tasks")
  const [view, setView] = useState<View>("suggestions")
  const [menuId, setMenuId] = useState<string | null>(null)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [source, setSource] = useState<SourceView | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [changeId, setChangeId] = useState<string | null>(null)
  const [exportTask, setExportTask] = useState<TaskItem | null>(null)
  // Set when the event dialog opens from "Review calendar event" after a deadline change.
  const [exportReview, setExportReview] = useState<Deadline | null>(null)
  // Google Calendar events by task ID. A failed load leaves this empty, so cards show Add to calendar.
  const [calendarStatuses, setCalendarStatuses] = useState<Record<string, CalendarEventStatus>>({})
  const [calendarFollowUp, setCalendarFollowUp] = useState<CalendarFollowUp | null>(null)
  // The task whose Manage event dialog is open; that dialog does its own reads.
  const dialogTaskId = useRef<string | null>(null)
  dialogTaskId.current = exportTask?.row.id ?? null
  // The task whose event was last opened from a link, checked once when this tab is shown again.
  const openedEvent = useRef<string | null>(null)
  // Tasks whose event link is being checked; further clicks on them are ignored until it ends.
  const checkingRef = useRef(new Set<string>())
  const [checkingEvents, setCheckingEvents] = useState<ReadonlySet<string>>(() => new Set())
  // Runs when this tab is shown again (see the visibility and focus handler below).
  const onReturn = useRef<() => void>(() => {})
  const [reminderFor, setReminderFor] = useState<StoredRow | null>(null)
  // "created": a task made from a Passive email (id is the task; revision as saved).
  const [toast, setToast] = useState<{ kind: "dismissed" | "completed" | "moved" | "created"; id: string; from?: Category; to?: Category; note?: string; revision?: number } | null>(null)
  // "Turn into task": the Passive email whose Create task form is open.
  const [creating, setCreating] = useState<SourceView | null>(null)
  // Bumped when a read mark is restored outside the Passive list, so the list rereads them.
  const [readVersion, setReadVersion] = useState(0)
  // The task card "View task" brings into view and outlines for a moment.
  const [jumpTo, setJumpTo] = useState<string | null>(null)
  const [activityOpen, setActivityOpen] = useState(false)
  // With automatic checks on, the status bar starts as one slim line; the choice to
  // expand it is remembered in this browser for this account.
  const panelKey = `inboxtotask:scan-panel-open:${userId}`
  const [panelOpen, setPanelOpen] = useState(() => { try { return window.localStorage.getItem(panelKey) === "1" } catch { return false } })
  const togglePanel = () => setPanelOpen((open) => {
    try { window.localStorage.setItem(panelKey, open ? "0" : "1") } catch { /* storage unavailable: kept for this page only */ }
    return !open
  })
  const [now, setNow] = useState(() => Date.now())
  // epoch changes when this account's dashboard unmounts; sequence orders reloads.
  const epoch = useRef(0), sequence = useRef(0)
  const latestSnapshot = useRef<Snapshot>(snapshot)
  latestSnapshot.current = snapshot
  // What the last reload loaded, readable right after `await reload()` before React re-renders.
  const loadedSnapshot = useRef<Snapshot | null>(null)
  const loadedCalendar = useRef<Record<string, CalendarEventStatus>>({})

  // Calendar statuses are read separately from Google, with no Calendar permission needed.
  // A failure shows no error: the cards then offer Add to calendar.
  const loadCalendar = useCallback(async () => {
    if (!calendarEventsEnabled) return {}
    try { return await loadCalendarStatuses() } catch { return {} }
  }, [])
  const refreshCalendar = useCallback(async () => {
    const current = epoch.current
    const next = await loadCalendar()
    if (current !== epoch.current) return
    loadedCalendar.current = next
    setCalendarStatuses(next)
  }, [loadCalendar])
  // After Add or Save changes: shows the notice, reloads the statuses, then adds the
  // event's link if this notice is still the one shown and the event has a valid link.
  const noticeWithEventLink = async (message: string, taskId: string) => {
    setNotice(message)
    const shown = noticeCount.current, current = epoch.current
    await refreshCalendar()
    if (shown !== noticeCount.current || current !== epoch.current) return
    const status = loadedCalendar.current[taskId]
    const link = hasCalendarEvent(status) ? eventLink(status?.eventUrl, taskId) : null
    if (link) setNoticeLink(link)
  }

  // A click on an event link (card line or toast) checks Google before showing the event,
  // so an event deleted in Google never lands on Google's error page. Modified and
  // middle clicks are left to the browser and open the saved link directly.
  const openEvent = (event: MouseEvent<HTMLAnchorElement>, taskId: string, savedUrl: string) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    if (checkingRef.current.has(taskId)) return
    openedEvent.current = taskId
    // The dialog for this task is open and does its own reads: no check.
    if (dialogTaskId.current === taskId) { openInNewTab(savedUrl); return }
    // Opened inside the click, before any await, so pop-up blockers allow it.
    const tab = window.open("", "_blank")
    if (!tab) { openInNewTab(savedUrl); return }
    try { tab.opener = null } catch { /* the tab is ours and blank; nothing to detach */ }
    void checkOpenedEvent(tab, taskId, savedUrl)
  }
  async function checkOpenedEvent(tab: Window, taskId: string, savedUrl: string) {
    const current = epoch.current
    checkingRef.current.add(taskId); setCheckingEvents(new Set(checkingRef.current))
    try {
      const result = await readEvent(taskId).catch(() => null)
      if (current !== epoch.current) { tab.close(); return }
      if (result?.state === "removed") {
        tab.close(); openedEvent.current = null
        setFailure(null); setNotice("This event was deleted in Google Calendar. You can add it again.")
      } else if (!tab.closed) {
        // Anything else (no permission, Google unreachable, another state) opens the saved link as before.
        tab.location.href = (result?.state === "succeeded" && googleCalendarUrl(result.eventUrl)) || savedUrl
      }
      // The read saved Google's current details, so the cards show them.
      if (result?.state === "succeeded" || result?.state === "removed") void refreshCalendar()
    } finally {
      checkingRef.current.delete(taskId); setCheckingEvents(new Set(checkingRef.current))
    }
  }
  // Back on this tab after opening an event: read that one task once, silently, then reload the statuses.
  onReturn.current = () => {
    const taskId = openedEvent.current
    if (!calendarEventsEnabled || !taskId || checkingRef.current.has(taskId)) return
    openedEvent.current = null
    if (dialogTaskId.current === taskId) return
    const current = epoch.current
    readEvent(taskId).then(() => { if (current === epoch.current) void refreshCalendar() }, () => { /* ignored: the card keeps its saved state */ })
  }

  const reload = useCallback(async () => {
    const current = epoch.current, request = ++sequence.current
    const fresh = () => current === epoch.current && request === sequence.current
    const [records, progress, connection, calendar] = await Promise.allSettled([
      loadStorageSnapshot(supabase), manualScanStatus(), googleConnectionStatus(), loadCalendar(),
    ])
    // A failed link lookup must not hide saved tasks, so it has its own visible state.
    const nextLinks = records.status === "fulfilled"
      ? await loadTaskSourceLinks(records.value.tasks.map((t) => t.id)).catch(() => null)
      : null
    if (!fresh()) return
    if (records.status === "fulfilled") { loadedSnapshot.current = records.value; setSnapshot(records.value); setLinks(nextLinks); setLoadFailed(false) }
    else setLoadFailed(true)
    const statuses = calendar.status === "fulfilled" ? calendar.value : {}
    loadedCalendar.current = statuses
    setCalendarStatuses(statuses)
    if (progress.status === "fulfilled") { setStatus(progress.value); setStatusFailed(false) } else setStatusFailed(true)
    setGmail({ state: connection.status === "fulfilled" ? connection.value.state : "unknown", checking: false })
    setLoading(false)
  }, [loadCalendar])

  useEffect(() => {
    void reload()
    return () => { epoch.current++; sequence.current++ }
  }, [reload, userId])

  // Several open tabs: only the tab holding a browser lock runs automatic checks (if
  // it closes, another takes over), every tab reloads when another reports a change,
  // and a tab refreshes when you come back to it.
  const channel = useRef<BroadcastChannel | null>(null)
  const [autoLeader, setAutoLeader] = useState(() => typeof navigator === "undefined" || !("locks" in navigator))
  useEffect(() => {
    let bc: BroadcastChannel | null = null
    try { bc = new BroadcastChannel(`inboxtotask:${userId}`) } catch { bc = null }
    channel.current = bc
    if (bc) bc.onmessage = (event) => { if (event.data === "changed") void reload() }
    let lastRefresh = Date.now()
    const refresh = () => {
      if (document.visibilityState !== "visible") return
      onReturn.current()
      if (Date.now() - lastRefresh < 5000) return
      lastRefresh = Date.now(); void reload()
    }
    document.addEventListener("visibilitychange", refresh)
    window.addEventListener("focus", refresh)
    const controller = new AbortController()
    let release: (() => void) | null = null
    if ("locks" in navigator) {
      navigator.locks.request(`inboxtotask-auto-scan:${userId}`, { signal: controller.signal }, () => new Promise<void>((resolve) => {
        release = resolve
        setAutoLeader(true)
      })).catch(() => { /* aborted on unmount */ })
    }
    return () => {
      controller.abort(); release?.()
      document.removeEventListener("visibilitychange", refresh)
      window.removeEventListener("focus", refresh)
      bc?.close(); channel.current = null
    }
  }, [reload, userId])
  const announceChange = () => { try { channel.current?.postMessage("changed") } catch { /* other tabs refresh on focus */ } }

  const cooldownEnd = status?.cooldownUntil ? Date.parse(status.cooldownUntil) : 0
  const cooldownLeft = Math.max(0, Math.ceil((cooldownEnd - now) / 1000))
  useEffect(() => {
    setNow(Date.now())
    if (cooldownEnd <= Date.now()) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [cooldownEnd])
  // Keeps "Checked 3 min ago" current.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
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
      announceChange()
      return true
    } catch (err) {
      if (current === epoch.current) { setFailure({ message: (err as Error).message }); await reload(); announceChange() }
      return false
    } finally {
      // Unconditional: the dashboard is keyed by account, so a previous account's
      // instance is unmounted and this is a no-op there.
      setBusy(false)
    }
  }

  async function runScan(mode: "initial" | "more") {
    const result = await manualScan(mode)
    if (result.executionMode !== "GMAIL_PERSISTENT_MANUAL") throw new Error("The backend is in retrieval-only mode. No suggestions were extracted or saved.")
    // A check that caught up is never a stall; repeated backlog batches without
    // progress are, so a stuck message cannot loop forever.
    const passing = Boolean(result.error && TRANSIENT_STOPS.includes(result.error))
    stalls.current = passing ? stalls.current : !result.backlog || batchMadeProgress(result) ? 0 : stalls.current + 1
    if (stalls.current >= 3) setAutoHalt("stalled")
    // Planned limits are not failures; the status bar explains them.
    if (result.error && !BATCH_LIMIT_STOPS.includes(result.error) && result.error !== DAILY_LIMIT_STOP) throw new ScanRequestError(`${scanStopMessage(result.error)} Saved results remain available.`, result.error, true)
  }

  async function scan(mode: "initial" | "more", auto = false) {
    checkedThisPage.current = true
    setScanning(true)
    if (!auto) {
      // A manual press restarts automatic scanning after it was stopped or stalled.
      stalls.current = 0; autoFailedAt.current = null; setAutoHalt(null)
      const current = epoch.current
      const before = scanIds(latestSnapshot.current)
      // With automatic checks on, a check already running or cooling down is not an
      // error: it finishes on its own and its results appear by themselves.
      let alreadyRunning = false, stopped = false
      setQuietRetries(0)
      try {
        const finished = await perform(async () => {
          try { await runScan(mode) } catch (err) {
            if (autoOn && isScanBusy(err)) { alreadyRunning = true; return }
            // One message only: the status panel already says why the check stopped.
            if (err instanceof ScanRequestError && err.fromResult) { stopped = true; return }
            throw err
          }
        }, "")
        if (current !== epoch.current) return
        // perform() reloaded saved records, so this counts only what was actually saved.
        const added = scanSummaryBetween(before, scanIds(latestSnapshot.current))
        if (!finished) setFailure((f) => (f ? { message: `${f.message} ${added}` } : f))
        else if (alreadyRunning) setNotice("A check is already running. New items will appear on their own.")
        else if (stopped) setNotice(added === NOTHING_ADDED ? "" : added)
        else setNotice(`This check finished. ${added}`)
      } finally { setScanning(false) }
      return
    }
    // Automatic checks run in the background: they do not lock review actions,
    // close menus or clear notices. Only a failure is shown; what they add shows
    // through the "New" labels and tab counts.
    const current = epoch.current
    try {
      await runScan(mode)
      autoFailedAt.current = null
      setQuietRetries(0)
    } catch (err) {
      const code = err instanceof ScanRequestError ? err.code : ""
      if (isScanBusy(err)) {
        // Another check running or cooling down (another tab, or this browser's clock
        // slightly ahead of the server's) is not a failure: wait and try again quietly.
        autoFailedAt.current = Date.now()
      } else if (TRANSIENT_STOPS.includes(code)) {
        // A passing Gmail or AI-service problem: the schedule retries it quietly.
        autoFailedAt.current = null
        setQuietRetries((n) => n + 1)
      } else {
        autoFailedAt.current = Date.now()
        if (++stalls.current >= 3) setAutoHalt("stalled")
        // One message only: a stop the panel shows is not repeated in a banner.
        const shownInPanel = err instanceof ScanRequestError && err.fromResult
        if (current === epoch.current && !shownInPanel) setFailure({ message: (err as Error).message })
      }
    } finally {
      if (current === epoch.current) { await reload(); announceChange() }
      setScanning(false)
    }
  }

  const model = useMemo(() => buildDashboardModel(snapshot, links), [snapshot, links])
  // Returning from Google Calendar authorization reopens that task's event review once.
  const resumedCalendar = useRef(false)
  useEffect(() => {
    if (loading || resumedCalendar.current || !calendarEventsEnabled) return
    resumedCalendar.current = true
    const pending = pendingCalendarTask(userId)
    const task = pending ? model.active.find((t) => t.row.id === pending) : undefined
    if (task) { setActiveTab("tasks"); setView("active"); setExportTask(task) }
    else if (pending) clearCalendarDraft(userId)
  }, [loading, model.active, userId])
  const today = localDate(new Date(now))
  const reviewCount = model.suggestions.length + model.changes.length + model.unresolvedChanges.length
  const counts: Record<View, number> = { suggestions: reviewCount, active: model.active.length, completed: model.closed.length, dismissed: model.dismissed.length }
  const pendingUpdates = model.active.filter((t) => t.pendingChanges > 0).length
  const openWaiting = model.waiting.filter((w) => !w.row.resolved).length
  const openTasks = model.active.filter((t) => t.row.status === "approved")
  const change = changeId ? [...model.changes].find((c) => c.row.id === changeId) ?? null : null

  // New = saved after your last visit to the tab; unread = not opened or acted on yet.
  const marks = useNewItems({
    userId,
    loaded: !loading && !loadFailed,
    review: [
      ...model.suggestions.map((s) => ({ key: suggestionKey(s.row.id), createdAt: s.row.created_at })),
      ...model.changes.map((c) => ({ key: changeKey(c.row.id), createdAt: c.row.created_at })),
    ],
    passive: model.information.map((e) => ({ createdAt: e.created_at })),
    showing: loading ? null : activeTab === "tasks" ? (view === "suggestions" ? "review" : null) : "passive",
  })
  const newSuggestions = model.suggestions.filter((s) => marks.isNew("review", s.row.created_at))
  const olderSuggestions = model.suggestions.filter((s) => !marks.isNew("review", s.row.created_at))
  const newReviewCount = newSuggestions.length + model.changes.filter((c) => marks.isNew("review", c.row.created_at)).length
  const newPassiveCount = model.information.filter((e) => marks.isNew("passive", e.created_at)).length

  const sourceForSuggestion = (s: SuggestionItem | ChangeItem | WaitingItem, title: string): SourceView => ({
    title, sender: s.source?.sender, subject: s.source?.subject, sentAt: s.source?.sent_at, quote: s.quote, messageId: s.messageId, extraction: s.extraction,
  })
  const sourceForTask = (t: TaskItem): SourceView => {
    // A task made from a Passive email has no suggestion-based link: show its origin email.
    const p = t.fromPassive
    if (p && !t.primary) return {
      title: t.fields.action, sender: p.source?.sender, subject: p.source?.subject, sentAt: p.source?.sent_at,
      quote: p.quote, messageId: p.messageId, extraction: p.extraction, summary: p.summary ?? undefined,
    }
    return {
      title: t.fields.action, sender: t.primary?.sender, subject: t.primary?.subject, sentAt: t.primary?.sentAt,
      quote: null, messageId: t.primary?.messageId ?? null, taskId: t.row.id,
    }
  }

  // Where an item is now, found by its suggestion ID (tasks keep it as origin_suggestion_id).
  const locate = (suggestionId: string): { cat: Category; row: StoredRow } | null => {
    const s = model.suggestions.find((x) => x.row.id === suggestionId); if (s) return { cat: "suggestions", row: s.row }
    const d = model.dismissed.find((x) => x.row.id === suggestionId); if (d) return { cat: "dismissed", row: d.row }
    const a = model.active.find((x) => x.row.origin_suggestion_id === suggestionId); if (a) return { cat: "active", row: a.row }
    const c = model.closed.find((x) => !x.cancelled && x.row.origin_suggestion_id === suggestionId); if (c) return { cat: "completed", row: c.row }
    return null
  }
  // Categories an item can move to. Tasks need their original, unexpired suggestion to
  // go back to review; a suggestion whose excerpt expired cannot become a task.
  const moveTargets = (from: Category, row: StoredRow, hasQuote = true): Category[] => {
    // Alphabetical, so the menu reads Active, Completed, Dismissed, Suggestions.
    const all: Category[] = ["active", "completed", "dismissed", "suggestions"]
    return all.filter((to) => {
      if (to === from) return false
      // Suggestions already have "Dismiss suggestion" in the same menu.
      if (from === "suggestions" && to === "dismissed") return false
      if (from === "active" || from === "completed") {
        if (to === "active" || to === "completed") return true
        const origin = snapshot.suggestions.find((s) => s.id === row.origin_suggestion_id)
        return Boolean(origin && origin.state === "approved" && (!origin.expires_at || Date.parse(origin.expires_at) > Date.now()))
      }
      return hasQuote || to === "suggestions" || to === "dismissed"
    })
  }
  const runMoveStep = (from: Category, row: StoredRow, to: Category, suggestionId: string, note?: string) =>
    void perform(() => runMove(from, row, to), `Moved to ${categoryLabel[to]}.`, () => { setNotice(""); setToast({ kind: "moved", id: suggestionId, from, to, note }) })
  // Moving a task back to Suggestions or Dismissed deletes it, so a task with a Calendar
  // event first asks what should happen to the event.
  // A task is never added to Active without a deadline, and a suggestion marked "Needs
  // verification" is never added unread: Add task opens the editor for these instead.
  const mustReview = (s: SuggestionItem) => !s.fields.deadline || Boolean(s.extraction?.needs_review)
  const contextOf = (s: SuggestionItem): EmailContext => ({
    sender: s.source?.sender ?? null, subject: s.source?.subject ?? null, sentAt: s.source?.sent_at ?? null, quote: s.quote, messageId: s.messageId,
  })
  const reviewToAdd = (s: SuggestionItem) => setEditing({
    kind: "suggestion", row: s.row, fields: s.fields, adding: true, context: contextOf(s),
    reasons: Array.isArray(s.extraction?.warnings) ? s.extraction.warnings.filter((w: unknown): w is string => typeof w === "string") : [],
  })
  const move = (from: Category, row: StoredRow, to: Category, suggestionId: string) => {
    if ((from === "suggestions" || from === "dismissed") && (to === "active" || to === "completed")) {
      const item = [...model.suggestions, ...model.dismissed].find((s) => s.row.id === row.id)
      if (item && mustReview(item)) return reviewToAdd(item)
    }
    const deletes = (from === "active" || from === "completed") && (to === "suggestions" || to === "dismissed")
    const task = deletes && calendarEventsEnabled && hasCalendarEvent(calendarStatuses[row.id])
      ? [...model.active, ...model.closed].find((t) => t.row.id === row.id) : undefined
    if (task) setCalendarFollowUp({ kind: "delete", task, from, to, suggestionId })
    else runMoveStep(from, row, to, suggestionId)
  }
  const moveItems = (from: Category, row: StoredRow, suggestionId: string | null | undefined, hasQuote = true, onAct?: () => void) => {
    if (!suggestionId) return null
    const targets = moveTargets(from, row, hasQuote)
    if (!targets.length) return null
    return <>{targets.map((to) => <button key={to} onClick={() => { setMenuId(null); onAct?.(); move(from, row, to, suggestionId) }}>Move to {categoryLabel[to]}</button>)}</>
  }

  // ---- Google Calendar event dialog and the follow-ups after a task change ----
  const openCalendar = (task: TaskItem, review?: Deadline) => { setExportReview(review ?? null); setExportTask(task) }
  const closeCalendar = () => { setExportTask(null); setExportReview(null) }
  // The task as the last reload loaded it (React state may not have re-rendered yet).
  const loadedTask = (taskId: string): TaskItem | undefined => {
    const fresh = buildDashboardModel(loadedSnapshot.current ?? latestSnapshot.current, null)
    return [...fresh.active, ...fresh.closed].find((t) => t.row.id === taskId)
  }
  // Called after a task edit, approved change or resolved change was saved and reloaded.
  const followUpAfterChange = (taskId: string | null | undefined, before: Deadline | null | undefined, cancelled: boolean) => {
    if (!calendarEventsEnabled || !taskId) return
    const status = loadedCalendar.current[taskId], task = loadedTask(taskId)
    if (!task || !status) return
    if (cancelled) { if (hasCalendarEvent(status)) setCalendarFollowUp({ kind: "cancelled", task }); return }
    const after = task.fields.deadline
    if (after && status.state === "succeeded" && deadlineMoved(before, after)) setCalendarFollowUp({ kind: "deadline", task, deadline: after, draft: status.draft })
  }
  // Runs one Calendar call from a follow-up, which stays open (busy) until the call ends.
  // A failure shows the fixed message; a missing permission opens the event dialog,
  // which has the authorize button.
  async function runCalendar<T>(task: TaskItem, step: () => Promise<T>, review?: Deadline): Promise<T | null> {
    const current = epoch.current
    setBusy(true); setFailure(null); setNotice(""); setMenuId(null)
    try {
      return await step()
    } catch (err) {
      if (current !== epoch.current) return null
      const code = err instanceof CalendarError ? err.code : ""
      setCalendarFollowUp(null)
      if (needsCalendarAuthorization(code)) { setFailure({ message: "Authorize Google Calendar to change this event." }); openCalendar(task, review) }
      else setFailure({ message: calendarMessage(code) })
      return null
    } finally {
      setBusy(false)
      if (current === epoch.current) { setCalendarFollowUp(null); void refreshCalendar() }
    }
  }
  // An event that is already gone counts as removed.
  const removeEvent = (taskId: string) => calendarEventAction({ action: "remove", taskId }).then(
    (result) => result.state === "removed",
    (err) => { if (err instanceof CalendarError && err.code === "CALENDAR_NOT_ADDED") return true; throw err })
  const fallbackDraft = (task: TaskItem): CalendarDraft => initialDraft(task.fields, viewerZone)

  async function moveCalendarEvent(followUp: Extract<CalendarFollowUp, { kind: "deadline" }>) {
    const { task, deadline } = followUp, taskId = task.row.id
    type Outcome = { kind: "moved"; summary: string; was: string; url?: string } | { kind: "gone" } | { kind: "review"; message?: string }
    const outcome = await runCalendar<Outcome>(task, async () => {
      // Read first, so a change made in Google is never overwritten.
      const read: CalendarResult = await calendarEventAction({ action: "read", taskId })
      if (read.state === "removed") return { kind: "gone" }
      if (read.state !== "succeeded" || !read.version) return { kind: "review" }
      const current = calendarDraftFrom(read.draft, fallbackDraft(task))
      const moved = oneClickMove(current, deadline)
      if (!moved) return { kind: "review" }
      try {
        const saved = await calendarEventAction({ action: "update", taskId, version: read.version, draft: payloadOf(moved) })
        if (saved.state === "removed") return { kind: "gone" }
        const was = current.date === moved.date ? timeRange(current.startTime, current.endTime) || eventSummary(current) : eventSummary(current)
        return { kind: "moved", summary: eventSummary(saved.draft ?? moved), was, url: saved.eventUrl }
      } catch (err) {
        // No retry: the dialog shows Google's details (or the authorize button).
        const code = err instanceof CalendarError ? err.code : ""
        return { kind: "review", message: needsCalendarAuthorization(code) ? "Authorize Google Calendar to change this event." : calendarMessage(code) }
      }
    }, deadline)
    if (!outcome) return
    if (outcome.kind === "moved") { setNotice(`Event moved to ${outcome.summary} (was ${outcome.was}).`); setNoticeLink(eventLink(outcome.url, taskId)) }
    else if (outcome.kind === "gone") setNotice("This event was deleted in Google Calendar.")
    else { if (outcome.message) setFailure({ message: outcome.message }); openCalendar(task, deadline) }
  }
  async function removeAfterCancel(task: TaskItem) {
    const removed = await runCalendar(task, () => removeEvent(task.row.id))
    if (removed) setNotice("Event removed from your Google Calendar.")
    else if (removed === false) setFailure({ message: calendarMessage("") })
  }
  async function deleteWithEvent(followUp: Extract<CalendarFollowUp, { kind: "delete" }>, removeIt: boolean) {
    const { task, from, to, suggestionId } = followUp
    if (!removeIt) { setCalendarFollowUp(null); return runMoveStep(from, task.row, to, suggestionId, "The event stays in Google Calendar. InboxToTask will no longer manage it.") }
    // The task is deleted only once the event's removal is confirmed.
    const removed = await runCalendar(task, () => removeEvent(task.row.id))
    if (removed) runMoveStep(from, task.row, to, suggestionId, "Its calendar event was removed.")
    else if (removed === false) setFailure({ message: `${calendarMessage("")} The task was not moved.` })
    else setFailure((f) => f && { message: `${f.message} The task was not moved.` })
  }

  // ---- "Turn into task" for Passive communication ----
  // Saves the Create task form. The backend keeps one task per email, so a repeat
  // returns the first task. Resolves to a fixed error for the form, or null.
  async function saveCreatedTask(view: SourceView, fields: TaskFields): Promise<string | null> {
    const extraction = view.extraction
    if (!extraction) return "This email can no longer become a task."
    const current = epoch.current
    setBusy(true); setFailure(null); setNotice(""); setMenuId(null)
    try {
      const saved = await reviewStoredRecord("extraction", extraction.id, "create_task", 0, fields) as { taskId: string; reused?: boolean; revision?: number }
      if (current !== epoch.current) return null
      // The read state from before View details, for Undo and Move back to Passive.
      if (view.passive) rememberPriorRead(userId, saved.taskId, view.passive)
      setCreating(null)
      await reload()
      announceChange()
      if (current === epoch.current) setToast({ kind: "created", id: saved.taskId, revision: Number(saved.revision ?? 0), note: saved.reused ? "reused" : undefined })
      return null
    } catch (err) {
      return current === epoch.current ? `The task was not created. ${(err as Error).message}` : null
    } finally {
      setBusy(false)
    }
  }
  // Removes the task and shows the email under Passive again, with its earlier read mark
  // when this browser recorded one. Never touches Google Calendar.
  const returnToPassive = (taskId: string, revision: number, message: string) =>
    perform(() => reviewStoredRecord("task", taskId, "return_to_passive", revision), message, () => {
      if (restorePriorRead(userId, taskId)) setReadVersion((v) => v + 1)
    })
  // Move back to Passive from a task's actions. A task with a Google Calendar event first
  // asks whether to keep or remove the event.
  const moveBackToPassive = (task: TaskItem) => {
    if (calendarEventsEnabled && hasCalendarEvent(calendarStatuses[task.row.id])) setCalendarFollowUp({ kind: "passive", task })
    else void returnToPassive(task.row.id, Number(task.row.revision), "Moved back to Passive communication.")
  }
  // Same removal as the delete follow-up: the task moves only once the event's removal is confirmed.
  async function passiveWithEvent(task: TaskItem, removeIt: boolean) {
    if (!removeIt) {
      setCalendarFollowUp(null)
      return void returnToPassive(task.row.id, Number(task.row.revision), "Moved back to Passive communication. The event stays in Google Calendar; InboxToTask will no longer manage it.")
    }
    const removed = await runCalendar(task, () => removeEvent(task.row.id))
    if (removed) void returnToPassive(task.row.id, Number(task.row.revision), "Moved back to Passive communication. Its calendar event was removed.")
    else if (removed === false) setFailure({ message: `${calendarMessage("")} The task was not moved.` })
    else setFailure((f) => f && { message: `${f.message} The task was not moved.` })
  }
  // "View task" in the Task created pop-up: opens the task's list and brings its card into view.
  const viewTask = (taskId: string) => {
    const closed = model.closed.some((t) => t.row.id === taskId)
    setActiveTab("tasks"); setView(closed ? "completed" : "active"); setMenuId(null); setJumpTo(taskId)
  }
  const passiveMoveItem = (t: TaskItem) => t.fromPassive?.canReturn
    ? <button onClick={() => { setMenuId(null); moveBackToPassive(t) }}>Move back to Passive</button> : null

  // The card's Calendar line; nothing at all when the task has no event (never a permission status).
  const calendarLine = (taskId: string) => {
    const status = calendarStatuses[taskId]
    if (!calendarEventsEnabled || !status || !hasCalendarEvent(status)) return undefined
    const when = eventSummary(status.draft)
    const text = <><Icon name="calendar" size={13} />Added to Google Calendar{when && <> · {when}</>}</>
    const url = googleCalendarUrl(status.eventUrl)
    if (!url) return <span className="rd-cal-line">{text}</span>
    return (
      <a className="rd-cal-line rd-cal-link" href={url} target="_blank" rel="noopener noreferrer"
        onClick={(e) => openEvent(e, taskId, url)} aria-disabled={checkingEvents.has(taskId) || undefined}
        aria-label={`Open this event in Google Calendar${when ? `: ${when}` : ""}`}>{text}<Icon name="external" size={11} /></a>
    )
  }
  const managesEvent = (taskId: string) => calendarEventsEnabled && hasCalendarEvent(calendarStatuses[taskId])

  const blockers = {
    sources: !settingsHaveScanSource(settings),
    consent: !settings.consent,
    paused: settings.paused,
    gmail: !gmail.checking && gmail.state !== "connected",
  }
  const autoOn = Boolean(settings.auto_scan) && autoHalt === null
  // While an automatic check is quietly retrying a passing problem, the panel does not show it.
  const shownStatus = status?.result && quietStop(status, autoOn) ? { ...status, result: { ...status.result, error: null } } : status
  const panelState: ScanPanelState = gmail.checking && !status ? "loading" : scanPanelState({ status: shownStatus, loadError: statusFailed, scanning, cooldownLeft, blockers })
  const needsReconnect = status?.result?.error === "GMAIL_RECONNECT_REQUIRED" || gmail.state === "reconnect_required"

  // While the app is open: check on opening, then every minute after the last
  // check finished, always continuing a saved backlog first. Every check passes
  // the same server checks as a manual scan; nothing runs with the app closed.
  const autoReady = autoOn && autoLeader && !busy && !scanning && !loading && !statusFailed && !needsReconnect
    && !blockers.sources && !blockers.consent && !blockers.paused && !blockers.gmail
  useEffect(() => {
    if (!autoReady) return
    const next = autoNextCheck(status, Date.now(), !checkedThisPage.current, quietRetries)
    if (!next) return
    const backoff = autoFailedAt.current === null ? 0 : autoFailedAt.current + AUTO_CHECK_INTERVAL_MS - Date.now()
    const timer = window.setTimeout(() => void scan(next.mode, true), Math.max(next.delay, backoff))
    return () => window.clearTimeout(timer)
    // scan is recreated each render; the timer only needs the latest status.
  }, [autoReady, status, quietRetries])

  // After "View task": scroll the card into view, move focus to it and outline it for 3 s.
  useEffect(() => {
    if (!jumpTo || activeTab !== "tasks") return
    const card = document.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(jumpTo)}"]`)
    if (!card) return
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    card.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" })
    card.focus({ preventScroll: true })
    const timer = window.setTimeout(() => setJumpTo(null), 3000)
    return () => window.clearTimeout(timer)
  }, [jumpTo, activeTab, view])

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
            Tasks<span className="tab-count">{reviewCount + model.active.length}</span>{newReviewCount > 0 && <NewCount n={newReviewCount} />}
          </button>
          <button aria-selected={activeTab === "passive"} className={activeTab === "passive" ? "tab active" : "tab"} onClick={() => setActiveTab("passive")} role="tab">
            Passive communication<span className="tab-count">{model.information.length}</span>{newPassiveCount > 0 && <NewCount n={newPassiveCount} />}
          </button>
        </nav>

        <RealScanStatus
          now={now} state={panelState} status={shownStatus} cooldownLeft={cooldownLeft} busy={busy} scanning={scanning}
          settings={settings} gmail={gmail.state} needsReconnect={needsReconnect} activityOpen={activityOpen}
          onToggleActivity={() => setActivityOpen((c) => !c)}
          onScan={(mode) => void scan(mode)}
          auto={{ on: Boolean(settings.auto_scan), halted: autoHalt, onStop: () => setAutoHalt("user") }}
          panel={{ open: panelOpen, onToggle: togglePanel, newCount: newReviewCount + newPassiveCount, trouble: quietRetries >= TROUBLE_AFTER }}
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
                    {v === "suggestions" && newReviewCount > 0 && <NewCount n={newReviewCount} />}
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
                    {[{ group: newSuggestions, fresh: true }, { group: olderSuggestions, fresh: false }].map(({ group, fresh }) => group.length > 0 && <div key={fresh ? "new" : "older"}>
                      {fresh && <NewDivider since={marks.lastVisit("review")} />}
                      {fresh && olderSuggestions.length > 0 && <span className="visually-hidden">End of new suggestions.</span>}
                      <div className="task-list">{group.map((s) => {
                        const seen = () => marks.markSeen(suggestionKey(s.row.id))
                        return (
                          <RealTaskRow key={s.row.id} kind="suggestion" fields={s.fields} today={today} busy={busy}
                            isNew={fresh} unread={marks.isUnread(suggestionKey(s.row.id))}
                            context={s.source?.sender ?? "Source unavailable"} menuOpen={menuId === s.row.id}
                            badges={<>{s.sibling && <span className="task-context">{s.sibling.index} of {s.sibling.of} from this email</span>}{s.edited && <span className="updated-badge">Edited by you</span>}{s.extraction?.needs_review && <span className="provisional-badge">Needs verification</span>}{!s.quote && <span className="updated-badge">Evidence expired</span>}</>}
                            onMenu={() => setMenuId((c) => (c === s.row.id ? null : s.row.id))}
                            onSource={() => { seen(); setSource(sourceForSuggestion(s, s.fields.action)) }}
                            primary={<button className="primary-button row-button" disabled={busy || !s.quote} title={s.quote ? undefined : "The supporting excerpt expired, so this suggestion can only be dismissed."}
                              onClick={() => { seen(); if (mustReview(s)) reviewToAdd(s); else void perform(() => reviewStoredRecord("suggestion", s.row.id, "approve", s.row.revision), "Task added.") }}>Add task</button>}
                            menu={<><button onClick={() => { setMenuId(null); seen(); setEditing({ kind: "suggestion", row: s.row, fields: s.fields, context: contextOf(s) }) }}>Edit before adding</button>
                              {moveItems("suggestions", s.row, s.row.id, Boolean(s.quote), seen)}
                              <button className="danger-action" onClick={() => { seen(); void perform(() => reviewStoredRecord("suggestion", s.row.id, "dismiss", s.row.revision), "Suggestion dismissed.", () => { setNotice(""); setToast({ kind: "dismissed", id: s.row.id }) }) }}>Dismiss suggestion</button></>}
                          />)
                      })}</div>
                    </div>)}
                    {model.changes.length > 0 && <>
                      <h3 className="rd-subhead">Proposed changes to your tasks</h3>
                      <div className="task-list">{model.changes.map((c) => {
                        const unread = marks.isUnread(changeKey(c.row.id)), fresh = marks.isNew("review", c.row.created_at)
                        const seen = () => marks.markSeen(changeKey(c.row.id))
                        return (
                        <article className={`task-row is-suggestion ${unread ? "rd-unread" : "rd-seen"}`} key={c.row.id}>
                          <div className="task-main">
                            <div className="task-title-line">
                              <h3>{unread && <UnreadDot />}{c.row.kind === "cancel" ? "Proposed cancellation" : "Proposed edit"}: {c.target?.accepted_fields?.action ?? c.row.baseline?.action ?? "Task"}</h3>
                              {fresh && <NewBadge />}
                              <span className="updated-badge">{c.row.kind === "cancel" ? "Cancellation detected" : `${c.row.changed_fields?.length ?? 0} field${c.row.changed_fields?.length === 1 ? "" : "s"} changed`}</span>
                              {c.stale && <span className="provisional-badge">Task changed since</span>}
                              {!c.open && <span className="provisional-badge">Task no longer open</span>}
                            </div>
                            <p className="task-caption">{c.row.reason}</p>
                          </div>
                          <button className="email-link" onClick={() => { seen(); setSource(sourceForSuggestion(c, "Proposed change")) }}>View details</button>
                          <button className="primary-button row-button" onClick={() => { seen(); setChangeId(c.row.id) }}>Review change</button>
                        </article>)
                      })}</div>
                    </>}
                    {model.unresolvedChanges.length > 0 && <>
                      <h3 className="rd-subhead">Changes that need you to choose the task</h3>
                      <Embedded>{model.unresolvedChanges.map((c) => (
                        <ManualChangeResolver key={`${c.row.id}-${c.row.revision}`} change={c.row} source={c.source} quote={c.quote} tasks={openTasks.map((t) => t.row)} email={email} busy={busy}
                          onResolve={(taskId, taskRevision, fields) => {
                            const before = model.active.find((t) => t.row.id === taskId)?.fields.deadline
                            void perform(() => resolveTaskChange(c.row.id, c.row.revision, taskId, taskRevision, fields), fields ? `Your values were saved to the task.${noCalendarWrite}` : `The task was marked cancelled.${noCalendarWrite}`)
                              .then((saved) => { if (saved) followUpAfterChange(taskId, before, !fields) })
                          }}
                          onDismiss={() => void perform(() => reviewTaskChange(c.row.id, c.row.revision, "dismiss"), "Item dismissed.")} />))}</Embedded>
                    </>}
                    {!reviewCount && <EmptyState title="Nothing waiting for review" detail={status?.lastSuccessful ? "New suggestions from a manual check appear here." : "Run a manual check once Gmail is connected and sources are permitted."} />}
                  </>}

                  {view === "active" && <>
                    {model.active.length > 0 && <div className="task-list">{model.active.map((t) => (
                      <RealTaskRow key={t.row.id} kind="active" fields={t.fields} today={today} busy={busy} taskId={t.row.id} highlight={jumpTo === t.row.id}
                        context={t.primary?.sender ?? t.fromPassive?.source?.sender ?? ""} menuOpen={menuId === t.row.id} calendarLine={calendarLine(t.row.id)}
                        badges={t.pendingChanges > 0 ? <><span className="updated-badge">Change proposed</span><button className="review-change-link" onClick={() => setChangeId(model.changes.find((c) => c.row.target_task_id === t.row.id)?.row.id ?? null)}>Review change</button></> : null}
                        onComplete={() => void perform(() => reviewStoredRecord("task", t.row.id, "complete", t.row.revision), "Task completed.", () => { setNotice(""); setToast({ kind: "completed", id: t.row.id }) })}
                        onMenu={() => setMenuId((c) => (c === t.row.id ? null : t.row.id))}
                        onSource={() => setSource(sourceForTask(t))}
                        primary={<button className="calendar-button" disabled={busy} onClick={() => openCalendar(t)}><Icon name="calendar" size={16} />{!calendarEventsEnabled ? "Export calendar file" : managesEvent(t.row.id) ? "Manage event" : "Add to calendar"}</button>}
                        menu={<><button onClick={() => { setMenuId(null); setEditing({ kind: "task", row: t.row, fields: t.fields }) }}>Edit task</button>
                          {moveItems("active", t.row, t.row.origin_suggestion_id)}
                          {passiveMoveItem(t)}</>}
                      />))}</div>}
                    <WaitingSection items={model.waiting} openCount={openWaiting} busy={busy} today={today}
                      onSource={(w) => setSource(sourceForSuggestion(w, w.row.action))}
                      onToggle={(w) => void perform(() => reviewStoredRecord("waiting", w.row.id, w.row.resolved ? "reopen" : "resolve", w.row.revision), w.row.resolved ? "Marked as still waiting." : "Marked resolved. Its dashboard reminder was cleared.")}
                      onReminder={setReminderFor} />
                    {!model.active.length && !model.waiting.length && <EmptyState title="No open tasks" detail="Tasks you add from Suggestions appear here." />}
                  </>}

                  {view === "completed" && <>
                    {model.closed.length > 0 && <div className="task-list">{model.closed.map((t) => {
                      const moves = t.cancelled ? null : moveItems("completed", t.row, t.row.origin_suggestion_id), back = t.cancelled ? null : passiveMoveItem(t)
                      return (
                      <RealTaskRow key={t.row.id} kind={t.cancelled ? "cancelled" : "completed"} fields={t.fields} today={today} busy={busy} taskId={t.row.id} highlight={jumpTo === t.row.id}
                        context={t.primary?.sender ?? t.fromPassive?.source?.sender ?? ""} menuOpen={menuId === t.row.id} calendarLine={calendarLine(t.row.id)}
                        onMenu={t.cancelled ? undefined : () => setMenuId((c) => (c === t.row.id ? null : t.row.id))}
                        menu={moves || back ? <>{moves}{back}</> : undefined}
                        onComplete={t.cancelled ? undefined : () => void perform(() => reviewStoredRecord("task", t.row.id, "undo", t.row.revision), "Completion undone. The task is open again.")}
                        onSource={() => setSource(sourceForTask(t))}
                        primary={(() => {
                          const state = <span className="deletion-date">{t.cancelled ? "Cancelled" : t.row.delete_after ? `Removed after ${formatWhen(t.row.delete_after)}` : "Completed"}</span>
                          return managesEvent(t.row.id)
                            ? <div className="rd-cal-closed">{state}<button className="calendar-button rd-cal-manage" disabled={busy} onClick={() => openCalendar(t)}><Icon name="calendar" size={14} />Manage event</button></div>
                            : state
                        })()}
                      />)
                    })}</div>}
                    {!model.closed.length && <EmptyState title="No completed tasks" detail="Completed tasks are kept for 30 days, then removed." />}
                  </>}

                  {view === "dismissed" && <>
                    {model.dismissed.length > 0 && <div className="task-list">{model.dismissed.map((s) => (
                      <RealTaskRow key={s.row.id} kind="dismissed" fields={s.fields} today={today} busy={busy}
                        context={s.source?.sender ?? ""} menuOpen={menuId === s.row.id}
                        onMenu={() => setMenuId((c) => (c === s.row.id ? null : s.row.id))}
                        menu={moveItems("dismissed", s.row, s.row.id, Boolean(s.quote)) ?? undefined}
                        onSource={() => setSource(sourceForSuggestion(s, s.fields.action))}
                        primary={<button className="secondary-button row-button rd-small-button" disabled={busy} onClick={() => void perform(() => reviewStoredRecord("suggestion", s.row.id, "restore", s.row.revision), "Suggestion restored to Suggestions.")}>Restore</button>}
                      />))}</div>}
                    {!model.dismissed.length && <EmptyState title="No dismissed suggestions" detail="Dismissed suggestions can be restored until they expire after 30 days." />}
                  </>}
                </>
              )}
            </section>
          </div>
        ) : (
          loading ? <div className="empty-state" role="status"><span className="spinner" aria-hidden="true" /><h3>Loading summaries…</h3></div>
            : model.information.length ? <PassiveSection key={`info-${userId}`} userId={userId} readVersion={readVersion} items={model.information} sources={snapshot.sources} evidence={snapshot.evidence} onSource={setSource}
              isNew={(e) => marks.isNew("passive", e.created_at)} since={marks.lastVisit("passive")} />
              : <EmptyState title="No informational summaries" detail="Summaries of permitted emails that don’t need action appear here after a manual check." />
        )}
      </main>

      {source && <SourceModal source={source} email={email} links={links} onClose={() => setSource(null)}
        onTurnIntoTask={source.passive && source.extraction ? () => { setCreating(source); setSource(null) } : undefined} />}
      {creating?.extraction && <CreateTaskFromEmail key={creating.extraction.id} timeZone={viewerZone} busy={busy}
        email={{ subject: creating.subject ?? null, sentAt: creating.sentAt ?? null, summary: creating.summary ?? null, quote: creating.quote, extraction: creating.extraction }}
        onCancel={() => setCreating(null)}
        onSave={(fields) => saveCreatedTask(creating, fields)} />}
      {editing && <EditFieldsModal editing={editing} email={email} busy={busy} onCancel={() => setEditing(null)}
        onSave={(fields) => {
          const { kind, row } = editing, before = editing.fields.deadline
          if (editing.adding) {
            // Add task from the editor: the reviewed values are saved with the approval.
            // A dismissed suggestion is restored first, as Move to Active does.
            return void perform(async () => {
              let rev = Number(row.revision)
              if (row.state !== "pending") { await reviewStoredRecord("suggestion", row.id, "restore", rev); rev += 1 }
              return reviewStoredRecord("suggestion", row.id, "approve", rev, fields)
            }, "Task added.", () => setEditing(null))
          }
          void perform(() => reviewStoredRecord(kind, row.id, "edit", row.revision, fields),
            kind === "suggestion" ? "Your edits were saved. The suggestion still needs you to add it." : `Task updated.${noCalendarWrite}`, () => setEditing(null))
            .then((saved) => { if (saved && kind === "task") followUpAfterChange(row.id, before, false) })
        }} />}
      {change && <ChangeModal item={change} email={email} busy={busy} onClose={() => setChangeId(null)}
        onApprove={() => {
          const taskId = change.target?.id ?? change.row.target_task_id, before = change.target?.accepted_fields?.deadline, cancelled = change.row.kind === "cancel"
          void perform(() => reviewTaskChange(change.row.id, change.row.revision, "approve"), `Task change approved.${noCalendarWrite}`, () => setChangeId(null))
            .then((saved) => { if (saved) followUpAfterChange(taskId, before, cancelled) })
        }}
        onDismiss={() => void perform(() => reviewTaskChange(change.row.id, change.row.revision, "dismiss"), "Proposal dismissed. The task is unchanged.", () => setChangeId(null))}
        onRebase={() => change.target && void perform(() => reviewTaskChange(change.row.id, change.row.revision, "rebase", change.target!.revision), "Proposal refreshed against the current task. Review the new comparison before approving.")} />}
      {exportTask && (
        <Modal onClose={() => { clearCalendarDraft(userId); closeCalendar() }} title={!calendarEventsEnabled ? "Export calendar file" : managesEvent(exportTask.row.id) ? "Manage event" : "Add to calendar"} wide>
          <Embedded><TaskCalendarControl key={`${userId}-${exportTask.row.id}`} task={exportTask.row} userId={userId}
            review={exportReview ? { deadline: exportReview } : undefined}
            onCancel={closeCalendar}
            onAdded={() => { closeCalendar(); setFailure(null); void noticeWithEventLink("Event added to your Google Calendar.", exportTask.row.id) }}
            onSaved={(summary: string) => { closeCalendar(); setFailure(null); void noticeWithEventLink(endSentence(`Event updated: ${summary}`), exportTask.row.id) }}
            onRemoved={() => { closeCalendar(); setFailure(null); setNotice("Event removed from your Google Calendar."); void refreshCalendar() }}
            onStatusChange={() => void refreshCalendar()}
            fileExport={<CalendarExport key={`${exportTask.row.id}-${exportTask.row.revision}`} task={exportTask.row} fields={exportTask.fields} close={() => { clearCalendarDraft(userId); closeCalendar() }}
              onDownloaded={() => { closeCalendar(); setNotice("Calendar file download started. Import it into your chosen calendar.") }} />} /></Embedded>
        </Modal>
      )}
      {calendarFollowUp && <CalendarFollowUpModal followUp={calendarFollowUp} busy={busy} fallback={fallbackDraft(calendarFollowUp.task)}
        onClose={() => { if (!busy) setCalendarFollowUp(null) }}
        onMove={() => { if (calendarFollowUp.kind === "deadline") void moveCalendarEvent(calendarFollowUp) }}
        onReview={() => { if (calendarFollowUp.kind === "deadline") { const { task, deadline } = calendarFollowUp; setCalendarFollowUp(null); openCalendar(task, deadline) } }}
        onRemove={() => {
          if (calendarFollowUp.kind === "cancelled") void removeAfterCancel(calendarFollowUp.task)
          else if (calendarFollowUp.kind === "delete") void deleteWithEvent(calendarFollowUp, true)
          else if (calendarFollowUp.kind === "passive") void passiveWithEvent(calendarFollowUp.task, true)
        }}
        onKeep={() => {
          if (calendarFollowUp.kind === "delete") void deleteWithEvent(calendarFollowUp, false)
          else if (calendarFollowUp.kind === "passive") void passiveWithEvent(calendarFollowUp.task, false)
          else setCalendarFollowUp(null)
        }} />}
      {reminderFor && <ReminderModal followup={reminderFor} busy={busy} onCancel={() => setReminderFor(null)}
        onSave={(iso) => void perform(() => reviewStoredRecord("followup", reminderFor.id, "remind", reminderFor.revision, { reminderAt: iso }), "Dashboard reminder saved. No email or notification is sent.", () => setReminderFor(null))} />}

      {/* Success messages float at the bottom like the Undo pop-up, so the page never shifts. */}
      {notice && !toast && !failure && (
        <FadeAway key={notice} aria-live="polite" className="undo-toast rd-toast-message" onDone={() => setNotice("")}>
          <span>{notice}</span>
          {noticeLink && <a className="rd-toast-link" href={noticeLink.url} target="_blank" rel="noopener noreferrer"
            onClick={(e) => openEvent(e, noticeLink.taskId, noticeLink.url)} aria-disabled={checkingEvents.has(noticeLink.taskId) || undefined}>{noticeLink.label}<Icon name="external" size={12} /></a>}
          <button aria-label="Dismiss message" className="toast-close" onClick={() => setNotice("")}><Icon name="close" size={16} /></button>
        </FadeAway>
      )}
      {toast && (() => {
        const dismissedRow = toast.kind === "dismissed" ? model.dismissed.find((s) => s.row.id === toast.id)?.row : undefined
        const completedRow = toast.kind === "completed" ? model.closed.find((t) => t.row.id === toast.id)?.row : undefined
        const row = dismissedRow ?? completedRow
        if (toast.kind === "created") {
          // A task made from a Passive email. A repeat save returned the email's existing task: no Undo.
          const task = [...model.active, ...model.closed].find((t) => t.row.id === toast.id)
          const reused = toast.note === "reused"
          return (
            <FadeAway aria-live="polite" className="undo-toast" key={`created-${toast.id}`} onDone={() => setToast(null)}>
              <span>{reused ? "This email is already a task" : "Task created"}</span>
              {task && <button onClick={() => viewTask(toast.id)}>View task</button>}
              {!reused && <button disabled={busy} onClick={() => {
                setToast(null)
                void returnToPassive(toast.id, Number(task?.row.revision ?? toast.revision ?? 0), "Undone. The email is back in Passive communication.")
              }}>Undo</button>}
              <button aria-label="Close" className="toast-close" onClick={() => setToast(null)}><Icon name="close" size={16} /></button>
            </FadeAway>
          )
        }
        return (
          <FadeAway aria-live="polite" className="undo-toast" key={`${toast.kind}-${toast.id}`} onDone={() => setToast(null)}>
            <span>{toast.kind === "moved" ? `Moved to ${categoryLabel[toast.to ?? "suggestions"]}` : toast.kind === "dismissed" ? "Suggestion dismissed" : "Task completed"}{toast.note && `. ${toast.note}`}</span>
            {toast.kind === "moved" && toast.from && (() => {
              const here = locate(toast.id)
              const back = toast.from
              return here ? <button disabled={busy} onClick={() => {
                setToast(null)
                void perform(() => runMove(here.cat, here.row, back), `Moved back to ${categoryLabel[back]}.`)
              }}>Undo</button> : null
            })()}
            {toast.kind !== "moved" && row && <button disabled={busy} onClick={() => {
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

function RealTaskRow({ kind, fields, today, busy, context, badges, menuOpen, onMenu, onSource, onComplete, primary, menu, isNew, unread, calendarLine, taskId, highlight }: {
  kind: "suggestion" | "active" | "completed" | "cancelled" | "dismissed"
  // Task cards only: lets "View task" find, focus and outline the card.
  taskId?: string
  highlight?: boolean
  isNew?: boolean
  unread?: boolean
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
  calendarLine?: ReactNode
}) {
  const due = deadlineDisplay(fields.deadline, today, viewerZone)
  const done = kind === "completed" || kind === "cancelled"
  const caption = [fields.condition && `Condition: ${fields.condition}`, ...fields.requirements].filter(Boolean).join(" · ")
  return (
    <article className={`task-row ${done ? "is-complete" : ""} ${kind === "suggestion" || kind === "dismissed" ? "is-suggestion" : ""} ${unread === undefined ? "" : unread ? "rd-unread" : "rd-seen"}${highlight ? " rd-jump-target" : ""}`}
      data-task-id={taskId} tabIndex={taskId ? -1 : undefined} aria-label={taskId ? fields.action : undefined}>
      {(kind === "active" || kind === "completed") && onComplete && (
        <button aria-label={kind === "completed" ? `Undo completion of ${fields.action}` : `Complete ${fields.action}`} aria-pressed={kind === "completed"} className="checkbox" disabled={busy} onClick={onComplete}>
          {kind === "completed" && <Icon name="check" size={15} />}
        </button>
      )}
      <div className="task-main">
        <div className="task-title-line">
          <h3>{unread && <UnreadDot />}{fields.action}</h3>
          {isNew && <NewBadge />}
          {context && <span className="task-context">{context}</span>}
          {badges}
        </div>
        {caption && <p className="task-caption">{caption}</p>}
        <div className="task-meta">
          <span className="date">{due.dateLabel}{due.timeLabel && <> · {due.timeLabel}</>}</span>
          {!done && <span className={`deadline ${due.tone}`}><span />{due.status}</span>}
          {fields.deadline?.wording && <span className="rd-wording" title="Timing as stated in the email">“{fields.deadline.wording}”</span>}
          {calendarLine}
        </div>
      </div>
      <button className="email-link" onClick={onSource}>View details</button>
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

// How sure the model was about the email's classification. Green ≥ 85%, yellow
// 60–84%, red < 60%. The label and percentage stay visible, so color is not the
// only signal.
function confidenceLevel(value: number): "high" | "medium" | "low" {
  return value >= 85 ? "high" : value >= 60 ? "medium" : "low"
}
// A small ring that fills clockwise to the confidence percentage, in the text color.
function ConfidenceRing({ value }: { value: number }) {
  const r = 6.5, c = 2 * Math.PI * r, filled = Math.max(0, Math.min(100, value)) / 100 * c
  return (
    <svg aria-hidden="true" className="rd-confidence-ring" height="16" viewBox="0 0 16 16" width="16">
      <circle cx="8" cy="8" fill="none" r={r} stroke="currentColor" strokeOpacity=".22" strokeWidth="2.5" />
      <circle cx="8" cy="8" fill="none" r={r} stroke="currentColor" strokeDasharray={`${filled} ${c}`} strokeLinecap="round" strokeWidth="2.5" transform="rotate(-90 8 8)" />
    </svg>
  )
}
function ConfidenceBadge({ category, value }: { category: string; value: number }) {
  const level = confidenceLevel(value)
  const kind = category === "Actionable" ? "Actionable" : "Informational"
  const word = level === "high" ? "high" : level === "medium" ? "not sure" : "low"
  return (
    <span aria-label={`Classification confidence: ${word}, ${value}% ${kind.toLowerCase()}`} className={`rd-confidence is-${level}`} role="img"
      title={`The model is ${value}% confident this email is ${kind.toLowerCase()}.`}>
      <ConfidenceRing value={value} />{kind} · {value}%
    </span>
  )
}

// Passive communication: informational emails as cards in the Tasks style, with
// Unread/Read tabs. Read marks stay in this browser (same storage as before).
function PassiveSection({ userId, readVersion, items, sources, evidence, onSource, isNew, since }: {
  userId: string
  // Changes when the dashboard restored a read mark (Undo, Move back to Passive).
  readVersion: number
  items: StoredRow[]
  sources: StoredRow[]
  evidence: StoredRow[]
  onSource: (view: SourceView) => void
  isNew: (e: StoredRow) => boolean
  since: string | null
}) {
  const [read, setRead] = useState(() => loadRead(userId))
  // Every change here is saved at once, so the stored marks are current: reread them after a restore.
  const firstRead = useRef(true)
  useEffect(() => {
    if (firstRead.current) { firstRead.current = false; return }
    setRead(loadRead(userId))
  }, [userId, readVersion])
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
  // New cards first, under a divider; each group keeps newest-first order.
  const inView = cards.filter((c) => read.has(c.e.source_id) === (view === "read"))
  const shown = [...inView.filter((c) => isNew(c.e)), ...inView.filter((c) => !isNew(c.e))]
  const firstOlder = shown.findIndex((c) => !isNew(c.e))
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
      {shown.length > 0 && isNew(shown[0].e) && <NewDivider since={since} />}
      {shown.length > 0 ? <div className="task-list">{shown.map(({ e, src, quote }, i) => {
        const isRead = read.has(e.source_id)
        const title = src?.subject || "(no subject)"
        return (
          <article className={`task-row rd-info-row${isRead ? " rd-is-read rd-seen" : " rd-unread"}${i === firstOlder && i > 0 ? " rd-first-older" : ""}`} key={e.id}>
            <div className="task-main">
              <div className="task-title-line">
                <h3>{!isRead && <UnreadDot />}{title}</h3>
                {isNew(e) && <NewBadge />}
                {src?.sender && <span className="task-context">{src.sender}</span>}
                {e.needs_review && <span className="rd-chip">Needs verification</span>}
              </div>
              <p className="task-caption rd-info-summary">{e.summary}</p>
              {src?.sent_at && <div className="task-meta"><span className="date">Received {friendlyTime(src.sent_at)}</span></div>}
            </div>
            <button className="email-link" onClick={() => {
              onSource({ title, sender: src?.sender, subject: src?.subject, sentAt: src?.sent_at, quote: quote?.quote ?? null, messageId: quote?.message_id ?? src?.message_id ?? null, extraction: e, summary: e.summary,
                passive: { sourceId: e.source_id, wasRead: isRead } })
              if (!isRead) mark(e.source_id, true)
            }}>View details</button>
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

// Each check handles a few new emails, then stops on purpose to limit AI use.
const partialDetail = (status: ScanStatus | null) => {
  const n = status?.result?.counts?.modelCalls ?? 0
  return n > 0 ? `Checked ${n} new email${n === 1 ? "" : "s"} this time; each scan handles a few at a time.` : "Each scan handles a few new emails at a time."
}

const stateCopy = (state: ScanPanelState, settings: ScanSettings, gmail: GmailState, status: ScanStatus | null, autoActive: boolean): [string, string] => {
  switch (state) {
    case "loading": return ["Loading scan status…", "Checking saved settings and the Gmail connection."]
    case "processing": return ["Checking permitted Gmail…", "Counts update when the batch finishes. You can keep reviewing."]
    case "missing-sources": return ["Nothing to check", "Add a sender, domain or category to check in Settings. Until then nothing is processed."]
    case "paused": return settings.consent ? ["Scanning paused", "Resume in Settings to run a manual check."] : ["Scanning consent needed", "Give scanning consent in Settings before a manual check."]
    case "disconnected": return gmail === "reconnect_required" ? ["Reconnect Gmail", "Gmail access is no longer valid. Reconnect in Settings → Connections."] : gmail === "unknown" ? ["Gmail status unavailable", "Could not confirm the Gmail connection. Reload, or check Settings → Connections."] : ["Gmail not connected", "Connect Gmail in Settings → Connections. No mailbox was accessed."]
    case "cooldown": return ["Cooling down", autoActive ? (status?.backlog ? "Scanning continues automatically when the timer finishes." : "The next automatic check starts a minute after this one finished.") : "You can scan again when the timer finishes."]
    case "partial": return ["More email to check", status?.result?.error === "STORAGE_PROVIDER_LIMIT"
      ? `The AI service's per-minute limit was reached. ${autoActive ? "Scanning continues automatically in about a minute." : "Wait a minute, then scan again."}`
      : `${partialDetail(status)} ${autoActive ? "Continuing automatically." : "Scan again when you're ready to continue."}`]
    case "daily-limit": return ["Daily limit reached", "Today's AI allowance is used up, so scanning stops here. It resets at midnight UTC; saved results remain available."]
    case "failed": return status?.result?.error ? ["Last check stopped", `${scanStopMessage(status.result.error)} Saved results remain available.`] : ["Scan status unavailable", "Could not load scan status. Saved tasks below are unaffected."]
    case "empty": return ["Ready for your first scan", autoActive ? "The first check starts automatically." : ""]
    default: return [autoActive ? "Watching for new email" : "Ready to scan", autoActive ? "Checks again every minute while the app is open." : ""]
  }
}

// Whether the latest check covered the full past 7 days or only email since the
// previous complete check (incremental window, with a few minutes of overlap).
const coveredFullWeek = (status: ScanStatus | null) => {
  const start = Date.parse(status?.windowStart ?? ""), end = Date.parse(status?.windowEnd ?? "")
  return Number.isNaN(start) || Number.isNaN(end) || end - start >= 7 * 86_400_000 - 60_000
}

// States that need you to do something always show the full panel.
const ATTENTION_STATES: ScanPanelState[] = ["missing-sources", "paused", "disconnected", "daily-limit", "failed"]

function PanelChevron({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button aria-expanded={open} aria-label={open ? "Hide scan details" : "Show scan details"} className="scan-panel-toggle" onClick={onToggle} type="button">
      <svg aria-hidden="true" className={open ? "is-open" : ""} height="16" viewBox="0 0 16 16" width="16">
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    </button>
  )
}

function RealScanStatus({ now, state, status, cooldownLeft, busy, scanning, settings, gmail, needsReconnect, activityOpen, onToggleActivity, onScan, onSettings, auto, panel }: {
  now: number
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
  auto: { on: boolean; halted: null | "user" | "stalled"; onStop: () => void }
  panel: { open: boolean; onToggle: () => void; newCount: number; trouble: boolean }
}) {
  // One button: it continues unfinished work when an earlier check left some,
  // otherwise it checks right now for email since the last complete check (the
  // full 7 days the first time, and after a settings change or reconnect).
  const resume = Boolean(status?.backlog) && !needsReconnect
  const [title, detail] = stateCopy(state, settings, gmail, status, auto.on && !auto.halted)
  const counts = status?.result?.counts
  const allowed = canScan(state) && !busy && !scanning && !status?.running
  const blocked = state === "missing-sources" || state === "paused" || state === "disconnected"
  const autoActive = auto.on && !auto.halted
  const compactable = autoActive && !ATTENTION_STATES.includes(state)

  // Automatic checks on and nothing to act on: one slim line, expandable.
  if (compactable && !panel.open) {
    const checking = state === "processing" || scanning || Boolean(status?.running)
    const when = status?.lastFinished ? (checkedAgo(status.lastFinished, now) ?? friendlyTime(status.lastFinished)) : null
    const skipped = skippedByCategories(status)
    const line = checking ? "Checking…" : panel.trouble ? "Having trouble reaching Gmail · retrying automatically" : when ? `Checked ${when}` : "Starting…"
    return (
      <section aria-label="Processing status" className="processing-status processing-status-compact">
        <div className="processing-status-copy" role="status">
          <span aria-hidden="true" className={`compact-dot${checking ? " is-checking" : panel.trouble ? " is-trouble" : ""}`} />
          <span><strong>Automatic checks on</strong> · {line}{panel.newCount > 0 ? <> · <span className="compact-new">{panel.newCount} new</span></> : null}{!checking && skipped > 0 ? <span className="compact-skipped"> · {skipped} skipped by your categories</span> : null}</span>
        </div>
        <div className="processing-status-actions">
          <button className="text-link" disabled={!allowed} onClick={() => onScan(resume ? "more" : "initial")} type="button">Check now</button>
          <PanelChevron onToggle={panel.onToggle} open={false} />
        </div>
      </section>
    )
  }
  return (
    <section aria-label="Processing status" className={`processing-status state-${state}`}>
      <div className="processing-status-copy">
        {state === "processing" ? <span className="manual-spinner" aria-hidden="true" />
          : state === "cooldown" ? <span className="manual-cooldown" aria-hidden="true" style={{ "--cooldown-progress": `${Math.min(100, (cooldownLeft / 30) * 100)}%` } as CSSProperties}><span>{cooldownLeft}</span></span>
            : <span className="status-pulse" />}
        <div role="status">
          <strong>{title}</strong>
          {detail && <span id="rd-scan-why">{detail}</span>}
          <span className="scan-last-checked">
            {checkedNoNewEmail(status) && status?.lastFinished
              ? `Checked ${checkedAgo(status.lastFinished, now) ?? friendlyTime(status.lastFinished)} · no new email`
              : <>
                {status?.lastSuccessful ? `Last scan ${friendlyTime(status.lastSuccessful)}` : "No scans yet"}
                {resume ? " · more email to process" : status?.lastSuccessful ? (coveredFullWeek(status) ? " · covered the past 7 days" : " · new email since the previous check") : ""}
              </>}
            {skippedByCategories(status) > 0 && ` · ${skippedByCategories(status)} skipped by your categories`}
          </span>
          {auto.on && (
            <span className="scan-last-checked">
              {auto.halted === "stalled" ? "Automatic checks paused: the last few made no progress or could not run. Press Scan now to try again."
                : auto.halted === "user" ? "Automatic checks stopped until you press Scan now or reopen the app."
                  : <>Automatic checks are on: when the app opens and every minute while it's open · <button className="text-link" onClick={auto.onStop}>Stop</button></>}
            </span>
          )}
        </div>
      </div>
      <div className="processing-status-actions">
        {blocked && <button className="text-link" onClick={onSettings}>Open Settings</button>}
        <button
          aria-describedby={allowed ? undefined : "rd-scan-why"}
          className="primary-button rd-scan-button"
          disabled={!allowed}
          onClick={() => onScan(resume ? "more" : "initial")}
          title={allowed ? (resume ? "Continue where the last check stopped" : "Check for new permitted Gmail right now") : title}
        >
          <Icon name="refresh" size={16} />
          {scanning || status?.running ? "Scanning…" : "Scan now"}
        </button>
        <button aria-expanded={activityOpen} className="text-link" onClick={onToggleActivity}>{activityOpen ? "Hide activity" : "View activity"}</button>
        {compactable && <PanelChevron onToggle={panel.onToggle} open />}
      </div>
      {activityOpen && (
        <div className="scan-activity">
          {counts ? <>
            <strong>Last batch</strong>
            <span>{counts.candidates ?? 0} candidates · {counts.permitted ?? 0} permitted · {counts.blocked ?? 0} excluded by your rules · {(counts.privateTopic ?? 0) + (counts.noTopicWord ?? 0)} skipped by topic words · {counts.prepared ?? 0} processed · {counts.reused ?? 0} reused without a model call · {counts.failed ?? 0} could not be processed · {counts.modelCalls ?? 0} model calls</span>
            {(counts.failed ?? 0) > 0 && <span>{(status?.result?.unresolved ?? 0) > 0 ? `${status?.result?.unresolved} messages stopped after repeated attempts; they are tried again after a settings change or Gmail reconnect, which rechecks the full 7 days. ` : ""}Other failed messages are retried by the next scan.</span>}
          </> : <><strong>No batch recorded</strong><span>Activity appears after your first manual check.</span></>}
          <span>{auto.on ? "Automatic checks run when the app opens and every minute while it's open, never with the app closed." : "Scans run only when you press Scan now; automatic checks are off."} The first check, and the first after a settings change or Gmail reconnect, covers the past 7 days; later checks cover email since the previous check. Each batch inspects up to 100 permitted messages and makes up to three model calls, within daily limits.</span>
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
                <button className="text-link" onClick={() => onSource(w)}>View details</button>
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

// onTurnIntoTask: Passive communication items only; opens the Create task form.
function SourceModal({ source, email, links, onClose, onTurnIntoTask }: { source: SourceView; email: string; links: TaskSourceLink[] | null; onClose: () => void; onTurnIntoTask?: () => void }) {
  // Tasks list their linked emails; any other item shows its one email in the same layout.
  const own = source.taskId ? (links ? links.filter((l) => l.taskId === source.taskId) : null)
    : [{ taskId: "", role: "source" as const, threadId: "", messageId: source.messageId, earlierMessage: false, sender: source.sender ?? null, subject: source.subject ?? null, sentAt: source.sentAt ?? null, quote: source.quote }]
  return (
    <Modal className="rd-source-modal" onClose={onClose} title="Source email" wide>
      <div className="email-details">
        <div><span>From</span><strong>{source.sender ?? "Unavailable"}</strong></div>
        <div><span>Subject</span><strong>{source.subject || "(no subject)"}</strong></div>
        <div><span>Received</span><strong>{formatWhen(source.sentAt) ?? "Unavailable"}</strong></div>
      </div>
      {source.summary && (
        <div className="excerpt rd-summary">
          <div className="rd-summary-head">
            <span>Executive summary</span>
            {source.extraction && <ConfidenceBadge category={String(source.extraction.category ?? "")} value={Number(source.extraction.classification_confidence ?? 0)} />}
          </div>
          <p>{source.summary}</p>
          {source.extraction?.topic_relevance === "uncertain" && <p className="rd-detail-meta">May be outside your selected topics.</p>}
        </div>
      )}
      <div className="rd-modal-body">
        <Embedded><TaskSourceEmails email={email} links={own} /></Embedded>
        {source.extraction && <Embedded><ExtractionReview extraction={source.extraction} /></Embedded>}
        <p className="form-hint">InboxToTask keeps only a short excerpt. Gmail opens the whole conversation, which can include messages your rules excluded.</p>
      </div>
      <div className="modal-actions">
        {onTurnIntoTask && <button className="secondary-button" onClick={onTurnIntoTask}>Turn into task</button>}
        <button className="primary-button" onClick={onClose}>Close</button>
      </div>
    </Modal>
  )
}

// "From the email" in the suggestion editors: sender, subject, sent time with its weekday,
// the saved excerpt and the deadline's original wording. Text only; nothing is fetched.
function EmailContextBlock({ context, wording, email }: { context: EmailContext; wording: string | null; email: string }) {
  const id = useId()
  return (
    <div className="rd-email-context" role="group" aria-labelledby={`${id}-head`}>
      <span id={`${id}-head`}>From the email</span>
      <dl>
        <div><dt>From</dt><dd>{context.sender ?? "Unavailable"}</dd></div>
        <div><dt>Subject</dt><dd>{context.subject || "(no subject)"}</dd></div>
        <div><dt>Sent</dt><dd>{sentLabel(context.sentAt, viewerZone) ?? "Unavailable"}</dd></div>
        {wording && <div><dt>Date wording</dt><dd>“{wording}”</dd></div>}
      </dl>
      <span id={`${id}-quote`} className="rd-email-context-label">Saved excerpt</span>
      {context.quote ? <blockquote aria-labelledby={`${id}-quote`}>{context.quote}</blockquote> : <p>The saved excerpt has expired.</p>}
      {context.messageId && <a className="rd-quiet-link" href={gmailConversationUrl(email, context.messageId)} target="_blank" rel="noopener noreferrer">
        Open in Gmail<span className="visually-hidden"> (opens in a new tab)</span></a>}
    </div>
  )
}

function EditFieldsModal({ editing, email, busy, onSave, onCancel }: { editing: Editing; email: string; busy: boolean; onSave: (fields: TaskFields) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(editing.fields))
  const [error, setError] = useState("")
  const set = (patch: Partial<Draft>) => { setDraft((d) => ({ ...d, ...patch })); setError("") }
  const adding = Boolean(editing.adding)
  const dateRequired = adding || editing.kind === "task"
  const ids = useId()
  // The email's own timing words; the fixed sentence for a typed date says nothing new.
  const original = editing.fields.deadline?.wording
  const wording = original && original !== USER_ENTERED_WORDING ? original : null
  const choices = useMemo(() => (adding ? dateChoicesFromNotes(editing.reasons ?? []) : []), [adding, editing.reasons])
  // The sent day is taken in the deadline's own time zone, as the scan does.
  const hint = editing.context ? sentDayHint(wording, editing.context.sentAt, editing.fields.deadline?.timeZone || viewerZone) : null
  const submit = () => {
    if (!draft.action.trim()) return setError("Enter the task action.")
    // Nothing reaches Active tasks without a deadline.
    if (adding && !draft.date) return setError("Add a due date before adding this task.")
    if (editing.kind === "task" && !draft.date) return setError("An active task needs a due date.")
    const fields = fieldsFromDraft(draft, editing.fields)
    if (!adding && canonical(fields) === canonical(editing.fields)) return setError("Change at least one value, or cancel.")
    onSave(fields)
  }
  return (
    <Modal className="rd-edit-modal" onClose={onCancel} title={adding ? "Review before adding" : editing.kind === "suggestion" ? "Edit suggestion" : "Edit task"}
      subtitle={adding ? "Check these values, then add the task. A task needs a due date." : undefined}>
      <form className="form-stack" onSubmit={(e) => { e.preventDefault(); submit() }}>
        {editing.context && <EmailContextBlock context={editing.context} wording={wording} email={email} />}
        {adding && editing.reasons && editing.reasons.length > 0 && <div className="rd-review-reasons" role="group" aria-label="What to check">
          <span>What to check</span>
          <ul>{editing.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>}
        {choices.length > 0 && <div className="rd-date-buttons" role="group" aria-labelledby={`${ids}-dates`}>
          <span id={`${ids}-dates`}>Dates mentioned</span>
          <div>{choices.map((c) => (
            <button type="button" key={c.date} className="secondary-button" aria-pressed={draft.date === c.date} disabled={busy}
              aria-label={`Use ${c.label} as the deadline date`} onClick={() => set({ date: c.date })}>Use {shortDateLabel(c.label)}</button>
          ))}</div>
        </div>}
        <label><span>Action</span><input value={draft.action} maxLength={350} disabled={busy} onChange={(e) => set({ action: e.target.value })} /></label>
        <label><span>{dateRequired ? "Deadline date" : "Deadline date (optional)"}</span><input type="date" aria-required={dateRequired} value={draft.date} disabled={busy}
          aria-describedby={hint ? `${ids}-hint` : undefined} onChange={(e) => set({ date: e.target.value })} /></label>
        {hint && <p className="form-hint" id={`${ids}-hint`}>{hint}</p>}
        <label><span>Time (optional; leave empty for date only)</span><input type="time" value={draft.time} disabled={busy || !draft.date} onChange={(e) => set({ time: e.target.value })} /></label>
        <label><span>Timing</span><select value={draft.boundary} disabled={busy || !draft.date} onChange={(e) => set({ boundary: e.target.value as Deadline["boundary"] })}>
          <option value="by">By</option><option value="before">Before</option><option value="on">On</option><option value="unspecified">Unspecified</option></select></label>
        <label><span>Condition (optional)</span><input value={draft.condition} maxLength={350} disabled={busy} onChange={(e) => set({ condition: e.target.value })} /></label>
        <label><span>Requirements (one per line)</span><textarea value={draft.requirements} disabled={busy} onChange={(e) => set({ requirements: e.target.value })} /></label>
        {editing.kind === "suggestion" && !adding && <p className="form-hint">The original suggestion is kept. Your edits are saved separately and used when you add the task.</p>}
        {error && <p className="inline-validation" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary-button" disabled={busy}>{busy ? "Saving…" : adding ? "Add task" : "Save changes"}</button>
        </div>
      </form>
    </Modal>
  )
}

function ChangeModal({ item, email, busy, onClose, onApprove, onDismiss, onRebase }: {
  item: ChangeItem; email: string; busy: boolean; onClose: () => void; onApprove: () => void; onDismiss: () => void; onRebase: () => void
}) {
  const c = item.row, current = item.target?.accepted_fields, cancel = c.kind === "cancel"
  // The proposing email, shown in the same history layout as the Source email dialog.
  const entry = [{ taskId: "", role: cancel ? "cancelled" as const : "updated" as const, threadId: "", messageId: item.messageId, earlierMessage: false,
    sender: item.source?.sender ?? null, subject: item.source?.subject ?? null, sentAt: item.source?.sent_at ?? null, quote: item.quote }]
  return (
    <Modal className="rd-source-modal" onClose={onClose} title={cancel ? "Review proposed cancellation" : "Review proposed edit"} wide>
      <div className="email-details">
        <div><span>Task</span><strong>{current?.action ?? c.baseline?.action ?? "Task unavailable"}</strong></div>
        <div><span>Change</span><strong>{cancel ? "Cancel this task" : "Edit task"}</strong></div>
        {c.reason && <div><span>Reason</span><span className="rd-plain">{c.reason}</span></div>}
      </div>
      <div className="rd-modal-body">
      {!cancel && (
        <table className="rd-change-table">
          <thead><tr><th scope="col">Field</th><th scope="col">Accepted when proposed</th><th scope="col">Proposed</th></tr></thead>
          <tbody>{(c.changed_fields ?? []).map((field: string) => (
            <tr key={field}><th scope="row">{field}</th><td>{fieldText(field, c.baseline?.[field])}</td><td>{fieldText(field, c.fields?.[field])}</td></tr>
          ))}</tbody>
        </table>
      )}
      {cancel && <p>If you approve, the task keeps its accepted values and is marked cancelled.</p>}
      {!item.open && <div className="deadline-review-warning"><strong>The task is no longer open</strong><span>This proposal cannot be applied. You can dismiss it.</span></div>}
      {item.stale && current && (
        <div className="deadline-review-warning">
          <strong>The task changed since this proposal</strong>
          <span>Current accepted values: {["action", "deadline", "condition"].map((f) => `${f}: ${fieldText(f, (current as any)[f])}`).join(" · ")}</span>
          <div><button className="secondary-button" disabled={busy} onClick={onRebase}>Compare with current task</button></div>
        </div>
      )}
      {!item.quote && <div className="deadline-review-warning"><strong>The saved excerpt has expired</strong><span>This proposal cannot be approved. You can dismiss it.</span></div>}
      <Embedded><TaskSourceEmails email={email} links={entry} /></Embedded>
      <p className="form-hint">Approving this change does not create or change any calendar entry. InboxToTask keeps only a short excerpt. Gmail opens the whole conversation, which can include messages your rules excluded.</p>
      </div>
      <div className="modal-actions">
        <button className="secondary-button" disabled={busy} onClick={onDismiss}>Dismiss proposal</button>
        <button className="primary-button" disabled={busy || !item.open || item.stale || !item.quote} onClick={onApprove}>{c.kind === "cancel" ? "Approve cancellation" : "Approve edit"}</button>
      </div>
    </Modal>
  )
}

// The question after a task change on a task with a Google Calendar event. It writes
// nothing itself; each button calls back to the dashboard.
function CalendarFollowUpModal({ followUp, busy, fallback, onClose, onMove, onReview, onRemove, onKeep }: {
  followUp: CalendarFollowUp; busy: boolean; fallback: CalendarDraft
  onClose: () => void; onMove: () => void; onReview: () => void; onRemove: () => void; onKeep: () => void
}) {
  const title = followUp.task.fields.action
  if (followUp.kind === "deadline") {
    const current = eventSummary(followUp.draft)
    const moved = followUp.draft ? oneClickMove(calendarDraftFrom(followUp.draft, fallback), followUp.deadline) : null
    return (
      <Modal onClose={onClose} title="Move your calendar event?">
        <div className="rd-followup-body">
          <p><strong>{endSentence(`Deadline updated to ${deadlineLabel(followUp.deadline)}`)}</strong> Move your calendar event?</p>
          <p className="rd-followup-task">{title}</p>
          {current && <p className="rd-cal-line"><Icon name="calendar" size={13} />Event now: {current}</p>}
        </div>
        <div className="modal-actions rd-followup-actions">
          <button className="secondary-button" disabled={busy} onClick={onKeep}>Keep current time</button>
          <button className="secondary-button" disabled={busy} onClick={onReview}>Review calendar event</button>
          {moved && <button className="primary-button" disabled={busy} onClick={onMove}>{busy ? "Moving…" : `Move to ${eventSummary(moved)}`}</button>}
        </div>
      </Modal>
    )
  }
  if (followUp.kind === "cancelled") return (
    <Modal onClose={onClose} title="Remove calendar event?">
      <div className="rd-followup-body">
        <p><strong>Task cancelled.</strong> Remove its calendar event too?</p>
        <p className="rd-followup-task">{title}</p>
      </div>
      <div className="modal-actions rd-followup-actions">
        <button className="secondary-button" disabled={busy} onClick={onKeep}>Keep</button>
        <button className="primary-button" disabled={busy} onClick={onRemove}>{busy ? "Removing…" : "Remove"}</button>
      </div>
    </Modal>
  )
  if (followUp.kind === "passive") return (
    <Modal onClose={onClose} title="Keep the calendar event?">
      <div className="rd-followup-body">
        <p>This task has an event in your Google Calendar. <strong>Keep or remove the event before moving the task back to Passive communication?</strong></p>
        <p className="rd-followup-task">{title}</p>
        <p className="form-hint">If you keep it, the event stays in Google Calendar and InboxToTask will no longer manage it.</p>
      </div>
      <div className="modal-actions rd-followup-actions">
        <button className="secondary-button" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="secondary-button" disabled={busy} onClick={onKeep}>Keep event and move back</button>
        <button className="primary-button" disabled={busy} onClick={onRemove}>{busy ? "Removing…" : "Remove event and move back"}</button>
      </div>
    </Modal>
  )
  return (
    <Modal onClose={onClose} title="Remove calendar event?">
      <div className="rd-followup-body">
        <p>This task has an event in your Google Calendar. <strong>Also remove its calendar event?</strong></p>
        <p className="rd-followup-task">{title}</p>
        <p className="form-hint">If you keep it, the event stays in Google Calendar and InboxToTask will no longer manage it.</p>
      </div>
      <div className="modal-actions rd-followup-actions">
        <button className="secondary-button" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="secondary-button" disabled={busy} onClick={onKeep}>Keep event and continue</button>
        <button className="primary-button" disabled={busy} onClick={onRemove}>{busy ? "Removing…" : "Remove event and continue"}</button>
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

// A small green dot before an unread card's title. The visually hidden word carries the
// meaning for screen readers, so color is never the only signal.
function UnreadDot() {
  return <><span aria-hidden="true" className="rd-unread-dot" /><span className="visually-hidden">Unread: </span></>
}
function NewBadge() {
  return <span className="rd-new-badge">New</span>
}
function NewCount({ n }: { n: number }) {
  return <span className="rd-new-count">· {n} new</span>
}
function NewDivider({ since }: { since: string | null }) {
  return <p className="rd-new-divider">{since ? `New since your last visit · ${friendlyTime(since)}` : "New since your last visit"}</p>
}

// IDs of saved items, to say what a finished check added.
function scanIds(s: Snapshot) {
  const m = buildDashboardModel(s, null)
  return {
    suggestions: [...m.suggestions, ...m.dismissed].map((x) => x.row.id as string),
    changes: [...m.changes, ...m.unresolvedChanges].map((x) => x.row.id as string),
    passive: m.information.map((x) => x.id as string),
  }
}
function scanSummaryBetween(before: ReturnType<typeof scanIds>, after: ReturnType<typeof scanIds>) {
  return scanSummary({
    suggestions: countAdded(new Set(before.suggestions), after.suggestions),
    changes: countAdded(new Set(before.changes), after.changes),
    passive: countAdded(new Set(before.passive), after.passive),
  })
}
