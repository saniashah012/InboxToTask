// "Turn into task" for informational (Passive) emails: prefill a Create task form from the
// email and turn the form into saved task fields. Pure: no React, no DOM, no network.
//
// Rules decided for this feature:
// - Never invent a date. A time with no date stays a time only; saving needs a date.
// - A task always has a due date: the form cannot be saved without one.
// - Several stated dates are all offered and none is preselected.
// - Location and links prefill the Description.
// - Saved fields satisfy private.valid_task_fields (action 1-350 chars, at most 12
//   requirements of 1-250 chars, deadline null or all five keys with a real date and
//   wording of 1-250 chars).
import type { Deadline, TaskFields } from "./storageAdapter"

export type StatedDate = { label: string; date: string | null; time: string | null; timeZone: string; wording: string; boundary: Deadline["boundary"]; source: "email" | "parsed" }
export type PassivePrefill = { title: string; dates: StatedDate[]; description: string }
export type PassiveInput = { subject: string | null; summary: string | null; quote: string | null; sentAt: string | null; details: unknown; timeZone: string }
export type CreateDraft = { title: string; date: string; time: string; description: string }

const MAX_DATES = 6
const MAX_LINKS = 5
const TITLE_MAX = 350
const LINE_MAX = 250
const MAX_LINES = 12
const WORDING_MAX = 250
const SUMMARY_TITLE_MAX = 80
const BOUNDARIES: readonly Deadline["boundary"][] = ["by", "before", "on", "unspecified"]
// Same wording the Edit task form saves for a deadline the user typed (fieldsFromDraft).
export const USER_ENTERED_WORDING = "Entered by you after reading the source email."

// ---------- small date helpers (calendar dates as "YYYY-MM-DD", no clock time) ----------

function isoFrom(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d) || y < 1 || y > 9999) return null
  const t = new Date(0)
  t.setUTCFullYear(y, m - 1, d)
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

function isRealDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  return !!m && isoFrom(Number(m[1]), Number(m[2]), Number(m[3])) === s
}

const isTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s)

function parts(iso: string): [number, number, number] {
  return [Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10))]
}

function dayOfWeek(iso: string): number {
  const [y, m, d] = parts(iso)
  const t = new Date(0)
  t.setUTCFullYear(y, m - 1, d)
  return t.getUTCDay()
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = parts(iso)
  const t = new Date(0)
  t.setUTCFullYear(y, m - 1, d + n)
  return isoFrom(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()) as string
}

function validZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true } catch { return false }
}

// The calendar date the email was sent on, as seen in timeZone. Null when unknown.
function localDate(sentAt: string | null, timeZone: string): string | null {
  if (!sentAt || !validZone(timeZone)) return null
  const t = new Date(sentAt)
  if (Number.isNaN(t.getTime())) return null
  const p = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(t)
  const get = (k: string) => Number(p.find((x) => x.type === k)?.value)
  return isoFrom(get("year"), get("month"), get("day"))
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n).trimEnd() : s)
const labelFor = (b: Deadline["boundary"]) => (b === "by" || b === "before" ? "Deadline" : "Date")

// ---------- details saved by the scan (untrusted shape) ----------

type Details = { title: string | null; dates: StatedDate[]; location: string | null; links: string[] }

function readDetails(raw: unknown, timeZone: string): Details | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
  const dates: StatedDate[] = []
  if (Array.isArray(r.dates)) {
    for (const item of r.dates) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue
      const d = item as Record<string, unknown>
      const date = typeof d.date === "string" && isRealDate(d.date) ? d.date : null
      const time = typeof d.time === "string" && isTime(d.time) ? d.time : null
      if (d.date != null && date === null) continue // a malformed date is dropped, not guessed
      if (d.time != null && time === null && date === null) continue
      if (!date && !time) continue
      const boundary = BOUNDARIES.includes(d.boundary as Deadline["boundary"]) ? (d.boundary as Deadline["boundary"]) : "unspecified"
      const label = clip(str(d.label) ?? labelFor(boundary), 80)
      const wording = clip(str(d.wording) ?? label, WORDING_MAX)
      dates.push({ label, date, time, timeZone: validZone(d.timeZone) ? d.timeZone : timeZone, wording, boundary, source: "email" })
    }
  }
  const links: string[] = []
  if (Array.isArray(r.links)) {
    for (const v of r.links) {
      const link = str(v)
      // Only web links, and only ones that fit one description line: a cut link would not work.
      if (link && /^https?:\/\/\S+$/i.test(link) && link.length <= LINE_MAX && !links.includes(link)) links.push(link)
      if (links.length === MAX_LINKS) break
    }
  }
  return { title: str(r.title), dates: dedupe(dates), location: str(r.location), links }
}

