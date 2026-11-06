import { supabase } from "./supabase"

export type Deadline = { date: string; time: string | null; timeZone: string; wording: string; boundary: "by" | "before" | "on" | "unspecified" }
export type TaskFields = { action: string; requirements: string[]; condition: string | null; deadline: Deadline | null }
export type StoredRow = Record<string, any>
export type Snapshot = Record<string, StoredRow[]>

export type ScanRules = Record<"allow" | "block", Record<"labels" | "senders" | "domains" | "subjectKeywords" | "keywords", string[]>>
export type ScanSettings = {
  revision: number; consent: boolean; paused: boolean; consent_at: string | null
  semantic_preferences: { include: string[]; exclude: string[] }
  requires_review: boolean; legacy_phrase_rules: ScanRules | null; reviewed?: boolean
  rules: ScanRules
  context_limits: { maxMessages: number; maxAgeDays: number; maxMessageChars: number; maxTotalChars: number }
}
export async function loadScanSettings(): Promise<ScanSettings> {
  if (!supabase) throw new Error("Account connection is not configured.")
  const { data, error } = await supabase.rpc("scan_settings_get")
  if (error) throw new Error("Could not load scanning settings. Retry after checking the local backend migration.")
  return data
}
export async function saveScanSettings(settings: ScanSettings): Promise<ScanSettings> {
  if (!supabase) throw new Error("Account connection is not configured.")
  const { data, error } = await supabase.rpc("scan_settings_save", {
    p_semantic: settings.semantic_preferences, p_reviewed: settings.reviewed ?? false,
    p_revision: settings.revision, p_rules: settings.rules, p_context: settings.context_limits,
    p_consent: settings.consent, p_paused: settings.paused,
    p_disclosure: settings.consent ? "gmail-scan-v1" : null,
  })
  if (error) throw new Error(error.code === "PT409"
    ? "Settings changed in another window. Reload saved settings before saving again."
    : "Settings were not saved. Check addresses, domains, list sizes, and context limits, then retry.")
  return data
}

export const storageClient =
  import.meta.env.VITE_STORAGE_ENABLED === "true" ? supabase : null

export const googleSignInEnabled = import.meta.env.VITE_GOOGLE_AUTH_ENABLED === "true"
export async function signInWithGoogle() {
  if (!storageClient || !googleSignInEnabled) throw new Error("Google sign-in is not configured.")
  const { error } = await storageClient.auth.signInWithOAuth({ provider: "google", options: {
    redirectTo: `${window.location.origin}/storage/auth/callback`,
    // App identity only. Gmail offline access uses the backend connection flow.
    scopes: "openid email profile", queryParams: { prompt: "select_account" },
  } })
  if (error) throw new Error("Google sign-in could not start. Check the provider configuration.")
}

export type GoogleStatus = { state: "disconnected" | "connected" | "reconnect_required" | "disconnecting"; email?: string; scopes?: string[]; expiresAt?: string; scanningEnabled: false }
export async function googleConnectionStatus(): Promise<GoogleStatus> {
  if (!supabase) throw new Error("Account connection is not configured.")
  const { data, error } = await supabase.rpc("google_connection_status")
  if (error) throw new Error("Could not load Google connection status. Check the backend setup.")
  return data
}
export async function googleConnectionAction(action: "connect" | "check" | "disconnect") {
  if (!supabase) throw new Error("Account connection is not configured.")
  const { data, error } = await supabase.functions.invoke("google_connection", { body: { action } })
  if (error) {
    let code = ""
    try { code = (await error.context?.json())?.error ?? "" } catch { /* fixed messages */ }
    const messages: Record<string, string> = {
      GOOGLE_NOT_CONFIGURED: "Google connection is not configured in the backend.",
      GOOGLE_CONNECTION_BUSY: "A connection operation is running. Wait briefly and reload the status.",
      GOOGLE_RECONNECT_REQUIRED: "Google authorization expired or was revoked. Reconnect your account.",
      GOOGLE_REVOCATION_PENDING: "Access is blocked in this app, but Google revocation is pending. Retry disconnect.",
      GOOGLE_PROVIDER_UNAVAILABLE: "Google could not be reached. Try again shortly.",
      GOOGLE_CONNECTION_STALE: "The connection changed. Reload its status before trying again.",
    }
    throw new Error(messages[code] ?? "The Google connection could not be updated. Reload its status and try again.")
  }
  return data as { authorizationUrl?: string; state?: string }
}

const tables = {
  tasks: "tasks", suggestions: "storage_suggestions", extractions: "storage_extractions",
  evidence: "storage_evidence", sources: "storage_sources", waiting: "storage_waiting_for",
  followups: "storage_followups", preferences: "storage_preferences", changes: "gmail_task_changes",
} as const

export async function loadStorageSnapshot(client = storageClient): Promise<Snapshot> {
  if (!client) throw new Error("Account connection is not configured.")
  const entries = await Promise.all(Object.entries(tables).map(async ([key, table]) => {
    // RLS owns authorization; never substitute a browser-supplied owner filter.
    let query = client.from(table).select("*")
    if (key === "suggestions" || key === "waiting" || key === "changes") query = query.gt("expires_at", new Date().toISOString())
    const orderBy = key === "preferences" ? "user_id"
      : ["tasks", "suggestions", "extractions", "sources"].includes(key) ? "created_at" : "id"
    const { data, error } = await query.order(orderBy, { ascending: orderBy !== "created_at" }).limit(200)
    if (error) throw new Error("Could not load stored results. Check the local migrations and session.")
    return [key, data ?? []] as const
  }))
  const { data: activity, error: activityError } = await client.rpc("storage_activity")
  if (activityError) throw new Error("Could not load processing activity.")
  return { ...Object.fromEntries(entries), activity: activity ? [activity] : [] }
}

export async function reviewStoredRecord(kind: string, id: string | null, action: string, revision: number, fields: unknown = null) {
  if (!supabase) throw new Error("Storage connection is not configured.")
  const { data, error } = await supabase.rpc("storage_action", {
    p_kind: kind, p_id: id, p_action: action, p_revision: revision, p_fields: fields,
  })
  if (error) throw new Error(error.code === "PT409"
    ? "This record changed. Reload it before saving again."
    : "The change could not be saved. Check its fields and current state.")
  return data
}

export async function processStoredFixture(caseId: string) {
  if (!storageClient) throw new Error("Storage connection is not configured.")
  const { data, error } = await storageClient.functions.invoke("analysis_email", { body: { caseId } })
  if (error) {
    let code = ""
    try { code = (await error.context?.json())?.error ?? "" } catch { /* fixed messages below */ }
    const messages: Record<string, string> = {
      STORAGE_BUSY: "A request is already running. Reload shortly.",
      STORAGE_PAUSED: "Processing is paused.", STORAGE_SUPPRESSED: "This extraction was deleted and will not be recreated.",
      STORAGE_BUDGET: "The daily request or token budget is reached. Try after the UTC daily reset.",
      STORAGE_RETRY_LATER: "Please wait before retrying this request.", STORAGE_ATTEMPT_LIMIT: "This item reached its attempt limit.",
      STORAGE_PROVIDER_LIMIT: "The shared model request limit is reached. Try in the next minute.",
      FIXTURE_EXTRACTION_DISABLED: "Sample processing is disabled in the backend configuration.",
      PROVIDER_RATE_LIMITED: "The model provider is throttling requests. Try later.",
    }
    throw new Error(messages[code] ?? "Processing failed. No successful save was confirmed; reload before retrying.")
  }
  if (!data?.saved) throw new Error("Processing finished without saving a result.")
  return data.output
}
