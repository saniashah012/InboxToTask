import { useEffect, useId, useRef, useState } from "react"
import { loadScanSettings, saveScanSettings, type ScanRules, type ScanSettings } from "./storageAdapter"
import "./scan-settings.css"

const fields = [
  ["senders", "Sender email addresses"], ["domains", "Sender domains"], ["keywords", "Words or phrases"],
] as const
const limitFields = [
  ["maxMessages", "Earlier messages", 0, 10], ["maxAgeDays", "Maximum context age (days)", 1, 90],
  ["maxMessageChars", "Characters per message", 100, 30000], ["maxTotalChars", "Total characters including current message", 100, 60000],
] as const

// The parent must key this component by verified user ID to discard account state.
export default function ScanSettingsPanel() {
  const [settings, setSettings] = useState<ScanSettings | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [help, setHelp] = useState(false)
  const [reload, setReload] = useState(0)
  const live = useRef(false)
  const helpId = useId()
  useEffect(() => {
    live.current = true
    let cancelled = false
    setBusy(true); setError(""); setNotice(""); setSettings(null)
    loadScanSettings().then(result => { if (!cancelled) setSettings(result) })
      .catch(() => { if (!cancelled) setError("Could not load scanning settings. Check the backend migration and retry.") })
      .finally(() => { if (!cancelled) setBusy(false) })
    return () => { cancelled = true; live.current = false }
  }, [reload])
  function list(group: keyof ScanRules, field: keyof ScanRules["allow"], value: string) {
    if (!settings) return
    setNotice("Unsaved changes. Save to update future processing permissions.")
    // Keep blank in-progress lines while typing; normalize only on save.
    setSettings({ ...settings, rules: { ...settings.rules, [group]: { ...settings.rules[group], [field]: value.split("\n") } } })
  }
  async function save() {
    if (!settings) return
    setBusy(true); setError(""); setNotice("")
    const normalized = structuredClone(settings)
    for (const group of ["allow", "block"] as const) for (const field of ["labels", "senders", "domains", "subjectKeywords", "keywords"] as const)
      normalized.rules[group][field] = normalized.rules[group][field].map(v => v.trim()).filter(Boolean)
    try {
      const result = await saveScanSettings(normalized)
      if (live.current) { setSettings(result); setNotice(`Saved revision ${result.revision}. No email was read. Scanning is not connected yet.`) }
    } catch (err) { if (live.current) setError((err as Error).message) }
    finally { if (live.current) setBusy(false) }
  }
  return <section className="scan-settings" aria-labelledby={`${helpId}-title`}>
    <h2 id={`${helpId}-title`}>Scanning permission and sources</h2>
    <p>These settings are saved to your account. Scanning is not connected yet. Connecting Gmail and saving filters alone do not grant scanning consent.</p>
    {busy && <p role="status">Loading or saving settings…</p>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <button type="button" disabled={busy} onClick={() => setReload(v => v + 1)}>Reload saved settings</button>
    {settings && <form onSubmit={e => { e.preventDefault(); void save() }}>
      <p aria-label="Current form scope">Current form scope: {([
        ...settings.rules.allow.keywords.filter(v => v.trim()).map(v => `subject or sender contains ${v.trim()}`),
        ...settings.rules.allow.senders.filter(v => v.trim()).map(v => `sender ${v.trim()}`),
        ...settings.rules.allow.domains.filter(v => v.trim()).map(v => `domain ${v.trim()}`),
      ].join(" OR ") || "No inclusions configured; nothing is permitted")}. Any matching exclusion blocks processing. Scanning remains unavailable.</p>
      <fieldset disabled={busy}>
        <legend>Words, phrases, and sender filters</legend>
        <span className="scan-help" onMouseEnter={() => setHelp(true)} onMouseLeave={() => setHelp(false)}>
          <button type="button" aria-label="About sender, domain, and subject filters" aria-expanded={help} aria-controls={helpId}
            onFocus={() => setHelp(true)} onBlur={() => setHelp(false)} onClick={() => setHelp(true)}
            onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setHelp(false) } }}>ⓘ</button>
          {help && <span id={helpId} role="tooltip">Words and phrases match subject lines or sender addresses/domains. Sender and domain controls match exactly. Bodies are not searched for filtering. Inclusions combine with OR; exclusions always win.</span>}
        </span>
        <p>One entry per line; up to 200 entries of 254 characters per list. Domains do not include subdomains. Words and phrases match literal text without case sensitivity.</p>
        <p>Words and phrases can include or exclude messages. Permitted bodies may still be analyzed for task extraction; metadata filters do not classify sensitive topics.</p>
        {fields.map(([field, label]) => <div className="scan-rule-pair" key={field}>
          {(["allow", "block"] as const).map(group =>
            <label key={group}>{group === "allow" ? "Include" : "Exclude"}: {label}
              <textarea value={settings.rules[group][field].join("\n")} onChange={e => list(group, field, e.target.value)} />
            </label>)}
        </div>)}
      </fieldset>
      {settings.rules.block.subjectKeywords.length > 0 && <p>Previous subject-only exclusions: {settings.rules.block.subjectKeywords.join(", ")}. These retain their original scope.</p>}
      <fieldset disabled={busy}>
        <legend>Context limits</legend>
        <p>Each earlier message must independently pass current permissions. Zero earlier messages is the starting setting. Quoted-text removal is imperfect.</p>
        {limitFields.map(([field, label, min, max]) => <label key={field}>{label} ({min}–{max})
          <input type="number" required step="1" min={min} max={max} value={settings.context_limits[field]}
            onChange={e => { setNotice("Unsaved changes."); setSettings({ ...settings, context_limits: { ...settings.context_limits, [field]: e.target.valueAsNumber } }) }} />
        </label>)}
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Consent and pause</legend>
        <p>When scanning becomes available, permitted bodies and selected context may be sent to the configured Gemini service for extraction. Full bodies are transient. Supporting excerpts and unreviewed results currently expire after 30 days; accepted tasks remain until completion or deletion. Minimal source identifiers and suppression records remain until account deletion. Provider and backup retention are separate and provider terms still require verification before real-email processing.</p>
        <p>Rules affect queued and future processing. Changes cannot retract content already transmitted. Existing results remain available unless separately deleted. Task approval never authorizes Calendar writes.</p>
        <label className="scan-checkbox"><input type="checkbox" checked={settings.consent} onChange={e => { setNotice("Unsaved changes."); setSettings({ ...settings, consent: e.target.checked }) }} />I consent to processing permitted Gmail content under the disclosure above.</label>
        <label className="scan-checkbox"><input type="checkbox" checked={settings.paused} onChange={e => { setNotice("Unsaved changes."); setSettings({ ...settings, paused: e.target.checked }) }} />Pause scanning</label>
        <p>Effective saved permission requires consent, an unpaused account, a connected Gmail account, and a nonempty inclusion list. Empty inclusions process nothing.</p>
        <button type="submit">Save scanning settings</button>
      </fieldset>
    </form>}
  </section>
}
