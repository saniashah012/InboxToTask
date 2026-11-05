// Presets only add visible terms. Saved terms do not change when presets change.
export const filterPresets: Record<string, string[]> = {
  School: ["homework", "assignment", "syllabus"],
  "Job applications": ["job application", "interview", "recruiting"],
  Research: ["research", "study", "publication"],
  Meetings: ["meeting", "agenda", "project"],
  Financial: ["invoice", "payment", "bank", "receipt"],
  Health: ["health", "medical", "appointment"],
  Promotions: ["sale", "promotion", "discount"],
  "Family & friends": ["family", "birthday", "reunion"],
}
export const uniqueTerms = (terms: string[]) => [...new Set(terms.map(t => t.trim().toLowerCase()).filter(Boolean))]
export function preferenceScope(p: { includedTypes: string[]; selectedSenders: string[]; selectedDomains: string[]; excludedTypes: string[]; excludedSenders: string[]; excludedDomains: string[]; excludedSubjects: string[] }) {
  const allowed = [...p.includedTypes.map(t => `subject or sender contains "${t}"`), ...p.selectedSenders.map(t => `from ${t}`), ...p.selectedDomains.map(t => `domain ${t}`)]
  const blocked = [...p.excludedTypes.map(t => `subject or sender contains "${t}"`), ...p.excludedSenders.map(t => `from ${t}`), ...p.excludedDomains.map(t => `domain ${t}`), ...p.excludedSubjects.map(t => `subject contains "${t}" (previous rule)`)]
  return `${allowed.length ? `Include ${allowed.join(" OR ")}` : "No inclusions; nothing will be processed"}.${blocked.length ? ` Exclude ${blocked.join(" OR ")}.` : ""} Exclusions always win. Scanning is not connected yet.`
}
