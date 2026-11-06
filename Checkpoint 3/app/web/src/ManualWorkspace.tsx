import {useCallback,useEffect,useRef,useState,type CSSProperties} from 'react'
import {supabase} from './supabase'
import {loadStorageSnapshot,reviewStoredRecord,type Snapshot,type TaskFields} from './storageAdapter'
import {manualScan,manualScanStatus,resolveTaskChange,reviewTaskChange,scanStopMessage,type ScanStatus} from './manualScanAdapter'
import ManualChangeResolver from './ManualChangeResolver'
import GoogleConnectionPanel from './GoogleConnectionPanel'
import TaskCalendarControl,{calendarReviewPending} from './TaskCalendarControl'
import ScanSettingsPanel from './ScanSettingsPanel'
import ExtractionReview from './ExtractionReview'
import InformationTab from './InformationTab'
import CalendarExport from './CalendarExportPanel'
import {loadTaskSourceLinks,OpenInGmail,TaskSourceEmails,type TaskSourceLink} from './SourceEmails'
import inboxToTaskLogo from './assets/inbox-to-task-logo.png'
import './storage.css'
import './manual-workspace.css'

const empty:Snapshot={tasks:[],suggestions:[],changes:[],sources:[],extractions:[],evidence:[],waiting:[],followups:[],preferences:[]}
function display(value:any):string{
 if(value==null)return 'Not specified'
 if(Array.isArray(value))return value.join('\n')||'None'
 if(typeof value==='object'&&value.date)return `${value.boundary==='unspecified'?'Due':value.boundary} ${value.date}${value.time?` ${value.time}`:' (date only)'} · ${value.timeZone}`
 return String(value)
}
function Fields({fields}:{fields:TaskFields}){
 return <><p>{display(fields.deadline)}</p>{fields.condition&&<p>Condition: {fields.condition}</p>}{fields.requirements.length>0&&<ul>{fields.requirements.map((r,i)=><li key={i}>{r}</li>)}</ul>}</>
}
export default function ManualWorkspace({userId,email,onSignOut}:{userId:string;email:string;onSignOut:()=>void}){
 const [snapshot,setSnapshot]=useState<Snapshot>(empty),[status,setStatus]=useState<ScanStatus|null>(null)
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [tab,setTab]=useState(()=>calendarReviewPending(userId)?'tasks':'review'),[exportId,setExportId]=useState<string|null>(null),[exportDone,setExportDone]=useState<string|null>(null),[sourceLinks,setSourceLinks]=useState<TaskSourceLink[]|null>([])
 const [scanning,setScanning]=useState(false),[now,setNow]=useState(()=>Date.now())
 const epoch=useRef(0),sequence=useRef(0),exportButtons=useRef(new Map<string,HTMLButtonElement>())
 const cooldownEnd=status?.cooldownUntil?Date.parse(status.cooldownUntil):0
 const cooldownLeft=Math.max(0,Math.ceil((cooldownEnd-now)/1000))
 useEffect(()=>{
  setNow(Date.now())
  if(cooldownEnd<=Date.now())return
  const timer=window.setInterval(()=>setNow(Date.now()),1000)
  return()=>window.clearInterval(timer)
 },[cooldownEnd])
 const reload=useCallback(async()=>{
  const current=epoch.current,request=++sequence.current
  try{
   const [records,progress]=await Promise.all([loadStorageSnapshot(supabase),manualScanStatus()])
   // A failed link lookup must not hide saved tasks, so it has its own visible state.
   const links=await loadTaskSourceLinks(records.tasks.map(t=>t.id)).catch(()=>null)
   if(current===epoch.current&&request===sequence.current){setSnapshot(records);setStatus(progress);setSourceLinks(links)}
  }catch(err){if(current===epoch.current&&request===sequence.current)setError((err as Error).message)}
  finally{if(current===epoch.current&&request===sequence.current)setLoading(false)}
 },[])
 useEffect(()=>{void reload();return()=>{epoch.current++;sequence.current++}},[reload,userId])
 useEffect(()=>{
  if(!busy&&!status?.running)return
  const current=epoch.current
  const timer=window.setInterval(()=>{manualScanStatus().then(next=>{if(current===epoch.current)setStatus(next)}).catch(()=>{})},3000)
  return()=>window.clearInterval(timer)
 },[busy,status?.running])
 async function perform(operation:()=>Promise<unknown>,message:string){
  const current=epoch.current;setBusy(true);setError('');setNotice('')
  try{await operation();if(current===epoch.current){setNotice(message);await reload()}}
  catch(err){if(current===epoch.current){setError((err as Error).message);await reload()}}
  finally{if(current===epoch.current)setBusy(false)}
 }
 async function scan(mode:'initial'|'more'){
  setScanning(true)
  try{await perform(async()=>{
   const result=await manualScan(mode)
   if(result.executionMode!=='GMAIL_PERSISTENT_MANUAL')throw new Error('The backend is in retrieval-only mode. No suggestions were extracted or saved.')
   if(result.error)throw new Error(`${scanStopMessage(result.error)} Saved results remain available.`)
  },'This scan batch finished. Review saved results below.')}
  finally{setScanning(false)}
 }
 const sources=new Set(snapshot.sources.filter(s=>s.namespace==='gmail'&&!s.deleted_at).map(s=>s.id))
 const extractions=new Map(snapshot.extractions.filter(e=>sources.has(e.source_id)).map(e=>[e.id,e]))
 // A source can be re-extracted after task or settings changes. Show its newest summary once.
 const latest=new Map<string,any>();for(const e of extractions.values()){const seen=latest.get(e.source_id);if(!seen||new Date(e.created_at)>new Date(seen.created_at))latest.set(e.source_id,e)}
 const information=Array.from(latest.values()).filter(e=>e.summary&&e.topic_relevance!=='irrelevant'&&new Date(e.digest_expires_at)>new Date())
 const evidence=new Map(snapshot.evidence.map(e=>[e.id,e]))
 const suggestions=snapshot.suggestions.filter(s=>extractions.has(s.extraction_id)&&s.state==='pending')
 const changes=(snapshot.changes??[]).filter(c=>extractions.has(c.extraction_id)&&c.state==='pending')
 const tasks=snapshot.tasks.filter(t=>!t.deleted_at&&t.accepted_fields&&['approved','completed'].includes(t.status))
 const counts=status?.result?.counts
 const needsReconnect=status?.result?.error==='GMAIL_RECONNECT_REQUIRED'
 // Display-only grouping. Pending suggestions that share an extraction get "n of m"; accepted tasks that share a thread are grouped.
 const siblingIds=new Map<string,string[]>();for(const s of suggestions)siblingIds.set(s.extraction_id,[...(siblingIds.get(s.extraction_id)??[]),s.id])
 const primaryLink=(taskId:string)=>{const own=(sourceLinks??[]).filter(l=>l.taskId===taskId);return own.find(l=>l.role==='created')??own[0]}
 const threadTasks=new Map<string,typeof tasks>();for(const t of tasks){const thread=primaryLink(t.id)?.threadId;if(thread)threadTasks.set(thread,[...(threadTasks.get(thread)??[]),t])}
 const renderTask=(t:(typeof tasks)[number])=>{const canExport=!t.cancelled_at&&['approved','completed'].includes(t.status)
  return <article className="storage-panel" key={t.id}><h2>{t.accepted_fields.action}</h2><p>{t.cancelled_at?'Cancelled':t.status} · revision {t.revision}</p><Fields fields={t.accepted_fields}/><TaskSourceEmails email={email} links={sourceLinks&&sourceLinks.filter(l=>l.taskId===t.id)}/><TaskCalendarControl key={`${userId}-${t.id}`} task={t} userId={userId}/>{!t.cancelled_at&&<button disabled={busy} onClick={()=>void perform(()=>reviewStoredRecord('task',t.id,t.status==='completed'?'undo':'complete',t.revision),'Task status saved.')}>{t.status==='completed'?'Undo completion':'Complete task'}</button>}{canExport&&<button ref={el=>{if(el)exportButtons.current.set(t.id,el);else exportButtons.current.delete(t.id)}} aria-expanded={exportId===t.id} onClick={()=>{setExportDone(null);setExportId(exportId===t.id?null:t.id)}}>Export calendar file</button>}{canExport&&<span className="manual-export-done" role="status">{exportDone===t.id&&<><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>Calendar file download started. Import it into your chosen calendar.</>}</span>}{exportId===t.id&&canExport&&<CalendarExport key={`${t.id}-${t.revision}`} task={t} fields={t.accepted_fields} close={()=>setExportId(null)} onDownloaded={()=>{setExportId(null);setExportDone(t.id);window.setTimeout(()=>exportButtons.current.get(t.id)?.focus(),0)}}/>}</article>}
 const sourceMessage=(extractionId:string)=>snapshot.sources.find(s=>s.id===extractions.get(extractionId)?.source_id)?.message_id
 return <main className="storage-page manual-workspace">
  <header className="manual-topbar"><div className="manual-brand"><img alt="" src={inboxToTaskLogo}/><span>InboxToTask</span></div><div className="manual-account"><span>{email}</span><button onClick={onSignOut}>Sign out</button></div></header>
  <div className="manual-intro"><h1>Your inbox, ready for review</h1><p>Suggestions stay here until you approve them.</p></div>
  <section className="storage-panel" aria-labelledby="manual-scan-title"><h2 id="manual-scan-title">Check Gmail</h2>
   <p>Manual checks cover the past seven days. Each batch can inspect up to 100 permitted messages and make up to two model calls, subject to time and account budgets. Additional work requires your Scan more request.</p>
   <div className={`manual-scan-state${scanning||status?.running?' is-scanning':!busy&&cooldownLeft>0?' is-cooldown':''}`}>
    {scanning||status?.running?<span className="manual-spinner" aria-hidden="true"/>:!busy&&cooldownLeft>0?<span className="manual-cooldown" aria-hidden="true" style={{'--cooldown-progress':`${Math.min(100,cooldownLeft/60*100)}%`} as CSSProperties}><span>{cooldownLeft}</span></span>:null}
    <p role="status">{scanning||status?.running?'Scanning permitted emails. Counts update when the batch finishes.':busy?'Saving your change…':cooldownLeft>0?'Cooling down. You can scan again shortly.':loading?'Loading saved status…':'Ready for a manual request. Automatic scanning is not enabled.'}</p>
   </div>
   <p>Last successful batch: {status?.lastSuccessful?new Date(status.lastSuccessful).toLocaleString():'None recorded'}</p>
   {counts&&<><h3 className="manual-stats-title">Last batch</h3><dl className="manual-stats">{[['Candidate messages',counts.candidates],['Permitted',counts.permitted],['Blocked',counts.blocked],['Processed',counts.prepared],['Reused without a model call',counts.reused],['Could not be processed',counts.failed],['Model calls',counts.modelCalls]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value??0}</dd></div>)}</dl></>}
   {counts?.failed>0&&<p role="status">{status?.result?.unresolved>0?`${status?.result?.unresolved} messages stopped after repeated attempts. A new seven-day scan tries them again. `:''}Other failed messages are retried by Scan more.</p>}
   {status?.result?.error&&<p role="status">{scanStopMessage(status.result.error)} Previously saved results remain available.</p>}
   {status?.backlog&&!needsReconnect&&<p>More work remains; the exact backlog count is unknown. Scan more continues the saved window and checks current permissions again.</p>}
   <div className="storage-actions"><button className="manual-primary" disabled={busy||status?.running||cooldownLeft>0} onClick={()=>void scan('initial')}>Scan past seven days</button>
    <button disabled={busy||status?.running||cooldownLeft>0||!status?.backlog||needsReconnect} onClick={()=>void scan('more')}>Scan more</button>
    <button disabled={busy} onClick={()=>{setError('');void reload()}}>Reload saved results</button></div>
  </section>
  {error&&<p className="storage-error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <nav className="storage-actions" aria-label="Workspace sections">{[['review',`Review (${suggestions.length+changes.length})`],['tasks','Accepted tasks'],['information','Information'],['settings','Connection and permissions']].map(([key,label])=><button key={key} aria-pressed={tab===key} onClick={()=>{setTab(key);setExportId(null);setExportDone(null)}}>{label}</button>)}</nav>
  {tab==='settings'&&<><GoogleConnectionPanel key={`google-${userId}`}/><ScanSettingsPanel key={`settings-${userId}`} collapseOnSave onSaved={()=>{setError('');setNotice('');void reload()}}/></>}
  {tab==='review'&&<section aria-label="Saved proposals">
   {!suggestions.length&&!changes.length&&!loading&&<p>No pending suggestions or task changes. Connect Gmail and review saved permission under Connection and permissions before scanning.</p>}
   {suggestions.map(s=>{const quote=evidence.get(s.evidence_id);const fields=s.review_fields??s.fields;const group=siblingIds.get(s.extraction_id)??[];return <article className="storage-panel" key={s.id}>{group.length>1&&<p className="manual-sibling">{group.indexOf(s.id)+1} of {group.length} pending tasks found in this email</p>}<h2>{fields.action}</h2><Fields fields={fields}/><ExtractionReview extraction={extractions.get(s.extraction_id)}/>
    <blockquote>{quote?.quote??'Supporting evidence has expired.'}</blockquote><OpenInGmail email={email} messageId={quote?.message_id??sourceMessage(s.extraction_id)}/><div className="storage-actions"><button className="manual-primary" disabled={busy||!quote?.quote} onClick={()=>void perform(()=>reviewStoredRecord('suggestion',s.id,'approve',s.revision),'Task approved. No Calendar event was created.')}>Approve task</button><button disabled={busy} onClick={()=>void perform(()=>reviewStoredRecord('suggestion',s.id,'dismiss',s.revision),'Suggestion dismissed.')}>Dismiss</button></div></article>})}
   {changes.map(c=>{const target=tasks.find(t=>t.id===c.target_task_id),open=target?.status==='approved'&&!target.cancelled_at,stale=open&&target.revision!==c.expected_revision,quote=evidence.get(c.evidence_id);
    if(!c.target_task_id)return <ManualChangeResolver key={`${c.id}-${c.revision}`} change={c} source={snapshot.sources.find(s=>s.id===extractions.get(c.extraction_id)?.source_id)} quote={quote?.quote} tasks={tasks.filter(t=>t.status==='approved'&&!t.cancelled_at)} email={email} busy={busy}
     onResolve={(taskId,taskRevision,fields)=>void perform(()=>resolveTaskChange(c.id,c.revision,taskId,taskRevision,fields),fields?'Your values were saved to the task. No Calendar write was authorized.':'The task was marked cancelled. No Calendar write was authorized.')}
     onDismiss={()=>void perform(()=>reviewTaskChange(c.id,c.revision,'dismiss'),'Item dismissed.')}/>
    return <article className="storage-panel" key={c.id}>
    <h2>{c.kind==='cancel'?'Proposed cancellation':'Proposed task edit'}: {c.baseline?.action??'Target needs review'}</h2><p>{c.reason}</p><p>Target: {target?.accepted_fields.action??'No eligible task selected'} · expected revision {c.expected_revision??'unresolved'}</p>
    {c.kind==='edit'&&<table><thead><tr><th>Field</th><th>Accepted at inference</th><th>Proposed</th></tr></thead><tbody>{c.changed_fields.map((field:string)=><tr key={field}><th scope="row">{field}</th><td>{display(c.baseline?.[field])}</td><td>{display(c.fields?.[field])}</td></tr>)}</tbody></table>}
    {c.kind==='cancel'&&c.baseline&&<><p>Accepted values are retained if cancellation is approved.</p><Fields fields={c.baseline}/></>}
    <ExtractionReview extraction={extractions.get(c.extraction_id)}/><blockquote>{quote?.quote??'Supporting evidence has expired.'}</blockquote><OpenInGmail email={email} messageId={quote?.message_id??sourceMessage(c.extraction_id)}/>
    {!open&&<p>The task is no longer open, so this proposal cannot be applied. You can dismiss it.</p>}
    {stale&&<><p>The task changed since this proposal. Current accepted values:</p><Fields fields={target.accepted_fields}/><button disabled={busy} onClick={()=>void perform(()=>reviewTaskChange(c.id,c.revision,'rebase',target.revision),'Proposal refreshed against the current task. Review the new comparison before approving.')}>Review against current revision</button></>}
    <div className="storage-actions"><button className="manual-primary" disabled={busy||!open||!!stale||!quote?.quote} onClick={()=>void perform(()=>reviewTaskChange(c.id,c.revision,'approve'),'Task change approved. No Calendar write was authorized.')}>{c.kind==='cancel'?'Approve cancellation':'Approve edit'}</button><button disabled={busy} onClick={()=>void perform(()=>reviewTaskChange(c.id,c.revision,'dismiss'),'Proposal dismissed.')}>Dismiss</button></div>
   </article>})}
  </section>}
  {tab==='tasks'&&<section aria-label="Accepted tasks">{!tasks.length&&<p>No accepted tasks yet.</p>}{tasks.map(t=>{const thread=primaryLink(t.id)?.threadId,group=thread?threadTasks.get(thread):undefined
   if(!thread||!group||group.length<2)return renderTask(t)
   if(group[0].id!==t.id)return null
   const subject=(group.map(g=>primaryLink(g.id)).find(l=>l?.role==='created')??primaryLink(t.id))?.subject
   return <section className="manual-thread" key={`thread-${thread}`} aria-labelledby={`thread-${thread}`}><h2 id={`thread-${thread}`}>{group.length} tasks from this conversation</h2><p className="manual-thread-subject">{subject||'(no subject)'}</p>{group.map(renderTask)}</section>})}</section>}
  {tab==='information'&&<InformationTab key={`info-${userId}`} userId={userId} email={email} items={information} sources={snapshot.sources} loading={loading}/>}
 </main>
}
