// Writes made-up data to site/data.enc.json so the page can be tried locally.
// Run: TRACKER_PASSWORD=sample-password node scripts/sample.mjs
import {writeFile} from 'node:fs/promises';
import {TEAM, GOAL_PER_DAY, PAST_WEEKS, SITE} from './team.mjs';
import {encryptJson} from './crypto.mjs';

const password = process.env.TRACKER_PASSWORD || 'sample-password';
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = new Date();
const mon = new Date(today); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
const weeks = [];
for (let i = PAST_WEEKS; i >= 0; i--) {
  const a = new Date(mon); a.setDate(a.getDate() - 7 * i);
  const b = new Date(a); b.setDate(b.getDate() + 6);
  weeks.push({week_start: iso(a), week_end: iso(b)});
}
const tickets = [
  ['TIUX-573', 'Internal Calls (Devs and Team)', 'TIUX', 'TI UX', 'In Progress', 'indeterminate'],
  ['TIUX-575', 'External Calls (with Clients and FGs)', 'TIUX', 'TI UX', 'In Progress', 'indeterminate'],
  ['TRL-24321', '[UX] Research and Ticket composing', 'TRL', '2020 Trialinteractive', 'Resolved', 'done'],
  ['QMS-3081', 'Contact Field Type on QMS Records', 'QMS', 'TI QMS', 'Story Review', 'new'],
  ['TICTMS-18500', 'UX: Workflows & UX Specification', 'TICTMS', 'TI-CTMS', 'In Progress', 'indeterminate'],
];
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const worklogs = []; let id = 1;
for (const w of weeks) for (let d = 0; d < 5; d++) {
  const day = new Date(w.week_start + 'T12:00:00'); day.setDate(day.getDate() + d);
  if (iso(day) > iso(today)) continue;
  for (const p of TEAM) {
    if (rnd() < 0.15) continue;
    let left = [8, 8, 6, 7.5, 4, 8.5][Math.floor(rnd() * 6)];
    while (left > 0) {
      const t = tickets[Math.floor(rnd() * tickets.length)];
      const h = Math.min(left, [0.5, 1, 1.5, 2, 3][Math.floor(rnd() * 5)]);
      const habit = [0.3, 1, 3, 6, 20][TEAM.indexOf(p)];
      const startH = 17 - left;
      const delayH = rnd() * habit * 2;
      const c = new Date(day); c.setHours(9, 0, 0, 0); c.setMinutes(Math.round((startH - 9 + h + delayH) * 60));
      const stamp = (d) => `${iso(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00.000+0200`;
      const st = new Date(day); st.setHours(9, 0, 0, 0); st.setMinutes(Math.round((startH - 9) * 60));
      worklogs.push({id: String(id++), person: p.name, day: iso(day), started: stamp(st), created: stamp(c), hours: h,
        key: t[0], summary: t[1], project_key: t[2], project: t[3], issue_type: 'Sub-task', parent_key: t[0] === 'TRL-24321' ? 'TRL-24000' : '', parent_summary: t[0] === 'TRL-24321' ? 'Q4 Study Startup redesign' : '', status: t[4], status_category: t[5]});
      left -= h;
    }
  }
}
const touched = {};
for (const w of weeks) touched[w.week_start] = TEAM.flatMap((p, i) => tickets.slice(0, 3 + (i % 3)).map((t, j) => ({
  person: p.name, key: t[0], summary: t[1], project_key: t[2], project: t[3], issue_type: t[0] === 'TRL-24321' ? 'Sub-task' : 'Task',
  parent_key: t[0] === 'TRL-24321' ? 'TRL-24000' : '', parent_summary: t[0] === 'TRL-24321' ? 'Q4 Study Startup redesign' : '', status: t[4], status_category: t[5],
  relation: ['Assigned, open', 'Updated this week', 'Created this week'][j % 3], assignee: p.name, updated: w.week_start + 'T10:00:00.000+0200',
})));
const payload = {generated_at: new Date().toISOString(), site: SITE, tz: 'Europe/Kyiv', goal_per_day: GOAL_PER_DAY, team: TEAM.map((p) => p.name), weeks, worklogs, touched, truncated: {worklogs: false, touched: false}};
await writeFile(new URL('../site/data.enc.json', import.meta.url), JSON.stringify(await encryptJson(payload, password)));
console.log(`Sample data written: ${worklogs.length} time entries. Password: ${password === 'sample-password' ? 'sample-password' : '(from TRACKER_PASSWORD)'}`);
