// Pure conversions between saved scan settings (scan_settings_get/save) and the
// designed onboarding/settings screens. No network or React here, so the offline
// suite can test it directly.
import type { ScanSettings } from "./storageAdapter"
import { resolveScanConsent } from "./scanConsent.ts"
import { starterBlockedWords, starterTopicWords } from "./filterPresets.ts"

// Same shape the designed chip editor already uses.
export type SetupPreferences = {
  includedTypes: string[]
  selectedSenders: string[]
  selectedDomains: string[]
  excludedTypes: string[]
  excludedSenders: string[]
  excludedDomains: string[]
  excludedSubjects: string[]
  // Skipped-category word lists keyed by lowercased category name. A category
  // without an entry uses its starter list, or its own name for a custom one.
  blockedWords?: Record<string, string[]>
  // Topic-to-check word lists, keyed the same way. With any topic to check saved,
  // an email must contain one of these words before it reaches Gemini.
  includeWords?: Record<string, string[]>
}

export type ContextLimits = ScanSettings["context_limits"]

// Ranges mirror private.valid_scan_context in the source/semantic migration.
export const contextLimitFields = [
  { key: "maxMessages", label: "Earlier messages", min: 0, max: 10, suffix: "" },
  { key: "maxAgeDays", label: "Maximum age in days", min: 1, max: 365, suffix: "" },
  { key: "maxMessageChars", label: "Characters per message", min: 100, max: 30000, suffix: "" },
  { key: "maxTotalChars", label: "Total characters", min: 100, max: 60000, suffix: "" },
] as const

export function contextLimitError(limits: ContextLimits): string | null {
  for (const field of contextLimitFields) {
    const value = limits[field.key]
    if (!Number.isInteger(value) || value < field.min || value > field.max) {
      return `${field.label} must be a whole number from ${field.min} to ${field.max}.`
    }
  }
  if (limits.maxTotalChars < limits.maxMessageChars) {
    return "Total characters must be at least the characters per message."
  }
  return null
}

export function preferencesFromSettings(settings: ScanSettings): SetupPreferences {
  return {
    includedTypes: [...settings.semantic_preferences.include],
    selectedSenders: [...settings.rules.allow.senders],
    selectedDomains: [...settings.rules.allow.domains],
    excludedTypes: [...settings.semantic_preferences.exclude],
    excludedSenders: [...settings.rules.block.senders],
    excludedDomains: [...settings.rules.block.domains],
    excludedSubjects: [...settings.rules.block.subjectKeywords],
    blockedWords: Object.fromEntries(
      Object.entries(settings.semantic_preferences.blockedWords ?? {}).map(([topic, words]) => [topic, [...words]]),
    ),
    includeWords: Object.fromEntries(
      Object.entries(settings.semantic_preferences.includeWords ?? {}).map(([topic, words]) => [topic, [...words]]),
    ),
  }
}

// Skipped-category word lists. These mirror the backend normalizer
// (private.normalize_scan_semantic): category names are trimmed and lowercased,
// words are trimmed, lowercased and inner spaces collapsed.
export const MAX_WORDS_PER_TOPIC = 100
export const MAX_BLOCKED_WORDS = 1000

export function topicKey(topic: string): string {
  return topic.trim().toLowerCase()
}

export function normalizeBlockedWord(word: string): string {
  return word.trim().toLowerCase().replace(/\s+/g, " ")
}

export function starterWordsFor(topic: string): string[] | null {
  const words = starterBlockedWords[topicKey(topic)]
  return words ? [...words] : null
}

// The list a category uses now: the user's edited list, else its starter list,
// else the category name itself (what the backend would save).
export function blockedWordsFor(preferences: Pick<SetupPreferences, "blockedWords">, topic: string): string[] {
  const key = topicKey(topic)
  return [...(preferences.blockedWords?.[key] ?? starterWordsFor(key) ?? [key])]
}

export function starterTopicWordsFor(topic: string): string[] | null {
  const words = starterTopicWords[topicKey(topic)]
  return words ? [...words] : null
}

// The list a topic to check uses now: edited, else starter, else its own name.
export function includeWordsFor(preferences: Pick<SetupPreferences, "includeWords">, topic: string): string[] {
  const key = topicKey(topic)
  return [...(preferences.includeWords?.[key] ?? starterTopicWordsFor(key) ?? [key])]
}

