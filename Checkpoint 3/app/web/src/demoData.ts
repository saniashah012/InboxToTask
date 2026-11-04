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
  const exclusions =
    rules.excludedLabels.length +
      rules.excludedSenders.length +
      rules.excludedDomains.length +
      rules.excludedSubjects.length >
    0
  return `Process messages ${allowed.join(" OR ")}${
    exclusions ? ", except blocked sources and subject keywords" : ""
  }.`
}
