import assert from "node:assert/strict"
import test from "node:test"
import {
  filterPresets,
  readStoredKeywordRules,
  writeStoredKeywordRules,
} from "../src/filterPresets.ts"

test("suggested groups round-trip as one category and retain scanner keywords", () => {
  for (const [category, keywords] of Object.entries(filterPresets)) {
    const stored = writeStoredKeywordRules([], [{ category, keywords }])
    const restored = readStoredKeywordRules(stored)

    assert.deepEqual(restored.groups, [{ category, keywords }])
    assert.deepEqual(restored.customKeywords, [])
    assert.deepEqual(stored.keywords, keywords)
  }
})

test("removing a group removes its bundle without changing custom phrases", () => {
  const saved = writeStoredKeywordRules(
    ["custom phrase"],
    [{ category: "School", keywords: filterPresets.School }],
  )
  const restored = readStoredKeywordRules(saved)
  const afterRemoval = writeStoredKeywordRules(restored.customKeywords, [])

  assert.deepEqual(afterRemoval, {
    keywords: ["custom phrase"],
    customKeywords: ["custom phrase"],
    keywordGroups: [],
  })
})

test("legacy keyword-only rows remain custom phrases instead of inferred bundles", () => {
  const legacy = ["homework", "assignment", "syllabus", "my own phrase"]
  const restored = readStoredKeywordRules({ keywords: legacy })
  const savedAgain = writeStoredKeywordRules(restored.customKeywords, restored.groups)

  assert.deepEqual(restored, { customKeywords: legacy, groups: [] })
  assert.deepEqual(savedAgain.keywords, legacy)
  assert.deepEqual(savedAgain.keywordGroups, [])
})

test("overlapping custom and grouped keywords keep one scanner term", () => {
  const stored = writeStoredKeywordRules(
    ["homework", "custom phrase"],
    [{ category: "School", keywords: filterPresets.School }],
  )

  assert.deepEqual(stored.keywords, [
    "homework",
    "custom phrase",
    "assignment",
    "syllabus",
  ])
  assert.deepEqual(readStoredKeywordRules(stored).groups, [
    { category: "School", keywords: filterPresets.School },
  ])
})
