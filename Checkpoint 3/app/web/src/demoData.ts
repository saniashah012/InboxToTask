export type ScanState = "ready" | "processing" | "cooldown" | "running" | "empty" | "failed" | "paused" | "missing-sources" | "disconnected"

export const processingActivityFixture = {
  lastChecked: "10:42 a.m.",
  processed: 18,
  excluded: 6,
  failed: 1,
  initialBacklog: 34,
}
