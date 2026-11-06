import {useEffect,useRef,useState} from 'react'
import {supabase} from './supabase'
import {googleConnectionAction,googleConnectionStatus,type StoredRow} from './storageAdapter'
import {calendarStart} from './calendarExport'

type Draft={title:string;date:string;allDay:boolean;startTime:string;endDate:string;endTime:string;timeZone:string}
type Receipt={state?:string;eventUrl?:string;draft?:Partial<Draft>}
const scope='https://www.googleapis.com/auth/calendar.events.owned'
const draftKey=(userId:string)=>`itt-calendar-draft:${userId}`
function savedDraft(userId:string,taskId:string):{draft:Draft;revision:number}|null {
 try { const doc=JSON.parse(sessionStorage.getItem(draftKey(userId))??'null');
  return doc?.taskId===taskId && Date.now()-doc.savedAt<86400000 && doc.draft && Number.isSafeInteger(doc.revision)?doc:null
 } catch { return null }
}
export function calendarReviewPending(userId:string):boolean {
 try { const doc=JSON.parse(sessionStorage.getItem(draftKey(userId))??'null');return typeof doc?.taskId==='string'&&!!savedDraft(userId,doc.taskId) }
 catch { return false }
}
function initial(task:StoredRow):Draft {
 const fields=task.accepted_fields
 return {title:fields.action,date:fields.deadline?.date??'',allDay:!fields.deadline?.time,
  startTime:fields.deadline?.time?.slice(0,5)??'',endDate:fields.deadline?.date??'',endTime:'',
  timeZone:fields.deadline?.timeZone??Intl.DateTimeFormat().resolvedOptions().timeZone}
}
function validate(draft:Draft) {
 if (!draft.title.trim() || draft.title.length>350) return 'Enter a title of at most 350 characters.'
 if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return 'Choose a date. A missing task date is not filled automatically.'
 try {
  const start=calendarStart(draft.date,draft.allDay?'12:00':draft.startTime,draft.timeZone)
  if (!draft.allDay) {
   const end=calendarStart(draft.endDate,draft.endTime,draft.timeZone)
   if (end<=start || end.getTime()-start.getTime()>86400000) return 'Choose an end after the start, within 24 hours.'
  }
 } catch { return 'Check the date, times and IANA time zone. Skipped or repeated clock-change times need another choice.' }
 return ''
}
const messages:Record<string,string>={
 CALENDAR_DISABLED:'Calendar creation is not enabled in this backend.',
 GOOGLE_CALENDAR_SCOPE_REQUIRED:'Authorize Google Calendar, then review and confirm again.',
 GOOGLE_RECONNECT_REQUIRED:'Reconnect Google, then review and confirm again.',
 CALENDAR_BUSY:'This task has a Calendar request in progress. Wait briefly, then retry.',
 STALE_CALENDAR_TASK:'The task changed or is no longer eligible. Close this form and review the latest task.',
 CALENDAR_RETRY_ORIGINAL:'An earlier attempt is unresolved. Reload its saved draft before retrying.',
 CALENDAR_AUTH_OR_PERMISSION:'Google access could not be used. Check Calendar authorization and try again.',
 CALENDAR_RATE_LIMITED:'Google is limiting requests. Wait briefly before retrying.',
 INVALID_CALENDAR_DRAFT:'Check the title, dates, times and time zone.',
}

