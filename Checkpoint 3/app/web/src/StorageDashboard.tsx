import { useCallback, useEffect, useRef, useState } from "react"
import type { Session } from "@supabase/supabase-js"
import { googleSignInEnabled, signInWithGoogle, loadStorageSnapshot, processStoredFixture, reviewStoredRecord, storageClient,
  type Deadline, type Snapshot, type StoredRow, type TaskFields } from "./storageAdapter"
import "./storage.css"
import CalendarExport from "./CalendarExportPanel"
import ExtractionReview from "./ExtractionReview"
import GoogleConnectionPanel from "./GoogleConnectionPanel"
import ScanSettingsPanel from "./ScanSettingsPanel"

const empty: Snapshot = { tasks: [], suggestions: [], extractions: [], evidence: [], sources: [], waiting: [], followups: [], preferences: [] }
const fieldsFor = (row: StoredRow): TaskFields => row.accepted_fields ?? row.review_fields ?? row.fields ?? {
  action: row.title ?? "", requirements: row.description ? [row.description] : [], condition: null, deadline: null,
}
function DeadlineText({ deadline }: { deadline: Deadline | null }) {
  return <p>{deadline ? `${deadline.boundary === "unspecified" ? "Due" : deadline.boundary} ${deadline.date}${deadline.time ? ` ${deadline.time}` : " (time unspecified)"} · ${deadline.timeZone}` : "No deadline specified"}
    {deadline && <small>Original timing: {deadline.wording}</small>}</p>
}
function FieldEditor({ initial, busy, save, cancel }: { initial: TaskFields; busy: boolean; save: (fields: TaskFields) => void; cancel: () => void }) {
  const [action, setAction] = useState(initial.action)
  const [requirements, setRequirements] = useState(initial.requirements.join("\n"))
  const [condition, setCondition] = useState(initial.condition ?? "")
  const [date, setDate] = useState(initial.deadline?.date ?? "")
  const [time, setTime] = useState(initial.deadline?.time ?? "")
  const [zone, setZone] = useState(initial.deadline?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [wording, setWording] = useState(initial.deadline?.wording ?? "")
  const [boundary, setBoundary] = useState<Deadline["boundary"]>(initial.deadline?.boundary ?? "unspecified")
  return <form className="storage-editor" onSubmit={(event) => {
    event.preventDefault(); save({ action: action.trim(), requirements: requirements.split("\n").map((s) => s.trim()).filter(Boolean),
      condition: condition.trim() || null, deadline: date ? { date, time: time || null, timeZone: zone, wording, boundary } : null })
  }}>
    <label>Action<input required maxLength={350} value={action} onChange={(e) => setAction(e.target.value)} /></label>
    <label>Requirements (one per line)<textarea value={requirements} onChange={(e) => setRequirements(e.target.value)} /></label>
    <label>Condition<textarea maxLength={350} value={condition} onChange={(e) => setCondition(e.target.value)} /></label>
    <div className="storage-fields"><label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label>Time (optional)<input type="time" disabled={!date} value={time} onChange={(e) => setTime(e.target.value)} /></label></div>
    {date && <><label>Time zone<input required value={zone} onChange={(e) => setZone(e.target.value)} /></label>
      <label>Timing wording<input required maxLength={250} value={wording} onChange={(e) => setWording(e.target.value)} /></label>
      <label>Boundary<select value={boundary} onChange={(e) => setBoundary(e.target.value as Deadline["boundary"])}>
        {['by','before','on','unspecified'].map((value) => <option key={value}>{value}</option>)}
      </select></label></>}
    <div className="storage-actions"><button disabled={busy}>Save changes</button><button type="button" onClick={cancel} disabled={busy}>Cancel</button></div>
  </form>
}

export default function StorageDashboard() {
  const [session, setSession] = useState<Session | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot>(empty)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [caseId, setCaseId] = useState("E01")
  const [tab, setTab] = useState("suggestions")
  const [editor, setEditor] = useState<{ kind: string; row: StoredRow } | null>(null)
  const [exportTaskId, setExportTaskId] = useState<string | null>(null)
  const [reminders, setReminders] = useState<Record<string, string>>({})
  const activeUser = useRef<string | null>(null)
  const generation = useRef(0)
  const reload = useCallback(async () => {
    const user = activeUser.current, epoch = ++generation.current
    if (!user) return
    setLoading(true)
    try {
      const result = await loadStorageSnapshot()
      if (activeUser.current === user && epoch === generation.current) setSnapshot(result)
    } catch (err) {
      if (activeUser.current === user && epoch === generation.current) setError((err as Error).message)
    } finally { if (epoch === generation.current) setLoading(false) }
  }, [])
  useEffect(() => {
    if (!storageClient) { setLoading(false); return }
    let live = true
    const apply = (next: Session | null) => {
      if (!live) return
      if (activeUser.current !== next?.user.id) {
        generation.current++; setSnapshot(empty); setEditor(null); setExportTaskId(null); setNotice(""); setError("")
      }
      activeUser.current = next?.user.id ?? null; setSession(next); setLoading(false)
    }
    const { data } = storageClient.auth.onAuthStateChange((_event, next) => apply(next))
    storageClient.auth.getSession().then(({ data, error: authError }) => {
      apply(data.session)
      if (live && window.location.pathname === "/storage/auth/callback") {
        if (authError || !data.session) setError("Google sign-in did not complete. Try again from the sign-in page.")
        window.history.replaceState(null, "", "/storage")
      }
    }).catch(() => { if (live) { setLoading(false); setError("Could not restore your sign-in session.") } })
    return () => { live = false; data.subscription.unsubscribe() }
  }, [])
  useEffect(() => { if (session) void reload() }, [session?.user.id, reload])

  const perform = async (operation: () => Promise<unknown>, message = "Saved.") => {
    const user = activeUser.current
    setBusy(true); setError(""); setNotice("")
    try {
      await operation()
      if (activeUser.current === user) { setNotice(message); setEditor(null); await reload() }
    } catch (err) { if (activeUser.current === user) setError((err as Error).message) }
    finally { setBusy(false) }
  }
  const review = (kind: string, row: StoredRow, action: string, fields: unknown = null) =>
    perform(() => reviewStoredRecord(kind, row.id, action, row.revision, fields))
  const evidence = (id: string) => snapshot.evidence.find((row) => row.id === id)?.quote

  if (!storageClient) return <main className="storage-page"><h1>InboxToTask</h1><p>The storage connection is not configured.</p><a href="/">Open preview</a></main>
  const client = storageClient
  if (!session) return <main className="storage-page"><h1>Sign in to InboxToTask</h1><p>Sign in to review your stored results. Signing in does not authorize Gmail scanning.</p>
    {error && <p role="alert">{error}</p>}
    {googleSignInEnabled && <button disabled={busy || loading} onClick={async () => {
      setBusy(true); setError("")
      try { await signInWithGoogle() } catch { setError("Google sign-in could not start. Check the provider configuration.") }
      finally { setBusy(false) }
    }}>Sign in with Google</button>}
    <form className="storage-editor" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError("")
      try {
        const { error } = await client.auth.signInWithPassword({ email, password })
        if (error) setError("Sign-in failed. Check the local account and connection.")
      } catch {
        setError("Sign-in failed. Check the local account and connection.")
      } finally { setPassword(""); setBusy(false) }
    }}><label>Email<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button></form><a href="/">Open preview</a></main>

  const suggestions = snapshot.suggestions.filter((row) => row.state === "pending")
  const activeTasks = snapshot.tasks.filter((row) => row.status !== "completed")
  const completed = snapshot.tasks.filter((row) => row.status === "completed")
  const dismissed = snapshot.suggestions.filter((row) => ["dismissed", "rejected"].includes(row.state))
  const digest = snapshot.extractions.filter((row) => row.category === "Passive" && row.summary && new Date(row.digest_expires_at) > new Date())
  return <main className="storage-page">
    <header><div><p className="storage-eyebrow">InboxToTask</p><h1>Your tasks and suggestions</h1><p>{session.user.email}</p></div>
      <button disabled={busy} onClick={async () => {
        setBusy(true); setError("")
        try {
          const { error } = await client.auth.signOut()
          if (error) setError("Sign-out failed. Check your connection and try again.")
        } catch { setError("Sign-out failed. Check your connection and try again.") }
        finally { setBusy(false) }
      }}>Sign out</button></header>
    {import.meta.env.VITE_GOOGLE_CONNECTION_ENABLED === "true" && <GoogleConnectionPanel key={session.user.id} />}
    <ScanSettingsPanel key={`scan-${session.user.id}`} />
    <section className="storage-panel"><h2>Test inbox</h2><p>Process a fictional email to test extraction and saved review decisions. Each new request may use model quota.</p>
      <div className="storage-actions"><label>Email<select value={caseId} disabled={busy} onChange={(e) => setCaseId(e.target.value)}>
        {Array.from({ length: 20 }, (_, i) => `E${String(i + 1).padStart(2, "0")}`).map((id) => <option key={id}>{id}</option>)}
      </select></label><button disabled={busy} onClick={() => void perform(async () => {
        const result = await processStoredFixture(caseId)
        setNotice(result.reused ? "Loaded the saved extraction without a model call." : "Extraction saved.")
      }, "Results are available below.")}>{busy ? "Working…" : "Process sample email"}</button>
      <button disabled={busy || loading} onClick={() => void reload()}>Reload</button>
      <button disabled={busy} onClick={() => void perform(() => reviewStoredRecord("processing", null,
        snapshot.preferences[0]?.enabled === false ? "resume" : "pause", 0))}>
        {snapshot.preferences[0]?.enabled === false ? "Resume processing" : "Pause processing"}</button></div>
    </section>
    {snapshot.activity?.[0] && <p className="storage-muted" aria-label="Processing activity">
      Saved extractions: {snapshot.activity[0].saved} · Running: {snapshot.activity[0].processing} · Failed: {snapshot.activity[0].failed} · Requests today: {snapshot.activity[0].requestsToday}
      {snapshot.activity[0].dailyRequests != null && ` / ${snapshot.activity[0].dailyRequests}`} · Reported or reserved tokens: {snapshot.activity[0].chargedOrReservedTokens}
    </p>}
    {error && <p className="storage-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <nav aria-label="Stored views" className="storage-actions">{[
      ["suggestions", `Suggestions (${suggestions.length})`], ["tasks", `Tasks (${activeTasks.length})`],
      ["completed", `Completed (${completed.length})`], ["digest", `Informational digest (${digest.filter((row) => row.needs_review).length} need review)`], ["waiting", "Waiting for"], ["dismissed", "Dismissed"],
    ].map(([id, label]) => <button key={id} aria-pressed={tab === id} onClick={() => { setTab(id); setEditor(null); setExportTaskId(null) }}>{label}</button>)}</nav>
    {loading && <p role="status">Loading saved records…</p>}
    <p className="storage-muted">Showing up to 200 records per view. Task approval does not create a calendar event.</p>
    {editor && <section className="storage-panel"><h2>Edit action</h2><FieldEditor key={editor.row.id} busy={busy} initial={fieldsFor(editor.row)}
      cancel={() => setEditor(null)} save={(fields) => void review(editor.kind, editor.row, "edit", fields)} /></section>}
    {(tab === "suggestions" || tab === "dismissed") && <section aria-label={tab}>
      {(tab === "suggestions" ? suggestions : dismissed).map((row) => {
        const doc = fieldsFor(row), extraction = snapshot.extractions.find((e) => e.id === row.extraction_id)
        return <article className="storage-panel" key={row.id}><h2>{doc.action}</h2>
          {row.target_task_id && <p>Proposed change to an existing task. Accepted values remain unchanged until approval.</p>}
          <DeadlineText deadline={doc.deadline} />{doc.condition && <p><strong>Conditional:</strong> {doc.condition}</p>}
          <ul>{doc.requirements.map((text, i) => <li key={i}>{text}</li>)}</ul>
          <ExtractionReview extraction={extraction} />
          <blockquote>{evidence(row.evidence_id) ?? "Supporting excerpt has expired or is unavailable."}</blockquote>
          <div className="storage-actions">{tab === "suggestions" ? <>
            <button disabled={busy} onClick={() => void review("suggestion", row, "approve")}>Approve</button>
            <button disabled={busy} onClick={() => setEditor({ kind: "suggestion", row })}>Edit</button>
            <button disabled={busy} onClick={() => void review("suggestion", row, "dismiss")}>Dismiss</button>
          </> : <button disabled={busy} onClick={() => void review("suggestion", row, "restore")}>Restore</button>}</div>
        </article>
      })}{!(tab === "suggestions" ? suggestions : dismissed).length && !loading && <p>No items in this view.</p>}
    </section>}
    {(tab === "tasks" || tab === "completed") && <section aria-label="Tasks">{(tab === "tasks" ? activeTasks : completed).map((row) => {
      const doc = fieldsFor(row)
      return <article key={row.id} className="storage-panel"><h2>{doc.action}</h2><DeadlineText deadline={doc.deadline} />
        {!row.accepted_fields && <p>Legacy task: edit and review its fields before approval. Original timestamp: {row.due_at ?? "unspecified"}.</p>}
        {doc.condition && <p><strong>Conditional:</strong> {doc.condition}</p>}<ul>{doc.requirements.map((text, i) => <li key={i}>{text}</li>)}</ul>
        {row.delete_after && <p>Eligible for cleanup: {new Date(row.delete_after).toLocaleString()}</p>}
        <div className="storage-actions"><button disabled={busy} onClick={() => setEditor({ kind: "task", row })}>Edit</button>
          {row.status === "approved" && <button disabled={busy} onClick={() => void review("task", row, "complete")}>Complete</button>}
          {row.status === "completed" && <button disabled={busy} onClick={() => void review("task", row, "undo")}>Undo completion</button>}
          {row.status === "pending" && <button disabled={busy || !row.accepted_fields} onClick={() => void review("task", row, "approve")}>Approve reviewed task</button>}
          {row.accepted_fields && ["approved", "completed"].includes(row.status) && <button disabled={busy} aria-expanded={exportTaskId === row.id}
            onClick={() => setExportTaskId(exportTaskId === row.id ? null : row.id)}>Export calendar file</button>}
          <button disabled={busy} onClick={() => void review("task", row, "delete")}>Delete</button></div>
        {exportTaskId === row.id && row.accepted_fields && ["approved", "completed"].includes(row.status) && <CalendarExport
          key={`${row.id}-${row.revision}`} task={row} fields={doc} close={() => setExportTaskId(null)} />}</article>
    })}{!(tab === "tasks" ? activeTasks : completed).length && !loading && <p>No tasks in this view.</p>}</section>}
    {tab === "digest" && <section aria-label="Informational digest">{digest.map((row) =>
      <article className="storage-panel" key={row.id}><p>{row.summary}</p><ExtractionReview extraction={row} />
        <blockquote>{snapshot.evidence.find((item) => item.extraction_id === row.id)?.quote ?? "Supporting excerpt has expired or is unavailable."}</blockquote>
        {row.needs_review && <p>No task is created from this message. Verify its meaning before deciding whether to act.</p>}
      </article>)}
      {!digest.length && !loading && <p>No informational messages saved.</p>}</section>}
    {tab === "waiting" && <section aria-label="Waiting for">{snapshot.waiting.map((row) => <article className="storage-panel" key={row.id}>
      <h2>{row.action}</h2><p>{row.external_owner} · {row.resolved ? "Resolved" : "Waiting"}</p><DeadlineText deadline={row.promised_deadline} />
      <ExtractionReview extraction={snapshot.extractions.find((item) => item.id === row.extraction_id)} />
      <blockquote>{evidence(row.evidence_id) ?? "Supporting excerpt has expired or is unavailable."}</blockquote>
      <button disabled={busy} onClick={() => void review("waiting", row, row.resolved ? "reopen" : "resolve")}>{row.resolved ? "Reopen" : "Mark resolved"}</button>
      {!row.resolved && snapshot.followups.filter((f) => f.waiting_for_id === row.id).map((followup) => <div key={followup.id}>
        <p><strong>Suggested follow-up:</strong> {followup.action}</p><p>{followup.recipient} · {followup.rationale}</p>
        {followup.confirmed_reminder_at && <p>Dashboard reminder: {new Date(followup.confirmed_reminder_at).toLocaleString()}</p>}
        <label>Reminder time ({Intl.DateTimeFormat().resolvedOptions().timeZone})<input type="datetime-local" value={reminders[followup.id] ?? ""}
          onChange={(e) => setReminders({ ...reminders, [followup.id]: e.target.value })} /></label>
        <button disabled={busy || !reminders[followup.id]} onClick={() => void review("followup", followup, "remind", {
          reminderAt: new Date(reminders[followup.id]).toISOString(),
        })}>Set dashboard reminder</button><p>No email is sent.</p></div>)}
    </article>)}{!snapshot.waiting.length && !loading && <p>No external commitments saved.</p>}</section>}
  </main>
}
