import { createClient } from "@supabase/supabase-js"
import type { SourceRules } from "./demoData"

export type OnboardingPreferences = SourceRules

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
  const allowedSenders: string[] = []
  const allowedDomains: string[] = []
  const excludedSenders: string[] = []
  const excludedDomains: string[] = []
  const excludedSubjects: string[] = []

  for (const source of row.selected_sources) {
    if (source.startsWith("domain:")) {
      allowedDomains.push(source.slice("domain:".length))
    } else if (source.startsWith("sender:")) {
      allowedSenders.push(source.slice("sender:".length))
    } else if (source.startsWith("@")) {
      allowedDomains.push(source.slice(1))
    } else if (source.includes("@")) {
      allowedSenders.push(source)
    } else {
      allowedDomains.push(source)
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
    allowedLabels: row.included_types,
    allowedSenders,
    allowedDomains,
    excludedLabels: row.excluded_types,
    excludedSenders,
    excludedDomains,
    excludedSubjects,
  }
}

export async function loadOnboardingPreferences(
  userId: string,
): Promise<OnboardingPreferences | null> {
  if (!supabase) throw new Error("Supabase is not configured.")
  const { data, error } = await supabase
    .from("user_onboarding_preferences")
    .select(preferenceColumns)
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw error
  return data ? fromPreferenceRow(data) : null
}

export async function saveOnboardingPreferences(
  userId: string,
  preferences: OnboardingPreferences,
): Promise<OnboardingPreferences> {
  if (!supabase) throw new Error("Supabase is not configured.")
  const { data, error } = await supabase
    .from("user_onboarding_preferences")
    .upsert(
      {
        user_id: userId,
        included_types: preferences.allowedLabels,
        selected_sources: [
          ...preferences.allowedSenders.map((sender) => `sender:${sender}`),
          ...preferences.allowedDomains.map((domain) => `domain:${domain}`),
        ],
        excluded_types: preferences.excludedLabels,
        excluded_sources: [
          ...preferences.excludedSenders.map((sender) => `sender:${sender}`),
          ...preferences.excludedDomains.map((domain) => `domain:${domain}`),
          ...preferences.excludedSubjects.map((subject) => `subject:${subject}`),
        ],
      },
      { onConflict: "user_id" },
    )
    .select(preferenceColumns)
    .single()
  if (error) throw error
  return fromPreferenceRow(data)
}
