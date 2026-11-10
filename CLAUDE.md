# InboxToTask entry point

Read [AGENTS.md](AGENTS.md) for repository rules, then
[current implementation state](<Checkpoint 3/CURRENT_STATE.md>) before editing.
Follow scoped frontend/backend instructions linked there.

[CLAUDE_HANDOFF.md](CLAUDE_HANDOFF.md) contains continuation details and known rough
edges. [The implementation plan](<Checkpoint 3/IMPLEMENTATION_PLAN.md>) is the
requirements/acceptance checklist; dated reports are evidence for their own runs.

Check Git status and preserve uncommitted work. Recheck runtime/applied migrations;
do not infer live Gmail success from offline tests. Local implementation does not
authorize pushing, deployment, automatic scanning, or broad real-email processing.

Record every commit in the docs, as [AGENTS.md](AGENTS.md) requires of Codex and Claude
alike: update [current state](<Checkpoint 3/CURRENT_STATE.md>) in the same commit with the
branch, what changed and what was verified, and the handoff where it covers the same thing.
Record changes made directly to hosted (migrations, function deploys, secrets, feature
flags) the same way, with the date, time and who approved them.
