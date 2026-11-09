import { filterMessage, PipelineError } from './core.mjs';
import { containsBlockedWord, textValues } from './private-topics.mjs';

const words = text => new Set(text.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []);
// This selects task candidates, never grants source access. A candidate is not a
// match: the model must cite current-message evidence and validation checks the
// target. Word overlap only ranks candidates, because a reply such as "this moved
// to Friday" can share no words with the task it changes.
// A task whose accepted values or source subjects contain a blocked word is never a
// candidate, because its values would carry that word to the model.
export function selectTaskContext(rows, message, rules, maxChars=12000, blockedTerms=[]) {
  const terms=words(`${message.subject} ${message.body}`); const eligible=[]; let omitted=false;
  if (!Array.isArray(rows) || rows.length>21) throw new PipelineError('INVALID_TASK_CONTEXT');
  for (const row of rows) {
    if (!row || !/^[0-9a-f-]{36}$/i.test(row.id) || !Number.isSafeInteger(row.revision) || row.revision<0
      || !row.acceptedFields || !Array.isArray(row.sources) || !row.sources.length) throw new PipelineError('INVALID_TASK_CONTEXT');
    if (row.sources.length>30) {omitted=true;continue;}
    if (row.sources.some(s=>filterMessage(s,rules)!=='PERMITTED')) continue;
    if (containsBlockedWord([...textValues(row.acceptedFields),...row.sources.map(s=>s.subject)],blockedTerms)) continue;
    if (!row.sources.some(s=>s.threadId===message.threadId)) continue;
    if (row.sources.every(s=>s.id===message.id)) continue;
    // A message cannot change a task that it created or that came from later mail.
    const origins=Array.isArray(row.origins)?row.origins:[];
    if (origins.some(o=>o.id===message.id || Date.parse(o.sentAt)>Date.parse(message.sentAt))) continue;
    const overlap=Array.from(words(row.acceptedFields.action)).filter(w=>terms.has(w)).length;
    eligible.push({overlap,candidate:{id:row.id,revision:row.revision,acceptedFields:row.acceptedFields,
      userEdited:row.userEdited===true,sourceMessageIds:origins.length?origins.map(o=>o.id):row.sources.map(s=>s.id)}});
  }
  const selected=[]; let used=0;
  for (const {candidate} of eligible.sort((a,b)=>b.overlap-a.overlap)) {
    const size=JSON.stringify(candidate).length;
    if (selected.length>=10 || used+size>maxChars) {omitted=true;continue;}
    used+=size;selected.push(candidate);
  }
  return {tasks:selected,omitted:omitted||rows.length>20};
}
