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
export type FilterKeywordGroup = { category: string; keywords: string[] }
export type StoredKeywordRules = {
  keywords?: string[]
  customKeywords?: string[]
  keywordGroups?: FilterKeywordGroup[]
}

export function effectiveFilterKeywords(customKeywords: string[], groups: FilterKeywordGroup[]) {
  return uniqueTerms([...customKeywords, ...groups.flatMap(group => group.keywords)])
}

export function readStoredKeywordRules(rules: StoredKeywordRules) {
  return {
    // Keyword-only rows predate group metadata; keep each saved term editable as a phrase.
    customKeywords: rules.customKeywords ?? rules.keywords ?? [],
    groups: rules.keywordGroups ?? [],
  }
}

export function writeStoredKeywordRules(customKeywords: string[], groups: FilterKeywordGroup[]) {
  return {
    keywords: effectiveFilterKeywords(customKeywords, groups),
    customKeywords,
    keywordGroups: groups,
  }
}

export function preferenceScope(p: { includedTypes: string[]; includedCategoryGroups: FilterKeywordGroup[]; selectedSenders: string[]; selectedDomains: string[]; excludedTypes: string[]; excludedCategoryGroups: FilterKeywordGroup[]; excludedSenders: string[]; excludedDomains: string[]; excludedSubjects: string[] }) {
  const allowed = [...effectiveFilterKeywords(p.includedTypes, p.includedCategoryGroups).map(t => `subject or sender contains "${t}"`), ...p.selectedSenders.map(t => `from ${t}`), ...p.selectedDomains.map(t => `domain ${t}`)]
  const blocked = [...effectiveFilterKeywords(p.excludedTypes, p.excludedCategoryGroups).map(t => `subject or sender contains "${t}"`), ...p.excludedSenders.map(t => `from ${t}`), ...p.excludedDomains.map(t => `domain ${t}`), ...p.excludedSubjects.map(t => `subject contains "${t}" (previous rule)`)]
  return `${allowed.length ? `Include ${allowed.join(" OR ")}` : "No inclusions; nothing will be processed"}.${blocked.length ? ` Exclude ${blocked.join(" OR ")}.` : ""} Exclusions always win. Scanning is not connected yet.`
}
