// Pure mapping from saved records (loadStorageSnapshot, gmail_task_source_links,
// gmail_scan_status) to what the designed dashboard shows. No network or React,
// so the offline suite can test it directly. Mirrors the filters ManualWorkspace
// already uses: only Gmail sources that are not deleted, only unexpired records.
import type { Deadline, Snapshot, StoredRow, TaskFields } from "./storageAdapter"

export type Tone = "red" | "orange" | "amber" | "neutral"

export type SourceLink = {
  taskId: string
  role: "created" | "updated" | "cancelled"
  threadId: string
  messageId: string
  sender: string | null
  subject: string | null
  sentAt: string | null
}

export type SuggestionItem = {
  row: StoredRow
  fields: TaskFields
  edited: boolean
  extraction?: StoredRow
  source?: StoredRow
  quote: string | null
  messageId: string | null
  sibling: { index: number; of: number } | null
}

export type ChangeItem = {
  row: StoredRow
  target?: StoredRow
  open: boolean
  stale: boolean
  extraction?: StoredRow
  source?: StoredRow
  quote: string | null
  messageId: string | null
}

export type TaskItem = {
  row: StoredRow
  fields: TaskFields
  cancelled: boolean
  primary?: SourceLink
  pendingChanges: number
}

export type WaitingItem = {
  row: StoredRow
  followups: StoredRow[]
  extraction?: StoredRow
  source?: StoredRow
  quote: string | null
  messageId: string | null
}

export type DashboardModel = {
  suggestions: SuggestionItem[]
  dismissed: SuggestionItem[]
  changes: ChangeItem[]
  unresolvedChanges: ChangeItem[]
  active: TaskItem[]
  closed: TaskItem[]
  waiting: WaitingItem[]
  information: StoredRow[]
}

export const emptySnapshot = (): Snapshot => ({
  tasks: [], suggestions: [], changes: [], sources: [], extractions: [],
  evidence: [], waiting: [], followups: [], preferences: [],
})

const time = (value: unknown) => {
  const parsed = typeof value === "string" ? Date.parse(value) : NaN
  return Number.isNaN(parsed) ? 0 : parsed
}

// Sort key that never invents a time: date-only deadlines sort as the end of that day.
export function deadlineSortKey(deadline: Deadline | null | undefined): string {
  if (!deadline?.date) return "9999-12-31T99:99"
  return `${deadline.date}T${deadline.time?.slice(0, 5) ?? "99:99"}`
}

