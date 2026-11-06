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
 return <section aria-label="Source emails" className="manual-source">{links.map((link,i)=><div key={`${link.messageId}-${link.role}-${i}`}>
  <h3>{roles[link.role]}{link.earlierMessage?' an earlier message in this thread':''}</h3>
  <p>From {link.sender??'unknown sender'}{link.sentAt?` · ${new Date(link.sentAt).toLocaleString()}`:''}<br/>Subject: {link.subject||'(no subject)'}</p>
  <blockquote>{link.quote??'The saved excerpt has expired.'}</blockquote>
  <OpenInGmail email={email} messageId={link.messageId}/>
 </div>)}</section>
}
