// Chip editor for exact sender/domain access rules, literal subject exclusions
// and semantic topics. Topics never grant access.
import { useId, useState } from "react"
import {
  excludedTopicSuggestions,
  includedTopicSuggestions,
} from "./filterPresets"
import { Icon } from "./designedUi"
import type { OnboardingPreferences } from "./supabase"

type RuleKey =
  | "includedTypes"
  | "selectedSenders"
  | "selectedDomains"
  | "excludedTypes"
  | "excludedSenders"
  | "excludedDomains"
  | "excludedSubjects"

type RuleField = {
  key: RuleKey
  label: string
  placeholder: string
}

type RuleChip = {
  key: RuleKey
  value: string
  raw?: string
  prefix?: string
  selected?: boolean
  id?: string
  removeIndex?: number
}

function FilterHelp() {
  const [open, setOpen] = useState(false)
  const id = useId()
  return <span className="scan-help" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
    <button type="button" className="text-link" aria-label="About these filters" aria-expanded={open} aria-controls={id}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen(true)}
      onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false) } }}>About these filters (i)</button>
    {open && <span id={id} role="tooltip" className="scan-help-tip">
      <span>An email is checked if it matches <strong>any</strong> included sender or domain.</span>
      <span>Excluded senders, domains and subject phrases <strong>always win</strong> over inclusions.</span>
      <span>A domain does not cover its subdomains (example.edu is not mail.example.edu).</span>
      <span>Topics are judged by Gemini <strong>after</strong> a permitted email is sent to it, so excluding a topic hides results but does not keep the email from Gemini.</span>
    </span>}
  </span>
}

export default function RulesEditor({
  rules,
  onChange,
  compact = false,
  section = "all",
}: {
  rules: OnboardingPreferences
  onChange: (rules: OnboardingPreferences) => void
  compact?: boolean
  section?: "allowed" | "excluded" | "all"
}) {
  const [drafts, setDrafts] = useState<Record<RuleKey, string>>({
    includedTypes: "",
    selectedSenders: "",
    selectedDomains: "",
    excludedTypes: "",
    excludedSenders: "",
    excludedDomains: "",
    excludedSubjects: "",
  })

  const [ruleError, setRuleError] = useState("")
  const add = (key: RuleKey, rawValue?: string) => {
    let value = (rawValue ?? drafts[key]).trim()
    if (!value) return
    const isSender = key === "selectedSenders" || key === "excludedSenders"
    const isDomain = key === "selectedDomains" || key === "excludedDomains"
    if (isSender || isDomain) value = value.toLowerCase()
    if (isDomain) value = value.replace(/^@/, "")
    if (key === "excludedSubjects" && (value.length > 254 || /[\x00-\x1f\x7f]/.test(value))) {
      setRuleError("Subject phrases must be 1-254 characters without control characters.")
      return
    }
    if ((isSender && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) ||
        (isDomain && !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(value))) {
      setRuleError(isSender ? "Enter a complete sender email address." : "Enter a valid domain, such as example.edu.")
      return
    }
    if (rules[key].some((item) => item.toLowerCase() === value.toLowerCase())) {
      setRuleError("That rule is already included.")
      return
    }
    onChange({ ...rules, [key]: [...rules[key], value] })
    setDrafts((current) => ({ ...current, [key]: "" }))
    setRuleError("")
  }

  const remove = (key: RuleKey, value: string) =>
    onChange({ ...rules, [key]: rules[key].filter((item) => item !== value) })

  const fields: RuleField[] = [
    {
      key: "selectedSenders",
      label: "Sender address",
      placeholder: "name@example.edu",
    },
    {
      key: "selectedDomains",
      label: "Sender domain",
      placeholder: "example.edu",
    },
    {
      key: "excludedSenders",
      label: "Blocked sender",
      placeholder: "sender@example.com",
    },
    {
      key: "excludedDomains",
      label: "Blocked domain",
      placeholder: "example.com",
    },
    {
      key: "excludedSubjects",
      label: "Subject contains",
      placeholder: "Literal phrase, such as payroll",
    },
  ]

  return (
    <div className={`rules-editor ${compact ? "compact" : ""}`}>
      {section !== "excluded" && <div className="rule-group">
        <div className="rule-heading">
          <div>
            <strong>Email categories to check</strong>
            <span>Topics describe relevance after source permission; they never grant access.</span>
          </div>
        </div>
        <CategorySelector
          label="Add an included email category"
          categoryKey="includedTypes"
          suggestions={includedTopicSuggestions}
          customKeywords={rules.includedTypes}
          onChange={(includedTypes) => onChange({ ...rules, includedTypes })}
        />
        <div className="rule-heading">
          <div>
            <strong>Sender and domain preferences</strong>
            <span>Exact address or domain matches. Domains do not include subdomains.</span>
          </div>
        </div>
        {fields.slice(0, 2).map((field) => {
          const entries = rules[field.key].map((value) => ({
            key: field.key,
            value,
            prefix: field.label,
          }))
          return (
            <div className="rule-field" key={field.key}>
              <RuleInput
                field={field}
                onAdd={() => add(field.key)}
                onChange={(value) =>
                  setDrafts((current) => ({ ...current, [field.key]: value }))
                }
                value={drafts[field.key]}
              />
              <Chips entries={entries} onRemove={remove} />
            </div>
          )
        })}
      </div>}
      {section !== "allowed" && <div className="rule-group exclusion">
        <div className="rule-heading">
          <div>
            <strong>Email categories to skip</strong>
            <span>Semantic exclusions affect results after Gemini has received permitted content.</span>
          </div>
        </div>
        <CategorySelector
          label="Add an excluded email category"
          categoryKey="excludedTypes"
          suggestions={excludedTopicSuggestions}
          customKeywords={rules.excludedTypes}
          onChange={(excludedTypes) => onChange({ ...rules, excludedTypes })}
        />
        <div className="rule-heading">
          <div>
            <strong>Excluded senders, domains, and subjects</strong>
            <span>Exact address or domain matches; domains do not include subdomains. Subject phrases match literal text in the subject only, ignoring case.</span>
          </div>
        </div>
        {fields.slice(2, 5).map((field) => {
          const entries = rules[field.key].map((value) => ({
            key: field.key,
            value,
            prefix: field.label,
          }))
          return (
            <div className="rule-field" key={field.key}>
              <RuleInput
                field={field}
                onAdd={() => add(field.key)}
                onChange={(value) =>
                  setDrafts((current) => ({ ...current, [field.key]: value }))
                }
                value={drafts[field.key]}
              />
              <Chips entries={entries} onRemove={remove} />
            </div>
          )
        })}
      </div>}
      <FilterHelp />
      {ruleError && <p className="notice warning" role="alert">{ruleError}</p>}
    </div>
  )
}

