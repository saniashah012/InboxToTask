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
 return <p><a href={gmailConversationUrl(email,messageId)} target="_blank" rel="noopener noreferrer">Open conversation in Gmail</a></p>
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
