import { filterMessage, PipelineError } from './core.mjs';

const words = text => new Set(text.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []);
// This selects task candidates, never grants source access. Thread identity by
// itself cannot select an update target. Accepted values include current edits.
export function selectTaskContext(rows, message, rules, maxChars=12000) {
  const terms=words(`${message.subject} ${message.body}`); const selected=[]; let used=0; let omitted=false;
  if (!Array.isArray(rows) || rows.length>21) throw new PipelineError('INVALID_TASK_CONTEXT');
  for (const row of rows) {
    if (!row || !/^[0-9a-f-]{36}$/i.test(row.id) || !Number.isSafeInteger(row.revision) || row.revision<0
      || !row.acceptedFields || !Array.isArray(row.sources) || !row.sources.length || row.sources.length>30) throw new PipelineError('INVALID_TASK_CONTEXT');
    if (row.sources.some(s=>filterMessage(s,rules)!=='PERMITTED')) continue;
    if (!row.sources.some(s=>s.threadId===message.threadId)) continue;
    if (row.sources.every(s=>s.id===message.id)) continue;
    if (!Array.from(words(row.acceptedFields.action)).some(w=>terms.has(w))) continue;
    const candidate={id:row.id,revision:row.revision,acceptedFields:row.acceptedFields,
      userEdited:row.userEdited===true,sourceMessageIds:row.sources.map(s=>s.id)};
    const size=JSON.stringify(candidate).length;
    if (selected.length>=10 || used+size>maxChars) {omitted=true;continue;}
    used+=size;selected.push(candidate);
  }
  return {tasks:selected,omitted:omitted||rows.length>20};
}
