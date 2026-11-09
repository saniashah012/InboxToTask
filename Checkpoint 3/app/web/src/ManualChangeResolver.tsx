import {useId,useState,type FormEvent} from 'react'
import type {Deadline,StoredRow,TaskFields} from './storageAdapter'
import {gmailConversationUrl} from './SourceEmails'

type Props={change:StoredRow;source?:StoredRow;quote?:string|null;tasks:StoredRow[];email:string;busy:boolean;
 onResolve:(taskId:string,taskRevision:number,fields:TaskFields|null)=>void;onDismiss:()=>void}
export type Draft={action:string;requirements:string;condition:string;date:string;time:string;boundary:Deadline['boundary']}
const zone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone
// Saved JSON does not keep key order, so compare with sorted keys.
export const canonical=(value:unknown)=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v)
export const draftFrom=(f:TaskFields):Draft=>({action:f.action,requirements:f.requirements.join('\n'),condition:f.condition??'',date:f.deadline?.date??'',time:f.deadline?.time??'',boundary:f.deadline?.boundary??'by'})

export function fieldsFromDraft(d:Draft,current:TaskFields,timeZone=zone()):TaskFields{
 const unchanged=current.deadline&&current.deadline.date===d.date&&(current.deadline.time??'')===d.time&&current.deadline.boundary===d.boundary
 return {action:d.action.trim(),requirements:d.requirements.split('\n').map(r=>r.trim()).filter(Boolean),condition:d.condition.trim()||null,
  deadline:!d.date?null:unchanged?current.deadline:{date:d.date,time:d.time||null,timeZone:current.deadline?.timeZone??timeZone,wording:'Entered by you after reading the source email.',boundary:d.boundary}}
}

// A proposal with no target holds no values to accept. The user reads the source,
// chooses the task and states what is correct. Full bodies are not stored, so the
// complete message stays in Gmail.
export default function ManualChangeResolver({change,source,quote,tasks,email,busy,onResolve,onDismiss}:Props){
 const id=useId(),[taskId,setTaskId]=useState(''),[draft,setDraft]=useState<Draft|null>(null),[error,setError]=useState('')
 const task=tasks.find(t=>t.id===taskId),cancel=change.kind==='cancel'
 const link=source&&gmailConversationUrl(email,source.message_id)
 const set=(patch:Partial<Draft>)=>{setDraft(d=>d&&{...d,...patch});setError('')}
 function choose(next:string){const chosen=tasks.find(t=>t.id===next);setTaskId(next);setError('');setDraft(chosen?draftFrom(chosen.accepted_fields):null)}
 function submit(event:FormEvent){
  event.preventDefault();if(!task)return setError('Choose the task this email refers to.')
  if(cancel)return onResolve(task.id,task.revision,null)
  if(!draft?.action.trim())return setError('Enter the task action.')
  const fields=fieldsFromDraft(draft,task.accepted_fields)
  if(canonical(fields)===canonical(task.accepted_fields))return setError('Change at least one value, or dismiss this item.')
  onResolve(task.id,task.revision,fields)
 }
 return <article className="storage-panel" aria-labelledby={`${id}-title`}>
  <h2 id={`${id}-title`}>{cancel?'Which task was cancelled?':'Which task changed?'}</h2>
  <p>This email seems to change a task, but it does not say clearly which one or what the new values are. Read the source, then enter what you believe is correct. Nothing changes until you save.</p>
  <p>{change.reason}</p>
  <section aria-label="Source email" className="manual-source">
   <h3>Source email</h3>
   {source?<p>From {source.sender} · {new Date(source.sent_at).toLocaleString()}<br/>Subject: {source.subject||'(no subject)'}</p>:<p>Source details are unavailable.</p>}
   <blockquote>{quote??'The saved excerpt has expired.'}</blockquote>
   {link&&<p><a href={link} target="_blank" rel="noopener noreferrer">Open conversation in Gmail</a></p>}
  </section>
  <form onSubmit={submit} className="manual-resolver">
   <label>Task this email refers to<select value={taskId} disabled={busy} onChange={e=>choose(e.target.value)}>
    <option value="">Choose a task</option>{tasks.map(t=><option key={t.id} value={t.id}>{t.accepted_fields.action}</option>)}</select></label>
   {!tasks.length&&<p>You have no open tasks to apply this to. You can dismiss it.</p>}
   {!cancel&&draft&&<>
    <label>Action<input value={draft.action} maxLength={350} disabled={busy} onChange={e=>set({action:e.target.value})}/></label>
    <div className="manual-resolver-row">
     <label>Deadline date (optional)<input type="date" value={draft.date} disabled={busy} onChange={e=>set({date:e.target.value})}/></label>
     <label>Time (optional)<input type="time" value={draft.time} disabled={busy||!draft.date} onChange={e=>set({time:e.target.value})}/></label>
     <label>Timing<select value={draft.boundary} disabled={busy||!draft.date} onChange={e=>set({boundary:e.target.value as Deadline['boundary']})}>
      <option value="by">By</option><option value="before">Before</option><option value="on">On</option><option value="unspecified">Unspecified</option></select></label>
    </div>
    <label>Condition (optional)<input value={draft.condition} maxLength={350} disabled={busy} onChange={e=>set({condition:e.target.value})}/></label>
    <label>Requirements (one per line)<textarea value={draft.requirements} disabled={busy} onChange={e=>set({requirements:e.target.value})}/></label>
   </>}
   {cancel&&task&&<p>The task keeps its accepted values and is marked cancelled.</p>}
   {error&&<p className="storage-error" role="alert">{error}</p>}
   <div className="storage-actions"><button type="submit" disabled={busy||!task}>{cancel?'Cancel selected task':'Save my values to this task'}</button>
    <button type="button" disabled={busy} onClick={onDismiss}>Dismiss</button></div>
  </form>
 </article>
}
