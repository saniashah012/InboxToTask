// Read markers are remembered in this browser only. They are keyed by the verified user ID and
// hold source IDs only (never email content). The source ID is stable when a source is
// re-extracted, so a newer summary of the same email keeps its read state.
const storageKey=(userId:string)=>`inboxtotask:info-read:${userId}`
export function loadRead(userId:string):Set<string>{
 try{
  const parsed=JSON.parse(window.localStorage.getItem(storageKey(userId))??'[]')
  return new Set(Array.isArray(parsed)?parsed.filter((v):v is string=>typeof v==='string'&&v.length<=100):[])
 }catch{return new Set()}
}
export function saveRead(userId:string,ids:Set<string>){
 try{window.localStorage.setItem(storageKey(userId),JSON.stringify([...ids]))}catch{/* storage unavailable: state stays in memory */}
}

// "Turn into task": whether the Passive email was read before it became a task, so Undo
// and Move back to Passive can restore it. Task ID -> { sourceId, wasRead }; IDs only, in
// this browser only. Another browser has no record and leaves the read mark as it is.
export type PriorRead={sourceId:string;wasRead:boolean}
const priorKey=(userId:string)=>`inboxtotask:passive-task-read:${userId}`
const PRIOR_LIMIT=50
const validId=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=100
function loadPriors(userId:string):Record<string,PriorRead>{
 try{
  const parsed=JSON.parse(window.localStorage.getItem(priorKey(userId))??'{}')
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return {}
  const out:Record<string,PriorRead>={}
  for(const [taskId,value] of Object.entries(parsed as Record<string,unknown>)){
   const v=value as Partial<PriorRead>|null
   if(validId(taskId)&&v&&validId(v.sourceId)&&typeof v.wasRead==='boolean')out[taskId]={sourceId:v.sourceId,wasRead:v.wasRead}
  }
  return out
 }catch{return {}}
}
function savePriors(userId:string,priors:Record<string,PriorRead>){
 // Oldest entries are dropped first (insertion order), so the record stays small.
 const kept=Object.entries(priors).slice(-PRIOR_LIMIT)
 try{window.localStorage.setItem(priorKey(userId),JSON.stringify(Object.fromEntries(kept)))}catch{/* storage unavailable: nothing to restore later */}
}
// Keeps the first record for a task: a repeated save of the same email must not replace it.
export function rememberPriorRead(userId:string,taskId:string,prior:PriorRead){
 if(!validId(taskId)||!validId(prior.sourceId))return
 const priors=loadPriors(userId)
 if(priors[taskId])return
 priors[taskId]={sourceId:prior.sourceId,wasRead:prior.wasRead}
 savePriors(userId,priors)
}
// Puts the email's read mark back as it was and forgets the record. False when this
// browser has no record (the read mark is then left as it is).
export function restorePriorRead(userId:string,taskId:string):boolean{
 const priors=loadPriors(userId)
 const prior=priors[taskId]
 if(!prior)return false
 const read=loadRead(userId)
 if(prior.wasRead)read.add(prior.sourceId);else read.delete(prior.sourceId)
 saveRead(userId,read)
 delete priors[taskId]
 savePriors(userId,priors)
 return true
}
