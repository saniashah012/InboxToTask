export type ScanState = "ready" | "processing" | "cooldown" | "running" | "empty" | "failed" | "paused" | "missing-sources" | "disconnected"

export type SourceRules = {
  allowedLabels: string[]
  allowedSenders: string[]
  allowedDomains: string[]
  excludedLabels: string[]
  excludedSenders: string[]
  excludedDomains: string[]
  excludedSubjects: string[]
}

export const gmailLabels = [
  "School",
  "Research",
  "Applications",
  "Receipts",
  "Newsletters",
]

export const processingActivityFixture = {
  lastChecked: "10:42 a.m.",
  processed: 18,
  excluded: 6,
  failed: 1,
  initialBacklog: 34,
}

export function scopeSummary(rules: SourceRules) {
  const allowed = [
    ...rules.allowedLabels.map((value) => `labeled ${value}`),
    ...rules.allowedSenders.map((value) => `from ${value}`),
    ...rules.allowedDomains.map((value) => `from @${value}`),
  ]
  if (!allowed.length) return "No permitted sources selected."
  const excluded = [
    ...rules.excludedLabels.map((value) => `labeled ${value}`),
    ...rules.excludedSenders.map((value) => `from ${value}`),
    ...rules.excludedDomains.map((value) => `from @${value}`),
    ...rules.excludedSubjects.map((value) => `subject contains "${value}"`),
  ]
  return `Process messages ${allowed.join(" OR ")}${
    excluded.length ? `, except any message ${excluded.join(" OR ")}` : ""
  }. Exclusions always win.`
}