export function buildDashboardModel(snapshot: Snapshot, links: SourceLink[] | null, now = new Date()): DashboardModel {
  const nowMs = now.getTime()
  const rows = (key: string) => snapshot[key] ?? []
  const sources = new Map(rows("sources").filter(s => s.namespace === "gmail" && !s.deleted_at).map(s => [s.id, s]))
  const extractions = new Map(rows("extractions").filter(e => sources.has(e.source_id)).map(e => [e.id, e]))
  const evidence = new Map(rows("evidence").map(e => [e.id, e]))
  const sourceOf = (extractionId: string) => sources.get(extractions.get(extractionId)?.source_id)
  const located = (row: StoredRow) => {
    const quote = evidence.get(row.evidence_id)
    const source = sourceOf(row.extraction_id)
    return {
      extraction: extractions.get(row.extraction_id),
      source,
      quote: typeof quote?.quote === "string" && quote.quote ? quote.quote : null,
      messageId: quote?.message_id ?? source?.message_id ?? null,
    }
  }
  const unexpired = (row: StoredRow) => !row.expires_at || time(row.expires_at) > nowMs

  const gmailSuggestions = rows("suggestions").filter(s => extractions.has(s.extraction_id) && unexpired(s))
  const pending = gmailSuggestions.filter(s => s.state === "pending")
  const siblingIds = new Map<string, string[]>()
  // Number siblings in the email's own item order, so "n of m" is stable across reloads.
  for (const s of [...pending].sort((a, b) => (a.item_index ?? 0) - (b.item_index ?? 0))) siblingIds.set(s.extraction_id, [...(siblingIds.get(s.extraction_id) ?? []), s.id])
  const suggestion = (row: StoredRow): SuggestionItem => {
    const group = siblingIds.get(row.extraction_id) ?? []
    return {
      row, fields: row.review_fields ?? row.fields, edited: Boolean(row.review_fields),
      ...located(row),
      sibling: row.state === "pending" && group.length > 1 ? { index: group.indexOf(row.id) + 1, of: group.length } : null,
    }
  }
  const byDeadline = (a: { fields: TaskFields; row: StoredRow }, b: { fields: TaskFields; row: StoredRow }) =>
    deadlineSortKey(a.fields.deadline).localeCompare(deadlineSortKey(b.fields.deadline)) || time(b.row.created_at) - time(a.row.created_at)

  const tasks = rows("tasks").filter(t => !t.deleted_at && t.accepted_fields && ["approved", "completed"].includes(t.status))
  const taskById = new Map(tasks.map(t => [t.id, t]))
  const changes = rows("changes").filter(c => extractions.has(c.extraction_id) && c.state === "pending" && unexpired(c))
  const changeItems = changes.map((row): ChangeItem => {
    const target = row.target_task_id ? taskById.get(row.target_task_id) : undefined
    const open = Boolean(target && target.status === "approved" && !target.cancelled_at)
    return { row, target, open, stale: open && target!.revision !== row.expected_revision, ...located(row) }
  })
  const pendingByTask = new Map<string, number>()
  for (const c of changeItems) if (c.row.target_task_id) pendingByTask.set(c.row.target_task_id, (pendingByTask.get(c.row.target_task_id) ?? 0) + 1)

  const primary = (taskId: string) => {
    const own = (links ?? []).filter(l => l.taskId === taskId)
    return own.find(l => l.role === "created") ?? own[0]
  }
  const taskItem = (row: StoredRow): TaskItem => ({
    row, fields: row.accepted_fields, cancelled: Boolean(row.cancelled_at),
    primary: primary(row.id), pendingChanges: pendingByTask.get(row.id) ?? 0,
  })
  const active = tasks.filter(t => t.status === "approved" && !t.cancelled_at).map(taskItem).sort(byDeadline)
  const closed = tasks.filter(t => t.status === "completed" || t.cancelled_at).map(taskItem)
    .sort((a, b) => time(b.row.completed_at ?? b.row.updated_at ?? b.row.created_at) - time(a.row.completed_at ?? a.row.updated_at ?? a.row.created_at))

  const followups = rows("followups")
  const waiting = rows("waiting").filter(w => extractions.has(w.extraction_id) && unexpired(w))
    .map((row): WaitingItem => ({ row, followups: followups.filter(f => f.waiting_for_id === row.id), ...located(row) }))
    .sort((a, b) => Number(Boolean(a.row.resolved)) - Number(Boolean(b.row.resolved))
      || deadlineSortKey(a.row.promised_deadline).localeCompare(deadlineSortKey(b.row.promised_deadline)))

  // A source can be re-extracted after task or settings changes. Show its newest summary once.
  const latest = new Map<string, StoredRow>()
  for (const e of extractions.values()) {
    const seen = latest.get(e.source_id)
    if (!seen || time(e.created_at) > time(seen.created_at)) latest.set(e.source_id, e)
  }
  // Passive communication is informational email only: the newest analysis must be
  // Passive (no owner obligation). Actionable emails' tasks appear under Tasks instead.
  const information = [...latest.values()].filter(e => e.category === "Passive" && e.summary && e.topic_relevance !== "irrelevant" && time(e.digest_expires_at) > nowMs)

  return {
    suggestions: pending.map(suggestion).sort(byDeadline),
    dismissed: gmailSuggestions.filter(s => s.state === "dismissed" || s.state === "rejected").map(suggestion)
      .sort((a, b) => time(b.row.created_at) - time(a.row.created_at)),
    changes: changeItems.filter(c => c.row.target_task_id),
    unresolvedChanges: changeItems.filter(c => !c.row.target_task_id),
    active, closed, waiting, information,
  }
}

const dayMs = 86_400_000
const utcDay = (date: string) => Date.parse(`${date}T00:00:00Z`)

