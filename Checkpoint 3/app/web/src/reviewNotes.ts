// Pure helpers for the "Review before adding" dialog: dates named in the scan's notes,
// the sent time with its weekday, and a hint for a relative day counted from the sent day.
// No network and no browser APIs beyond Intl, so Node tests can import this file.

export type DateChoice = { date: string; label: string }

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const MAX_CHOICES = 4

const pad = (n: number) => String(n).padStart(2, "0")
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

// A calendar date as a UTC timestamp, or null when the date does not exist (Feb 30).
function utcDay(y: number, m: number, d: number): Date | null {
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? t : null
}

// Dates written exactly like "Thu, Nov 19, 2026". The weekday must match the date.
const NOTE_DATE = /\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat), (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}), (\d{4})\b/g

export function dateChoicesFromNotes(notes: string[]): DateChoice[] {
  const out: DateChoice[] = []
  if (!Array.isArray(notes)) return out
  for (const note of notes) {
    if (typeof note !== "string") continue
    for (const m of note.matchAll(NOTE_DATE)) {
      const y = Number(m[4]), mo = MONTHS_SHORT.indexOf(m[2]) + 1, d = Number(m[3])
      const day = utcDay(y, mo, d)
      if (!day || WEEKDAYS_SHORT[day.getUTCDay()] !== m[1]) continue
      const date = isoOf(y, mo, d)
      if (out.some((c) => c.date === date)) continue
      out.push({ date, label: `${m[1]}, ${m[2]} ${d}, ${y}` })
      if (out.length >= MAX_CHOICES) return out
    }
  }
  return out
}

// "Fri, Nov 13" for a choice's button; the year is kept in DateChoice.label.
export const shortDateLabel = (label: string) => label.replace(/, \d{4}$/, "")

// The calendar day and clock time of an instant in a time zone, or null when either is invalid.
function localParts(sentAt: string | null | undefined, timeZone: string) {
  if (typeof sentAt !== "string" || !sentAt) return null
  const t = Date.parse(sentAt)
  if (Number.isNaN(t)) return null
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(new Date(t))
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
    const y = Number(get("year")), m = Number(get("month")), d = Number(get("day"))
    const day = utcDay(y, m, d)
    if (!day) return null
    return { y, m, d, weekday: day.getUTCDay(), clock: `${get("hour")}:${get("minute")} ${get("dayPeriod").toUpperCase()}` }
  } catch {
    return null
  }
}

// "Thursday, Nov 12, 2026 at 3:23 PM" in the given time zone, or null.
export function sentLabel(sentAt: string | null | undefined, timeZone: string): string | null {
  const p = localParts(sentAt, timeZone)
  return p ? `${WEEKDAYS_LONG[p.weekday]}, ${MONTHS_SHORT[p.m - 1]} ${p.d}, ${p.y} at ${p.clock}` : null
}

// Only "[by|before|on|due] [this|next] <weekday|today|tonight|tomorrow> [clock time]".
// Anything else ("the Friday after Thanksgiving", "Friday, November 20") gets no hint.
const CLOCK = String.raw`(?:(?:1[0-2]|0?[1-9])(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)|(?:[01]?\d|2[0-3]):[0-5]\d|noon|midnight)`
const RELATIVE_DAY = new RegExp(
  String.raw`^(?:(?:by|before|on|due)\s+)?(?:(this|next)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|today|tonight|tomorrow)(?:,?\s+(?:at\s+)?${CLOCK})?\.?$`,
  "i",
)

// `Sent Thursday, Nov 12. "by Friday" counted from that day is Fri, Nov 13.` or null.
// A weekday is the first such day on or after the sent day; "next" skips the sent day;
// tomorrow is the day after; today and tonight are the sent day. Never throws.
export function sentDayHint(wording: string | null | undefined, sentAt: string | null | undefined, timeZone: string): string | null {
  if (typeof wording !== "string") return null
  const text = wording.trim().replace(/\s+/g, " ")
  if (!text || text.length > 60) return null
  const match = RELATIVE_DAY.exec(text)
  if (!match) return null
  const modifier = match[1]?.toLowerCase(), word = match[2].toLowerCase()
  const relative = word === "today" || word === "tonight" || word === "tomorrow"
  if (relative && modifier) return null
  const sent = localParts(sentAt, timeZone)
  if (!sent) return null
  let offset: number
  if (word === "tomorrow") offset = 1
  else if (relative) offset = 0
  else {
    offset = (WEEKDAYS_LONG.findIndex((w) => w.toLowerCase() === word) - sent.weekday + 7) % 7
    if (modifier === "next" && offset === 0) offset = 7
    // A weekday named on the sent weekday with a clock time is that day only while the
    // time was still ahead when the email was sent; otherwise it is the next one. The scan
    // works that out from the exact times. Rather than risk disagreeing with it here, no
    // hint is shown for that one case.
    else if (offset === 0 && /\d|noon|midnight/i.test(text)) return null
  }
  const target = new Date(Date.UTC(sent.y, sent.m - 1, sent.d + offset))
  const ty = target.getUTCFullYear()
  const targetLabel = `${WEEKDAYS_SHORT[target.getUTCDay()]}, ${MONTHS_SHORT[target.getUTCMonth()]} ${target.getUTCDate()}${ty !== sent.y ? `, ${ty}` : ""}`
  return `Sent ${WEEKDAYS_LONG[sent.weekday]}, ${MONTHS_SHORT[sent.m - 1]} ${sent.d}. “${text}” counted from that day is ${targetLabel}.`
}
