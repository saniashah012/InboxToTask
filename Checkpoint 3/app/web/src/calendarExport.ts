export type CalendarDraft = {
  taskId: string
  title: string
  date: string
  allDay: boolean
  time: string
  timeZone: string
  durationMinutes: number
}

function dateValue(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Choose a valid date.")
  const value = new Date(`${date}T00:00:00Z`)
  if (!Number.isFinite(value.getTime()) || value.toISOString().slice(0, 10) !== date || Number(date.slice(0, 4)) < 1000) {
    throw new Error("Choose a valid date.")
  }
  return value
}

// Resolve a wall-clock time to UTC without silently shifting DST gaps or
// selecting one of two occurrences during a clock rollback.
export function calendarStart(date: string, time: string, timeZone: string) {
  dateValue(date)
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Choose a valid start time.")
  let formatter: Intl.DateTimeFormat
  try {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
  } catch { throw new Error("Choose a valid IANA time zone, such as America/Chicago.") }
  const wall = (instant: number) => {
    const parts = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]))
    return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second))
  }
  const target = Date.parse(`${date}T${time}:00Z`)
  const offsets = new Set<number>()
  for (let hours = -36; hours <= 36; hours += 6) {
    const probe = target + hours * 3600000
    offsets.add(wall(probe) - probe)
  }
  const matches = [...offsets].map((offset) => target - offset).filter((candidate) => wall(candidate) === target)
  if (matches.length !== 1) throw new Error("This time is skipped or repeated by a clock change. Choose another start time.")
  return new Date(matches[0])
}

const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
const text = (value: string) => value.replace(/\r\n|\r/g, "\n").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,")

// RFC 5545 limits content lines to 75 octets, including a continuation space.
function fold(line: string) {
  const encoder = new TextEncoder()
  let result = "", width = 0
  for (const char of line) {
    const bytes = encoder.encode(char).length
    if (width + bytes > 75) { result += "\r\n "; width = 1 }
    result += char; width += bytes
  }
  return result
}

export function createCalendarExport(draft: CalendarDraft, now = new Date()) {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(draft.taskId)) throw new Error("The task identity is invalid.")
  if (!draft.title.trim() || draft.title.length > 350 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(draft.title)) {
    throw new Error("Enter a title of at most 350 characters.")
  }
  const startDate = dateValue(draft.date)
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//InboxToTask//Task Export//EN", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT", `UID:task-${draft.taskId}@inboxtotask.invalid`, `DTSTAMP:${stamp(now)}`]
  if (draft.allDay) {
    const end = new Date(startDate.getTime() + 86400000)
    if (end.getUTCFullYear() > 9999) throw new Error("Choose an earlier date.")
    lines.push(`DTSTART;VALUE=DATE:${draft.date.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${end.toISOString().slice(0, 10).replace(/-/g, "")}`)
  } else {
    if (!Number.isInteger(draft.durationMinutes) || draft.durationMinutes < 1 || draft.durationMinutes > 1440) {
      throw new Error("Choose a duration between 1 and 1440 minutes.")
    }
    const start = calendarStart(draft.date, draft.time, draft.timeZone)
    const end = new Date(start.getTime() + draft.durationMinutes * 60000)
    if (end.getUTCFullYear() > 9999) throw new Error("Choose an earlier date.")
    lines.push(`DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`)
  }
  lines.push(`SUMMARY:${text(draft.title.trim())}`, "END:VEVENT", "END:VCALENDAR")
  return `${lines.map(fold).join("\r\n")}\r\n`
}