function CategorySelector({
  label,
  categoryKey,
  suggestions,
  customKeywords,
  onChange,
}: {
  label: string
  categoryKey: "includedTypes" | "excludedTypes"
  suggestions: string[]
  customKeywords: string[]
  onChange: (customKeywords: string[]) => void
}) {
  const [draft, setDraft] = useState("")
  const [error, setError] = useState("")

  const add = (rawValue = draft) => {
    const category = rawValue.trim()
    if (!category) return
    if (
      category.length > 254 ||
      /[\x00-\x1f\x7f]/.test(category) ||
      customKeywords.length >= 200
    ) {
      setError("Use up to 200 terms, each 1-254 characters without control characters.")
      return
    }
    onChange([...customKeywords, category])
    setDraft("")
    setError("")
  }

  const toggleSuggestion = (suggestion: string) => {
    const selected = customKeywords.some(
      (keyword) => keyword.toLowerCase() === suggestion.toLowerCase(),
    )
    onChange(
      selected
        ? customKeywords.filter(
            (keyword) => keyword.toLowerCase() !== suggestion.toLowerCase(),
          )
        : [...customKeywords, suggestion],
    )
    setError("")
  }

  const visibleCustomKeywords = customKeywords
    .map((keyword, index) => ({ keyword, index }))
    .filter(
      ({ keyword }) =>
        !suggestions.some(
          (suggestion) =>
            suggestion.toLowerCase() === keyword.toLowerCase(),
        ),
    )

  return (
    <div className="category-preferences">
      <div className="rule-input">
        <span>{label}</span>
        <div>
          <input
            aria-label={label}
            placeholder="Type a word or phrase."
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              setError("")
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                add()
              }
            }}
          />
          <button
            className="secondary-button"
            disabled={!draft.trim()}
            onClick={() => add()}
            type="button"
          >
            Add
          </button>
        </div>
      </div>
      <Chips
        entries={visibleCustomKeywords.map(({ keyword, index }) => ({
          key: categoryKey,
          value: keyword,
          selected: true,
          id: `${categoryKey}-${index}`,
          removeIndex: index,
        }))}
        onRemove={(_key, _category, index) =>
          onChange(
            customKeywords.filter(
              (_current, currentIndex) => currentIndex !== index,
            ),
          )
        }
      />
      <div className="category-suggestions">
        <p className="suggestions-label">Suggestions</p>
        <div className="type-selection-chips">
          {suggestions.map((suggestion) => {
            const selected = customKeywords.some(
              (keyword) => keyword.toLowerCase() === suggestion.toLowerCase(),
            )
            return (
              <span
                className={`type-chip ${selected ? "selected" : ""}`}
                key={suggestion}
              >
                <button
                  aria-pressed={selected}
                  className="type-chip-toggle"
                  onClick={() => toggleSuggestion(suggestion)}
                  type="button"
                >
                  {!selected && (
                    <span aria-hidden="true" className="chip-plus">
                      +
                    </span>
                  )}
                  {suggestion}
                </button>
                {selected && (
                  <button
                    aria-label={`Remove ${suggestion}`}
                    className="type-chip-remove"
                    onClick={() => toggleSuggestion(suggestion)}
                    type="button"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                )}
              </span>
            )
          })}
        </div>
      </div>
      {error && <p className="notice warning" role="alert">{error}</p>}
    </div>
  )
}

function RuleInput({
  field,
  value,
  onChange,
  onAdd,
}: {
  field: RuleField
  value: string
  onChange: (value: string) => void
  onAdd: () => void
}) {
  return (
    <label className="rule-input">
      <span>{field.label}</span>
      <div>
        <input
          placeholder={field.placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              onAdd()
            }
          }}
        />
        <button
          className="secondary-button"
          disabled={!value.trim()}
          onClick={onAdd}
          type="button"
        >
          Add
        </button>
      </div>
    </label>
  )
}

function Chips({
  entries,
  onRemove,
}: {
  entries: RuleChip[]
  onRemove: (key: RuleKey, value: string, index: number) => void
}) {
  if (!entries.length) return null
  return (
    <div className="rule-chips">
      {entries.map((entry, index) => (
        <span
          className={`rule-chip ${entry.selected ? "selected" : ""}`}
          key={entry.id ?? `${entry.key}-${entry.value}-${index}`}
        >
          {entry.prefix && <small>{entry.prefix}</small>}
          <span className="rule-chip-value">{entry.value}</span>
          <button
            aria-label={`Remove ${entry.value}`}
            onClick={() =>
              onRemove(entry.key, entry.raw ?? entry.value, entry.removeIndex ?? index)
            }
            type="button"
          >
            <Icon name="close" size={12} />
          </button>
        </span>
      ))}
    </div>
  )
}
