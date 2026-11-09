// Shared by the Connection and permissions tab and onboarding, so the wording cannot drift.
export const SCAN_DISCLOSURE_VERSION = "gmail-scan-v1"
export const SCAN_DISCLOSURE = "During an authorized manual scan, permitted bodies and selected context may be sent to the configured Gemini service for extraction. Full bodies are transient. Supporting excerpts and unreviewed results currently expire after 30 days; accepted tasks remain until completion or deletion. Minimal source identifiers and suppression records remain until account deletion. Provider and backup retention are separate and provider terms still require verification before real-email processing."
export const SCAN_DISCLOSURE_EFFECTS = "Rules affect queued and future processing. Changes cannot retract content already transmitted. Existing results remain available unless separately deleted. Task approval never authorizes Calendar writes."
export const SCAN_CONSENT_LABEL = "I consent to processing permitted Gmail content under the disclosure above."

// An untouched checkbox is no decision: it must neither revoke consent nor end a deliberate pause.
export function consentDecision(initial: boolean, checked: boolean): boolean | undefined {
  return checked === initial ? undefined : checked
}

// true grants consent and unpauses, false revokes and keeps the pause state as the tab does,
// undefined keeps both exactly as saved.
export function resolveScanConsent(current: { consent: boolean; paused: boolean }, decision?: boolean) {
  const consent = decision ?? current.consent
  return {
    p_consent: consent,
    p_paused: decision === true ? false : current.paused,
    p_disclosure: consent ? SCAN_DISCLOSURE_VERSION : null,
  }
}
