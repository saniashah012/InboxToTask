// Pure conversions between saved scan settings (scan_settings_get/save) and the
// designed onboarding/settings screens. No network or React here, so the offline
// suite can test it directly.
import type { ScanSettings } from "./storageAdapter"
import { resolveScanConsent } from "./scanConsent.ts"

// Same shape the designed chip editor already uses.
export type SetupPreferences = {
  includedTypes: string[]
  selectedSenders: string[]
  selectedDomains: string[]
  excludedTypes: string[]
  excludedSenders: string[]
  excludedDomains: string[]
  excludedSubjects: string[]
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
  }
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
    semantic_preferences: {
      include: clean(preferences.includedTypes, false),
      exclude: clean(preferences.excludedTypes, false),
    },
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

// Onboarding's consent box: undefined keeps saved consent and pause exactly.
export function withConsentDecision(settings: ScanSettings, decision?: boolean): ScanSettings {
  const resolved = resolveScanConsent(settings, decision)
  return { ...settings, consent: resolved.p_consent, paused: resolved.p_paused }
}

export function hasSourcePermission(preferences: Pick<SetupPreferences, "selectedSenders" | "selectedDomains">) {
  return preferences.selectedSenders.some(v => v.trim()) || preferences.selectedDomains.some(v => v.trim())
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
  if (!hasSourcePermission({ selectedSenders: settings.rules.allow.senders, selectedDomains: settings.rules.allow.domains })) {
    blockers.push("No permitted senders or domains, so nothing will be processed.")
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
  const access = allowed.length ? `Permit ${allowed.join(" OR ")}` : "No permitted sources, so nothing is processed"
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
  const pick = (s: ScanSettings) => stable([s.rules, s.semantic_preferences, s.context_limits, s.consent, s.paused])
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
