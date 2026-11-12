// Chip editor for exact sender/domain access rules, literal subject exclusions
// and topics. Each category opens an editable word list that the backend checks
// before anything reaches Gemini. With no sender or domain permitted, categories
// to check decide which senders' email is checked at all.
import { useId, useState } from "react"
import {
  excludedTopicSuggestions,
  includedTopicSuggestions,
} from "./filterPresets"
import { Icon } from "./designedUi"
import type { OnboardingPreferences } from "./supabase"
import {
  blockedWordsFor,
  includeWordsFor,
  parseBlockedWord,
  parseRuleInput,
  starterTopicWordsFor,
  starterWordsFor,
  topicInputError,
  topicKey,
  totalBlockedWords,
  totalIncludeWords,
  MAX_WORDS_PER_TOPIC,
  type RuleInputKey,
} from "./scanSetup"

type RuleKey =
  | "includedTypes"
  | "selectedSenders"
  | "selectedDomains"
  | "excludedTypes"
  | "excludedSenders"
  | "excludedDomains"
  | "excludedSubjects"

type RuleField = {
  key: RuleInputKey
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

// Collapsed by default; a click on the heading or its chevron shows the details in
// place. It no longer opens on hover, so it never covers the form.
function FilterHelp() {
  const [open, setOpen] = useState(false)
  const id = useId()
  return <div className="filter-help">
    <button type="button" className="filter-help-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}>
      About these filters
      <svg aria-hidden="true" className={`filter-help-chevron${open ? " is-open" : ""}`} height="14" viewBox="0 0 16 16" width="14">
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    </button>
    {open && <ul className="filter-help-body" id={id}>
      <li>An email is checked if it matches <strong>any</strong> included sender or domain.</li>
      <li>Excluded senders, domains and subject phrases <strong>always win</strong> over inclusions.</li>
      <li>A domain does not cover its subdomains (example.edu is not mail.example.edu).</li>
      <li>Categories to check are word lists too: with any saved, an email must contain one of their words <strong>before</strong> it reaches Gemini. Email about the topic that uses none of the words is skipped.</li>
      <li>Categories to skip are word lists checked <strong>before</strong> anything reaches Gemini. Email about the topic that uses none of the words can still be sent; block a sender or domain for complete protection.</li>
    </ul>}
  </div>
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
  const add = (key: RuleInputKey) => {
    const parsed = parseRuleInput(key, drafts[key], rules[key])
    if (!parsed) return
    if ("error" in parsed) {
      setRuleError(parsed.error)
      return
    }
    onChange({ ...rules, [key]: [...rules[key], parsed.value] })
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

  const renderField = (field: RuleField) => (
    <div className="rule-field" key={field.key}>
      <RuleInput
        field={field}
        onAdd={() => add(field.key)}
        onChange={(value) =>
          setDrafts((current) => ({ ...current, [field.key]: value }))
        }
        value={drafts[field.key]}
      />
      <Chips
        entries={rules[field.key].map((value) => ({ key: field.key, value, prefix: field.label }))}
        onRemove={remove}
      />
    </div>
  )

  return (
    <div className={`rules-editor ${compact ? "compact" : ""}`}>
      {section !== "excluded" && <div className="rule-group">
        <div className="rule-heading">
          <div>
            <strong>Email categories to check</strong>
            <span>With any category here, a permitted email must contain one of its words before it reaches Gemini; email using none of them is skipped. With no permitted sender or domain, these categories decide what is checked. Select a category to see or edit its words.</span>
          </div>
        </div>
        <CategorySelector
          label="Add an included email category"
          categoryKey="includedTypes"
          suggestions={includedTopicSuggestions}
          customKeywords={rules.includedTypes}
          onChange={(includedTypes) => onChange({ ...rules, includedTypes })}
          wordLists={{
            mode: "check",
            wordsFor: (topic) => includeWordsFor(rules, topic),
            starterFor: starterTopicWordsFor,
            total: totalIncludeWords(rules),
            onWordsChange: (topic, words) =>
              onChange({ ...rules, includeWords: { ...(rules.includeWords ?? {}), [topicKey(topic)]: words } }),
          }}
        />
        <div className="rule-heading">
          <div>
            <strong>Sender and domain preferences</strong>
            <span>Exact address or domain matches. Domains do not include subdomains.</span>
          </div>
        </div>
        {fields.slice(0, 2).map(renderField)}
      </div>}
      {section !== "allowed" && <div className="rule-group exclusion">
        <div className="rule-heading">
          <div>
            <strong>Email categories to skip</strong>
            <span>An email containing any of a category's words is skipped before it reaches Gemini. Select a category to see or edit its words.</span>
          </div>
        </div>
        <CategorySelector
          label="Add an excluded email category"
          categoryKey="excludedTypes"
          suggestions={excludedTopicSuggestions}
          customKeywords={rules.excludedTypes}
          onChange={(excludedTypes) => onChange({ ...rules, excludedTypes })}
          wordLists={{
            mode: "skip",
            wordsFor: (topic) => blockedWordsFor(rules, topic),
            starterFor: starterWordsFor,
            total: totalBlockedWords(rules),
            onWordsChange: (topic, words) =>
              onChange({ ...rules, blockedWords: { ...(rules.blockedWords ?? {}), [topicKey(topic)]: words } }),
          }}
        />
        <div className="rule-heading">
          <div>
            <strong>Excluded senders, domains, and subjects</strong>
            <span>Exact address or domain matches; domains do not include subdomains. Subject phrases match literal text in the subject only, ignoring case.</span>
          </div>
        </div>
        {fields.slice(2, 5).map(renderField)}
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
  wordLists,
}: {
  label: string
  categoryKey: "includedTypes" | "excludedTypes"
  suggestions: string[]
  customKeywords: string[]
  onChange: (customKeywords: string[]) => void
  // Present for skipped categories: selecting one opens its editable word list.
  wordLists?: {
    mode: "check" | "skip"
    wordsFor: (topic: string) => string[]
    starterFor: (topic: string) => string[] | null
    total: number
    onWordsChange: (topic: string, words: string[]) => void
  }
}) {
  const [draft, setDraft] = useState("")
  const [error, setError] = useState("")
  const [openTopic, setOpenTopic] = useState<string | null>(null)
  const panelId = useId()
  const isSelected = (topic: string) => customKeywords.some((keyword) => topicKey(keyword) === topicKey(topic))
  const toggleOpen = (topic: string) =>
    setOpenTopic((current) => (current === topicKey(topic) ? null : topicKey(topic)))
  const openLabel = openTopic === null ? null
    : [...suggestions, ...customKeywords].find((topic) => topicKey(topic) === openTopic) ?? null

  const add = (rawValue = draft) => {
    const category = rawValue.trim()
    if (!category) return
    const termError = topicInputError(category, customKeywords.length)
    if (termError) {
      setError(termError)
      return
    }
    onChange([...customKeywords, category])
    if (wordLists && !isSelected(category)) setOpenTopic(topicKey(category))
    setDraft("")
    setError("")
  }

  const toggleSuggestion = (suggestion: string) => {
    const selected = isSelected(suggestion)
    onChange(
      selected
        ? customKeywords.filter(
            (keyword) => keyword.toLowerCase() !== suggestion.toLowerCase(),
          )
        : [...customKeywords, suggestion],
    )
    if (wordLists) {
      const key = topicKey(suggestion)
      setOpenTopic((current) => (selected ? (current === key ? null : current) : key))
    }
    setError("")
  }

  const removeCustom = (index: number) => {
    const removed = customKeywords[index]
    onChange(customKeywords.filter((_current, currentIndex) => currentIndex !== index))
    if (removed !== undefined && openTopic === topicKey(removed)) setOpenTopic(null)
  }

  // A selected skipped category: its name opens the word list, x removes it.
  const wordListChip = (topic: string, onRemove: () => void, key: string) => {
    const open = openTopic === topicKey(topic)
    const count = wordLists ? wordLists.wordsFor(topic).length : 0
    return (
      <span className={`type-chip selected ${open ? "open" : ""}`} key={key}>
        <button
          aria-controls={open ? panelId : undefined}
          aria-expanded={open}
          className="type-chip-toggle"
          onClick={() => toggleOpen(topic)}
          title={`${open ? "Close" : "Edit"} the words for ${topic}`}
          type="button"
        >
          {topic}
          <span className="chip-count">{count} {count === 1 ? "word" : "words"}</span>
        </button>
        <button
          aria-label={`Remove ${topic}`}
          className="type-chip-remove"
          onClick={onRemove}
          type="button"
        >
          <span aria-hidden="true">×</span>
        </button>
      </span>
    )
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
      {wordLists ? (
        visibleCustomKeywords.length > 0 && (
          <div className="type-selection-chips custom-topics">
            {visibleCustomKeywords.map(({ keyword, index }) =>
              wordListChip(keyword, () => removeCustom(index), `${categoryKey}-${index}`))}
          </div>
        )
      ) : (
        <Chips
          entries={visibleCustomKeywords.map(({ keyword, index }) => ({
            key: categoryKey,
            value: keyword,
            selected: true,
            id: `${categoryKey}-${index}`,
            removeIndex: index,
          }))}
          onRemove={(_key, _category, index) => removeCustom(index)}
        />
      )}
      <div className="category-suggestions">
        <p className="suggestions-label">Suggestions</p>
        <div className="type-selection-chips">
          {suggestions.map((suggestion) => {
            const selected = isSelected(suggestion)
            if (selected && wordLists) {
              return wordListChip(suggestion, () => toggleSuggestion(suggestion), suggestion)
            }
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
      {wordLists && openLabel !== null && isSelected(openLabel) && (
        <BlockedWordsEditor
          id={panelId}
          key={openTopic}
          topic={openLabel}
          words={wordLists.wordsFor(openLabel)}
          mode={wordLists.mode}
          starter={wordLists.starterFor(openLabel)}
          total={wordLists.total}
          onChange={(words) => wordLists.onWordsChange(openLabel, words)}
          onClose={() => setOpenTopic(null)}
        />
      )}
      {error && <p className="notice warning" role="alert">{error}</p>}
    </div>
  )
}

function BlockedWordsEditor({
  id,
  mode,
  topic,
  words,
  starter,
  total,
  onChange,
  onClose,
}: {
  id: string
  mode: "check" | "skip"
  topic: string
  words: string[]
  starter: string[] | null
  total: number
  onChange: (words: string[]) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState("")
  const [error, setError] = useState("")
  const add = () => {
    const parsed = parseBlockedWord(draft, words, total)
    if (!parsed) return
    if ("error" in parsed) {
      setError(parsed.error)
      return
    }
    onChange([...words, parsed.value])
    setDraft("")
    setError("")
  }
  const remove = (word: string) => {
    if (words.length <= 1) {
      setError(mode === "skip"
        ? "A category needs at least one word. Remove the category to stop skipping it."
        : "A category needs at least one word. Remove the category to stop checking for it.")
      return
    }
    onChange(words.filter((item) => item !== word))
    setError("")
  }
  const changedFromStarter = starter !== null &&
    (starter.length !== words.length || starter.some((word, index) => word !== words[index]))

  return (
    <section aria-label={`Words for ${topic}`} className="blocked-words-editor" id={id}>
      <div className="blocked-words-head">
        <div>
          <strong>{mode === "skip" ? `Words that skip “${topic}”` : `Words that count as “${topic}”`}</strong>
          <span>{words.length} of {MAX_WORDS_PER_TOPIC} words</span>
        </div>
        <button className="secondary-button" onClick={onClose} type="button">Done</button>
      </div>
      {mode === "skip" ? (
        <p className="blocked-words-note">
          An email whose subject or body contains any of these words or phrases is skipped
          before it reaches Gemini. Matching ignores case and punctuation but needs whole
          words, so add plural forms separately. Email about this topic that uses none of
          these words can still be sent; block a sender or domain for complete protection.
        </p>
      ) : (
        <p className="blocked-words-note">
          A permitted email reaches Gemini only if its subject or body contains a word or
          phrase from one of your categories to check. Email about this topic that uses
          none of the words is skipped and gets no suggestions. Matching ignores case and
          punctuation but needs whole words, so add plural forms separately.
        </p>
      )}
      <label className="rule-input">
        <span>Add a word or phrase</span>
        <div>
          <input
            aria-label={`Add a word or phrase to ${topic}`}
            placeholder="Word or phrase"
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
          <button className="secondary-button" disabled={!draft.trim()} onClick={add} type="button">
            Add
          </button>
        </div>
      </label>
      <div className="rule-chips blocked-word-chips">
        {words.map((word) => (
          <span className="rule-chip" key={word}>
            <span className="rule-chip-value">{word}</span>
            <button aria-label={`Remove ${word} from ${topic}`} onClick={() => remove(word)} type="button">
              <Icon name="close" size={12} />
            </button>
          </span>
        ))}
      </div>
      {changedFromStarter && (
        <button
          className="text-link"
          onClick={() => {
            onChange([...starter])
            setError("")
          }}
          type="button"
        >
          Restore suggested words
        </button>
      )}
      {error && <p className="notice warning" role="alert">{error}</p>}
    </section>
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
