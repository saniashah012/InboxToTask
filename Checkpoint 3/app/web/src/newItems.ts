// "New" and "unread" marks for dashboard cards, remembered in this browser only.
//
// - New: the card was saved after your last visit to its tab. A visit ends when you
//   leave the tab, switch away from the app, or close it, after the tab was on screen
//   for at least VISIT_MS. Each tab's last visit is stored as the newest created_at it
//   showed (a server timestamp), so the browser clock never matters.
// - Unread: you have not opened the card's source email or acted on it yet. Suggestions
//   and proposed task updates keep their own seen list here; Passive communication keeps
//   using its Unread/Read marks in readMarks.ts.
//
// Keys are per signed-in user ID and hold record IDs and timestamps only, never email
// content. No network or React here, so the offline suite can test it directly.

export type NewItemsTab = "review" | "passive"

export type NewItemsState = {
  // Cards you have opened or acted on, as "s:<suggestion id>" or "c:<change id>".
  seen: string[]
  // Newest created_at shown during your last visit to each tab.
  review: string | null
  passive: string | null
}

export const VISIT_MS = 2000
export const MAX_SEEN = 2000

const storageKey = (userId: string) => `inboxtotask:new-items:${userId}`
const validTime = (value: unknown): value is string => typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value))

export const suggestionKey = (id: string) => `s:${id}`
export const changeKey = (id: string) => `c:${id}`

// null means this browser has never saved marks for the account.
export function loadNewItems(userId: string): NewItemsState | null {
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (raw === null) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return null
    return {
      seen: Array.isArray(parsed.seen) ? parsed.seen.filter((v: unknown): v is string => typeof v === "string" && v.length <= 110).slice(-MAX_SEEN) : [],
      review: validTime(parsed.review) ? parsed.review : null,
      passive: validTime(parsed.passive) ? parsed.passive : null,
    }
  } catch { return null }
}

export function saveNewItems(userId: string, state: NewItemsState) {
  try { window.localStorage.setItem(storageKey(userId), JSON.stringify(state)) } catch { /* storage unavailable: marks stay in memory */ }
}

// The newest valid timestamp, or null.
export function latest(times: Iterable<string | null | undefined>): string | null {
  let best: string | null = null
  for (const t of times) if (validTime(t) && (best === null || Date.parse(t) > Date.parse(best))) best = t
  return best
}

// First load in this browser: everything already there counts as seen and not new,
// so only cards saved from now on are marked.
export function initialState(reviewKeys: string[], reviewTimes: (string | null | undefined)[], passiveTimes: (string | null | undefined)[]): NewItemsState {
  return { seen: [...new Set(reviewKeys)].slice(-MAX_SEEN), review: latest(reviewTimes), passive: latest(passiveTimes) }
}

export function isNew(createdAt: string | null | undefined, lastVisit: string | null): boolean {
  return lastVisit !== null && validTime(createdAt) && Date.parse(createdAt) > Date.parse(lastVisit)
}

export function markSeen(state: NewItemsState, key: string): NewItemsState {
  if (state.seen.includes(key)) return state
  return { ...state, seen: [...state.seen, key].slice(-MAX_SEEN) }
}

// Ending a visit moves the tab's mark to the newest card it showed. It never moves back.
export function endVisit(state: NewItemsState, tab: NewItemsTab, shownTimes: (string | null | undefined)[]): NewItemsState {
  const next = latest([state[tab], ...shownTimes])
  return next === state[tab] ? state : { ...state, [tab]: next }
}

// How many IDs in `after` were not in `before`.
export function countAdded(before: Set<string>, after: Iterable<string>): number {
  let n = 0
  for (const id of after) if (!before.has(id)) n++
  return n
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const list = (parts: string[]) => parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`

export const NOTHING_ADDED = "No new items found."

// What a finished check added, in one sentence. Types with none are left out.
export function scanSummary(added: { suggestions: number; changes: number; passive: number }): string {
  const parts = [
    added.suggestions > 0 ? plural(added.suggestions, "new suggestion", "new suggestions") : "",
    added.changes > 0 ? plural(added.changes, "task update", "task updates") : "",
    added.passive > 0 ? plural(added.passive, "Passive communication summary", "Passive communication summaries") : "",
  ].filter(Boolean)
  return parts.length ? `Found ${list(parts)}.` : NOTHING_ADDED
}
