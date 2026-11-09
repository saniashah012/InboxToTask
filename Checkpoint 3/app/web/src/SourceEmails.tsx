import {supabase} from './supabase'

export type TaskSourceLink={taskId:string;role:'created'|'updated'|'cancelled';threadId:string;messageId:string;earlierMessage:boolean;
 sender:string|null;subject:string|null;sentAt:string|null;quote:string|null}

const roles:Record<TaskSourceLink['role'],string>={created:'Created from',updated:'Updated by',cancelled:'Cancelled by'}

// Naive implementation: the full email stays in Gmail and nothing is fetched here. This
// URL format is not a documented Google contract, and Gmail opens the whole conversation.
export const gmailConversationUrl=(email:string,messageId:string)=>
 `https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}#all/${encodeURIComponent(messageId)}`

export async function loadTaskSourceLinks(taskIds:string[]):Promise<TaskSourceLink[]>{
 if(!supabase)throw new Error('Account connection is not configured.')
 if(!taskIds.length)return []
 const {data,error}=await supabase.rpc('gmail_task_source_links',{p_tasks:taskIds})
 if(error)throw new Error('Could not load source emails.')
 return data
}

export function OpenInGmail({email,messageId}:{email:string;messageId?:string|null}){
 if(!messageId)return <p>The source email is unavailable.</p>
 return <p className="gmail-open"><a className="gmail-open-button" href={gmailConversationUrl(email,messageId)} target="_blank" rel="noopener noreferrer">
  Open conversation in Gmail
  <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3h7v7"/><path d="m10 14 11-11"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>
  <span className="visually-hidden"> (opens in a new tab)</span>
 </a></p>
}

export function TaskSourceEmails({links,email}:{links:TaskSourceLink[]|null;email:string}){
 if(!links)return <p>Source emails could not be loaded. Reload to try again.</p>
 if(!links.length)return <p>No linked source email is available.</p>
 // Oldest first, so the list reads as the task's history. Undated links go last.
 const time=(link:TaskSourceLink)=>link.sentAt?Date.parse(link.sentAt):Infinity
 const ordered=[...links].sort((a,b)=>time(a)-time(b))
 return <section aria-label="Source emails" className="manual-timeline">
  <h3>Email history · {ordered.length} {ordered.length===1?'email':'emails'}</h3>
  <ol>{ordered.map((link,i)=><li key={`${link.messageId}-${link.role}-${i}`} className={`is-${link.role}`}>
   <div className="manual-timeline-head"><strong>{roles[link.role]}{link.earlierMessage?' an earlier message in this thread':''}</strong>{link.sentAt&&<time dateTime={link.sentAt}>{new Date(link.sentAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</time>}</div>
   <p className="manual-timeline-subject">{link.subject||'(no subject)'}</p>
   <p className="manual-timeline-sender">From {link.sender??'unknown sender'}</p>
   <details><summary>Show saved excerpt</summary><blockquote>{link.quote??'The saved excerpt has expired.'}</blockquote></details>
   <OpenInGmail email={email} messageId={link.messageId}/>
  </li>)}</ol>
 </section>
}
