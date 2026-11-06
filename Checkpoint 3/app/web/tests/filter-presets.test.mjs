import assert from "node:assert/strict"
import test from "node:test"
import {
  excludedTopicSuggestions,
  includedTopicSuggestions,
} from "../src/filterPresets.ts"

test("semantic topic suggestions retain the designed short names", () => {
  assert.deepEqual(includedTopicSuggestions, [
    "School",
    "Job applications",
    "Research",
    "Meetings",
  ])
  assert.deepEqual(excludedTopicSuggestions, [
    "Financial",
    "Health",
    "Promotions",
    "Family & friends",
  ])
})
