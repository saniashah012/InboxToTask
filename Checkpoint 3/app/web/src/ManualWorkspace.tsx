import {useCallback,useEffect,useRef,useState} from 'react'
import {supabase} from './supabase'
import {loadStorageSnapshot,reviewStoredRecord,type Snapshot,type TaskFields} from './storageAdapter'
import {manualScan,manualScanStatus,reviewTaskChange,scanStopMessage,type ScanStatus} from './manualScanAdapter'
import GoogleConnectionPanel from './GoogleConnectionPanel'
import TaskCalendarControl,{calendarReviewPending} from './TaskCalendarControl'
import ScanSettingsPanel from './ScanSettingsPanel'
import ExtractionReview from './ExtractionReview'
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
 const [tab,setTab]=useState(()=>calendarReviewPending(userId)?'tasks':'review'),[refresh,setRefresh]=useState(0)
 const epoch=useRef(0),sequence=useRef(0)
 const reload=useCallback(async()=>{
  const current=epoch.current,request=++sequence.current
  try{
   const [records,progress]=await Promise.all([loadStorageSnapshot(supabase),manualScanStatus()])
   if(current===epoch.current&&request===sequence.current){setSnapshot(records);setStatus(progress)}
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
  await perform(async()=>{
   const result=await manualScan(mode)
   if(result.executionMode!=='GMAIL_PERSISTENT_MANUAL')throw new Error('The backend is in retrieval-only mode. No suggestions were extracted or saved.')
   if(result.error)throw new Error(`${scanStopMessage(result.error)} Saved results remain available.`)
  },'This scan batch finished. Review saved results below.')
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
 return <main className="storage-page manual-workspace">
  <header><div><p className="storage-eyebrow">InboxToTask</p><h1>Your inbox, ready for review</h1><p>{email}</p></div><button onClick={onSignOut}>Sign out</button></header>
  <section className="storage-panel" aria-labelledby="manual-scan-title"><h2 id="manual-scan-title">Check Gmail</h2>
   <p>Manual checks cover the past seven days. Each batch can inspect up to 100 permitted messages and make up to two model calls, subject to time and account budgets. Additional work requires your Scan more request.</p>
   <p role="status">{busy||status?.running?'Work is in progress. Counts update when the batch finishes.':loading?'Loading saved status…':'Ready for a manual request. Automatic scanning is not enabled.'}</p>
   <p>Last successful batch: {status?.lastSuccessful?new Date(status.lastSuccessful).toLocaleString():'None recorded'}</p>
   {counts&&<p>Last batch: {counts.candidates??0} candidate messages, {counts.permitted??0} permitted, {counts.blocked??0} blocked, {counts.prepared??0} processed ({counts.reused??0} reused without a model call), {counts.failed??0} could not be processed, {counts.modelCalls??0} model calls.</p>}
   {counts?.failed>0&&<p role="status">{status?.result?.unresolved>0?`${status?.result?.unresolved} messages stopped after repeated attempts. A new seven-day scan tries them again. `:''}Other failed messages are retried by Scan more.</p>}
   {status?.result?.error&&<p role="status">{scanStopMessage(status.result.error)} Previously saved results remain available.</p>}
   {status?.backlog&&<p>More work remains; the exact backlog count is unknown. Scan more continues the saved window and checks current permissions again.</p>}
   <div className="storage-actions"><button disabled={busy||status?.running} onClick={()=>void scan('initial')}>Scan past seven days</button>
    <button disabled={busy||status?.running||!status?.backlog} onClick={()=>void scan('more')}>Scan more</button>
    <button disabled={busy} onClick={()=>{setError('');void reload()}}>Reload saved results</button></div>
   <p>No Calendar events are created by scans or task approval.</p>
  </section>
  {error&&<p className="storage-error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <nav className="storage-actions" aria-label="Workspace sections">{[['review',`Review (${suggestions.length+changes.length})`],['tasks','Accepted tasks'],['information','Information'],['settings','Connection and permissions']].map(([key,label])=><button key={key} aria-pressed={tab===key} onClick={()=>setTab(key)}>{label}</button>)}</nav>
  {tab==='settings'&&<><GoogleConnectionPanel key={`google-${userId}`}/><ScanSettingsPanel key={`settings-${userId}-${refresh}`}/><button disabled={busy} onClick={()=>setRefresh(v=>v+1)}>Reload settings form</button></>}
  {tab==='review'&&<section aria-label="Saved proposals">
   {!suggestions.length&&!changes.length&&!loading&&<p>No pending suggestions or task changes. Connect Gmail and review saved permission under Connection and permissions before scanning.</p>}
   {suggestions.map(s=>{const quote=evidence.get(s.evidence_id);const fields=s.review_fields??s.fields;return <article className="storage-panel" key={s.id}><h2>{fields.action}</h2><Fields fields={fields}/><ExtractionReview extraction={extractions.get(s.extraction_id)}/>
    <blockquote>{quote?.quote??'Supporting evidence has expired.'}</blockquote><div className="storage-actions"><button disabled={busy||!quote?.quote} onClick={()=>void perform(()=>reviewStoredRecord('suggestion',s.id,'approve',s.revision),'Task approved. No Calendar event was created.')}>Approve task</button><button disabled={busy} onClick={()=>void perform(()=>reviewStoredRecord('suggestion',s.id,'dismiss',s.revision),'Suggestion dismissed.')}>Dismiss</button></div></article>})}
   {changes.map(c=>{const target=tasks.find(t=>t.id===c.target_task_id),open=target?.status==='approved'&&!target.cancelled_at,stale=open&&target.revision!==c.expected_revision,quote=evidence.get(c.evidence_id);return <article className="storage-panel" key={c.id}>
    <h2>{c.kind==='cancel'?'Proposed cancellation':'Proposed task edit'}: {c.baseline?.action??'Target needs review'}</h2><p>{c.reason}</p><p>Target: {target?.accepted_fields.action??'No eligible task selected'} · expected revision {c.expected_revision??'unresolved'}</p>
    {c.kind==='edit'&&<table><thead><tr><th>Field</th><th>Accepted at inference</th><th>Proposed</th></tr></thead><tbody>{c.changed_fields.map((field:string)=><tr key={field}><th scope="row">{field}</th><td>{display(c.baseline?.[field])}</td><td>{display(c.fields?.[field])}</td></tr>)}</tbody></table>}
    {c.kind==='cancel'&&c.baseline&&<><p>Accepted values are retained if cancellation is approved.</p><Fields fields={c.baseline}/></>}
    <ExtractionReview extraction={extractions.get(c.extraction_id)}/><blockquote>{quote?.quote??'Supporting evidence has expired.'}</blockquote>
    {!c.target_task_id&&<p>This reference is ambiguous. No accepted task can be changed from this proposal.</p>}
    {c.target_task_id&&!open&&<p>The task is no longer open, so this proposal cannot be applied. You can dismiss it.</p>}
    {stale&&<><p>The task changed since this proposal. Current accepted values:</p><Fields fields={target.accepted_fields}/><button disabled={busy} onClick={()=>void perform(()=>reviewTaskChange(c.id,c.revision,'rebase',target.revision),'Proposal refreshed against the current task. Review the new comparison before approving.')}>Review against current revision</button></>}
    <div className="storage-actions"><button disabled={busy||!open||!!stale||!quote?.quote} onClick={()=>void perform(()=>reviewTaskChange(c.id,c.revision,'approve'),'Task change approved. No Calendar write was authorized.')}>{c.kind==='cancel'?'Approve cancellation':'Approve edit'}</button><button disabled={busy} onClick={()=>void perform(()=>reviewTaskChange(c.id,c.revision,'dismiss'),'Proposal dismissed.')}>Dismiss</button></div>
   </article>})}
  </section>}
  {tab==='tasks'&&<section aria-label="Accepted tasks">{!tasks.length&&<p>No accepted tasks yet.</p>}{tasks.map(t=><article className="storage-panel" key={t.id}><h2>{t.accepted_fields.action}</h2><p>{t.cancelled_at?'Cancelled':t.status} · revision {t.revision}</p><Fields fields={t.accepted_fields}/><TaskCalendarControl key={`${userId}-${t.id}`} task={t} userId={userId}/>{!t.cancelled_at&&<button disabled={busy} onClick={()=>void perform(()=>reviewStoredRecord('task',t.id,t.status==='completed'?'undo':'complete',t.revision),'Task status saved.')}>{t.status==='completed'?'Undo completion':'Complete task'}</button>}</article>)}</section>}
  {tab==='information'&&<section aria-label="Informational results">{!information.length&&!loading&&<p>No informational summaries are saved.</p>}{information.map(e=><article className="storage-panel" key={e.id}><h2>{e.category}</h2><p>{e.summary}</p><ExtractionReview extraction={e}/></article>)}</section>}
 </main>
}