// ---------- fallback parser for older rows without details ----------
// Conservative on purpose: a missed date is fine, a wrong date is not.

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
const monthIndex = (name: string) => MONTHS.indexOf(name.toLowerCase().slice(0, 3)) + 1

type Span = { start: number; end: number }
type DateHit = Span & { date: string; dow?: number }
type TimeHit = Span & { time: string }

function nextOnOrAfter(today: string, month: number, day: number, year: string | undefined): string | null {
  if (year) return isoFrom(Number(year), month, day)
  const [y] = parts(today)
  const same = isoFrom(y, month, day)
  if (same && same >= today) return same
  // Try the following years so that February 29 finds the next leap year.
  for (let k = 1; k <= 8; k++) { const next = isoFrom(y + k, month, day); if (next) return next }
  return null
}

function findDates(s: string, today: string | null): DateHit[] {
  const explicit: DateHit[] = []
  let m: RegExpExecArray | null
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/g
  while ((m = iso.exec(s))) {
    const date = isoFrom(Number(m[1]), Number(m[2]), Number(m[3]))
    if (date) explicit.push({ start: m.index, end: m.index + m[0].length, date })
  }
  const monthDay = new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4})\\b)?`, "gi")
  while ((m = monthDay.exec(s))) {
    if (!m[3] && !today) continue
    const date = m[3] ? isoFrom(Number(m[3]), monthIndex(m[1]), Number(m[2])) : nextOnOrAfter(today as string, monthIndex(m[1]), Number(m[2]), undefined)
    if (date) explicit.push({ start: m.index, end: m.index + m[0].length, date })
  }
  const dayMonth = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b(?:,?\\s+(\\d{4})\\b)?`, "gi")
  while ((m = dayMonth.exec(s))) {
    if (!m[3] && !today) continue
    const date = m[3] ? isoFrom(Number(m[3]), monthIndex(m[2]), Number(m[1])) : nextOnOrAfter(today as string, monthIndex(m[2]), Number(m[1]), undefined)
    if (date) explicit.push({ start: m.index, end: m.index + m[0].length, date })
  }

  const relative: DateHit[] = []
  if (today) {
    const before = (i: number) => s.slice(Math.max(0, i - 12), i)
    // "Thursday" means the first Thursday on or after the sent date (the sent day itself
    // when the email was sent on a Thursday). "this Thursday" is the same. "next Thursday"
    // uses the same rule except that it is never the sent day itself: on a Thursday,
    // "next Thursday" cannot mean today, so it moves to the following week. On any other
    // day it is the coming Thursday; no week is added, because readers split on whether
    // "next" means this coming one or the one after, and a week added wrongly is worse
    // than a user correcting the date.
    const wd = /\b(?:(this|next)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi
    while ((m = wd.exec(s))) {
      // "last Friday", "every Friday" and "Friday's" are past or recurring: no single date.
      if (/\b(last|every|each|past|previous)\s+$/i.test(before(m.index)) || /^'s\b/i.test(s.slice(m.index + m[0].length))) continue
      const dow = WEEKDAYS.indexOf(m[2].toLowerCase())
      let delta = (dow - dayOfWeek(today) + 7) % 7
      if (m[1]?.toLowerCase() === "next" && delta === 0) delta = 7
      relative.push({ start: m.index, end: m.index + m[0].length, date: addDays(today, delta), dow })
    }
    const rel = /\b(today|tonight|tomorrow)\b/gi
    while ((m = rel.exec(s))) {
      if (/\b(after|before)\s+(the\s+day\s+)?$/i.test(s.slice(Math.max(0, m.index - 20), m.index)) && /tomorrow/i.test(m[1])) continue
      relative.push({ start: m.index, end: m.index + m[0].length, date: m[1].toLowerCase() === "tomorrow" ? addDays(today, 1) : today })
    }
  }

  // "Friday, November 20": one date. When the weekday disagrees with the date, keep neither.
  const dropped = new Set<DateHit>()
  for (const w of relative) {
    if (w.dow === undefined) continue
    const e = explicit.find((x) => x.start >= w.end && /^,?\s*(the\s+)?$/i.test(s.slice(w.end, x.start)))
    if (!e) continue
    dropped.add(w)
    if (dayOfWeek(e.date) === w.dow) e.start = w.start
    else dropped.add(e)
  }
  const all = [...explicit, ...relative].filter((x) => !dropped.has(x)).sort((a, b) => a.start - b.start || b.end - a.end)
  const kept: DateHit[] = []
  for (const h of all) if (!kept.some((k) => h.start < k.end && k.start < h.end)) kept.push(h)
  return kept
}

function findTimes(s: string, taken: Span[]): TimeHit[] {
  const hits: TimeHit[] = []
  const pad = (n: number) => String(n).padStart(2, "0")
  let m: RegExpExecArray | null
  const ampm = /\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*([ap])m\b/gi
  while ((m = ampm.exec(s))) {
    let h = Number(m[1]) % 12
    if (m[3].toLowerCase() === "p") h += 12
    hits.push({ start: m.index, end: m.index + m[0].length, time: `${pad(h)}:${m[2] ?? "00"}` })
  }
  // 24-hour times only when they cannot be a 12-hour time without am/pm ("3:30" alone is skipped).
  const h24 = /\b(0\d|1[3-9]|2[0-3]):([0-5]\d)\b/g
  while ((m = h24.exec(s))) hits.push({ start: m.index, end: m.index + m[0].length, time: `${m[1]}:${m[2]}` })
  const words = /\b(noon|midday|midnight)\b/gi
  while ((m = words.exec(s))) hits.push({ start: m.index, end: m.index + m[0].length, time: m[1].toLowerCase() === "midnight" ? "00:00" : "12:00" })
  const kept: TimeHit[] = []
  for (const h of hits.sort((a, b) => a.start - b.start || b.end - a.end)) {
    if (![...taken, ...kept].some((k) => h.start < k.end && k.start < h.end)) kept.push(h)
  }
  return kept
}

// The deadline word right before a date or time, if any.
function boundaryBefore(s: string, start: number): { boundary: Deadline["boundary"]; start: number } {
  const window = s.slice(Math.max(0, start - 30), start)
  const offset = Math.max(0, start - 30)
  const by = /\b(by|due(?:\s+(?:on|by))?|no later than|deadline(?:\s+is)?)\s+(?:(?:the|on|at)\s+)?$/i.exec(window)
  if (by) return { boundary: "by", start: offset + by.index }
  const bf = /\bbefore\s+(?:(?:the|on|at)\s+)?$/i.exec(window)
  if (bf) return { boundary: "before", start: offset + bf.index }
  return { boundary: "on", start }
}

function normalize(text: string): string {
  return text.replace(/\b([ap])\.\s?m\.?/gi, "$1m").replace(/\b(jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\./gi, "$1")
}

function parseText(text: string, today: string | null, timeZone: string): StatedDate[] {
  const out: StatedDate[] = []
  for (const sentence of normalize(text).split(/(?:[.!?;]+(?=\s|$)|\n)+/)) {
    const s = sentence.trim()
    if (!s) continue
    const dates = findDates(s, today)
    const times = findTimes(s, dates)
    const make = (d: DateHit | null, t: TimeHit | null) => {
      const lead = d ?? t as Span
      const b = boundaryBefore(s, Math.min(d?.start ?? Infinity, t?.start ?? Infinity))
      const start = Math.min(b.start, lead.start, t?.start ?? Infinity)
      const end = Math.max(d?.end ?? 0, t?.end ?? 0)
      out.push({ label: labelFor(b.boundary), date: d?.date ?? null, time: t?.time ?? null, timeZone, wording: clip(s.slice(start, end).trim(), WORDING_MAX), boundary: b.boundary, source: "parsed" })
    }
    if (!dates.length) { for (const t of times) make(null, t); continue }
    // Each time goes with the nearest date in the same sentence.
    const paired = new Map<DateHit, TimeHit[]>(dates.map((d) => [d, []]))
    for (const t of times) {
      const dist = (d: DateHit) => (t.start >= d.end ? t.start - d.end : d.start - t.end)
      const near = dates.reduce((a, b) => (dist(b) < dist(a) ? b : a))
      paired.get(near)!.push(t)
    }
    for (const d of dates) {
      const ts = paired.get(d)!
      if (!ts.length) make(d, null)
      for (const t of ts) make(d, t)
    }
  }
  return out
}

// Drops repeats: the same date and time; a date alone when that date also comes with a
// time; a time alone when that time also comes with a date.
function dedupe(list: StatedDate[]): StatedDate[] {
  const seen = new Set<string>()
  const unique = list.filter((d) => { const k = `${d.date}|${d.time}`; if (seen.has(k)) return false; seen.add(k); return true })
  return unique.filter((d) =>
    !(d.date && !d.time && unique.some((o) => o.date === d.date && o.time)) &&
    !(!d.date && d.time && unique.some((o) => o.time === d.time && o.date)))
}

// ---------- title ----------

const GENERIC_SUBJECTS = new Set([
  "school", "update", "updates", "reminder", "reminders", "hello", "hi", "hey", "fyi", "no subject", "info",
  "information", "important", "news", "newsletter", "announcement", "announcements", "notice", "question",
  "quick question", "follow up", "follow-up", "checking in", "hello there", "greetings", "thanks", "thank you",
])

function stripPrefixes(subject: string): string {
  let s = subject.trim()
  while (/^(re|fwd?|fw)\s*:\s*/i.test(s)) s = s.replace(/^(re|fwd?|fw)\s*:\s*/i, "")
  return s.trim()
}

export function isMeaningfulSubject(subject: string | null): boolean {
  if (!subject) return false
  const s = stripPrefixes(subject)
  const key = s.toLowerCase().replace(/^[\s(\[]+|[\s)\].!?:]+$/g, "")
  if (!key || GENERIC_SUBJECTS.has(key)) return false
  return /\s/.test(key) // one word is not meaningful
}

// What the summary is about, without who reported it or when it happens:
// "The sender informed you that the exam is scheduled for Thursday at 3:30 PM" -> "Exam",
// "Campus bake sale on Thursday, November 19 at 3:30 PM in the Union lobby" -> "Campus bake sale".
// The date and time have their own fields. Returns "" when nothing usable is left.
const WHEN_WORD = "(?:today|tonight|tomorrow|noon|midday|midnight|(?:sun|mon|tues|wednes|thurs|fri|satur)day|" +
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?\\s+\\d|" +
  "\\d{1,2}(?::\\d{2})?\\s*[ap]\\.?m|\\d{4}-\\d{2}-\\d{2})"
const REPORTED = /^(?:[Tt]he sender|[Tt]his email|[A-Z][\w.'-]*(?: [A-Z][\w.'-]*){0,3})\s+(?:has\s+|is\s+)?(?:informed|informs|informing|notified|notifies|notifying|told|tells|reminded|reminds|reminding|announced|announces|announcing|says|said|wrote|writes|let|lets)\s+(?:you\s+)?(?:know\s+)?(?:that\s+|about\s+)?/
const SCHEDULED = /\s+(?:is|are|was|were|will be|has been|have been)\s+(?:now\s+)?(?:scheduled|set|planned|held|happening|taking place)\b/i
const WHEN = new RegExp(`\\s+(?:(?:is|are|will be|starts?|begins?)\\s+)?(?:(?:on|at|by|before|from|until|starting|this|next)\\s+)*${WHEN_WORD}`, "i")
function subjectOfSummary(sentence: string): string {
  let s = sentence.replace(REPORTED, "")
  for (const cut of [SCHEDULED, WHEN]) { const m = cut.exec(s); if (m) s = s.slice(0, m.index) }
  s = s.replace(/^(?:the|an?)\s+/i, "").replace(/[\s,;:–-]+$/, "").trim()
  return s.length >= 3 ? s[0].toUpperCase() + s.slice(1) : ""
}

// A short title from the summary's first sentence, at most 80 characters.
function titleFromSummary(summary: string | null): string {
  const sentence = (summary ?? "").trim().split(/(?<=[.!?])\s+/)[0]?.replace(/[.!?]+$/, "").trim() ?? ""
  const first = subjectOfSummary(sentence) || sentence
  if (first.length <= SUMMARY_TITLE_MAX) return first
  const cut = first.slice(0, SUMMARY_TITLE_MAX)
  const space = cut.lastIndexOf(" ")
  return `${(space > 40 ? cut.slice(0, space) : cut).trimEnd()}…`
}

// ---------- public API ----------

export function prefillFromPassive(input: PassiveInput): PassivePrefill {
  const timeZone = input.timeZone
  const details = readDetails(input.details, timeZone)
  let dates = details?.dates ?? []
  if (!dates.length) {
    const today = localDate(input.sentAt, timeZone)
    const parsed: StatedDate[] = []
    for (const text of [input.summary, input.quote, input.subject ? stripPrefixes(input.subject) : null]) {
      if (text) parsed.push(...parseText(text, today, timeZone))
    }
    dates = dedupe(parsed)
  }
  let title = details?.title ?? ""
  if (!title && input.subject && isMeaningfulSubject(input.subject)) title = stripPrefixes(input.subject)
  if (!title) title = titleFromSummary(input.summary)
  const lines: string[] = []
  if (details?.location) lines.push(clip(`Location: ${details.location}`, LINE_MAX))
  if (details) lines.push(...details.links)
  return { title: clip(title, TITLE_MAX), dates: dates.slice(0, MAX_DATES), description: lines.join("\n") }
}

export function draftFromPrefill(prefill: PassivePrefill): CreateDraft {
  const one = prefill.dates.length === 1 ? prefill.dates[0] : null
  return { title: prefill.title, date: one?.date ?? "", time: one?.time ?? "", description: prefill.description }
}

// A dated choice sets the date and its time (or clears the time when it states none).
// A time-only choice sets the time and leaves the date as it is.
export function applyStatedDate(draft: CreateDraft, choice: StatedDate): CreateDraft {
  if (!choice.date) return { ...draft, time: choice.time ?? draft.time }
  return { ...draft, date: choice.date, time: choice.time ?? "" }
}

export function fieldsFromCreateDraft(draft: CreateDraft, chosen: StatedDate | null, timeZone: string): { ok: true; fields: TaskFields } | { ok: false; error: string } {
  const action = draft.title.trim()
  const date = draft.date.trim()
  const time = draft.time.trim()
  if (!action) return { ok: false, error: "Enter a task title." }
  if (action.length > TITLE_MAX) return { ok: false, error: "Keep the title to 350 characters or fewer." }
  if (time && !date) return { ok: false, error: "Add a date to keep this time." }
  // Nothing reaches Active tasks without a deadline.
  if (!date) return { ok: false, error: "Add a due date to save this task." }
  if (date && !isRealDate(date)) return { ok: false, error: "Enter a real date." }
  if (time && !isTime(time)) return { ok: false, error: "Enter a real time." }
  const requirements = draft.description.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (requirements.length > MAX_LINES) return { ok: false, error: "Keep the description to 12 lines or fewer." }
  if (requirements.some((l) => l.length > LINE_MAX)) return { ok: false, error: "Keep each description line to 250 characters or fewer." }
  let deadline: Deadline | null = null
  if (date) {
    const unchanged = chosen && chosen.date === date && (chosen.time ?? "") === time
    const wording = chosen?.wording.trim() ? clip(chosen.wording.trim(), WORDING_MAX) : ""
    deadline = unchanged && wording
      ? { date, time: time || null, timeZone: chosen.timeZone, wording, boundary: chosen.boundary }
      // Mirrors the Edit task form: fixed wording, the viewer's time zone, and the timing
      // already in the form (here the chosen date's, or "by" as in draftFrom).
      : { date, time: time || null, timeZone, wording: USER_ENTERED_WORDING, boundary: chosen?.boundary ?? "by" }
  }
  return { ok: true, fields: { action, requirements, condition: null, deadline } }
}
