// Rules for the Google Calendar event form and the follow-ups after a task changes.
// Pure functions only, so the offline tests can import this file directly.
import type { Deadline, TaskFields } from "./storageAdapter"

export type Draft = { title: string; date: string; allDay: boolean; startTime: string; endDate: string; endTime: string; timeZone: string }

const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const pad = (n: number) => String(n).padStart(2, "0")
// Wall-clock arithmetic: the form works in the event's own time zone, so no zone math is needed.
const wall = (date: string, time: string) => Date.parse(`${date}T${time}:00Z`)

export function addMinutes(date: string, time: string, minutes: number): { date: string; time: string } | null {
  if (!DATE.test(date) || !TIME.test(time)) return null
  const at = new Date(wall(date, time) + minutes * 60000)
  if (Number.isNaN(at.getTime())) return null
  return { date: at.toISOString().slice(0, 10), time: `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}` }
}
export function minutesBetween(date: string, time: string, endDate: string, endTime: string): number | null {
  if (!DATE.test(date) || !TIME.test(time) || !DATE.test(endDate) || !TIME.test(endTime)) return null
  return Math.round((wall(endDate, endTime) - wall(date, time)) / 60000)
}
function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
}
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)
}

// What the form opens with. "All day" always starts unticked, so the app never chooses
// all-day for an email that only gave a date. The end is filled only when the task has
// a start: from the task's own end time, or else 30 minutes after the start.
export function initialDraft(fields: TaskFields, fallbackZone: string): Draft {
  const deadline = fields.deadline as (Deadline & { endTime?: string | null }) | null
  const date = deadline?.date ?? "", start = deadline?.time?.slice(0, 5) ?? ""
  const stated = deadline?.endTime?.slice(0, 5) ?? ""
  const end = !start ? null : stated && (minutesBetween(date, start, date, stated) ?? 0) > 0 ? { date, time: stated } : addMinutes(date, start, 30)
  return { title: fields.action, date, allDay: false, startTime: start, endDate: end?.date ?? date, endTime: end?.time ?? "", timeZone: deadline?.timeZone || fallbackZone }
}

// Applies one edit. The end date follows a changed date until the user sets it. When the
// form opened with times filled in, the end also follows a changed start, keeping the
// event's length, until the user edits the end.
export function applyEdit(draft: Draft, patch: Partial<Draft>, follow: { endFollowsStart: boolean; endDateFollowsDate: boolean }): Draft {
  const next = { ...draft, ...patch }
  const length = minutesBetween(draft.date, draft.startTime, draft.endDate, draft.endTime)
  const startMoved = (patch.startTime !== undefined && patch.startTime !== draft.startTime) || (patch.date !== undefined && patch.date !== draft.date)
  if (follow.endFollowsStart && startMoved && length !== null && length > 0) {
    const end = addMinutes(next.date, next.startTime, length)
    if (end) return { ...next, endDate: end.date, endTime: end.time }
  }
  if (follow.endDateFollowsDate && patch.date !== undefined && patch.date !== draft.date && DATE.test(patch.date)) {
    const gap = DATE.test(draft.date) && DATE.test(draft.endDate) ? daysBetween(draft.date, draft.endDate) : 0
    next.endDate = addDays(patch.date, gap >= 0 && gap <= 1 ? gap : 0)
  }
  return next
}

// Required fields still blank; the create and save buttons stay disabled until none are.
export function missingFields(draft: Draft): Array<"title" | "date" | "startTime" | "endTime" | "endDate"> {
  const missing: Array<"title" | "date" | "startTime" | "endTime" | "endDate"> = []
  if (!draft.title.trim()) missing.push("title")
  if (!DATE.test(draft.date)) missing.push("date")
  if (!draft.allDay) {
    if (!TIME.test(draft.startTime)) missing.push("startTime")
    if (!TIME.test(draft.endTime)) missing.push("endTime")
    if (!DATE.test(draft.endDate)) missing.push("endDate")
  }
  return missing
}