export default function TaskCalendarControl({task,userId}:{task:StoredRow;userId:string}) {
 const [open,setOpen]=useState(()=>!!savedDraft(userId,task.id))
 const [draft,setDraft]=useState<Draft>(()=>savedDraft(userId,task.id)?.draft??initial(task))
 const [revision,setRevision]=useState(()=>savedDraft(userId,task.id)?.revision??task.revision)
 const [receipt,setReceipt]=useState<Receipt>({}),[authorized,setAuthorized]=useState(false)
 const [busy,setBusy]=useState(false),[checking,setChecking]=useState(true)
 const [error,setError]=useState(()=>savedDraft(userId,task.id)&&new URL(window.location.href).searchParams.get('google')==='failed'
  ?'Google authorization was canceled or did not complete. Review your saved draft and try again.':'' )
 const live=useRef(true),running=useRef(false),dialog=useRef<HTMLDialogElement>(null)
 const locked=['executing','unknown'].includes(receipt.state??'')
 const eligible=task.status==='approved'&&!task.cancelled_at&&!task.deleted_at
 async function reload() {
  if (!supabase) throw new Error('Account connection is unavailable.')
  const [{data,error:failure},google]=await Promise.all([supabase.rpc('calendar_event_status',{p_task:task.id}),googleConnectionStatus()])
  if (failure) throw new Error('Calendar status could not load. Check the backend migration and retry.')
  if (!live.current) return
  setReceipt(data??{});setAuthorized(google.state==='connected'&&!!google.scopes?.includes(scope))
  if (['executing','unknown'].includes(data?.state) && data.draft) setDraft({...initial(task),...data.draft})
  if (data?.state==='succeeded') { setOpen(false);clearDraft() }
 }
 function clearDraft() { try { if(savedDraft(userId,task.id))sessionStorage.removeItem(draftKey(userId)) } catch { /* no sensitive data */ } }
 useEffect(()=>{live.current=true;void reload().catch(e=>{if(live.current)setError(e.message)}).finally(()=>{if(live.current)setChecking(false)});return()=>{live.current=false}},[userId,task.id])
 useEffect(()=>{
  if(open&&!dialog.current?.open)dialog.current?.showModal()
  if(!open&&dialog.current?.open)dialog.current?.close()
 },[open])
 useEffect(()=>{
  if (!open) return
  try { sessionStorage.setItem(draftKey(userId),JSON.stringify({taskId:task.id,revision,draft,savedAt:Date.now()})) } catch { /* authorization explicitly requires saving below */ }
 },[draft,revision,open,userId,task.id])
 function update(patch:Partial<Draft>) { setDraft(d=>({...d,...patch}));setError('') }
 function close() {if(running.current)return;setOpen(false);clearDraft()}
 async function authorize() {
  if(running.current)return
  running.current=true;setBusy(true);setError('')
  try {
   // Fail before redirect if this browser cannot retain the review draft.
   sessionStorage.setItem(draftKey(userId),JSON.stringify({taskId:task.id,revision,draft,savedAt:Date.now()}))
   const result=await googleConnectionAction('connect_calendar')
   if(!live.current)return
   const url=new URL(result.authorizationUrl??'')
   if(url.origin!=='https://accounts.google.com'||url.pathname!=='/o/oauth2/v2/auth')throw new Error('Invalid Google authorization destination.')
   window.location.assign(url.href)
  }catch {if(live.current)setError('Authorization could not start. Your edits remain here; check browser storage and Google connection setup.')}
  finally {running.current=false;if(live.current)setBusy(false)}
 }
 async function submit() {
  if(running.current||!supabase)return
  const problem=validate(draft);if(problem){setError(problem);return}
  running.current=true;setBusy(true);setError('')
  try {
   const payload=draft.allDay?{title:draft.title,date:draft.date,allDay:true,timeZone:draft.timeZone}:draft
   const {data,error:failure}=await supabase.functions.invoke('calendar_event',{body:{taskId:task.id,taskRevision:revision,draft:payload}})
   if(!live.current)return
   if(failure){let code='';try{code=(await failure.context?.json())?.error??''}catch{/* fixed errors */}throw new Error(messages[code]??'Calendar creation could not be confirmed. Your edits are preserved. Reload status and retry the saved attempt.')}
   if(data?.state!=='succeeded')throw new Error('Calendar creation could not be confirmed. Reload status before retrying.')
   await reload()
  }catch(e){if(live.current){setError((e as Error).message);try{await reload()}catch{/* preserve original error */}}}
  finally{running.current=false;if(live.current)setBusy(false)}
 }
 const validUrl=receipt.eventUrl&&/^https:\/\/(www\.)?google\.com\/calendar\//.test(receipt.eventUrl)?receipt.eventUrl:null
 return <>
  {receipt.state==='succeeded'&&validUrl?<a href={validUrl} target="_blank" rel="noopener noreferrer">View event</a>:eligible&&<button disabled={checking||busy} onClick={()=>{if(!savedDraft(userId,task.id)&&!locked){setDraft(initial(task));setRevision(task.revision)}setOpen(true)}}>Add to calendar</button>}
  {!open&&error&&<p role="alert">{error} <button onClick={()=>void reload().catch(e=>setError(e.message)).finally(()=>setChecking(false))}>Reload Calendar status</button></p>}
  <dialog className="task-calendar-dialog" ref={dialog} aria-labelledby={`calendar-title-${task.id}`} onCancel={e=>{e.preventDefault();close()}}>
   <form className="storage-editor" onSubmit={e=>{e.preventDefault();void submit()}}>
    <h2 id={`calendar-title-${task.id}`}>Review Google Calendar event</h2>
    <p>Destination: your primary Google calendar. Only the title and chosen schedule are sent. Task approval does not authorize this event.</p>
    {task.accepted_fields.condition&&<p>Task condition: {task.accepted_fields.condition}</p>}
    <p>A task deadline does not establish event duration. Choose the schedule below. This entry will not synchronize later task edits.</p>
    {locked&&<p role="status">An earlier attempt may have reached Google. Its submitted fields are locked until retry confirms the result.</p>}
    <fieldset disabled={busy||locked}><legend>Event details</legend>
     <label>Title<input required maxLength={350} value={draft.title} onChange={e=>update({title:e.target.value})}/></label>
     <label>Date<input required type="date" value={draft.date} onChange={e=>update({date:e.target.value})}/></label>
     <label><input type="checkbox" checked={draft.allDay} onChange={e=>update({allDay:e.target.checked})}/> All-day event</label>
     {!draft.allDay&&<><label>Start time<input required type="time" value={draft.startTime} onChange={e=>update({startTime:e.target.value})}/></label>
      <label>End date<input required type="date" value={draft.endDate} onChange={e=>update({endDate:e.target.value})}/></label>
      <label>End time<input required type="time" value={draft.endTime} onChange={e=>update({endTime:e.target.value})}/></label></>}
     <label>Time zone (IANA)<input required value={draft.timeZone} onChange={e=>update({timeZone:e.target.value})}/></label>
    </fieldset>
    <p>Google authorization is separate from creating an event. Returning from Google reopens this review and requires confirmation.</p>
    {(!authorized||error)&&<button type="button" disabled={busy||checking} onClick={()=>void authorize()}>{authorized?'Reconnect Google Calendar':'Authorize Google Calendar'}</button>}
    {error&&<p role="alert">{error}</p>}
    <div className="storage-actions"><button disabled={busy||checking||!authorized||!eligible}>{busy?'Working…':'Add to Google Calendar'}</button>
     <button type="button" disabled={busy} onClick={()=>void reload().catch(e=>setError(e.message))}>Reload status</button>
     <button type="button" disabled={busy} onClick={close}>Cancel</button></div>
   </form>
  </dialog>
 </>
}
