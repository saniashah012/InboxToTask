import { createClient } from "@supabase/supabase-js"

export type OnboardingPreferences = {
  scanRevision?: number
  includedTypes: string[]
  selectedSenders: string[]
  selectedDomains: string[]
  excludedTypes: string[]
  excludedSenders: string[]
  excludedDomains: string[]
  excludedSubjects: string[]
  blockedWords?: Record<string, string[]>
  includeWords?: Record<string, string[]>
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

// The older user_onboarding_preferences rows are not read: their category terms
// may be expanded keywords, and topics must never be inferred from those. Signed-in
// onboarding and settings use scan_settings_get/save (see scanSetup.ts).
