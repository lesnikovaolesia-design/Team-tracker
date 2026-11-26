// Reads the team's Jira time entries and tickets, then writes an encrypted
// data file for the page: site/data.enc.json.
//
// Needs these environment variables (GitHub Actions secrets):
//   JIRA_EMAIL        the Atlassian account email that owns the token
//   JIRA_API_TOKEN    an Atlassian API token (read access to the projects)
//   TRACKER_PASSWORD  the team password the page asks for
// Optional: JIRA_SITE (default trialinteractive.atlassian.net), TRACKER_TZ (default Europe/Kyiv)
// Extra accounts, for projects the main account can't see: JIRA_EMAIL_2 + JIRA_API_TOKEN_2,
// up to _5. Results from all accounts are merged, and each time entry is counted once.
//
// Run: node scripts/fetch.mjs

import {writeFile, mkdir} from 'node:fs/promises';
import {SITE, TEAM, GOAL_PER_DAY, PAST_WEEKS} from './team.mjs';
import {encryptJson} from './crypto.mjs';

const {JIRA_EMAIL, JIRA_API_TOKEN, TRACKER_PASSWORD} = process.env;
const TZ = process.env.TRACKER_TZ || 'Europe/Kyiv';
for (const [k, v] of Object.entries({JIRA_EMAIL, JIRA_API_TOKEN, TRACKER_PASSWORD})) {
  if (!v) { console.error(`Missing ${k}.`); process.exit(1); }
}

const BASE = `https://${SITE}`;
const basic = (email, token) => 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
const ACCOUNTS = [basic(JIRA_EMAIL, JIRA_API_TOKEN)];
for (let i = 2; i <= 5; i++) {
  const e = process.env[`JIRA_EMAIL_${i}`], t = process.env[`JIRA_API_TOKEN_${i}`];
  if (e && t) ACCOUNTS.push(basic(e, t));
}
const AUTH = ACCOUNTS[0];
const BY_ID = new Map(TEAM.map((p) => [p.id, p.name]));

async function jira(path, {method = 'GET', body, auth = AUTH} = {}, attempt = 1) {
  const res = await fetch(BASE + path, {
    method,
    headers: {Authorization: auth, Accept: 'application/json', ...(body ? {'Content-Type': 'application/json'} : {})},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 429 && attempt <= 5) {
    const wait = Number(res.headers.get('retry-after') || 2 * attempt) * 1000;
    await new Promise((r) => setTimeout(r, wait));
    return jira(path, {method, body, auth}, attempt + 1);
  }
  if (!res.ok) throw new Error(`Jira ${method} ${path.split('?')[0]} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function search(jql, fields, limit = 1000, auth = AUTH) {
  const out = [];
  let nextPageToken;
  do {
    const page = await jira('/rest/api/3/search/jql', {auth, method: 'POST', body: {jql, fields, maxResults: 100, ...(nextPageToken ? {nextPageToken} : {})}});
    out.push(...(page.issues || []));
    nextPageToken = page.isLast ? undefined : page.nextPageToken;
  } while (nextPageToken && out.length < limit);
  return {issues: out, truncated: Boolean(nextPageToken)};
}

// An extra account that fails (expired token, no access) is skipped with a warning; the main one must work.
const SKIPPED = new Set();
async function searchAs(auth, jql, fields, limit) {
  if (SKIPPED.has(auth)) return {issues: [], truncated: false};
  try { return await search(jql, fields, limit, auth); }
  catch (e) {
    if (auth === AUTH) throw e;
    SKIPPED.add(auth);
    console.warn(`Skipped extra Jira account #${ACCOUNTS.indexOf(auth) + 1}: ${e.message}`);
    return {issues: [], truncated: false};
  }
}

// Dates in the team's time zone.
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const todayIn = (tz) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'})
    .formatToParts(new Date()).map((p) => [p.type, p.value]));
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day));
};
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const mondayOf = (d) => addDays(d, -((d.getUTCDay() + 6) % 7));

const thisMonday = mondayOf(todayIn(TZ));
const weeks = [];
for (let i = PAST_WEEKS; i >= 0; i--) {
  const mon = addDays(thisMonday, -7 * i);
  weeks.push({week_start: iso(mon), week_end: iso(addDays(mon, 6))});
}
const from = weeks[0].week_start;
const to = weeks[weeks.length - 1].week_end;
const ids = TEAM.map((p) => `"${p.id}"`).join(', ');

const status = (f) => ({
  status: f.status?.name || '',
  status_category: f.status?.statusCategory?.key || '',
});

// For a sub-task: the ticket it was created from. (Stories under an epic also have a parent; those are left out.)
const parentOf = (f) => (f.issuetype?.subtask && f.parent?.key
  ? {parent_key: f.parent.key, parent_summary: f.parent.fields?.summary || ''}
  : {parent_key: '', parent_summary: ''});

