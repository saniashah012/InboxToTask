// "Turn into task" for a Passive communication email: the Create task form. It prefills
// from the email (./passiveTask) and hands the finished fields to the dashboard, which
// saves them. Nothing is saved here and nothing touches Google Calendar.
import { useId, useMemo, useState } from "react"
import { Modal } from "./designedUi"
import { applyStatedDate, draftFromPrefill, fieldsFromCreateDraft, prefillFromPassive, type CreateDraft, type StatedDate } from "./passiveTask"
import { sentLabel } from "./reviewNotes"
import type { StoredRow, TaskFields } from "./storageAdapter"

export type PassiveEmail = {
  subject: string | null
  sentAt: string | null
  summary: string | null
  quote: string | null
  extraction: StoredRow
}

// "Fri, Nov 20" for a calendar date, without inventing a time or shifting the day.
const dateLabel = (date: string) => {
  const t = Date.parse(`${date}T00:00:00Z`)
  return Number.isNaN(t) ? date : new Date(t).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
}
const clockLabel = (time: string) => {
  const [h, m] = time.split(":").map(Number)
  if (!Number.isInteger(h) || !Number.isInteger(m)) return time
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "a.m." : "p.m."}`
}
// What a stated date says, in words: "Fri, Nov 20, 2026 · 3:00 p.m.", "Fri, Nov 20, 2026 (date only)", "3:00 p.m. (no date)".
export function statedWhen(d: StatedDate, viewerZone: string): string {
  const zone = d.time && d.timeZone && d.timeZone !== viewerZone ? ` (${d.timeZone})` : ""
  if (d.date && d.time) return `${dateLabel(d.date)} · ${clockLabel(d.time)}${zone}`
  if (d.date) return `${dateLabel(d.date)} (date only)`
  return `${clockLabel(d.time ?? "")}${zone} (no date)`
}

export default function CreateTaskFromEmail({ email, timeZone, busy, onCancel, onSave }: {
  email: PassiveEmail
  timeZone: string
  busy: boolean
  onCancel: () => void
  // Resolves to a fixed error message when the save failed, or null when it succeeded.
  onSave: (fields: TaskFields) => Promise<string | null>
}) {
  const prefill = useMemo(() => prefillFromPassive({
    subject: email.subject, summary: email.summary, quote: email.quote, sentAt: email.sentAt,
    details: email.extraction.details ?? null, timeZone,
  }), [email.subject, email.summary, email.quote, email.sentAt, email.extraction, timeZone])
  const dates = prefill.dates
  const several = dates.length > 1
  const [draft, setDraft] = useState<CreateDraft>(() => draftFromPrefill(prefill))
  // The stated date the date and time came from: the only one when there is one, otherwise
  // the one the user chose. `applied` is what choosing it put in the form.
  const [chosen, setChosen] = useState<{ index: number; applied: CreateDraft } | null>(() =>
    dates.length === 1 ? { index: 0, applied: draftFromPrefill(prefill) } : null)
  const [error, setError] = useState("")
  const ids = useId()
  // The choice still describes the form only while its date and time are unchanged.
  const current = chosen && chosen.applied.date === draft.date && chosen.applied.time === draft.time ? chosen.index : null
  const set = (patch: Partial<CreateDraft>) => { setDraft((d) => ({ ...d, ...patch })); setError("") }
  const choose = (index: number) => {
    const next = applyStatedDate(draft, dates[index])
    setDraft(next); setChosen({ index, applied: next }); setError("")
  }
  const submit = async () => {
    if (busy) return
    if (!draft.title.trim()) return setError("Enter a task title.")
    const result = fieldsFromCreateDraft(draft, chosen ? dates[chosen.index] : null, timeZone)
    if (!result.ok) return setError(result.error)
    setError("")
    const failed = await onSave(result.fields)
    if (failed) setError(failed)
  }
  const single = dates.length === 1 && current === 0 ? dates[0] : null
  return (
    <Modal className="rd-create-modal" onClose={() => { if (!busy) onCancel() }} title="Create task" subtitle="Saving moves this item to Active tasks.">
      <form className="form-stack" noValidate onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <label><span>Task title</span>
          <input autoFocus required aria-required="true" value={draft.title} maxLength={350} disabled={busy} onChange={(e) => set({ title: e.target.value })} /></label>
        {several && (
          <fieldset className="rd-date-choices" disabled={busy}>
            <legend>This email mentions more than one date. Choose one for the due date, or enter your own.</legend>
            {dates.map((d, i) => (
              <label className="rd-date-choice" key={`${d.date}-${d.time}-${i}`}>
                <input type="radio" name="stated-date" checked={current === i} onChange={() => choose(i)} />
                <span>
                  <strong>{d.label}</strong>
                  <span className="rd-date-when">{statedWhen(d, timeZone)}</span>
                  {d.wording && <span className="rd-date-wording">“{d.wording}”</span>}
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <label><span>Due date</span>
          <input type="date" aria-required="true" value={draft.date} disabled={busy} onChange={(e) => set({ date: e.target.value })} /></label>
        {single?.date && single.wording && <p className="form-hint">From the email: “{single.wording}”</p>}
        <label><span>Time (optional)</span>
          <input type="time" value={draft.time} disabled={busy} aria-describedby={draft.time && !draft.date ? `${ids}-time` : undefined} onChange={(e) => set({ time: e.target.value })} /></label>
        {single && !single.date && single.wording && <p className="form-hint">From the email: “{single.wording}”</p>}
        {draft.time && !draft.date && <p className="form-hint" id={`${ids}-time`}>A time needs a date. Add a date to keep this time, or clear the time.</p>}
        <label><span>Description (optional)</span>
          <textarea value={draft.description} disabled={busy} rows={3} onChange={(e) => set({ description: e.target.value })} /></label>
        <div className="rd-create-source" role="group" aria-labelledby={`${ids}-source`}>
          <span id={`${ids}-source`}>From source email</span>
          <p>{email.summary || "Summary unavailable."}</p>
          <p>Sent {sentLabel(email.sentAt, timeZone) ?? "date unavailable"}</p>
          {email.quote ? <blockquote aria-label="Saved excerpt">{email.quote}</blockquote> : <p>The saved excerpt has expired.</p>}
        </div>
        {error && <p className="inline-validation" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save task"}</button>
        </div>
      </form>
    </Modal>
  )
}
