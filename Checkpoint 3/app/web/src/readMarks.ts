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
