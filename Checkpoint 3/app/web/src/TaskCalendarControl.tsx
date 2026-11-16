import {useEffect,useRef,useState,type ReactNode} from 'react'
import {supabase} from './supabase'
import {googleConnectionAction,googleConnectionStatus,type Deadline,type StoredRow} from './storageAdapter'
import {calendarStart} from './calendarExport'
import {applyEdit,deadlineLabel,draftFrom,eventSummary,initialDraft,missingFields,payloadOf,reviewAfterDeadline,type Draft} from './calendarForm'
import {calendarEventAction,calendarMessage,CalendarError,needsCalendarAuthorization} from './calendarApi'

// Calendar event creation is off unless this build and the backend both enable it.
// With it off, the dashboard offers only the calendar file download.
export const calendarEventsEnabled=import.meta.env.VITE_CALENDAR_EVENTS_ENABLED==='true'

type Receipt={state?:string;eventUrl?:string;draft?:Partial<Draft>}
type Mode='choose'|'google'|'file'
// The values and version of an update, kept so a lost update can be retried with the same values.
type Attempt={version:string;draft:ReturnType<typeof payloadOf>;form:Draft;savedAt:number}
type Saved={taskId:string;draft:Draft;revision:number;baseline?:Draft;savedAt:number}
const scope='https://www.googleapis.com/auth/calendar.events.owned'
const browserZone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone
const draftKey=(userId:string)=>`itt-calendar-draft:${userId}`
const attemptKey=(userId:string,taskId:string)=>`itt-calendar-update:${userId}:${taskId}`
function savedDraft(userId:string,taskId:string):Saved|null {
 try { const doc=JSON.parse(sessionStorage.getItem(draftKey(userId))??'null')
  return doc?.taskId===taskId && Date.now()-doc.savedAt<86400000 && doc.draft && Number.isSafeInteger(doc.revision)?doc:null
 } catch { return null }
}
// The task whose Calendar review was interrupted by Google authorization, if any.
export function pendingCalendarTask(userId:string):string|null {
 try { const doc=JSON.parse(sessionStorage.getItem(draftKey(userId))??'null')
  return typeof doc?.taskId==='string'&&savedDraft(userId,doc.taskId)?doc.taskId:null }
 catch { return null }
}
export function clearCalendarDraft(userId:string) { try { sessionStorage.removeItem(draftKey(userId)) } catch { /* nothing saved */ } }
export const calendarReviewPending=(userId:string)=>calendarEventsEnabled&&!!pendingCalendarTask(userId)
function loadAttempt(userId:string,taskId:string):Attempt|null {
 try { const doc=JSON.parse(sessionStorage.getItem(attemptKey(userId,taskId))??'null')
  return typeof doc?.version==='string'&&doc.draft&&doc.form?doc:null
 } catch { return null }
}
function keepAttempt(userId:string,taskId:string,attempt:Attempt) { try { sessionStorage.setItem(attemptKey(userId,taskId),JSON.stringify(attempt)) } catch { /* the backend still refuses different values */ } }
function clearAttempt(userId:string,taskId:string) { try { sessionStorage.removeItem(attemptKey(userId,taskId)) } catch { /* nothing saved */ } }
// Results after which Google may or may not have made the change; the saved attempt is kept for Retry.
const uncertain=(code:string)=>['','CALENDAR_BUSY','CALENDAR_RETRY_ORIGINAL','CALENDAR_PROVIDER_UNAVAILABLE','STALE_CALENDAR_OPERATION','CALENDAR_UNAVAILABLE'].includes(code)
const codeOf=(e:unknown)=>e instanceof CalendarError?e.code:''
const same=(a:Draft,b:Draft)=>JSON.stringify(payloadOf(a))===JSON.stringify(payloadOf(b))

