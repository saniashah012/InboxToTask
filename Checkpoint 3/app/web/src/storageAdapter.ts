import { createClient } from "@supabase/supabase-js"

export type Deadline = { date: string; time: string | null; timeZone: string; wording: string; boundary: "by" | "before" | "on" | "unspecified" }
export type TaskFields = { action: string; requirements: string[]; condition: string | null; deadline: Deadline | null }
export type StoredRow = Record<string, any>
export type Snapshot = Record<string, StoredRow[]>

// One shared Auth client: the OAuth implementation can reuse this session.
// Public browser configuration only; never accept a privileged key here.
const url = import.meta.env.VITE_SUPABASE_URL
const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
function configuredClient() {
  if (import.meta.env.VITE_STORAGE_ENABLED !== "true" || !url || !publicKey || publicKey.startsWith("sb_secret_")) return null
  try { return createClient(url, publicKey) } catch { return null }
}
export const storageClient = configuredClient()

const tables = {
  tasks: "tasks", suggestions: "storage_suggestions", extractions: "storage_extractions",
  evidence: "storage_evidence", sources: "storage_sources", waiting: "storage_waiting_for",
  followups: "storage_followups", preferences: "storage_preferences",
} as const

export async function loadStorageSnapshot(): Promise<Snapshot> {
  if (!storageClient) throw new Error("Storage connection is not configured.")
  const entries = await Promise.all(Object.entries(tables).map(async ([key, table]) => {
    // RLS owns authorization; never substitute a browser-supplied owner filter.
    let query = storageClient.from(table).select("*")
    if (key === "suggestions" || key === "waiting") query = query.gt("expires_at", new Date().toISOString())
    const orderBy = key === "preferences" ? "user_id"
      : ["tasks", "suggestions", "extractions", "sources"].includes(key) ? "created_at" : "id"
    const { data, error } = await query.order(orderBy, { ascending: orderBy !== "created_at" }).limit(200)
    if (error) throw new Error("Could not load stored results. Check the local migrations and session.")
    return [key, data ?? []] as const
  }))
  const { data: activity, error: activityError } = await storageClient.rpc("storage_activity")
  if (activityError) throw new Error("Could not load processing activity.")
  return { ...Object.fromEntries(entries), activity: activity ? [activity] : [] }
}

export async function reviewStoredRecord(kind: string, id: string | null, action: string, revision: number, fields: unknown = null) {
  if (!storageClient) throw new Error("Storage connection is not configured.")
  const { data, error } = await storageClient.rpc("storage_action", {
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
