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
