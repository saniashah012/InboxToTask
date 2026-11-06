import { useState } from "react"
import type { StoredRow, TaskFields } from "./storageAdapter"
import { createCalendarExport, type CalendarDraft } from "./calendarExport"

// onDownloaded is optional: when given, the caller owns the confirmation and this panel shows no notice of its own.
export default function CalendarExport({ task, fields, close, onDownloaded }: { task: StoredRow; fields: TaskFields; close: () => void; onDownloaded?: () => void }) {
  const [draft, setDraft] = useState<CalendarDraft>(() => ({ taskId: task.id, title: fields.action,
    date: fields.deadline?.date ?? "", allDay: !fields.deadline?.time, time: fields.deadline?.time?.slice(0, 5) ?? "",
    timeZone: fields.deadline?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone, durationMinutes: 0 }))
  const [notice, setNotice] = useState("")
  let content = "", error = ""
  try { content = createCalendarExport(draft) } catch (err) { error = (err as Error).message }
  const update = (patch: Partial<CalendarDraft>) => { setDraft({ ...draft, ...patch }); setNotice("") }
  return <section className="storage-panel" aria-label="Calendar export preview"><h2>Export calendar file</h2>
    <p>Download an ICS file for manual import. Choose the destination calendar when importing. Imported entries must be managed in that calendar; InboxToTask cannot synchronize changes or undo imports. Repeated imports may create duplicates.</p>
    <p>Only the title and chosen schedule are included. Source excerpts and recipients are omitted.</p>
    {fields.condition && <p><strong>Task condition:</strong> {fields.condition}</p>}
    {fields.deadline && <p>Task timing: {fields.deadline.wording}. Choose when the calendar entry should start; a deadline does not establish its duration.</p>}
    <form className="storage-editor" onSubmit={(event) => {
      event.preventDefault()
      if (!content) return
      const url = URL.createObjectURL(new Blob([content], { type: "text/calendar;charset=utf-8" }))
      const link = document.createElement("a")
      link.href = url; link.download = `inboxtotask-${task.id}.ics`
      document.body.appendChild(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      if (onDownloaded) onDownloaded()
      else setNotice("Calendar file prepared. Save it, then import it into your chosen calendar.")
    }}>
      <label>Calendar title<input required maxLength={350} value={draft.title} onChange={(e) => update({ title: e.target.value })} /></label>
      <label>Entry type<select value={draft.allDay ? "all-day" : "timed"} onChange={(e) => update({ allDay: e.target.value === "all-day" })}>
        <option value="all-day">All-day</option><option value="timed">Timed</option></select></label>
      <label>Start date<input type="date" required value={draft.date} onChange={(e) => update({ date: e.target.value })} /></label>
      {!draft.allDay && <><label>Start time<input type="time" required value={draft.time} onChange={(e) => update({ time: e.target.value })} /></label>
        <label>Time zone<input required value={draft.timeZone} onChange={(e) => update({ timeZone: e.target.value })} /></label>
        <label>Duration (minutes)<input type="number" required min={1} max={1440} step={1} value={draft.durationMinutes || ""} onChange={(e) => update({ durationMinutes: Number(e.target.value) })} /></label>
        <p>The file records the chosen time as UTC; your calendar displays it in its own time zone.</p></>}
      {error ? <p role="status">{error}</p> : <p>Ready to export: {draft.title}, {draft.date}, {draft.allDay ? "all-day" : `${draft.time} (${draft.timeZone}), ${draft.durationMinutes} minutes`}.</p>}
      {notice && <p role="status">{notice}</p>}
      <div className="storage-actions"><button disabled={!content}>Download ICS</button><button type="button" onClick={close}>Cancel export</button></div>
    </form>
  </section>
}