export function totalIncludeWords(preferences: Pick<SetupPreferences, "includedTypes" | "includeWords">): number {
  const keys = new Set(preferences.includedTypes.map(topicKey).filter(Boolean))
  let total = 0
  for (const key of keys) total += includeWordsFor(preferences, key).length
  return total
}

export function totalBlockedWords(preferences: Pick<SetupPreferences, "excludedTypes" | "blockedWords">): number {
  const keys = new Set(preferences.excludedTypes.map(topicKey).filter(Boolean))
  let total = 0
  for (const key of keys) total += blockedWordsFor(preferences, key).length
  return total
}

// Checks one typed word before it joins a category's list. Returns the
// normalized word, an error to show, or null for blank input.
export function parseBlockedWord(
  raw: string,
  existing: string[],
  total: number,
): { value: string } | { error: string } | null {
  if (!raw.trim()) return null
  const value = normalizeBlockedWord(raw)
  if (value.length > 100 || CONTROL_CHARS.test(raw) || !/[\p{L}\p{N}]/u.test(value)) {
    return { error: "Words must be 1-100 characters and include a letter or number." }
  }
  if (existing.includes(value)) return { error: "That word is already in this list." }
  if (existing.length >= MAX_WORDS_PER_TOPIC) return { error: `A category can hold up to ${MAX_WORDS_PER_TOPIC} words.` }
  if (total >= MAX_BLOCKED_WORDS) return { error: `These categories can hold up to ${MAX_BLOCKED_WORDS} words in total.` }
  return { value }
}

function clean(values: string[], lower: boolean): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of values) {
    const value = lower ? raw.trim().toLowerCase() : raw.trim()
    const key = value.toLowerCase()
    if (!value || seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }
  return result
}

// Topics stay semantic: they are written only to semantic_preferences and never
// expanded into access keywords. Fields the screens do not edit keep their saved
// values, so an onboarding save cannot silently drop them.
export function settingsWithPreferences(
  settings: ScanSettings,
  preferences: SetupPreferences,
  context: ContextLimits = settings.context_limits,
): ScanSettings {
  return {
    ...settings,
    context_limits: { ...context },
    semantic_preferences: semanticWithWords(preferences),
    rules: {
      allow: {
        ...settings.rules.allow,
        senders: clean(preferences.selectedSenders, true),
        domains: clean(preferences.selectedDomains.map(d => d.trim().replace(/^@/, "")), true),
      },
      block: {
        ...settings.rules.block,
        senders: clean(preferences.excludedSenders, true),
        domains: clean(preferences.excludedDomains.map(d => d.trim().replace(/^@/, "")), true),
        subjectKeywords: clean(preferences.excludedSubjects, false),
      },
    },
  }
}

// Every skipped category is saved with its full word list, so the draft matches
// what the backend stores and an untouched form never reports unsaved edits.
function semanticWithWords(preferences: SetupPreferences): ScanSettings["semantic_preferences"] {
  const exclude = clean(preferences.excludedTypes, false)
  const blockedWords: Record<string, string[]> = {}
  for (const topic of exclude) {
    const key = topicKey(topic)
    if (blockedWords[key]) continue
    blockedWords[key] = [...new Set(blockedWordsFor(preferences, key).map(normalizeBlockedWord).filter(Boolean))]
  }
  const include = clean(preferences.includedTypes, false)
  const includeWords: Record<string, string[]> = {}
  for (const topic of include) {
    const key = topicKey(topic)
    if (includeWords[key]) continue
    includeWords[key] = [...new Set(includeWordsFor(preferences, key).map(normalizeBlockedWord).filter(Boolean))]
  }
  return { include, exclude, blockedWords, includeWords }
}

// Onboarding's consent box: undefined keeps saved consent and pause exactly.
export function withConsentDecision(settings: ScanSettings, decision?: boolean): ScanSettings {
  const resolved = resolveScanConsent(settings, decision)
  return { ...settings, consent: resolved.p_consent, paused: resolved.p_paused }
}

export function hasSourcePermission(preferences: Pick<SetupPreferences, "selectedSenders" | "selectedDomains">) {
  return preferences.selectedSenders.some(v => v.trim()) || preferences.selectedDomains.some(v => v.trim())
}