// Today's date in the viewer's own calendar, as YYYY-MM-DD.
export function localDate(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function clock(time: string): string {
  const [h, m] = time.split(":").map(Number)
  if (!Number.isInteger(h) || !Number.isInteger(m)) return time
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "a.m." : "p.m."}`
}

// Labels for the designed task row. A date-only deadline gets no time; the
// stated time zone is shown when it differs from the viewer's.
export function deadlineDisplay(deadline: Deadline | null | undefined, today: string, viewerZone?: string) {
  if (!deadline?.date || Number.isNaN(utcDay(deadline.date))) {
    return { dateLabel: "No deadline", timeLabel: null as string | null, tone: "neutral" as Tone, status: "No deadline stated" }
  }
  const dateLabel = new Date(utcDay(deadline.date)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: deadline.date.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric", timeZone: "UTC" })
  const zone = viewerZone && deadline.timeZone && deadline.timeZone !== viewerZone ? ` (${deadline.timeZone})` : ""
  const timeLabel = deadline.time ? `${clock(deadline.time)}${zone}` : "Date only"
  const days = Math.round((utcDay(deadline.date) - utcDay(today)) / dayMs)
  const on = deadline.boundary === "on"
  const before = deadline.boundary === "before" ? "before " : ""
  let tone: Tone, status: string
  if (days < 0) { tone = "red"; status = on ? "Date has passed" : "Past due" }
  else if (days === 0) { tone = "orange"; status = on ? "Today" : `Due ${before}today` }
  else if (days === 1) { tone = "amber"; status = on ? "Tomorrow" : `Due ${before}tomorrow` }
  else if (days <= 7) { tone = "amber"; status = on ? `In ${days} days` : `Due ${before}in ${days} days` }
  else { tone = "neutral"; status = on ? "Upcoming" : "Upcoming deadline" }
  return { dateLabel, timeLabel, tone, status }
}

export function fieldText(field: string, value: unknown): string {
  if (value == null) return "Not specified"
  if (Array.isArray(value)) return value.length ? value.join("; ") : "None"
  if (field === "deadline" && typeof value === "object") {
    const d = value as Deadline
    const lead = d.boundary === "unspecified" ? "Due" : d.boundary[0].toUpperCase() + d.boundary.slice(1)
    return `${lead} ${d.date}${d.time ? ` ${d.time}` : " (date only)"} · ${d.timeZone}`
  }
  return String(value)
}

export type ScanStatusLike = {
  running: boolean
  backlog: boolean
  lastSuccessful: string | null
  cooldownUntil: string | null
  lastFinished?: string | null
  result: { error?: string | null; counts?: Record<string, number>; unresolved?: number } | null
}

export type ScanPanelState = "loading" | "failed" | "processing" | "cooldown" | "missing-sources" | "paused" | "disconnected" | "partial" | "daily-limit" | "ready" | "empty"

// Planned limits. The batch saved its work and stopped on purpose to bound model
// use, so these are not failures. With a saved backlog, more email is waiting.
// The per-minute AI limit is shared and resets each calendar minute.
export const BATCH_LIMIT_STOPS = ["SCAN_INFERENCE_LIMIT", "SCAN_TIME_LIMIT", "SCAN_RETRIEVAL_LIMIT", "STORAGE_PROVIDER_LIMIT"]
// The account's daily allowance: expected, but nothing more runs until it resets.
export const DAILY_LIMIT_STOP = "STORAGE_BUDGET"

// One state for the designed status bar. Order matters: a running scan wins,
// then a load failure, then reasons scanning is refused, then cooldown.
export function scanPanelState(input: {
  status: ScanStatusLike | null
  loadError: boolean
  scanning: boolean
  cooldownLeft: number
  blockers: { sources: boolean; consent: boolean; paused: boolean; gmail: boolean }
}): ScanPanelState {
  const { status, loadError, scanning, cooldownLeft, blockers } = input
  if (scanning || status?.running) return "processing"
  if (loadError) return "failed"
  if (!status) return "loading"
  if (blockers.sources) return "missing-sources"
  if (blockers.consent || blockers.paused) return "paused"
  if (blockers.gmail) return "disconnected"
  if (cooldownLeft > 0) return "cooldown"
  const error = status.result?.error
  if (error === DAILY_LIMIT_STOP) return "daily-limit"
  if (error && !BATCH_LIMIT_STOPS.includes(error)) return "failed"
  // "More email to check" only when the batch actually saved unscanned work.
  if (status.backlog) return "partial"
  if (!status.lastSuccessful) return "empty"
  return "ready"
}

export const canScan = (state: ScanPanelState) => ["ready", "empty", "failed", "partial", "daily-limit"].includes(state)

// Milliseconds until automatic scanning should start the next batch, or null when
// it should not: nothing is waiting, or the last batch stopped for a reason a
// retry will not fix. The caller also checks canScan and the saved preference.
export function autoContinueDelay(status: ScanStatusLike | null, now: number): number | null {
  if (!status || status.running || !status.backlog) return null
  const error = status.result?.error ?? null
  if (error && !BATCH_LIMIT_STOPS.includes(error)) return null
  const cooldown = status.cooldownUntil ? Date.parse(status.cooldownUntil) : 0
  let at = Number.isNaN(cooldown) ? now : cooldown
  if (error === "STORAGE_PROVIDER_LIMIT") {
    // Wait for the next calendar minute, plus a moment for clock differences.
    const finished = status.lastFinished ? Date.parse(status.lastFinished) : now
    at = Math.max(at, (Math.floor((Number.isNaN(finished) ? now : finished) / 60_000) + 1) * 60_000 + 2_000)
  }
  return Math.max(0, at - now)
}

// Automatic checks while the app is open start a new check this long after the
// previous one finished.
export const AUTO_CHECK_INTERVAL_MS = 60_000

// The next automatic check: which mode and how many milliseconds from now, or null
// when none should start. A saved backlog is always continued first ("more"), never
// replaced by a new check. Otherwise a new ("initial") check starts right away when
// the page has just opened (after any cooldown), or one interval after the last
// check finished. Stop codes other than planned per-batch limits (daily limit,
// reconnect, failures) end automatic checks until the next manual Scan now. The
// caller also checks the saved preference, Stop, stalls and blockers.
// Passing problems reaching Gmail or the AI service. Nothing for you to do: automatic
// checks keep retrying them, waiting longer each time (30 s, 1 min, 2 min, then every
// 5 min), and never stop for them. After TROUBLE_AFTER failures in a row the compact
// status line says it is having trouble, but checks continue.
export const TRANSIENT_STOPS = ["GMAIL_UNAVAILABLE", "GMAIL_TIMEOUT", "GMAIL_SERVER_ERROR", "GMAIL_RATE_LIMITED", "PROVIDER_HTTP_429"]
export const TROUBLE_AFTER = 3
export const TRANSIENT_RETRY_MS = 30_000
export const MAX_RETRY_MS = 5 * 60_000
export const transientRetryDelay = (failuresInARow: number) => Math.min(MAX_RETRY_MS, TRANSIENT_RETRY_MS * 2 ** Math.max(0, failuresInARow))

// Whether the status panel should hide this stop: a passing problem that automatic
// checks are retrying on their own.
export function quietStop(status: ScanStatusLike | null, autoActive: boolean): boolean {
  const error = status?.result?.error ?? null
  return autoActive && !!error && TRANSIENT_STOPS.includes(error)
}

export function autoNextCheck(status: ScanStatusLike | null, now: number, firstOnPage: boolean, quietRetries = 0): { mode: "initial" | "more"; delay: number } | null {
  if (!status || status.running) return null
  const stop = status.result?.error ?? null
  if (stop && TRANSIENT_STOPS.includes(stop)) {
    const parse = (iso: string | null | undefined) => { const t = iso ? Date.parse(iso) : NaN; return Number.isNaN(t) ? null : t }
    const finished = parse(status.lastFinished)
    const at = Math.max(parse(status.cooldownUntil) ?? now, finished === null ? now : finished + transientRetryDelay(quietRetries))
    return { mode: status.backlog ? "more" : "initial", delay: Math.max(0, at - now) }
  }
  if (status.backlog) {
    const delay = autoContinueDelay(status, now)
    return delay === null ? null : { mode: "more", delay }
  }
  const error = status.result?.error ?? null
  if (error && !BATCH_LIMIT_STOPS.includes(error)) return null
  const parse = (iso: string | null | undefined) => { const t = iso ? Date.parse(iso) : NaN; return Number.isNaN(t) ? null : t }
  let at = parse(status.cooldownUntil) ?? now
  const finished = parse(status.lastFinished)
  if (!firstOnPage && finished !== null) at = Math.max(at, finished + AUTO_CHECK_INTERVAL_MS)
  return { mode: "initial", delay: Math.max(0, at - now) }
}

// A finished check that covered its whole window and found no new email: nothing
// processed for the first time and nothing failed. Reused messages come from the
// overlap with the previous check and were already handled.
export function checkedNoNewEmail(status: ScanStatusLike | null): boolean {
  if (!status || status.running || status.backlog || !status.lastFinished) return false
  const result = status.result
  if (!result || result.error) return false
  const c = result.counts ?? {}
  return (c.prepared ?? 0) - (c.reused ?? 0) <= 0 && (c.failed ?? 0) === 0
}

// Relative time for "Checked …": just now, then minutes, then hours, then null so
// the caller can fall back to a clock time.
export function checkedAgo(iso: string | null | undefined, now: number): string | null {
  const t = iso ? Date.parse(iso) : NaN
  if (Number.isNaN(t)) return null
  const minutes = Math.floor(Math.max(0, now - t) / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours} hr ago` : null
}

// Whether a finished batch moved the backlog forward. Repeated batches that do
// not stop automatic scanning, so a stuck message cannot loop forever.
export function batchMadeProgress(result: ScanStatusLike["result"]): boolean {
  const c = result?.counts ?? {}
  return ["prepared", "reused", "skipped", "privateTopic", "noTopicWord", "failed", "blocked"].some((k) => (c[k] ?? 0) > 0)
}
