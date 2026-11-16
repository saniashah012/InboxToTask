// Calls to the calendar_event function and the status read for the task cards.
// The contract is in Checkpoint 3/docs/calendar-behavior.md.
import { supabase } from "./supabase"
import type { Draft } from "./calendarForm"

export type CalendarEventState = "executing" | "unknown" | "failed" | "succeeded" | "updating" | "removing"
export type CalendarEventStatus = { taskId: string; state: CalendarEventState; eventUrl: string | null; draft: Partial<Draft> | null }
export type CalendarResult = { state: string; eventUrl?: string; draft?: Partial<Draft>; version?: string; reason?: string }
export type CalendarRequest =
  | { taskId: string; taskRevision: number; draft: object }
  | { action: "read"; taskId: string }
  | { action: "update"; taskId: string; version: string; draft: object }
  | { action: "remove"; taskId: string }

// A failure carries the backend's fixed code, never provider text.
export class CalendarError extends Error {
  code: string
  constructor(code: string) { super(calendarMessage(code)); this.code = code }
}

const messages: Record<string, string> = {
  CALENDAR_DISABLED: "Google Calendar is not enabled in this backend. You can download a calendar file instead.",
  GOOGLE_CALENDAR_SCOPE_REQUIRED: "Authorize Google Calendar to change this event.",
  GOOGLE_RECONNECT_REQUIRED: "Reconnect Google to change this event.",
  GOOGLE_CONNECTION_BUSY: "The Google connection is busy. Try again in a moment.",
  CALENDAR_BUSY: "A Calendar request for this task is in progress. Its status is checked again automatically.",
  STALE_CALENDAR_TASK: "The task changed or is no longer open. Close this and review the latest task.",
  CALENDAR_RETRY_ORIGINAL: "An earlier attempt is unresolved. Retry it with the details you confirmed.",
  CALENDAR_NOT_ADDED: "This task has no event in Google Calendar.",
  CALENDAR_EVENT_CHANGED: "This event changed in Google Calendar.",
  CALENDAR_AUTH_OR_PERMISSION: "Google access could not be used. Authorize Google Calendar and try again.",
  CALENDAR_RATE_LIMITED: "Google is limiting requests. Wait briefly before trying again.",
  CALENDAR_UNRESOLVED: "The event found in Google Calendar could not be confirmed as this task's. Nothing was changed.",
  CALENDAR_PROVIDER_UNAVAILABLE: "Google Calendar could not be reached, so the result is not confirmed.",
  INVALID_CALENDAR_DRAFT: "Check the title, dates and times.",
}
export function calendarMessage(code: string): string {
  return messages[code] ?? "The Calendar request could not be confirmed. Your entries are kept."
}
// Codes that mean the user has to authorize Calendar (again) before the action can run.
export const needsCalendarAuthorization = (code: string) =>
  ["GOOGLE_CALENDAR_SCOPE_REQUIRED", "GOOGLE_RECONNECT_REQUIRED", "CALENDAR_AUTH_OR_PERMISSION"].includes(code)

export async function calendarEventAction(body: CalendarRequest): Promise<CalendarResult> {
  if (!supabase) throw new CalendarError("CALENDAR_DISABLED")
  const { data, error } = await supabase.functions.invoke("calendar_event", { body })
  if (error) {
    let code = ""
    try { code = (await error.context?.json())?.error ?? "" } catch { /* fixed messages only */ }
    throw new CalendarError(code)
  }
  return data as CalendarResult
}

// Every task of the signed-in user that has an event, in one read. It needs no
// Calendar permission, so cards keep their line after Calendar is disconnected.
export async function loadCalendarStatuses(): Promise<Record<string, CalendarEventStatus>> {
  if (!supabase) return {}
  const { data, error } = await supabase.rpc("calendar_event_statuses")
  if (error) throw new Error("Calendar status could not load.")
  const byTask: Record<string, CalendarEventStatus> = {}
  for (const row of (data ?? []) as CalendarEventStatus[]) byTask[row.taskId] = row
  return byTask
}