async function worklogRows() {
  // Search a day wider on each side; Jira compares worklog dates in the token owner's time zone.
  const jql = `worklogAuthor in (${ids}) AND worklogDate >= "${iso(addDays(new Date(from + 'T00:00:00Z'), -1))}" AND worklogDate <= "${iso(addDays(new Date(to + 'T00:00:00Z'), 1))}" ORDER BY updated DESC`;
  const found = new Map();
  let truncated = false;
  for (const auth of ACCOUNTS) {
    const r = await searchAs(auth, jql, ['summary', 'status', 'project', 'issuetype', 'parent'], 1000);
    truncated ||= r.truncated;
    for (const it of r.issues) if (!found.has(it.key)) found.set(it.key, {...it, auth});
  }
  const issues = [...found.values()];
  const after = Date.parse(from + 'T00:00:00Z') - 2 * 86400000;
  const before = Date.parse(to + 'T23:59:59Z') + 2 * 86400000;
  const rows = [];
  for (let i = 0; i < issues.length; i += 5) {
    const chunk = issues.slice(i, i + 5);
    const lists = await Promise.all(chunk.map(async (it) => {
      const all = [];
      let startAt = 0;
      for (;;) {
        const page = await jira(`/rest/api/3/issue/${encodeURIComponent(it.key)}/worklog?startedAfter=${after}&startedBefore=${before}&startAt=${startAt}&maxResults=1000`, {auth: it.auth});
        all.push(...(page.worklogs || []));
        startAt += (page.worklogs || []).length;
        if (!page.worklogs?.length || startAt >= (page.total || 0)) break;
      }
      return all;
    }));
    chunk.forEach((it, j) => {
      const f = it.fields || {};
      for (const w of lists[j]) {
        const person = BY_ID.get(w.author?.accountId);
        if (!person) continue;
        // "started" carries the logger's own offset, so its date is the day they logged it for.
        const day = String(w.started || '').slice(0, 10);
        if (day < from || day > to) continue;
        rows.push({
          id: String(w.id), person, day, started: w.started, created: w.created || '',
          hours: Math.round((Number(w.timeSpentSeconds) || 0) / 36) / 100,
          key: it.key, summary: f.summary || '',
          project_key: f.project?.key || '', project: f.project?.name || '',
          issue_type: f.issuetype?.name || '', ...parentOf(f),
          ...status(f),
        });
      }
    });
  }
  return {rows, truncated};
}

async function touchedRows() {
  const byWeek = {};
  let truncated = false;
  const fields = ['summary', 'status', 'assignee', 'reporter', 'updated', 'created', 'project', 'issuetype', 'parent'];
  for (const w of weeks) {
    const lists = await Promise.all(TEAM.map(async (p) => {
      const jql = `(assignee = "${p.id}" AND statusCategory != Done) OR issuekey in updatedBy("${p.id}", "${w.week_start}", "${w.week_end}") OR (reporter = "${p.id}" AND created >= "${w.week_start}" AND created <= "${w.week_end} 23:59") ORDER BY updated DESC`;
      const seen = new Map();
      for (const auth of ACCOUNTS) {
        const r = await searchAs(auth, jql, fields, 200);
        truncated ||= r.truncated;
        for (const it of r.issues) if (!seen.has(it.key)) seen.set(it.key, it);
      }
      return [...seen.values()].map((it) => {
        const f = it.fields || {};
        const cat = f.status?.statusCategory?.key || '';
        const assigned = f.assignee?.accountId === p.id;
        const created = f.reporter?.accountId === p.id && String(f.created || '').slice(0, 10) >= w.week_start;
        return {
          person: p.name, key: it.key, summary: f.summary || '',
          project_key: f.project?.key || '', project: f.project?.name || '',
          issue_type: f.issuetype?.name || '', ...status(f), ...parentOf(f),
          relation: assigned && cat !== 'done' ? 'Assigned, open' : created ? 'Created this week' : 'Updated this week',
          assignee: f.assignee?.displayName || 'Unassigned', updated: f.updated || '',
        };
      });
    }));
    byWeek[w.week_start] = lists.flat();
  }
  return {byWeek, truncated};
}

const started = Date.now();
const [wl, tc] = await Promise.all([worklogRows(), touchedRows()]);
const payload = {
  generated_at: new Date().toISOString(),
  site: SITE, tz: TZ, goal_per_day: GOAL_PER_DAY,
  team: TEAM.map((p) => p.name),
  weeks,
  worklogs: wl.rows,
  touched: tc.byWeek,
  truncated: {worklogs: wl.truncated, touched: tc.truncated},
  accounts: {configured: ACCOUNTS.length, working: ACCOUNTS.length - SKIPPED.size},
};
await mkdir(new URL('../site/', import.meta.url), {recursive: true});
await writeFile(new URL('../site/data.enc.json', import.meta.url), JSON.stringify(await encryptJson(payload, TRACKER_PASSWORD)));
// A small public status file: when the data was made and how many Jira accounts worked. No hours or names.
const failed = [...SKIPPED].map((a) => ACCOUNTS.indexOf(a) + 1);
await writeFile(new URL('../site/status.json', import.meta.url), JSON.stringify({
  generated_at: payload.generated_at, accounts_configured: ACCOUNTS.length, accounts_working: ACCOUNTS.length - SKIPPED.size, failed_accounts: failed,
}));
console.log(`Read Jira with ${ACCOUNTS.length - SKIPPED.size} of ${ACCOUNTS.length} account${ACCOUNTS.length > 1 ? 's' : ''}${failed.length ? ` (not working: #${failed.join(', #')})` : ''}.`);
console.log(`Wrote ${wl.rows.length} time entries and ${Object.values(tc.byWeek).flat().length} ticket rows for ${weeks.length} weeks in ${((Date.now() - started) / 1000).toFixed(1)} s.`);
