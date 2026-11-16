# InboxToTask entry point

Before editing, read these in order:

1. [AGENTS.md](AGENTS.md) for the repository rules. It also links the frontend and
   backend instructions; follow the one for the area you change.
2. [Current implementation state](<Checkpoint 3/CURRENT_STATE.md>) for what is built,
   what was verified and what is pending.
3. [CLAUDE_HANDOFF.md](CLAUDE_HANDOFF.md) for where the last session stopped and the
   problems it left open.

Other references:

- [The implementation plan](<Checkpoint 3/IMPLEMENTATION_PLAN.md>) is the requirements
  and acceptance checklist. An unchecked item is a requirement, not proof the code is missing.
- Dated reports describe the run they were written for. Check the current code and
  database before relying on one.
- [The CP4 plan](<Checkpoint 4/CP4_PLAN.md>) has the evaluation design. CP4 tasks and
  dates are in the GitHub issues, and their statuses are on the
  [InboxToTask CP4](https://github.com/users/mzheng-01/projects/1) board. The older board
  linked to the repository is no longer kept up to date.

## Working on a CP4 task

Follow "CP4 task tracking" in [AGENTS.md](AGENTS.md). In short: find the task's issue and
work to its "Done when" list, then draft updates for every open issue your change affects
and show them to the person you are working with before posting, because the repository
is public.

## Before you change anything

- Check Git status and keep any uncommitted work. Several people and agents share this
  repository, and what you find may be someone's unfinished change.
- Check which migrations are applied and what is running, locally and on the hosted
  Supabase project. The docs describe the state when they were written, which may have
  changed.
- Report offline test results and live results separately. Offline tests use fake Gmail
  and Google responses, so they show the logic is right, not that live Gmail works.

## Ask first

Ask the person you are working with before pushing, deploying, turning on automatic
scanning, or processing real email beyond a single test. `main` deploys to production, and
scans read a real person's inbox, so a request to build or test something locally does not
cover these.

## Record what you did

Every commit updates [current state](<Checkpoint 3/CURRENT_STATE.md>) in the same commit:
the branch, what changed and what was verified. Update the handoff too where it covers the
same thing. The next person or agent starts from those files, not from this conversation.

Changes made directly to the hosted project (migrations, function deploys, secrets,
feature flags) leave no commit, so record them the same way with the date, time and who
approved them.
