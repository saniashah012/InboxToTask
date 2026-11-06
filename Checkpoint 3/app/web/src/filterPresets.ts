export const uniqueTerms = (terms: string[]) => [...new Set(terms.map(t => t.trim().toLowerCase()).filter(Boolean))]
export function preferenceScope(p: { includedTypes: string[]; selectedSenders: string[]; selectedDomains: string[]; excludedTypes: string[]; excludedSenders: string[]; excludedDomains: string[]; excludedSubjects: string[] }, realAccount = false) {
  const allowed = [...p.selectedSenders.map(t => `from ${t}`), ...p.selectedDomains.map(t => `domain ${t}`)]
  const blocked = [...p.excludedSenders.map(t => `from ${t}`), ...p.excludedDomains.map(t => `domain ${t}`), ...p.excludedSubjects.map(t => `subject contains "${t}"`)]
  return `${allowed.length ? `Include ${allowed.join(" OR ")}` : "No inclusions; nothing will be processed"}.${blocked.length ? ` Exclude ${blocked.join(" OR ")}.` : ""} Source exclusions always win. Topics are evaluated by Gemini only after source access is permitted; they never grant access. ${realAccount ? "Saving does not start a scan." : "Scanning is not connected yet."}`
}
