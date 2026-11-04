import type { ScanState } from "./demoData"

export type PreviewGmailAccount = {
  email: string
}

export type PreviewCalendarEvent = {
  id: string
}

export type PreviewCalendarEventDraft = {
  title: string
  calendar: string
  allDay: boolean
  startDate: string
  endDate: string
  startTime?: string
  duration?: string
  timeZone: string
}

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))

let nextScanFails = false
let lastScanCompletedAt = 0

export const previewAdapter = {
  async connectGmail(): Promise<PreviewGmailAccount> {
    await delay(350)
    return { email: "maya.patel@example.com" }
  },

  async startProcessing(): Promise<ScanState> {
    await delay(500)
    return "ready"
  },

  async refreshProcessing(): Promise<ScanState> {
    await delay(900)
    if (nextScanFails) {
      nextScanFails = false
      return "failed"
    }

    const now = Date.now()
    if (now - lastScanCompletedAt < 3000) return "cooldown"
    lastScanCompletedAt = now
    return "empty"
  },

  simulateNextScanFailure() {
    nextScanFails = true
  },

  async connectGoogleCalendar(): Promise<PreviewGmailAccount> {
    await delay(350)
    return { email: "maya.patel@example.com" }
  },

  async createCalendarEvent(
    _draft: PreviewCalendarEventDraft,
    taskId: string,
  ): Promise<PreviewCalendarEvent> {
    await delay(500)
    return { id: `preview-${taskId}` }
  },
}
