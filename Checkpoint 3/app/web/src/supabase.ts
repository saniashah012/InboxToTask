import { createClient } from "@supabase/supabase-js"
import { resolveScanConsent } from "./scanConsent"

export type OnboardingPreferences = {
  scanRevision?: number
  includedTypes: string[]
  selectedSenders: string[]
  selectedDomains: string[]
  excludedTypes: string[]
  excludedSenders: string[]
  excludedDomains: string[]
  excludedSubjects: string[]
}

type PreferenceRow = {
  user_id: string
  included_types: string[]
  selected_sources: string[]
  excluded_types: string[]
  excluded_sources: string[]
  created_at: string
  updated_at: string
}

type Database = {
  public: {
    Tables: {
      user_onboarding_preferences: {
        Row: PreferenceRow
        Insert: Omit<PreferenceRow, "created_at" | "updated_at">
        Update: Partial<Omit<PreferenceRow, "user_id" | "created_at" | "updated_at">>
        Relationships: []
      }
      tasks: StorageTable
      storage_evidence: StorageTable
      storage_extractions: StorageTable
      storage_followups: StorageTable
      storage_preferences: StorageTable
      storage_sources: StorageTable
      storage_suggestions: StorageTable
      storage_waiting_for: StorageTable
      gmail_task_changes: StorageTable
    }
    Views: Record<string, never>
    Functions: {
      gmail_scan_status: { Args: Record<string, never>; Returns: any }
      gmail_change_review: { Args: Record<string, any>; Returns: any }
      gmail_change_resolve: { Args: Record<string, any>; Returns: any }
      gmail_task_source_links: { Args: { p_tasks: string[] }; Returns: any }
      scan_settings_get: { Args: Record<string, never>; Returns: any }
      scan_settings_save: { Args: Record<string, any>; Returns: any }
      google_connection_status: {
        Args: Record<string, never>
        Returns: any
      }
      storage_action: {
        Args: Record<string, any>
        Returns: any
      }
      storage_activity: {
        Args: Record<string, never>
        Returns: any
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

type StorageTable = {
  Row: Record<string, any>
  Insert: Record<string, any>
  Update: Record<string, any>
  Relationships: []
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabase =
  supabaseUrl &&
  supabasePublishableKey &&
  !supabasePublishableKey.startsWith("sb_secret_")
    ? createClient<Database>(supabaseUrl, supabasePublishableKey, {
        auth: {
          flowType: "pkce",
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null

const preferenceColumns =
  "user_id,included_types,selected_sources,excluded_types,excluded_sources,created_at,updated_at"

function fromPreferenceRow(row: PreferenceRow): OnboardingPreferences {
  const selectedSenders: string[] = []
  const selectedDomains: string[] = []
  const excludedSenders: string[] = []
  const excludedDomains: string[] = []
  const excludedSubjects: string[] = []

  for (const source of row.selected_sources) {
    if (source.startsWith("domain:")) {
      selectedDomains.push(source.slice("domain:".length))
    } else if (source.startsWith("sender:")) {
      selectedSenders.push(source.slice("sender:".length))
    } else if (source.startsWith("@")) {
      selectedDomains.push(source.slice(1))
    } else if (source.includes("@")) {
      selectedSenders.push(source)
    } else {
      selectedDomains.push(source)
    }
  }

  for (const source of row.excluded_sources) {
    if (source.startsWith("domain:")) {
      excludedDomains.push(source.slice("domain:".length))
    } else if (source.startsWith("sender:")) {
      excludedSenders.push(source.slice("sender:".length))
    } else if (source.startsWith("subject:")) {
      excludedSubjects.push(source.slice("subject:".length))
    } else if (source.startsWith("@")) {
      excludedDomains.push(source.slice(1))
    } else if (source.includes("@")) {
      excludedSenders.push(source)
    } else {
      excludedDomains.push(source)
    }
  }

  return {
    includedTypes: row.included_types,
    selectedSenders,
    selectedDomains,
    excludedTypes: row.excluded_types,
    excludedSenders,
    excludedDomains,
    excludedSubjects,
  }
}

export type SavedSetup = {
  revision: number
  requiresReview: boolean
  consent: boolean
  paused: boolean
  preferences: OnboardingPreferences | null
}

// Canonical scanning settings decide routing and consent. A legacy preference row
// can only prefill a first-run draft; it never counts as saved settings or consent.
export async function loadSavedSetup(userId: string): Promise<SavedSetup> {
  if (!supabase) throw new Error("Supabase is not configured.")
  const { data: settings, error: settingsError } = await supabase.rpc("scan_settings_get")
  if (settingsError || typeof settings?.revision !== "number") throw new Error("Could not load scanning settings.")
  const requiresReview = settings.requires_review === true
  if (settings.revision > 0 || requiresReview) return {
    revision: settings.revision, requiresReview, consent: settings.consent === true, paused: settings.paused === true,
    preferences: {
      scanRevision: settings.revision,
      includedTypes: settings.semantic_preferences.include, selectedSenders: settings.rules.allow.senders,
      selectedDomains: settings.rules.allow.domains, excludedTypes: settings.semantic_preferences.exclude,
      excludedSenders: settings.rules.block.senders, excludedDomains: settings.rules.block.domains,
      excludedSubjects: settings.rules.block.subjectKeywords,
    },
  }
  const { data, error } = await supabase.from("user_onboarding_preferences").select(preferenceColumns).eq("user_id", userId).maybeSingle()
  return {
    revision: 0, requiresReview: false, consent: false, paused: true,
    preferences: !error && data ? { ...fromPreferenceRow(data), scanRevision: 0 } : null,
  }
}

// These messages are fixed text, so the screen may show them to the user as written.
export class SetupSaveError extends Error {}

// consent: true grants, false revokes, omitted keeps the saved consent and pause state.
export async function saveOnboardingPreferences(_userId: string, preferences: OnboardingPreferences, consent?: boolean): Promise<OnboardingPreferences> {
  if (!supabase) throw new SetupSaveError("Account connection is not configured.")
  const { data: current, error: readError } = await supabase.rpc("scan_settings_get")
  if (readError) throw new SetupSaveError("Could not load scanning settings, so nothing was saved. Please retry.")
  if (current.requires_review) throw new SetupSaveError("Review previous phrase rules under Connection and permissions before saving.")
  const { data, error } = await supabase.rpc("scan_settings_save", {
    p_revision: preferences.scanRevision ?? 0,
    p_rules: {
      allow: { labels: [], senders: preferences.selectedSenders, domains: preferences.selectedDomains, keywords: [], subjectKeywords: [] },
      block: { labels: [], senders: preferences.excludedSenders, domains: preferences.excludedDomains, keywords: [], subjectKeywords: preferences.excludedSubjects },
    },
    p_semantic: { include: preferences.includedTypes, exclude: preferences.excludedTypes },
    p_reviewed: false,
    p_context: current.context_limits,
    ...resolveScanConsent(current, consent),
  })
  if (error) throw new SetupSaveError(error.code === "PT409" ? "Settings changed in another window. Reload this page before saving again." : "Filters were not saved. Check your entries and retry.")
  return { ...preferences, scanRevision: data.revision, includedTypes: data.semantic_preferences.include, excludedTypes: data.semantic_preferences.exclude }
}
