import { useEffect, useId, useRef, useState } from "react"
import { loadScanSettings, saveScanSettings, type ScanRules, type ScanSettings } from "./storageAdapter"
import "./scan-settings.css"

const fields = [
  ["senders", "Sender email addresses"], ["domains", "Sender domains"],
] as const
const limitFields = [
  ["maxMessages", "Earlier messages", 0, 10], ["maxAgeDays", "Maximum context age (days)", 1, 365],
  ["maxMessageChars", "Characters per message", 100, 30000], ["maxTotalChars", "Total characters including current message", 100, 60000],
] as const

// The parent must key this component by verified user ID to discard account state.
export default function ScanSettingsPanel({ onSaved, collapseOnSave = false }: { onSaved?: () => void; collapseOnSave?: boolean } = {}) {
  const [collapsed, setCollapsed] = useState(false)
  const editButton = useRef<HTMLButtonElement>(null)
  // The submit button disappears on collapse, so keep keyboard focus in the panel.
  useEffect(() => { if (collapsed) editButton.current?.focus() }, [collapsed])
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
    for (const group of ["include", "exclude"] as const) normalized.semantic_preferences[group] = normalized.semantic_preferences[group].map(v => v.trim()).filter(Boolean)
    try {
      const result = await saveScanSettings(normalized)
      if (live.current) { setSettings(result); setNotice(`Saved revision ${result.revision}. No email was read. Scanning requires a separate manual request.`); if (collapseOnSave) setCollapsed(true); onSaved?.() }
    } catch (err) { if (live.current) setError((err as Error).message) }
    finally { if (live.current) setBusy(false) }
  }
  if (collapsed && settings) {
    const sources = [...settings.rules.allow.senders, ...settings.rules.allow.domains]
    const excluded = [...settings.rules.block.senders, ...settings.rules.block.domains, ...settings.rules.block.subjectKeywords]
    return <section className="scan-settings scan-settings-summary" aria-labelledby={`${helpId}-title`}>
      <h2 id={`${helpId}-title`}>Scanning permission and sources</h2>
      {notice && <p role="status">{notice}</p>}
      <dl>
        <div><dt>Permitted sources</dt><dd>{sources.join(", ") || "None, so nothing is permitted"}</dd></div>
        <div><dt>Exclusions</dt><dd>{excluded.join(", ") || "None"}</dd></div>
        <div><dt>Consent</dt><dd>{settings.consent ? "Given" : "Not given"}</dd></div>
        <div><dt>Scanning</dt><dd>{settings.paused ? "Paused" : "Not paused"}</dd></div>
      </dl>
      <button type="button" ref={editButton} onClick={() => { setNotice(""); setCollapsed(false) }}>Edit settings</button>
    </section>
  }
  return <section className="scan-settings" aria-labelledby={`${helpId}-title`}>
    <h2 id={`${helpId}-title`}>Scanning permission and sources</h2>
    <p>These settings are saved to your account. Scanning requires a separate manual request. Connecting Gmail and saving filters alone do not grant scanning consent.</p>
    {busy && <p role="status">Loading or saving settings…</p>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <button type="button" disabled={busy} onClick={() => setReload(v => v + 1)}>Reload saved settings</button>
    {settings && <form onSubmit={e => { e.preventDefault(); void save() }}>
      <p aria-label="Current form scope">Current form scope: {([
        ...settings.rules.allow.senders.filter(v => v.trim()).map(v => `sender ${v.trim()}`),
        ...settings.rules.allow.domains.filter(v => v.trim()).map(v => `domain ${v.trim()}`),
      ].join(" OR ") || "No inclusions configured; nothing is permitted")}. Any matching exclusion blocks processing. Saving does not start a scan.</p>
      <fieldset disabled={busy}>
        <legend>Source access permissions</legend>
        <span className="scan-help" onMouseEnter={() => setHelp(true)} onMouseLeave={() => setHelp(false)}>
          <button type="button" aria-label="About sender, domain, and subject filters" aria-expanded={help} aria-controls={helpId}
            onFocus={() => setHelp(true)} onBlur={() => setHelp(false)} onClick={() => setHelp(true)}
            onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setHelp(false) } }}>ⓘ</button>
          {help && <span id={helpId} role="tooltip">Sender and domain controls match exactly. Optional subject exclusions match literal text without case sensitivity. Bodies are not searched for access decisions. Inclusions combine with OR; exclusions always win.</span>}
        </span>
        <p>One entry per line; up to 200 entries of 254 characters per list. Domains do not include subdomains. Words and phrases match literal text without case sensitivity.</p>
        <p>With no topics of interest selected, all source-permitted topics qualify. Topics never grant access.</p>
        {fields.map(([field, label]) => <div className="scan-rule-pair" key={field}>
          {(["allow", "block"] as const).map(group =>
            <label key={group}>{group === "allow" ? "Include" : "Exclude"}: {label}
              <textarea value={settings.rules[group][field].join("\n")} onChange={e => list(group, field, e.target.value)} />
            </label>)}
        </div>)}
      </fieldset>
      <fieldset disabled={busy}><legend>Subject exclusions</legend><label>Exclude subjects containing (one literal phrase per line)
        <textarea value={settings.rules.block.subjectKeywords.join("\n")} onChange={e => list("block", "subjectKeywords", e.target.value)} /></label></fieldset>
      <fieldset disabled={busy}><legend>Topics</legend>
        <p>Topics of interest are sent to the AI to rank what it finds. Skipped topics are never sent to the AI: each one is a list of words that our system checks in the subject and text before anything goes to the AI, and a matching email is skipped. Email that discusses a topic without using those words can still be sent. To fully protect a source, exclude its sender or domain.</p>
        {(["include", "exclude"] as const).map(group => <label key={group}>{group === "include" ? "Topics of interest" : "Topics to skip (never sent to the AI)"}
          <textarea value={settings.semantic_preferences[group].join("\n")} onChange={e => setSettings({ ...settings, semantic_preferences: { ...settings.semantic_preferences, [group]: e.target.value.split("\n") } })} /></label>)}
        {Object.entries(settings.semantic_preferences.blockedWords ?? {}).map(([topic, words]) =>
          <p key={topic}>Words blocked for {topic}: {words.join(", ")}</p>)}
        <p>A new skipped topic uses its suggested word list, or its own name, once saved.</p>
      </fieldset>
      {settings.requires_review && <fieldset disabled={busy}><legend>Previous phrase rules require review</legend>
        <p>Scanning was paused and consent revoked. Previous phrases cannot safely be converted to source permissions or semantic topics. Review these rules and choose exact sources and subject exclusions above.</p>
        <pre>{JSON.stringify(settings.legacy_phrase_rules, null, 2)}</pre>
        <label><input type="checkbox" required checked={settings.reviewed ?? false} onChange={e => setSettings({ ...settings, reviewed: e.target.checked })} />I reviewed and replaced the previous phrase rules.</label>
      </fieldset>}
      <fieldset disabled={busy}>
        <legend>Context limits</legend>
        <p>Each earlier message must independently pass current permissions. New accounts default to five earlier messages within 90 days. Existing saved limits are preserved. Age is measured backward from the current message; zero disables earlier context. Quoted-text removal is imperfect.</p>
        {limitFields.map(([field, label, min, max]) => <label key={field}>{label} ({min}–{max})
          <input type="number" required step="1" min={min} max={max} value={settings.context_limits[field]}
            onChange={e => { setNotice("Unsaved changes."); setSettings({ ...settings, context_limits: { ...settings.context_limits, [field]: e.target.valueAsNumber } }) }} />
        </label>)}
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Consent and pause</legend>
        <p>During an authorized manual scan, permitted bodies and selected context may be sent to the configured Gemini service for extraction. Full bodies are transient. Supporting excerpts and unreviewed results currently expire after 30 days; accepted tasks remain until completion or deletion. Minimal source identifiers and suppression records remain until account deletion. Provider and backup retention are separate and provider terms still require verification before real-email processing.</p>
        <p>Rules affect queued and future processing. Changes cannot retract content already transmitted. Existing results remain available unless separately deleted. Task approval never authorizes Calendar writes.</p>
        <label className="scan-checkbox"><input type="checkbox" checked={settings.consent} onChange={e => { setNotice("Unsaved changes."); setSettings({ ...settings, consent: e.target.checked }) }} />I consent to processing permitted Gmail content under the disclosure above.</label>
        <label className="scan-checkbox"><input type="checkbox" checked={settings.paused} onChange={e => { setNotice("Unsaved changes."); setSettings({ ...settings, paused: e.target.checked }) }} />Pause scanning</label>
        <p>Effective saved permission requires consent, an unpaused account, a connected Gmail account, and a nonempty inclusion list. Empty inclusions process nothing.</p>
        <button type="submit">Save scanning settings</button>
      </fieldset>
    </form>}
  </section>
}