// The time zone is not a field: it comes from the task, or else this browser, and is
// shown as text. A saved draft with an unusable zone falls back to the task's.
function zoneName(timeZone:string):string|null {
 try { return new Intl.DateTimeFormat('en-US',{timeZone,timeZoneName:'longGeneric'}).formatToParts(new Date()).find(p=>p.type==='timeZoneName')?.value??timeZone }
 catch { return null }
}
function validate(draft:Draft) {
 if (draft.title.trim().length>350) return 'Enter a title of at most 350 characters.'
 try {
  const start=calendarStart(draft.date,draft.allDay?'12:00':draft.startTime,draft.timeZone)
  if (!draft.allDay) {
   const end=calendarStart(draft.endDate,draft.endTime,draft.timeZone)
   if (end<=start || end.getTime()-start.getTime()>86400000) return 'Choose an end after the start, within 24 hours.'
  }
 } catch { return 'Check the date and times. A time skipped or repeated by a clock change needs another choice.' }
 return ''
}
// Create-specific wording; everything else uses the shared fixed messages.
const createMessages:Record<string,string>={
 GOOGLE_CALENDAR_SCOPE_REQUIRED:'Authorize Google Calendar, then review and confirm again.',
 GOOGLE_RECONNECT_REQUIRED:'Reconnect Google, then review and confirm again.',
 STALE_CALENDAR_TASK:'The task changed or is no longer eligible. Close this form and review the latest task.',
}
const createMessage=(code:string)=>createMessages[code]??(code?calendarMessage(code):'Calendar creation could not be confirmed. Your entries are kept.')

