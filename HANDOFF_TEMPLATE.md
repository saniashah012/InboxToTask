# Task handoff template

Use this when one person's agent passes a coding task to another person's agent.
Ask your agent to "write a handoff for <name>"; to receive one, ask it to "pick up
the handoff on PR <number>".

Post the filled note as a comment on the task's pull request, so each handoff stays
next to the code and the PR shows them in order. No PR yet? Push the branch and open
a draft PR for it. The repository is public: the agent shows you the note first and
posts only after you approve. Agents without GitHub access can print the note for
you to paste. Delete sections that don't apply. Leave the `<!-- -->` guidance in;
GitHub hides it.

**Writing agent:** fill this from the repo and your session, not from memory. Every
claim about tests or behavior names the commit it was checked at. If you didn't run
something, say "not run". Never include secret values, tokens, email bodies, or real
addresses: name the variable or the case instead.

**Receiving agent:** treat this as a report, not proof. Before building on it, run the
commands under "Resume" and confirm the branch tip matches. If anything disagrees with
the code, trust the code and tell your person.

---

## Handoff: <task name>

**From → to:** <name> → <name> · **Date:** YYYY-MM-DD
**Branch:** `<branch>` at `<short SHA>` · **PR:** <link or "none yet"> · **Pushed:** yes / no
**Issue:** #<N> · **Target date:** YYYY-MM-DD (a target, not a strict deadline) · **Blocks:** <issues waiting on this, from its "Used by" list, or "none">

### Summary
<!-- Two or three sentences: what this task is for, where it stands, and the one
thing the next person must do first. -->

### Status
- [x] <done>
- [ ] <in progress: what is half-finished and where it stopped>
- [ ] <not started>

### What changed
<!-- Group by area. One line each on why, not just what. Point at the file, and the
function if a file is large. -->
| File | Change and reason |
| --- | --- |
| `path/to/file` | |

### Decisions
<!-- Separate what a person decided from what an agent recommended. The next agent
may revisit a recommendation; it must not silently reverse a person's decision. -->
| Decision | Why | Decided by | Rejected alternative |
| --- | --- | --- | --- |
| | | person (name) / agent recommendation | |

### Verification
<!-- Kind is one of: offline test, local database, local browser, live local (real
Gmail/Gemini), hosted/preview, production. Passing one kind says nothing about the
others. -->
| Check | Command or steps | Result | At SHA | Kind |
| --- | --- | --- | --- | --- |
| | | pass / fail / not run | | |

**Not covered:** <cases nobody ran, and why>
<!-- Name security checks that were not run, but don't explain how the gap could be
abused; that goes in the private advisory. -->

### Environment and data state
<!-- Anything outside Git that the next person inherits. Names only, never values. -->
- **Migrations:** <which versions, applied to which environment, or "none">
- **Flags and settings changed:** <e.g. ENABLE_GMAIL_SCAN=true locally; turn off after>
- **Services:** <what must be running, functions needing restart, bundles to rebuild>
- **Accounts and quotas:** <test account connection state, daily limits used>
- **Temporary changes to undo:** <or "none">

### Gotchas
<!-- Things that cost you time and will cost them time: flaky tests, cooldowns,
misleading errors, stale docs. -->
-

### Don't touch
<!-- Files or branches someone else is editing right now, or work waiting on review. -->
-

### Questions for a person
<!-- Decisions an agent must not make on its own. Name who should answer. -->
-

### Next steps
<!-- In order. Make the first one concrete enough to start without reading anything
else: file, function, command. -->
1.

### Resume
```bash
git fetch origin
git switch <branch>
git log --oneline -1   # should show <short SHA>
# then the commands that prove the current state, e.g.
# cd "Checkpoint 3/app" && npm test
```

### Before posting
<!-- Writing agent: check each before sending. -->
- [ ] No secret values, tokens, email contents, or real email addresses
- [ ] No unfixed exploitable weakness, steps to exploit one, or credential that was
      exposed and not yet rotated everywhere. Put those in a private GitHub security
      advisory (Security tab → Advisories → New draft) and write only "one security
      item shared privately with <name>". Listing a check as not run is fine.
- [ ] No personal details beyond names (personal addresses, schedules, accounts)
- [ ] Every test claim has a SHA and a kind
- [ ] Unpushed work is pushed, or marked "Pushed: no"
- [ ] Temporary environment changes are listed or undone