// A scan needs a permitted sender or domain, or else at least one category to
// check: with no sender or domain, any sender that is not blocked is checked for
// the categories' words. Must match private.scan_sources_ready.
export function hasScanSource(preferences: Pick<SetupPreferences, "selectedSenders" | "selectedDomains" | "includedTypes">) {
  return hasSourcePermission(preferences) || preferences.includedTypes.some(v => v.trim())
}

export function settingsHaveScanSource(settings: ScanSettings) {
  return hasScanSource({
    selectedSenders: settings.rules.allow.senders,
    selectedDomains: settings.rules.allow.domains,
    includedTypes: settings.semantic_preferences.include,
  })
}

// Signed-in routing: a first save (revision 0) goes through the designed onboarding.
// Legacy phrase rules need the workspace review form, which is the only screen
// that can send p_reviewed.
export function signedInRoute(settings: ScanSettings): "onboarding" | "review-legacy" | "workspace" {
  if (settings.requires_review) return "review-legacy"
  return settings.revision === 0 ? "onboarding" : "workspace"
}

export type GmailState = "disconnected" | "connected" | "reconnect_required" | "disconnecting" | "unknown"

// Every reason a manual scan would be refused by saved settings, in plain words.
export function scanBlockers(settings: ScanSettings, gmail: GmailState): string[] {
  const blockers: string[] = []
  if (!settingsHaveScanSource(settings)) {
    blockers.push("No permitted senders, domains or categories to check, so nothing will be processed.")
  }
  if (!settings.consent) blockers.push("Scanning consent has not been given.")
  if (settings.paused) blockers.push("Scanning is paused.")
  if (gmail !== "connected") blockers.push(gmail === "unknown" ? "Gmail connection status is unknown." : "Gmail is not connected.")
  return blockers
}

export function accessScopeSummary(preferences: SetupPreferences): string {
  const allowed = [
    ...preferences.selectedSenders.map(v => `sender ${v}`),
    ...preferences.selectedDomains.map(v => `domain ${v}`),
  ]
  const blocked = [
    ...preferences.excludedSenders.map(v => `sender ${v}`),
    ...preferences.excludedDomains.map(v => `domain ${v}`),
    ...preferences.excludedSubjects.map(v => `subject containing "${v}"`),
  ]
  const topics = preferences.includedTypes.map(v => v.trim()).filter(Boolean)
  const access = allowed.length
    ? `Permit ${allowed.join(" OR ")}`
    : topics.length
      ? `Permit any sender whose email uses a word from ${topics.join(" or ")}`
      : "No permitted senders, domains or categories to check, so nothing is processed"
  return `${access}${blocked.length ? `, except ${blocked.join(" or ")}` : ""}. Exclusions always win.`
}

// Compare what would be saved, so an unchanged form never reports unsaved edits.
// jsonb returns object keys in its own order, so compare with sorted keys.
export function sameSavedFields(a: ScanSettings, b: ScanSettings): boolean {
  const stable = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`).join(",")}}`
    }
    return JSON.stringify(value) ?? "null"
  }
  // A never-saved account has no word lists yet; the backend stores {} for none.
  const semantic = (s: ScanSettings) => ({
    ...s.semantic_preferences,
    blockedWords: s.semantic_preferences.blockedWords ?? {},
    includeWords: s.semantic_preferences.includeWords ?? {},
  })
  const pick = (s: ScanSettings) => stable([s.rules, semantic(s), s.context_limits, s.consent, s.paused])
  return pick(a) === pick(b)
}

// Chip inputs for exact access rules and literal subject exclusions.
export type RuleInputKey = "selectedSenders" | "selectedDomains" | "excludedSenders" | "excludedDomains" | "excludedSubjects"

const CONTROL_CHARS = /[\x00-\x1f\x7f]/

