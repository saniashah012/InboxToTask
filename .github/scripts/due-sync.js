// Keeps the CP4 board's Due field in step with each issue's "Due:" line and
// comments on the issue when that date changes. The issue body is the official
// date; the board field mirrors it for sorting. Run by .github/workflows/due-sync.yml.
//
// The board belongs to a personal account, so the built-in token can't edit it.
// Board updates use the PROJECT_SYNC_TOKEN secret (classic token, `project` scope
// only). Without it, the comment is still posted and the board update is skipped.

const CONFIG = { owner: 'mzheng-01', number: 1, field: 'Due' };
const TRUSTED = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

// First "Due:" followed by a date, with or without bold markers:
// "**Due:** 2026-11-16 (sent); written by 2026-11-13" -> "2026-11-16"
function parseDue(body) {
  const m = /Due:\**\s*(\d{4}-\d{2}-\d{2})/.exec(body || '');
  return m ? m[1] : null;
}

async function loadBoard(gql) {
  const r = await gql(
    `query($owner: String!, $number: Int!, $field: String!) {
      user(login: $owner) { projectV2(number: $number) {
        id field(name: $field) { ... on ProjectV2Field { id dataType } } } } }`,
    CONFIG,
  );
  const p = r.user && r.user.projectV2;
  if (!p || !p.field || p.field.dataType !== 'DATE') throw new Error('Board or its Due date field was not found');
  return { projectId: p.id, fieldId: p.field.id };
}

async function findItem(gql, board, issueNodeId) {
  const r = await gql(
    `query($id: ID!) { node(id: $id) { ... on Issue {
      projectItems(first: 20) { nodes { id project { id } } } } } }`,
    { id: issueNodeId },
  );
  const items = (r.node && r.node.projectItems.nodes) || [];
  const hit = items.find((n) => n.project.id === board.projectId);
  return hit ? hit.id : null;
}

async function setDue(gql, board, itemId, date) {
  if (date) {
    await gql(
      `mutation($p: ID!, $i: ID!, $f: ID!, $d: Date!) {
        updateProjectV2ItemFieldValue(input: { projectId: $p, itemId: $i, fieldId: $f, value: { date: $d } }) {
          projectV2Item { id } } }`,
      { p: board.projectId, i: itemId, f: board.fieldId, d: date },
    );
  } else {
    await gql(
      `mutation($p: ID!, $i: ID!, $f: ID!) {
        clearProjectV2ItemFieldValue(input: { projectId: $p, itemId: $i, fieldId: $f }) {
          projectV2Item { id } } }`,
      { p: board.projectId, i: itemId, f: board.fieldId },
    );
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function onIssueEvent({ github, context, core, projectGql, wait = 10000 }) {
  const { action, issue, changes } = context.payload;
  if (!TRUSTED.has(issue.author_association)) {
    core.info(`Skipping #${issue.number}: author is not a repository collaborator`);
    return;
  }
  const newDue = parseDue(issue.body);
  if (action === 'edited') {
    if (!changes || !changes.body) return; // title or other edit
    const oldDue = parseDue(changes.body.from);
    if (oldDue === newDue) return;
    await github.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: issue.number,
      body: `Due date changed from **${oldDue || 'none'}** to **${newDue || 'none'}** by @${context.actor}.`,
    });
  } else if (action === 'opened') {
    if (!newDue) return;
  } else {
    return;
  }

  if (!projectGql) {
    core.notice('PROJECT_SYNC_TOKEN is not set; the board Due field was not updated.');
    return;
  }
  const board = await loadBoard(projectGql);
  // A new issue may reach the board through auto-add a few seconds after this runs.
  let itemId = null;
  for (let attempt = 0; attempt < 4 && !itemId; attempt++) {
    if (attempt) await sleep(wait);
    itemId = await findItem(projectGql, board, issue.node_id);
  }
  if (!itemId) {
    core.notice(`#${issue.number} is not on the board; nothing to update.`);
    return;
  }
  await setDue(projectGql, board, itemId, newDue);
  core.info(`#${issue.number}: board Due set to ${newDue || '(cleared)'}`);
}

// Manual run: make every board item from this repository match its issue body.
async function syncAll({ context, core, projectGql }) {
  if (!projectGql) {
    core.setFailed('PROJECT_SYNC_TOKEN is not set.');
    return;
  }
  const board = await loadBoard(projectGql);
  const repo = `${context.repo.owner}/${context.repo.repo}`;
  let after = null;
  let checked = 0;
  let changed = 0;
  do {
    const r = await projectGql(
      `query($owner: String!, $number: Int!, $after: String) {
        user(login: $owner) { projectV2(number: $number) {
          items(first: 100, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes { id
              content { ... on Issue { number body repository { nameWithOwner } } }
              fieldValueByName(name: "Due") { ... on ProjectV2ItemFieldDateValue { date } } } } } } }`,
      { owner: CONFIG.owner, number: CONFIG.number, after },
    );
    const page = r.user.projectV2.items;
    for (const item of page.nodes) {
      const c = item.content;
      if (!c || !c.repository || c.repository.nameWithOwner !== repo) continue;
      checked++;
      const want = parseDue(c.body);
      const have = item.fieldValueByName ? item.fieldValueByName.date : null;
      if (want !== have) {
        await setDue(projectGql, board, item.id, want);
        changed++;
        core.info(`#${c.number}: ${have || 'none'} -> ${want || 'none'}`);
      }
    }
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
  core.info(`Checked ${checked} issues, updated ${changed}.`);
}

// github-script passes getOctokit; the second client uses the board token.
async function main({ github, context, core, getOctokit }) {
  const token = process.env.PROJECT_TOKEN;
  const projectGql = token ? getOctokit(token).graphql : null;
  if (context.eventName === 'workflow_dispatch') return syncAll({ context, core, projectGql });
  return onIssueEvent({ github, context, core, projectGql });
}

module.exports = { parseDue, onIssueEvent, syncAll, main };
