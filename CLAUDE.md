# InboxToTask entry point

Read [AGENTS.md](AGENTS.md) for repository rules, then
[current implementation state](<Checkpoint 3/CURRENT_STATE.md>) before editing.
Follow scoped frontend/backend instructions linked there.

[CLAUDE_HANDOFF.md](CLAUDE_HANDOFF.md) contains continuation details and known rough
edges. [The implementation plan](<Checkpoint 3/IMPLEMENTATION_PLAN.md>) is the
requirements/acceptance checklist; dated reports are evidence for their own runs.

For CP4, follow "CP4 task tracking" in [AGENTS.md](AGENTS.md): find the task's issue
first and work to its "Done when" list. After a change, find every open issue it affects
and draft updates for your person to approve. Due dates are targets, not strict requirements;
fall-break work is optional and only on tasks nothing else is waiting on.

Check Git status and preserve uncommitted work. Recheck runtime/applied migrations;
do not infer live Gmail success from offline tests. Local implementation does not
authorize pushing, deployment, automatic scanning, or broad real-email processing.
