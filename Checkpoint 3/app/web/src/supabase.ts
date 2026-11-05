import { createClient } from "@supabase/supabase-js"
import {
  readStoredKeywordRules,
  type FilterKeywordGroup,
  writeStoredKeywordRules,
} from "./filterPresets"

export type OnboardingPreferences = {
  scanRevision?: number
  includedTypes: string[]
  includedCategoryGroups: FilterKeywordGroup[]
  selectedSenders: string[]
  selectedDomains: string[]
  excludedTypes: string[]
  excludedCategoryGroups: FilterKeywordGroup[]
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
    }
    Views: Record<string, never>
    Functions: {
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
    includedCategoryGroups: [],
    selectedSenders,
    selectedDomains,
    excludedTypes: row.excluded_types,
    excludedCategoryGroups: [],
    excludedSenders,
    excludedDomains,
    excludedSubjects,
  }
}

// Canonical scanning settings are the source of truth after a reviewed save.
// Older category titles remain draft phrases until explicitly reviewed and saved.
export async function loadOnboardingPreferences(userId: string): Promise<OnboardingPreferences | null> {
  if (!supabase) throw new Error("Supabase is not configured.")
  const { data: settings, error: settingsError } = await supabase.rpc("scan_settings_get")
  if (settingsError) throw new Error("Could not load filter settings. Check the local migration and retry.")
  if (settings.revision > 0) {
    const allow = readStoredKeywordRules(settings.rules.allow)
    const block = readStoredKeywordRules(settings.rules.block)
    return {
      scanRevision: settings.revision,
      includedTypes: allow.customKeywords,
      includedCategoryGroups: allow.groups,
      selectedSenders: settings.rules.allow.senders,
      selectedDomains: settings.rules.allow.domains,
      excludedTypes: block.customKeywords,
      excludedCategoryGroups: block.groups,
      excludedSenders: settings.rules.block.senders,
      excludedDomains: settings.rules.block.domains,
      excludedSubjects: settings.rules.block.subjectKeywords,
    }
  }
  const { data, error } = await supabase.from("user_onboarding_preferences").select(preferenceColumns).eq("user_id", userId).maybeSingle()
  if (error) throw new Error("Could not load previous preferences.")
  return data ? { ...fromPreferenceRow(data), scanRevision: 0 } : null
}

export async function saveOnboardingPreferences(_userId: string, preferences: OnboardingPreferences): Promise<OnboardingPreferences> {
  if (!supabase) throw new Error("Supabase is not configured.")
  const { data: current, error: readError } = await supabase.rpc("scan_settings_get")
  if (readError) throw new Error("Could not load scanning settings. Retry after checking the local migration.")
  const { data, error } = await supabase.rpc("scan_settings_save", {
    p_revision: preferences.scanRevision ?? 0,
    p_rules: {
      allow: {
        labels: [],
        senders: preferences.selectedSenders,
        domains: preferences.selectedDomains,
        ...writeStoredKeywordRules(preferences.includedTypes, preferences.includedCategoryGroups),
        subjectKeywords: [],
      },
      block: {
        labels: [],
        senders: preferences.excludedSenders,
        domains: preferences.excludedDomains,
        ...writeStoredKeywordRules(preferences.excludedTypes, preferences.excludedCategoryGroups),
        subjectKeywords: preferences.excludedSubjects,
      },
    },
    p_context: current.context_limits, p_consent: current.consent, p_paused: current.paused,
    p_disclosure: current.consent ? "gmail-scan-v1" : null,
  })
  if (error) throw new Error(error.code === "PT409" ? "Settings changed in another window. Reload before saving again." : "Filters were not saved. Check your entries and retry.")
  const allow = readStoredKeywordRules(data.rules.allow)
  const block = readStoredKeywordRules(data.rules.block)
  return {
    ...preferences,
    scanRevision: data.revision,
    includedTypes: allow.customKeywords,
    includedCategoryGroups: allow.groups,
    excludedTypes: block.customKeywords,
    excludedCategoryGroups: block.groups,
  }
}