// Rendered inside the dashboard's calendar modal. Connected Calendar accounts go
// straight to the Google Calendar form; others choose between authorizing Google
// Calendar and downloading a calendar file. A task with an event opens Manage event.
export default function TaskCalendarControl({task,userId,fileExport,review,onAdded,onSaved,onRemoved,onStatusChange,onCancel}:{
 task:StoredRow;userId:string;fileExport:ReactNode
 review?:{deadline:Deadline}
 onAdded:()=>void;onSaved:(summary:string)=>void;onRemoved:()=>void;onStatusChange:()=>void;onCancel:()=>void}) {
 const fallback=()=>initialDraft(task.accepted_fields,browserZone())
 const withZone=(draft:Draft):Draft=>draft.timeZone&&zoneName(draft.timeZone)?draft:{...draft,timeZone:fallback().timeZone}
 const [resumed]=useState(()=>savedDraft(userId,task.id))
 // Edits made in Manage event before leaving for Google's consent screen, restored if the event is unchanged.
 const resumedEdits=useRef(resumed?.baseline?resumed:null)
 const [mode,setMode]=useState<Mode|null>(calendarEventsEnabled?(resumed?'google':null):'file')
 const [draft,setDraft]=useState<Draft>(()=>resumed?.draft?withZone(draftFrom(resumed.draft,fallback())):fallback())
 // The end follows a moved start only when the form opened with a start from the task.
 const follow=useRef({endFollowsStart:!resumed&&!!fallback().startTime,endDateFollowsDate:true})
 const [revision]=useState(()=>resumed?.revision??task.revision)
 const [receipt,setReceipt]=useState<Receipt>({}),[authorized,setAuthorized]=useState(false)
 const [email,setEmail]=useState('')
 // Manage event: Google's details as read (the baseline for "changed") and Google's version.
 const [baseline,setBaseline]=useState<Draft|null>(null),[version,setVersion]=useState<string|null>(null)
 const [unreadable,setUnreadable]=useState(false),[authNeeded,setAuthNeeded]=useState(false)
 const [changed,setChanged]=useState(false),[reviewShown,setReviewShown]=useState(false)
 const [busy,setBusy]=useState(false),[checking,setChecking]=useState(calendarEventsEnabled)
 const [notice,setNotice]=useState('')
 const [error,setError]=useState(()=>resumed&&new URL(window.location.href).searchParams.get('google')==='failed'
  ?'Google authorization was canceled or did not complete. Review your saved draft and try again.':'')
 const live=useRef(true),running=useRef(false),lastCheck=useRef(0),reviewOpen=useRef(true)
 const dirty=!!baseline&&!same(draft,baseline)
 // Automatic checks read these, so they see the current form rather than the first render's.
 const receiptRef=useRef(receipt),dirtyRef=useRef(dirty)
 receiptRef.current=receipt;dirtyRef.current=dirty
 // A request that started more than a lease ago and never settled is treated as lost.
 const [stalled,setStalled]=useState(false)
 const locked=['executing','unknown'].includes(receipt.state??'')
 const inProgress=['executing','updating','removing'].includes(receipt.state??'')
 // Lost: Google may or may not have made the change. Only a retry settles it.
 const lost=receipt.state==='unknown'||(receipt.state==='executing'&&stalled)
 const waiting=inProgress&&!lost
 const eligible=task.status==='approved'&&!task.cancelled_at&&!task.deleted_at
 const missing=missingFields(draft)

 // The event is gone from Google: say so and offer the Add form again.
 function markDeleted() {
  const fresh=fallback()
  setReceipt({});setDraft(fresh);setBaseline(null);setVersion(null);setChanged(false);setReviewShown(false);setUnreadable(false)
  follow.current={endFollowsStart:!!fresh.startTime,endDateFollowsDate:true}
  setNotice('This event was deleted in Google Calendar. You can add it again.')
  onStatusChange()
 }
 // Shows Google's current details in Manage event. Returns false when the form was not replaced.
 function showRead(read:Draft,readVersion:string,eventUrl:string|undefined,saved:Partial<Draft>|null|undefined) {
  let form=read
  const edits=resumedEdits.current;resumedEdits.current=null
  if (edits?.baseline&&same(withZone(draftFrom(edits.baseline,read)),read)) form=withZone(draftFrom(edits.draft,read))
  // The new deadline's schedule stays applied over every read (the dialog reads Google
  // more than once as it opens) until the user edits the form or loads Google's details.
  else if (review&&reviewOpen.current) { form=reviewAfterDeadline(read,review.deadline);setReviewShown(true) }
  if (edits) clearDraft()
  setReceipt({state:'succeeded',eventUrl,draft:read});setDraft(form);setBaseline(read);setVersion(readVersion)
  setUnreadable(false);setAuthNeeded(false);setChanged(false)
  follow.current={endFollowsStart:true,endDateFollowsDate:true}
  if (!same(read,draftFrom(saved,read))) onStatusChange()
 }
 // readGoogle=false keeps an open Manage form as it is (used after a failed save or by automatic checks while the user has edits).
 async function reload(readGoogle=true) {
  if (!supabase) throw new Error('Account connection is unavailable.')
  const [{data,error:failure},google]=await Promise.all([supabase.rpc('calendar_event_status',{p_task:task.id}),googleConnectionStatus()])
  if (failure) throw new Error('Calendar status could not load. Check the backend migration and retry.')
  if (!live.current) return
  const ok=google.state==='connected'&&!!google.scopes?.includes(scope)
  setEmail(google.state==='connected'?google.email??'':'')
  let current:Receipt=data??{}
  // Only an update that has not settled needs its saved values.
  if (current.state!=='updating') clearAttempt(userId,task.id)
  if (current.state==='succeeded'&&!readGoogle&&receiptRef.current.state==='succeeded') {
   lastCheck.current=Date.now();setAuthorized(ok);return
  }
  // The app's record says the event exists. Ask Google whether it still does, so an
  // event deleted or changed there is not shown as it was. Without Calendar access,
  // or if Google cannot be reached, the saved details stand.
  let read:{draft:Draft;version:string;eventUrl?:string}|null=null,deleted=false,auth=!ok
  if (current.state==='succeeded'&&ok) {
   try {
    const fresh=await calendarEventAction({action:'read',taskId:task.id})
    if (!live.current) return
    if (fresh?.state==='removed') deleted=true
    else if (fresh?.state==='succeeded'&&fresh.version) read={draft:withZone(draftFrom(fresh.draft,draftFrom(current.draft,fallback()))),version:fresh.version,eventUrl:fresh.eventUrl??current.eventUrl}
    else if (fresh?.state&&fresh.state!=='succeeded') current={state:fresh.state,eventUrl:fresh.eventUrl??current.eventUrl,draft:fresh.draft??current.draft}
   } catch(e) {
    const code=codeOf(e)
    if (code==='CALENDAR_NOT_ADDED') deleted=true
    else if (needsCalendarAuthorization(code)) auth=true
   }
  }
  if (!live.current) return
  lastCheck.current=Date.now();setAuthorized(ok)
  if (deleted) markDeleted()
  else if (current.state==='succeeded'&&read) showRead(read.draft,read.version,read.eventUrl,current.draft)
  else {
   setReceipt(current)
   const stored=withZone(draftFrom(current.draft,fallback()))
   if (current.state==='succeeded') {
    // Google could not be read: show the app's saved details, read-only.
    setDraft(stored);setBaseline(null);setVersion(null);setUnreadable(true);setAuthNeeded(auth)
   } else if (current.state==='updating') setDraft(loadAttempt(userId,task.id)?.form??stored)
   else if (current.draft&&['executing','unknown','removing'].includes(current.state??'')) setDraft(stored)
  }
  // Default to Google Calendar once it is authorized; otherwise ask.
  setMode(m=>m??(ok||current.state?'google':'choose'))
 }
 // Status is kept current without a button: on open, after a failed attempt, when
 // the user returns to this tab, and every few seconds while a request is in progress.
 async function refresh() {
  if (running.current||!live.current||Date.now()-lastCheck.current<3000) return
  try { await reload(!dirtyRef.current) } catch { /* keep what is shown; the next check tries again */ }
 }
 function clearDraft() { try { if(savedDraft(userId,task.id))sessionStorage.removeItem(draftKey(userId)) } catch { /* no sensitive data */ } }
 useEffect(()=>{
  live.current=true
  // The Google return marker has been read; keep it out of later reloads.
  const url=new URL(window.location.href)
  if(url.searchParams.has('google')){url.searchParams.delete('google');window.history.replaceState(null,'',url.pathname+url.search+url.hash)}
  if(calendarEventsEnabled)void reload().catch(e=>{if(live.current){setError(e.message);setMode(m=>m??'choose')}}).finally(()=>{if(live.current)setChecking(false)})
  return()=>{live.current=false}
 },[userId,task.id])
 useEffect(()=>{
  if (!calendarEventsEnabled) return
  const onReturn=()=>{ if(document.visibilityState==='visible') void refresh() }
  document.addEventListener('visibilitychange',onReturn);window.addEventListener('focus',onReturn)
  return()=>{document.removeEventListener('visibilitychange',onReturn);window.removeEventListener('focus',onReturn)}
 },[userId,task.id])
 useEffect(()=>{
  if (!inProgress) { setStalled(false); return }
  if (stalled) return
  const started=Date.now()
  // The backend holds a request for at most 90 seconds; after that it can only have been lost.
  const timer=window.setInterval(()=>{ if(Date.now()-started>100000) setStalled(true); else void refresh() },4000)
  return()=>window.clearInterval(timer)
 },[inProgress,stalled,userId,task.id])
 useEffect(()=>{
  // Only the Add form is kept; Manage event saves its edits only when leaving for Google's consent screen.
  if (mode!=='google'||['succeeded','updating','removing'].includes(receipt.state??'')||(checking&&resumed?.baseline)) return
  try { sessionStorage.setItem(draftKey(userId),JSON.stringify({taskId:task.id,revision,draft,savedAt:Date.now()})) } catch { /* authorization explicitly requires saving below */ }
 },[draft,revision,mode,receipt.state,checking,userId,task.id])
 function edit(patch:Partial<Draft>) {
  if ('endTime' in patch||'endDate' in patch) follow.current.endFollowsStart=false
  if ('endDate' in patch) follow.current.endDateFollowsDate=false
  const rules={...follow.current}
  reviewOpen.current=false
  setDraft(d=>applyEdit(d,patch,rules));setError('');setNotice('')
 }
 function cancel() { if(running.current)return; clearDraft(); onCancel() }
 function chooseFile() { if(running.current)return; clearDraft(); setError(''); setMode('file') }
 async function authorize() {
  if(running.current)return
  running.current=true;setBusy(true);setError('')
  try {
   // Fail before redirect if this browser cannot retain the form. Manage event also keeps
   // the details it read, so the edits are restored only if the event is unchanged.
   const saved:Saved={taskId:task.id,revision,draft,savedAt:Date.now(),...(receipt.state==='succeeded'&&baseline?{baseline}:{})}
   sessionStorage.setItem(draftKey(userId),JSON.stringify(saved))
   const result=await googleConnectionAction('connect_calendar')
   if(!live.current)return
   const url=new URL(result.authorizationUrl??'')
   if(url.origin!=='https://accounts.google.com'||url.pathname!=='/o/oauth2/v2/auth')throw new Error('Invalid Google authorization destination.')
   window.location.assign(url.href)
  }catch {if(live.current)setError('Authorization could not start. Your edits remain here; check browser storage and Google connection setup.')}
  finally {running.current=false;if(live.current)setBusy(false)}
 }
 async function submit() {
  if(running.current||missing.length)return
  const problem=validate(draft);if(problem){setError(problem);return}
  running.current=true;setBusy(true);setError('')
  try {
   const data=await calendarEventAction({taskId:task.id,taskRevision:revision,draft:payloadOf(draft)})
   if(!live.current)return
   if(data?.state!=='succeeded')throw new CalendarError('')
   clearDraft();onAdded()
  }catch(e){if(live.current){setError(createMessage(codeOf(e)));try{await reload()}catch{/* preserve original error */}}}
  finally{running.current=false;if(live.current)setBusy(false)}
 }
 // Save changes and its Retry. The attempt is saved before sending so a lost result can be retried with the same values.
 async function sendUpdate(attempt:Attempt) {
  if(running.current)return
  running.current=true;setBusy(true);setError('');setAuthNeeded(false);setChanged(false);setNotice('')
  try {
   keepAttempt(userId,task.id,attempt)
   const result=await calendarEventAction({action:'update',taskId:task.id,version:attempt.version,draft:attempt.draft})
   if(!live.current)return
   if(result?.state==='succeeded'){clearAttempt(userId,task.id);clearDraft();onSaved(eventSummary(draftFrom(result.draft,attempt.form)));return}
   if(result?.state==='removed'){clearAttempt(userId,task.id);markDeleted();return}
   throw new CalendarError('')
  }catch(e){
   if(!live.current)return
   const code=codeOf(e)
   if(!uncertain(code))clearAttempt(userId,task.id)
   if(code==='CALENDAR_NOT_ADDED'){markDeleted();return}
   if(code==='CALENDAR_EVENT_CHANGED'){setChanged(true);return}
   if(needsCalendarAuthorization(code)){setAuthNeeded(true);return}
   setError(calendarMessage(code))
   try{await reload(false)}catch{/* preserve original error */}
  }finally{running.current=false;if(live.current)setBusy(false)}
 }
 function save() {
  if(!version||!dirty||missing.length||!eligible)return
  const problem=validate(draft);if(problem){setError(problem);return}
  void sendUpdate({version,draft:payloadOf(draft),form:draft,savedAt:Date.now()})
 }
 async function remove(confirmFirst:boolean) {
  if(running.current)return
  if(confirmFirst&&!window.confirm('Remove this event from your Google Calendar?'))return
  running.current=true;setBusy(true);setError('');setAuthNeeded(false);setNotice('')
  try {
   const result=await calendarEventAction({action:'remove',taskId:task.id})
   if(!live.current)return
   if(result?.state==='removed'){clearAttempt(userId,task.id);clearDraft();onRemoved();return}
   throw new CalendarError('')
  }catch(e){
   if(!live.current)return
   const code=codeOf(e)
   // Already gone from Google counts as removed.
   if(code==='CALENDAR_NOT_ADDED'){clearAttempt(userId,task.id);clearDraft();onRemoved();return}
   if(needsCalendarAuthorization(code)){setAuthNeeded(true);return}
   setError(calendarMessage(code))
   try{await reload(false)}catch{/* preserve original error */}
  }finally{running.current=false;if(live.current)setBusy(false)}
 }
 // "Load latest details" after Google refused a save because the event changed there.
 async function loadLatest() {
  if(running.current)return
  running.current=true;setBusy(true);setError('');setAuthNeeded(false)
  reviewOpen.current=false;setReviewShown(false)
  try {
   const fresh=await calendarEventAction({action:'read',taskId:task.id})
   if(!live.current)return
   if(fresh?.state==='removed'){markDeleted();return}
   if(fresh?.state!=='succeeded'||!fresh.version)throw new CalendarError('')
   const read=withZone(draftFrom(fresh.draft,draft))
   showRead(read,fresh.version,fresh.eventUrl??receipt.eventUrl,read)
   // Google's details replaced what the app had, so the card refreshes.
   onStatusChange()
  }catch(e){
   if(!live.current)return
   const code=codeOf(e)
   if(code==='CALENDAR_NOT_ADDED'){markDeleted();return}
   if(needsCalendarAuthorization(code)){setAuthNeeded(true);return}
   setError(code?calendarMessage(code):'The latest details could not be loaded. Try again.')
  }finally{running.current=false;if(live.current)setBusy(false)}
 }
 const validUrl=receipt.eventUrl&&/^https:\/\/(www\.)?google\.com\/calendar\//.test(receipt.eventUrl)?receipt.eventUrl:null
 const fileLink=<p className="calendar-alt"><button type="button" className="link-button" disabled={busy} onClick={chooseFile}>Download a calendar file instead</button></p>
 const openLink=validUrl&&<a className="calendar-open" href={validUrl} target="_blank" rel="noopener noreferrer">Open in Google Calendar</a>
 const errorLine=error&&<p className="storage-error" role="alert">{error}</p>
 const authPrompt=authNeeded&&<div className="calendar-note" role="status"><p>Authorize Google Calendar to change this event.</p>
  <button type="button" disabled={busy} onClick={()=>void authorize()}>Authorize Google Calendar</button></div>
 const outline=(field:ReturnType<typeof missingFields>[number],readOnly:boolean)=>!readOnly&&missing.includes(field)?{className:'is-missing','aria-invalid':true as const}:{}
 // The event card shared by Add, Manage and the uncertain states.
 const fields=(readOnly:boolean)=><fieldset className="calendar-card" disabled={busy||readOnly}><legend className="calendar-legend">Event details</legend>
  <label className="calendar-title">Title<input required maxLength={350} value={draft.title} {...outline('title',readOnly)} onChange={e=>edit({title:e.target.value})}/></label>
  <div className="calendar-when">
   <label>Date<input required type="date" value={draft.date} {...outline('date',readOnly)} onChange={e=>edit({date:e.target.value})}/></label>
   {!draft.allDay&&<>
    <label>Start<input required type="time" value={draft.startTime} {...outline('startTime',readOnly)} onChange={e=>edit({startTime:e.target.value})}/></label>
    <label>End<input required type="time" value={draft.endTime} {...outline('endTime',readOnly)} onChange={e=>edit({endTime:e.target.value})}/></label></>}
  </div>
  {!draft.allDay&&<label className="calendar-end-date">End date<input required type="date" value={draft.endDate} {...outline('endDate',readOnly)} onChange={e=>edit({endDate:e.target.value})}/></label>}
  <label><input type="checkbox" checked={draft.allDay} onChange={e=>edit({allDay:e.target.checked})}/> All day</label>
  {!draft.allDay&&<p className="calendar-zone">Times are in {zoneName(draft.timeZone)??draft.timeZone}.</p>}
  <p className="calendar-destination"><span>Calendar · Primary only</span>{email&&<span>{email}</span>}</p>
 </fieldset>

 if (mode==='file') return <>
  {calendarEventsEnabled
   ?<p className="calendar-separation-note">This downloads a file you import yourself; nothing is written to any calendar. <button type="button" className="link-button" onClick={()=>{setError('');setMode(authorized||receipt.state?'google':'choose')}}>Use Google Calendar instead</button></p>
   :<p className="calendar-separation-note">Google Calendar is not enabled in this release. This downloads a file you import yourself; nothing is written to any calendar.</p>}
  {fileExport}
 </>

 if (mode===null||checking&&(mode!=='google'||resumed?.baseline)) return <p role="status">Checking Google Calendar access…</p>

 if (mode==='choose') return <section className="storage-panel calendar-choice" aria-label="Choose how to add this task">
  <p>Google Calendar is not connected for this account. Choose how to add “{task.accepted_fields.action}”.</p>
  <div className="calendar-choice-options">
   <button type="button" disabled={busy||!eligible} onClick={()=>void authorize()}>
    <strong>Add to Google Calendar</strong><span>Google asks you to allow Calendar access, then you return here to review the event before anything is created.</span>
   </button>
   <button type="button" disabled={busy} onClick={chooseFile}>
    <strong>Download a calendar file (.ics)</strong><span>Import it into any calendar yourself. Nothing is connected or written.</span>
   </button>
  </div>
  {!eligible&&<p>Only open, approved tasks can be added to Google Calendar.</p>}
  {errorLine}
  <div className="storage-actions"><button type="button" disabled={busy} onClick={cancel}>Cancel</button></div>
 </section>

 // An update or removal whose result was not confirmed.
 if (receipt.state==='updating'||receipt.state==='removing') {
  const attempt=receipt.state==='updating'?loadAttempt(userId,task.id):null
  return <section className="storage-panel calendar-google-form" aria-label="Google Calendar event">
   {receipt.state==='updating'
    ?<p role="status">We couldn’t confirm whether your change was saved.{attempt?' Retry sends the same details again.':''}</p>
    :<p role="status">We couldn’t confirm that the event was removed.</p>}
   {receipt.state==='updating'&&!attempt&&<p>This change was started in another browser or tab, so it can’t be retried here. Check the event in Google Calendar, or remove it.</p>}
   {!stalled&&<p className="calendar-zone" aria-live="polite">Checking…</p>}
   {fields(true)}
   {authPrompt}{errorLine}
   <div className="storage-actions">
    {attempt&&<button type="button" className="manual-primary" disabled={busy} onClick={()=>void sendUpdate(attempt)}>{busy?'Working…':'Retry'}</button>}
    {receipt.state==='removing'&&<button type="button" className="manual-primary" disabled={busy} onClick={()=>void remove(false)}>{busy?'Working…':'Remove again'}</button>}
    {openLink}
    {receipt.state==='updating'&&!attempt&&<button type="button" disabled={busy} onClick={()=>void remove(true)}>Remove from calendar</button>}
    <button type="button" disabled={busy} onClick={cancel}>Close</button>
   </div>
  </section>
 }

 if (receipt.state==='succeeded') {
  const readOnly=!eligible||!version
  return <form className="storage-panel calendar-google-form" onSubmit={e=>{e.preventDefault();save()}} aria-label="Manage Google Calendar event">
   {reviewShown&&review&&<p className="calendar-note" role="status">The task’s deadline is now {deadlineLabel(review.deadline)}. The schedule below was moved to match; nothing is saved until you choose Save changes.</p>}
   {unreadable&&<p className="calendar-note" role="status">Google Calendar could not be read, so these are the details the app saved.</p>}
   {changed&&<div className="calendar-note" role="alert"><p>This event changed in Google Calendar.</p>
    <button type="button" disabled={busy} onClick={()=>void loadLatest()}>Load latest details</button></div>}
   {fields(readOnly)}
   {!eligible&&<p className="calendar-zone">This task is no longer open, so its event can’t be changed here. You can still open or remove it.</p>}
   {authPrompt}{errorLine}
   <div className="storage-actions">
    {eligible&&<button className="manual-primary" disabled={busy||!version||!dirty||changed||missing.length>0}>{busy?'Working…':'Save changes'}</button>}
    {openLink}
    <button type="button" disabled={busy} onClick={()=>void remove(true)}>Remove from calendar</button>
    <button type="button" disabled={busy} onClick={cancel}>Cancel</button>
   </div>
   {fileLink}
  </form>
 }

 return <form className="storage-panel calendar-google-form" onSubmit={e=>{e.preventDefault();void submit()}} aria-label="Add Google Calendar event">
  {notice&&<p className="calendar-note" role="status">{notice}</p>}
  {lost&&<p role="status">We couldn’t confirm whether the event was added. Retry checks Google Calendar first, so it is never added twice. The details are locked to what you confirmed.</p>}
  {waiting&&<p role="status">A request for this event is in progress. Checking…</p>}
  {task.accepted_fields.condition&&<p className="calendar-zone">Task condition: {task.accepted_fields.condition}</p>}
  {fields(locked)}
  <p className="calendar-zone">Nothing is added to your calendar until you choose Add to Google Calendar.</p>
  {checking&&<p role="status">Checking Google Calendar access…</p>}
  {!checking&&!authorized&&<p>Google Calendar access is needed before this event can be created. Returning from Google reopens this form and requires confirmation.</p>}
  {!checking&&(!authorized||error)&&<button type="button" disabled={busy} onClick={()=>void authorize()}>{authorized?'Reconnect Google Calendar':'Authorize Google Calendar'}</button>}
  {errorLine}
  <div className="storage-actions"><button className="manual-primary" disabled={busy||checking||waiting||!authorized||!eligible||missing.length>0}>{busy?'Working…':lost?'Retry':'Add to Google Calendar'}</button>
   <button type="button" disabled={busy} onClick={cancel}>Cancel</button></div>
  {!locked&&fileLink}
 </form>
}