// Checks one typed sender, domain or subject rule before it becomes a chip.
// Returns the normalized value to add, an error to show, or null for blank
// input. The backend validates again on save; this is early feedback only.
export function parseRuleInput(
  key: RuleInputKey,
  raw: string,
  existing: string[],
): { value: string } | { error: string } | null {
  let value = raw.trim()
  if (!value) return null
  const isSender = key === "selectedSenders" || key === "excludedSenders"
  const isDomain = key === "selectedDomains" || key === "excludedDomains"
  if (isSender || isDomain) value = value.toLowerCase()
  if (isDomain) value = value.replace(/^@/, "")
  if (key === "excludedSubjects" && (value.length > 254 || CONTROL_CHARS.test(value))) {
    return { error: "Subject phrases must be 1-254 characters without control characters." }
  }
  if ((isSender && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) ||
      (isDomain && !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(value))) {
    return { error: isSender ? "Enter a complete sender email address." : "Enter a valid domain, such as example.edu." }
  }
  if (existing.some((item) => item.toLowerCase() === value.toLowerCase())) {
    return { error: "That rule is already included." }
  }
  return { value }
}

// Topic terms are semantic only and never grant access.
export function topicInputError(term: string, count: number): string | null {
  return term.length > 254 || CONTROL_CHARS.test(term) || count >= 200
    ? "Use up to 200 terms, each 1-254 characters without control characters."
    : null
}

// What a confirmed save changed, in plain words, for the message shown back on the
// dashboard. Compares the settings before the save with what the backend stored.
export const NO_SETTINGS_CHANGES = "No changes to save. Your settings are unchanged."
export function settingsChanges(before: ScanSettings, after: ScanSettings): string[] {
  const changes: string[] = []
  const norm = (values: string[] | undefined) => [...new Set((values ?? []).map(v => v.trim().toLowerCase()).filter(Boolean))]
  const diff = (label: string, a: string[] | undefined, b: string[] | undefined) => {
    const was = norm(a), now = norm(b)
    const added = now.filter(v => !was.includes(v)), removed = was.filter(v => !now.includes(v))
    if (added.length) changes.push(`added ${label} ${added.join(", ")}`)
    if (removed.length) changes.push(`removed ${label} ${removed.join(", ")}`)
  }
  diff("permitted sender", before.rules.allow.senders, after.rules.allow.senders)
  diff("permitted domain", before.rules.allow.domains, after.rules.allow.domains)
  diff("blocked sender", before.rules.block.senders, after.rules.block.senders)
  diff("blocked domain", before.rules.block.domains, after.rules.block.domains)
  diff("skipped subject", before.rules.block.subjectKeywords, after.rules.block.subjectKeywords)
  diff("category to check", before.semantic_preferences.include, after.semantic_preferences.include)
  diff("category to skip", before.semantic_preferences.exclude, after.semantic_preferences.exclude)
  // Word lists of categories kept on both sides; added or removed categories are named above.
  const words = (label: string, a: Record<string, string[]> | undefined, b: Record<string, string[]> | undefined, kept: string[]) => {
    const edited = kept.filter(t => JSON.stringify(norm(a?.[t])) !== JSON.stringify(norm(b?.[t])) && a?.[t] !== undefined && b?.[t] !== undefined)
    if (edited.length) changes.push(`edited the words for ${label} ${edited.join(", ")}`)
  }
  const keptBoth = (a: string[], b: string[]) => norm(a).filter(t => norm(b).includes(t))
  words("category to check", before.semantic_preferences.includeWords, after.semantic_preferences.includeWords,
    keptBoth(before.semantic_preferences.include, after.semantic_preferences.include))
  words("category to skip", before.semantic_preferences.blockedWords, after.semantic_preferences.blockedWords,
    keptBoth(before.semantic_preferences.exclude, after.semantic_preferences.exclude))
  if (JSON.stringify(before.context_limits) !== JSON.stringify(after.context_limits)) changes.push("changed the earlier-email context limits")
  if (before.consent !== after.consent) changes.push(after.consent ? "gave scanning consent" : "withdrew scanning consent")
  if (before.paused !== after.paused) changes.push(after.paused ? "paused scanning" : "resumed scanning")
  return changes
}

// "Settings saved: added permitted sender a@x.org and removed category to check School."
// Long lists are cut after three changes so the message stays readable.
export function settingsSavedNotice(changes: string[]): string {
  if (!changes.length) return "Settings saved. Nothing that affects scanning changed."
  const shown = changes.slice(0, 3)
  const more = changes.length - shown.length
  const parts = more > 0 ? [...shown, `${more} more change${more === 1 ? "" : "s"}`] : shown
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
  return `Settings saved: ${list}. No email was read and no scan was started.`
}