// The backend's draft shape: an all-day event carries no times.
export function payloadOf(draft: Draft) {
  const title = draft.title.trim()
  return draft.allDay ? { title, date: draft.date, allDay: true, timeZone: draft.timeZone }
    : { title, date: draft.date, allDay: false, startTime: draft.startTime, endDate: draft.endDate, endTime: draft.endTime, timeZone: draft.timeZone }
}
// A stored or Google-read draft, completed for the form.
export function draftFrom(saved: Partial<Draft> | null | undefined, fallback: Draft): Draft {
  const date = saved?.date ?? fallback.date
  return {
    title: saved?.title ?? fallback.title, date, allDay: saved?.allDay ?? fallback.allDay,
    startTime: saved?.startTime ?? "", endDate: saved?.endDate ?? date, endTime: saved?.endTime ?? "",
    timeZone: saved?.timeZone || fallback.timeZone,
  }
}

const monthDay = (date: string) => DATE.test(date)
  ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`)) : ""
function clock(time: string): { text: string; half: string } {
  const [h, m] = time.split(":").map(Number)
  return { text: `${h % 12 === 0 ? 12 : h % 12}:${pad(m)}`, half: h < 12 ? "a.m." : "p.m." }
}
export function timeRange(start: string, end: string): string {
  if (!TIME.test(start)) return ""
  const a = clock(start)
  if (!TIME.test(end)) return `${a.text} ${a.half}`
  const b = clock(end)
  return a.half === b.half ? `${a.text}–${b.text} ${b.half}` : `${a.text} ${a.half}–${b.text} ${b.half}`
}
// "Dec 1 · 3:00–3:30 p.m." or "Dec 1 · All day", for the task card and notices.
export function eventSummary(draft: Partial<Draft> | null | undefined): string {
  if (!draft?.date) return ""
  const day = monthDay(draft.date)
  if (draft.allDay) return `${day} · All day`
  const range = timeRange(draft.startTime ?? "", draft.endTime ?? "")
  return range ? `${day} · ${range}` : day
}

export function deadlineMoved(before: Deadline | null | undefined, after: Deadline | null | undefined): boolean {
  if (!after?.date) return false
  return (before?.date ?? "") !== after.date || (before?.time ?? "") !== (after.time ?? "")
}
export function deadlineLabel(deadline: Deadline): string {
  const day = DATE.test(deadline.date)
    ? new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${deadline.date}T00:00:00Z`)) : deadline.date
  const time = deadline.time ? timeRange(deadline.time.slice(0, 5), "") : ""
  return time ? `${day}, ${time}` : day
}

// The schedule a one-click "Move to …" would save, or null when it is not offered.
// Offered only when the deadline is when the thing happens (a meeting) and the change
// gives a time. The event keeps its current length unless the task states an end. A
// deadline something is due by or before gets no one-click: the event may be a work
// block placed earlier. An all-day event has no length to keep.
export function oneClickMove(event: Draft, deadline: Deadline & { endTime?: string | null }): Draft | null {
  if (deadline.boundary !== "on" || !deadline.time || event.allDay) return null
  const start = deadline.time.slice(0, 5)
  const stated = deadline.endTime?.slice(0, 5)
  const length = stated && (minutesBetween(deadline.date, start, deadline.date, stated) ?? 0) > 0
    ? minutesBetween(deadline.date, start, deadline.date, stated)
    : minutesBetween(event.date, event.startTime, event.endDate, event.endTime)
  const end = length && length > 0 ? addMinutes(deadline.date, start, length) : null
  if (!end) return null
  const moved = { ...event, date: deadline.date, startTime: start, endDate: end.date, endTime: end.time }
  return moved.date === event.date && moved.startTime === event.startTime && moved.endTime === event.endTime ? null : moved
}

// What "Review calendar event" opens with after a deadline change: the event's own
// times on the new date; the new time too when the deadline is the event's time.
export function reviewAfterDeadline(event: Draft, deadline: Deadline & { endTime?: string | null }): Draft {
  const moved = oneClickMove(event, deadline)
  if (moved) return moved
  if (event.allDay) return { ...event, date: deadline.date, endDate: deadline.date }
  const length = minutesBetween(event.date, event.startTime, event.endDate, event.endTime)
  const end = length && length > 0 ? addMinutes(deadline.date, event.startTime, length) : null
  return { ...event, date: deadline.date, endDate: end?.date ?? deadline.date, endTime: end?.time ?? event.endTime }
}
