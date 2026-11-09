import {useEffect,useState} from 'react'
import ExtractionReview from './ExtractionReview'
import {OpenInGmail} from './SourceEmails'
import {loadRead,saveRead} from './readMarks'

export default function InformationTab({userId,email,items,sources,loading}:{userId:string;email:string;items:any[];sources:any[];loading:boolean}){
 const [read,setRead]=useState(()=>loadRead(userId))
 const [open,setOpen]=useState<Set<string>>(new Set())
 useEffect(()=>{setRead(loadRead(userId));setOpen(new Set())},[userId])
 const sourceOf=(id:string)=>sources.find(s=>s.id===id)
 const mark=(id:string,isRead:boolean)=>{
  const next=new Set(read);if(isRead)next.add(id);else next.delete(id)
  setRead(next);saveRead(userId,next)
  setOpen(o=>{const n=new Set(o);n.delete(id);return n})
 }
 const toggleView=(id:string)=>setOpen(o=>{const n=new Set(o);if(n.has(id))n.delete(id);else n.add(id);return n})
 // Array.prototype.sort is stable, so order within each group is preserved.
 const ordered=[...items].sort((a,b)=>Number(read.has(a.source_id))-Number(read.has(b.source_id)))
 const readCount=items.filter(e=>read.has(e.source_id)).length
 return <section aria-label="Informational results">
  {!items.length&&!loading&&<p>No informational summaries are saved.</p>}
  {items.length>0&&<p className="manual-info-count" role="status">{items.length-readCount} unread · {readCount} read <span>(remembered in this browser)</span></p>}
  {ordered.map(e=>{
   const src=sourceOf(e.source_id),isRead=read.has(e.source_id),expanded=!isRead||open.has(e.source_id)
   const title=src?.subject||e.category||'(no subject)',panel=`info-${e.id}`
   const sent=src?.sent_at&&!Number.isNaN(Date.parse(src.sent_at))?new Date(src.sent_at):null
   return <article className={`storage-panel manual-info${isRead?' is-read':''}`} key={e.id}>
    {isRead?<div className="manual-info-row"><span className="manual-info-marker">✓ Read</span><strong id={`${panel}-title`}>{title}</strong>
      <button aria-expanded={expanded} aria-controls={panel} onClick={()=>toggleView(e.source_id)}>{expanded?'Hide summary':'View summary'}</button>
      <button onClick={()=>mark(e.source_id,false)}>Mark as unread</button></div>
     :<><p className="manual-info-label">Executive summary</p><h2>{title}</h2></>}
    {expanded&&<div id={panel}>
     {!isRead||src?<p className="manual-info-meta">{src?.sender&&<>From {src.sender}</>}{src?.sender&&sent&&' · '}{sent&&<time dateTime={sent.toISOString()}>{sent.toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})}</time>}</p>:null}
     {e.category&&<p className="manual-info-label">{e.category}</p>}
     <p>{e.summary}</p><ExtractionReview extraction={e}/>
     <OpenInGmail email={email} messageId={src?.message_id}/>
     {!isRead&&<button onClick={()=>mark(e.source_id,true)}>Mark as read</button>}
    </div>}
   </article>})}
 </section>
}
