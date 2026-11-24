(() => {
  'use strict';

  const STORE_KEY = 'tt-pass';
  const COLORS = ['#4a9dff', '#ff5fa8', '#2fc48d', '#ff9a3c', '#9a6bff', '#ffcf3a', '#2ec5d3', '#e76f51', '#8ab17d', '#c77dff'];
  const VIBES = {
    zero: '😴 The timesheet is empty. Even the Product Owner is getting nervous. Coffee first, then Jira? ☕',
    some: '🐢 First hours are in. Progress is “normal”, as we say. 👌',
    half: '🚀 Over halfway to today’s goal! Americans would call this AWESOME. We’ll call it “not bad”.',
    full: '🎉 Team goal hit for today! Tell the Product Owner, then hide before they add scope. 🍕',
    weekend: '🛋️ It’s the weekend. Laptop closed, varenyky open. 🥟',
  };
  const DAY_EMOJI = ['🌞', '☕', '🌮', '🐪', '🚀', '🎉', '🛋️'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const pad = (n) => String(n).padStart(2, '0');
  const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return isoLocal(d); };
  const dayLabel = (s) => { const d = parseDay(s); return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; };
  const fmtH = (h) => { const n = Math.round(Number(h) * 100) / 100; return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''); };
  const todayIso = () => isoLocal(new Date());
  const isWeekend = (s) => { const w = parseDay(s).getDay(); return w === 0 || w === 6; };
  const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : null);

  let DATA = null;
  let PASS = null;
  const S = {week: 0, person: '', day: '', sort: '', dir: 'asc', q: '', project: '', status: '', rel: '', assignee: ''};

  // ---------- decryption ----------
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function decrypt(box, password) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({name: 'PBKDF2', salt: b64(box.salt), iterations: box.iterations, hash: 'SHA-256'},
      base, {name: 'AES-GCM', length: 256}, false, ['decrypt']);
    const pt = await crypto.subtle.decrypt({name: 'AES-GCM', iv: b64(box.iv)}, key, b64(box.data));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  async function load(password) {
    const res = await fetch(`data.enc.json?t=${Date.now()}`, {cache: 'no-store'});
    if (!res.ok) throw new Error('nodata');
    return decrypt(await res.json(), password);
  }
  const store = {
    get: () => { try { return localStorage.getItem(STORE_KEY); } catch { return null; } },
    set: (v) => { try { localStorage.setItem(STORE_KEY, v); } catch { /* private mode */ } },
    clear: () => { try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ } },
  };

  async function unlock(password, remember) {
    const data = await load(password);
    DATA = data; PASS = password;
    if (remember) store.set(password);
    S.week = currentWeekIndex();
    $('lock').hidden = true; $('app').hidden = false;
    renderAll();
    setupNav();
  }

  $('lock-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('lock-error').hidden = true;
    try { await unlock($('lock-pass').value, $('lock-remember').checked); }
    catch (err) {
      $('lock-error').textContent = err.message === 'nodata' ? 'The data file isn’t there yet. Ask Olesia to run the update job.' : 'That password didn’t work. Try again.';
      $('lock-error').hidden = false;
    }
  });
  $('forget').addEventListener('click', () => { store.clear(); location.reload(); });

  // ---------- derived data ----------
  const week = () => DATA.weeks[S.week];
  const weekDays = () => { const out = []; for (let i = 0; i < 7; i++) out.push(addDays(week().week_start, i)); return out; };
  const weekLogs = () => DATA.worklogs.filter((r) => r.day >= week().week_start && r.day <= week().week_end);
  const hoursMap = () => { const m = new Map(); for (const r of weekLogs()) { const k = `${r.person}|${r.day}`; m.set(k, (m.get(k) || 0) + r.hours); } return m; };
  const visibleDays = () => { const m = hoursMap(); return weekDays().filter((d) => !isWeekend(d) || DATA.team.some((p) => (m.get(`${p}|${d}`) || 0) > 0)); };
  const GOAL = () => DATA.goal_per_day || 8;

  // ---------- rendering ----------
  function renderAll() {
    renderHeader(); renderFun(); renderGrid(); renderChips(); renderChart(); renderLog(); renderTouchedFilters(); renderTouched();
  }

  const weekText = (w) => {
    const a = parseDay(w.week_start), b = parseDay(w.week_end);
    return a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${MON[b.getMonth()]} ${b.getFullYear()}` : `${a.getDate()} ${MON[a.getMonth()]} – ${b.getDate()} ${MON[b.getMonth()]} ${b.getFullYear()}`;
  };
  const currentWeekIndex = () => { const t = DATA.weeks.findIndex((w) => w.week_start <= todayIso() && todayIso() <= w.week_end); return t >= 0 ? t : DATA.weeks.length - 1; };
  function renderHeader() {
    const txt = weekText(week());
    $('week-text').textContent = txt;
    const cur = currentWeekIndex();
    $('week-select').replaceChildren(...DATA.weeks.map((wk, i) => [wk, i]).reverse().map(([wk, i]) => {
      const short = weekText(wk).replace(` ${new Date().getFullYear()}`, '');
      return new Option(`${short}${i === cur ? ' · this week' : i === cur - 1 ? ' · last week' : ''}`, String(i));
    }));
    $('week-select').value = String(S.week);
    $('this-week').hidden = S.week === cur;
    const total = weekLogs().reduce((s, r) => s + r.hours, 0);
    $('team-hours').textContent = fmtH(total);
    $('team-goal').textContent = fmtH(DATA.team.length * 5 * GOAL());
    $('prev').disabled = S.week <= 0;
    $('next').disabled = S.week >= DATA.weeks.length - 1;
    const at = new Date(DATA.generated_at);
    const mins = Math.round((Date.now() - at.getTime()) / 60000);
    const acc = DATA.accounts;
    $('updated-at').title = acc ? `Read from Jira with ${acc.working} of ${acc.configured} account${acc.configured > 1 ? 's' : ''}` : '';
    $('updated-at').textContent = `Updated ${at.toLocaleString(undefined, {weekday: 'short', hour: '2-digit', minute: '2-digit'})}${mins >= 0 && mins < 600 ? ` (${mins} min ago)` : ''}`;
  }

  function renderFun() {
    const dow = new Date().getDay();
    let vibe = 'weekend';
    if (dow !== 0 && dow !== 6) {
      const today = todayIso();
      const hours = DATA.worklogs.filter((r) => r.day === today).reduce((s, r) => s + r.hours, 0);
      const share = hours / (DATA.team.length * GOAL());
      vibe = share >= 1 ? 'full' : share >= 0.5 ? 'half' : share > 0 ? 'some' : 'zero';
    }
    $('vibe-text').textContent = VIBES[vibe];
  }

  function msgRow(tbody, cols, text) {
    const tr = el('tr'); const td = el('td', 'tt-msg', text); td.colSpan = cols; tr.append(td); tbody.replaceChildren(tr);
  }

  function renderGrid() {
    const days = visibleDays();
    const today = todayIso();
    const m = hoursMap();
    const head = el('tr');
    head.append(el('th', '', 'Person'));
    for (const d of days) {
      const th = el('th', 'tt-c' + (d === today ? ' tt-today' : ''), `${DAY_EMOJI[parseDay(d).getDay()]} ${dayLabel(d)}`);
      th.append(el('span', 'tt-goal', isWeekend(d) ? 'Weekend' : `Goal ${fmtH(GOAL())} h`));
      head.append(th);
    }
    head.append(el('th', 'tt-num', 'Week'), el('th', 'tt-num', 'Missing'), el('th', 'tt-num', 'Days at 8 h'));
    $('grid-head').replaceChildren(head);

    const rows = DATA.team.map((person) => {
      const tr = el('tr');
      const th = el('th'); th.scope = 'row';
      const pb = el('button', 'tt-person', person); pb.type = 'button';
      pb.setAttribute('aria-pressed', String(S.person === person && !S.day));
      pb.addEventListener('click', () => { S.person = S.person === person && !S.day ? '' : person; S.day = ''; renderAfterFilter(); });
      th.append(pb); tr.append(th);
      let weekH = 0, missing = 0, met = 0;
      for (const d of days) {
        const h = m.get(`${person}|${d}`) || 0;
        weekH += h;
        const weekend = isWeekend(d);
        if (!weekend && d < today) { missing += Math.max(0, GOAL() - h); }
        if (!weekend && h >= GOAL()) met++;
        const level = d > today ? 'future' : weekend ? 'weekend' : h >= GOAL() ? 'ok' : h > 0 ? 'part' : d === today ? 'future' : 'none';
        const td = el('td', 'tt-c' + (d === today ? ' tt-today' : ''));
        const b = el('button', 'tt-pill'); b.type = 'button'; b.dataset.level = level;
        const on = S.person === person && S.day === d;
        b.setAttribute('aria-pressed', String(on));
        b.setAttribute('aria-label', `${person}, ${dayLabel(d)}: ${fmtH(h)} of ${weekend ? 0 : fmtH(GOAL())} hours`);
        if (d > today && h === 0) b.textContent = '·';
        else {
          b.append(el('span', '', fmtH(h)));
          if (!weekend) b.append(el('span', 'tt-of', ` / ${fmtH(GOAL())}`));
          const emo = {ok: '🎉', part: '☕', none: '😴'}[level];
          if (emo) { const e = el('span', 'tt-emo', emo); e.setAttribute('aria-hidden', 'true'); b.append(e); }
        }
        b.addEventListener('click', () => { if (on) S.day = ''; else { S.person = person; S.day = d; } renderAfterFilter(); });
        td.append(b); tr.append(td);
      }
      const wk = el('td', 'tt-num tt-total', fmtH(weekH)); wk.append(el('span', 'tt-muted', ` / ${fmtH(GOAL() * 5)}`));
      tr.append(wk, el('td', 'tt-num' + (missing > 0 ? ' tt-bad' : ''), fmtH(missing)), el('td', 'tt-num', String(met)));
      return tr;
    });
    $('grid-body').replaceChildren(...rows);

    const foot = el('tr');
    const fth = el('th', '', 'Team'); fth.scope = 'row'; foot.append(fth);
    let teamWeek = 0;
    for (const d of days) {
      const h = DATA.team.reduce((s, p) => s + (m.get(`${p}|${d}`) || 0), 0);
      teamWeek += h;
      const td = el('td', 'tt-c' + (d === today ? ' tt-today' : ''), fmtH(h));
      if (!isWeekend(d)) td.append(el('span', 'tt-of', ` / ${fmtH(GOAL() * DATA.team.length)}`));
      foot.append(td);
    }
    const tw = el('td', 'tt-num tt-total', fmtH(teamWeek)); tw.append(el('span', 'tt-muted', ` / ${fmtH(GOAL() * 5 * DATA.team.length)}`));
    foot.append(tw, el('td'), el('td'));
    $('grid-foot').replaceChildren(foot);
  }

  function renderChips() {
    const sel = $('person-select');
    sel.replaceChildren(new Option('Everyone', ''), ...DATA.team.map((p) => new Option(p, p)));
    sel.value = S.person || '';
    $('clear-day').hidden = !S.day;
    $('clear-day').textContent = S.day ? `📅 ${dayLabel(S.day)} ✕` : '';
    renderCounts();
  }

  function renderCounts() {
    const logs = weekLogs();
    $('count-hours').textContent = `${fmtH(logs.reduce((s, r) => s + r.hours, 0))} h`;
    $('count-projects').textContent = String(new Set(logs.map((r) => r.project_key)).size);
    $('count-logged').textContent = String(new Set(logs.filter((r) => (!S.person || r.person === S.person) && (!S.day || r.day === S.day)).map((r) => `${r.person}|${r.key}`)).size);
    $('count-touched').textContent = String(touchedForPerson().length);
  }

  function renderAfterFilter() { renderGrid(); renderChips(); renderLog(); renderTouchedFilters(); renderTouched(); }

  // Stacked bars per person by project
  function renderChart() {
    const box = $('chart');
    const logs = weekLogs();
    const proj = new Map();
    for (const r of logs) { const p = proj.get(r.project_key) || {name: r.project, h: 0}; p.h += r.hours; proj.set(r.project_key, p); }
    const order = [...proj.entries()].sort((a, b) => b[1].h - a[1].h);
    const color = new Map(order.map(([k], i) => [k, COLORS[i % COLORS.length]]));
    $('legend').replaceChildren(...order.map(([k, p]) => {
      const li = el('li'); const sw = el('span', 'tt-sw'); sw.style.background = color.get(k);
      li.append(sw, el('b', '', k), el('span', '', p.name), el('span', 'tt-muted', `${fmtH(p.h)} h`)); return li;
    }));
    if (!logs.length) { box.replaceChildren(el('p', 'tt-note', 'No time logged in this week yet.')); return; }
    const W = Math.max(320, box.clientWidth || 800);
    const labelW = W < 520 ? 72 : Math.min(170, W * 0.32);
    const barH = 24, gap = 14, top = 22;
    const H = top + DATA.team.length * (barH + gap);
    const maxH = Math.max(GOAL() * 5, ...DATA.team.map((p) => logs.filter((r) => r.person === p).reduce((s, r) => s + r.hours, 0)));
    const x = (h) => labelW + (h / maxH) * (W - labelW - 40);
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Hours logged in the selected week by each person, split by Jira project');
    const mk = (tag, attrs, text) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text != null) n.textContent = text; return n; };
    const axis = mk('g', {class: 'tt-axis'});
    const step = maxH > 60 ? 20 : maxH > 30 ? 10 : 5;
    for (let h = 0; h <= maxH + 0.001; h += step) {
      axis.append(mk('line', {class: 'tt-gridline', x1: x(h), x2: x(h), y1: top - 6, y2: H - gap / 2}));
      axis.append(mk('text', {x: x(h), y: 12, 'text-anchor': 'middle'}, `${h} h`));
    }
    svg.append(axis);
    const tip = $('tip');
    DATA.team.forEach((person, i) => {
      const y = top + i * (barH + gap);
      svg.append(mk('text', {x: 0, y: y + barH / 2, dy: '0.35em'}, W < 520 ? person.split(' ')[0] : person));
      const segs = new Map();
      for (const r of logs.filter((l) => l.person === person)) segs.set(r.project_key, (segs.get(r.project_key) || 0) + r.hours);
      let acc = 0;
      for (const [k, h] of [...segs.entries()].sort((a, b) => b[1] - a[1])) {
        const rect = mk('rect', {x: x(acc), y, width: Math.max(1, x(acc + h) - x(acc) - 1), height: barH, rx: 4, fill: color.get(k)});
        const label = `${person} · ${k} ${proj.get(k).name}: ${fmtH(h)} h`;
        rect.setAttribute('tabindex', '0'); rect.setAttribute('aria-label', label);
        const show = (ev) => {
          tip.textContent = label; tip.hidden = false;
          const r = ev.target.getBoundingClientRect();
          const cx = ev.clientX ?? (r.left + r.width / 2), cy = ev.clientY ?? r.top;
          tip.style.left = `${Math.min(window.innerWidth - 270, Math.max(8, cx + 12))}px`;
          tip.style.top = `${Math.max(8, cy - 36)}px`;
        };
        rect.addEventListener('mousemove', show); rect.addEventListener('focus', show);
        rect.addEventListener('mouseleave', () => { tip.hidden = true; }); rect.addEventListener('blur', () => { tip.hidden = true; });
        svg.append(rect);
        acc += h;
      }
      svg.append(mk('text', {x: x(acc) + 6, y: y + barH / 2, dy: '0.35em'}, `${fmtH(acc)} h`));
    });
    svg.append(mk('line', {class: 'tt-goalline', x1: x(GOAL() * 5), x2: x(GOAL() * 5), y1: top - 6, y2: H - gap / 2}));
    box.replaceChildren(svg);
  }

  const link = (key, site) => {
    const url = safeUrl(`https://${site}/browse/${encodeURIComponent(key)}`);
    const a = el('a', '', key); if (url) { a.href = url; a.target = '_blank'; a.rel = 'noopener'; } return a;
  };
  const statusCell = (name, cat) => { const s = el('span', 'tt-status'); const d = el('span', 'tt-dot'); d.dataset.cat = cat || ''; s.append(d, el('span', '', name)); return s; };

  let LOG_VIEW = 'sheet';
  function renderLog() {
    $('sheet-wrap').hidden = LOG_VIEW !== 'sheet';
    $('entries-wrap').hidden = LOG_VIEW !== 'entries';
    document.querySelectorAll('.tt-seg-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === LOG_VIEW)));
    $('log-note').textContent = LOG_VIEW === 'sheet'
      ? 'Hours per ticket and day for the selected week. Long-running tickets show up once, with each day’s hours. Select a ticket key to open it in Jira.'
      : 'Every single time entry in the selected week, newest first. Select a ticket key to open it in Jira.';
    renderSheet();
    const rows = weekLogs().filter((r) => (!S.person || r.person === S.person) && (!S.day || r.day === S.day))
      .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : DATA.team.indexOf(a.person) - DATA.team.indexOf(b.person)));
    if (!rows.length) { msgRow($('log-rows'), 7, 'No time entries for this selection.'); return; }
    $('log-rows').replaceChildren(...rows.map((r) => {
      const tr = el('tr');
      const k = el('td'); k.append(link(r.key, DATA.site));
      const p = el('td'); p.append(el('span', '', r.project_key), el('span', 'tt-muted', ` ${r.project}`));
      const st = el('td'); st.append(statusCell(r.status, r.status_category));
      tr.append(el('td', '', dayLabel(r.day)), el('td', '', r.person), k, el('td', 'tt-wrap', r.summary), p, st, el('td', 'tt-num', fmtH(r.hours)));
      return tr;
    }));
  }

  function renderSheet() {
    const days = visibleDays();
    const logs = weekLogs().filter((r) => !S.person || r.person === S.person);
    const groups = new Map();
    for (const r of logs) {
      const k = `${r.person}|${r.key}`;
      const g = groups.get(k) || {person: r.person, key: r.key, summary: r.summary, project_key: r.project_key, project: r.project, status: r.status, status_category: r.status_category, byDay: new Map(), total: 0};
      g.byDay.set(r.day, (g.byDay.get(r.day) || 0) + r.hours); g.total += r.hours;
      groups.set(k, g);
    }
    let list = [...groups.values()];
    if (S.day) list = list.filter((g) => (g.byDay.get(S.day) || 0) > 0);
    list.sort((a, b) => DATA.team.indexOf(a.person) - DATA.team.indexOf(b.person) || b.total - a.total || a.key.localeCompare(b.key));
    const head = el('tr');
    head.append(el('th', '', 'Person'), el('th', '', 'Ticket'), el('th', '', 'Summary'));
    for (const d of days) head.append(el('th', 'tt-h' + (d === S.day ? ' is-day' : ''), dayLabel(d).replace(/ \w+$/, '')));
    head.append(el('th', 'tt-num', 'Week'));
    $('sheet-head').replaceChildren(head);
    const cols = 4 + days.length;
    if (!list.length) { msgRow($('sheet-rows'), cols, 'No time logged for this selection.'); $('sheet-foot').replaceChildren(); return; }
    let prev = null;
    $('sheet-rows').replaceChildren(...list.map((g) => {
      const tr = el('tr', g.person !== prev ? 'tt-group-start' : '');
      tr.append(el('td', 'tt-person-cell', g.person !== prev ? g.person : ''));
      prev = g.person;
      const k = el('td'); k.append(link(g.key, DATA.site));
      const sum = el('td', 'tt-wrap'); sum.append(el('span', '', g.summary), el('br'), el('span', 'tt-muted', `${g.project_key} · ${g.status}`));
      tr.append(k, sum);
      for (const d of days) { const h = g.byDay.get(d) || 0; tr.append(el('td', 'tt-h' + (h ? '' : ' is-zero') + (d === S.day ? ' is-day' : ''), h ? fmtH(h) : '·')); }
      tr.append(el('td', 'tt-num tt-total', fmtH(g.total)));
      return tr;
    }));
    const foot = el('tr');
    const f = el('th', '', 'Total'); f.colSpan = 3; foot.append(f);
    for (const d of days) foot.append(el('td', 'tt-h' + (d === S.day ? ' is-day' : ''), fmtH(list.reduce((s, g) => s + (g.byDay.get(d) || 0), 0))));
    foot.append(el('td', 'tt-num', fmtH(list.reduce((s, g) => s + g.total, 0))));
    $('sheet-foot').replaceChildren(foot);
  }

  // ---------- touched table ----------
  const touchedForPerson = () => (DATA.touched[week().week_start] || []).filter((r) => !S.person || r.person === S.person);
  function fillSelect(sel, all, pairs, current) {
    const seen = new Map(); pairs.forEach(([v, l]) => { if (v && !seen.has(v)) seen.set(v, l); });
    if (current && !seen.has(current)) seen.set(current, current);
    const opts = [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1], undefined, {sensitivity: 'base'}));
    sel.replaceChildren(new Option(all, ''), ...opts.map(([v, l]) => new Option(l, v)));
    sel.value = current;
  }
  function renderTouchedFilters() {
    const rows = touchedForPerson();
    fillSelect($('t-project'), 'All projects', rows.map((r) => [r.project_key, `${r.project_key} · ${r.project}`]), S.project);
    fillSelect($('t-status'), 'All statuses', rows.map((r) => [r.status, r.status]), S.status);
    fillSelect($('t-assignee'), 'All assignees', rows.map((r) => [r.assignee, r.assignee]), S.assignee);
    $('t-rel').value = S.rel;
    if (document.activeElement !== $('t-q')) $('t-q').value = S.q;
    $('t-clear').hidden = !(S.q || S.project || S.status || S.rel || S.assignee);
    document.querySelectorAll('#touched-table th').forEach((th) => {
      const b = th.querySelector('.tt-sort');
      th.setAttribute('aria-sort', b && b.dataset.sort === S.sort ? (S.dir === 'desc' ? 'descending' : 'ascending') : 'none');
    });
  }
  const keyNum = (k) => { const m = /^([A-Z0-9_]+)-(\d+)$/.exec(k); return m ? [m[1], +m[2]] : [k, 0]; };
  function compare(col) {
    if (col === 'person') return (a, b) => DATA.team.indexOf(a.person) - DATA.team.indexOf(b.person);
    if (col === 'key') return (a, b) => { const [pa, na] = keyNum(a.key), [pb, nb] = keyNum(b.key); return pa.localeCompare(pb) || na - nb; };
    if (col === 'project') return (a, b) => a.project_key.localeCompare(b.project_key);
    if (col === 'updated') return (a, b) => (a.updated < b.updated ? -1 : a.updated > b.updated ? 1 : 0);
    return (a, b) => String(a[col] || '').localeCompare(String(b[col] || ''), undefined, {sensitivity: 'base'});
  }
  function renderTouched() {
    const all = touchedForPerson();
    const q = S.q.trim().toLowerCase();
    let rows = all.filter((r) => (!S.project || r.project_key === S.project) && (!S.status || r.status === S.status) && (!S.rel || r.relation === S.rel)
      && (!S.assignee || r.assignee === S.assignee) && (!q || r.key.toLowerCase().includes(q) || r.summary.toLowerCase().includes(q)));
    if (S.sort) { const c = compare(S.sort); const sign = S.dir === 'desc' ? -1 : 1; rows = rows.map((r, i) => [r, i]).sort((a, b) => sign * c(a[0], b[0]) || a[1] - b[1]).map((x) => x[0]); }
    else {
      const rank = {'Assigned, open': 1, 'Created this week': 0, 'Updated this week': 0};
      rows.sort((a, b) => (DATA.team.indexOf(a.person) - DATA.team.indexOf(b.person)) || (rank[a.relation] - rank[b.relation]) || (a.updated < b.updated ? 1 : -1));
    }
    $('t-count').textContent = rows.length === all.length ? `${all.length} tickets.` : `Showing ${rows.length} of ${all.length} tickets.`;
    if (!rows.length) { msgRow($('touched-rows'), 8, all.length ? 'No tickets match these filters.' : 'No assigned or touched tickets for this selection.'); return; }
    $('touched-rows').replaceChildren(...rows.map((r) => {
      const tr = el('tr');
      const k = el('td'); k.append(link(r.key, DATA.site));
      const p = el('td'); p.append(el('span', '', r.project_key), el('span', 'tt-muted', ` ${r.project}`));
      const st = el('td'); st.append(statusCell(r.status, r.status_category));
      const rel = el('td'); rel.append(el('span', 'tt-tag', r.relation));
      tr.append(el('td', '', r.person), k, el('td', 'tt-wrap', r.summary), p, st, rel, el('td', '', r.assignee), el('td', 'tt-muted', r.updated ? dayLabel(r.updated.slice(0, 10)) : ''));
      return tr;
    }));
  }


  // ---------- controls ----------
  const go = (i) => { S.week = Math.max(0, Math.min(DATA.weeks.length - 1, i)); S.day = ''; renderAll(); };
  $('prev').addEventListener('click', () => go(S.week - 1));
  $('next').addEventListener('click', () => go(S.week + 1));
  $('this-week').addEventListener('click', () => go(currentWeekIndex()));
  $('week-select').addEventListener('change', () => go(Number($('week-select').value)));
  $('person-select').addEventListener('change', () => { S.person = $('person-select').value; S.day = ''; renderAfterFilter(); });
  document.addEventListener('keydown', (e) => {
    if (!DATA || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.target.closest && e.target.closest('input, select, textarea, [contenteditable]')) return;
    if (e.key === 'ArrowLeft' && S.week > 0) { e.preventDefault(); go(S.week - 1); }
    if (e.key === 'ArrowRight' && S.week < DATA.weeks.length - 1) { e.preventDefault(); go(S.week + 1); }
  });
  document.querySelectorAll('.tt-seg-btn').forEach((b) => b.addEventListener('click', () => { LOG_VIEW = b.dataset.view; renderLog(); }));
  $('clear-day').addEventListener('click', () => { S.day = ''; renderAfterFilter(); });
  // ---------- 🔄 Update: ask the helper to read Jira now, wait for the job, then load the new copy ----------
  const TRIGGER_URL = (window.TT_CONFIG && window.TT_CONFIG.triggerUrl) || '';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function teamKey(password) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`team-tracker:${password}`));
    return [...new Uint8Array(hash)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  async function readJiraNow(onStep) {
    const key = await teamKey(PASS);
    const call = async (method) => {
      const r = await fetch(TRIGGER_URL, {method, headers: {'X-Team-Key': key}, cache: 'no-store'});
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `helper ${r.status}`);
      return j;
    };
    onStep('⏳ Asking Jira…');
    const first = await call('POST');
    // The run to wait for: the one just started, or the one that was already running.
    const since = first.started ? Date.parse(first.since) - 10000 : Date.parse(first.run.created_at) - 1000;
    let run = first.started ? null : first.run;
    const t0 = Date.now();
    for (;;) {
      if (run && Date.parse(run.created_at) >= since && run.status === 'completed') {
        if (run.conclusion !== 'success') throw new Error('job-failed');
        break;
      }
      if (Date.now() - t0 > 6 * 60000) throw new Error('job-slow');
      await sleep(6000);
      const s = Math.round((Date.now() - t0) / 1000);
      onStep(`⏳ Reading Jira… ${Math.floor(s / 60)}:${pad(s % 60)}`);
      run = (await call('GET')).run;
    }
    // The job is done; its copy can take a few seconds to show up on the site.
    onStep('⏳ Loading…');
    const madeAfter = Date.parse(run.created_at);
    for (let i = 0; i < 12; i++) {
      const d = await load(PASS);
      if (Date.parse(d.generated_at) >= madeAfter) return d;
      await sleep(5000);
    }
    throw new Error('copy-late');
  }
  const showData = (d) => { const ws = week().week_start; DATA = d; const i = DATA.weeks.findIndex((w) => w.week_start === ws); if (i >= 0) S.week = i; renderAll(); };
  const UPDATE_MSG = {
    'job-failed': 'The Jira update didn’t finish. Showing the newest saved copy.',
    'job-slow': 'The Jira update is taking long. Try 🔄 Update again in a few minutes.',
    'copy-late': 'Jira was read. The new copy shows up in a few minutes; press 🔄 Update again then.',
  };
  if (TRIGGER_URL) $('update').title = 'Reads Jira now. Takes about a minute.';
  $('update').addEventListener('click', async () => {
    const b = $('update'); b.disabled = true;
    const step = (t) => { b.textContent = t; };
    let note = '';
    try {
      if (TRIGGER_URL) {
        try { showData(await readJiraNow(step)); note = '✅ Fresh from Jira'; }
        catch (e) { note = UPDATE_MSG[e.message] || 'Couldn’t start a Jira update. Showing the newest saved copy.'; if (!UPDATE_MSG[e.message] || e.message === 'job-failed') showData(await load(PASS)); }
      } else {
        step('⏳ Loading…'); showData(await load(PASS));
      }
    } catch { note = 'Couldn’t load the newest copy. Try again.'; }
    finally {
      b.disabled = false; b.textContent = '🔄 Update';
      if (note) { $('updated-at').textContent = note; setTimeout(() => DATA && renderHeader(), 8000); }
    }
  });
  document.querySelectorAll('#touched-table .tt-sort').forEach((b) => b.addEventListener('click', () => {
    const col = b.dataset.sort;
    S.dir = S.sort === col ? (S.dir === 'asc' ? 'desc' : 'asc') : (col === 'updated' ? 'desc' : 'asc');
    S.sort = col; renderTouchedFilters(); renderTouched();
  }));
  let qTimer = null;
  $('t-q').addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => { S.q = $('t-q').value; renderTouchedFilters(); renderTouched(); }, 150); });
  [['t-project', 'project'], ['t-status', 'status'], ['t-rel', 'rel'], ['t-assignee', 'assignee']].forEach(([id, k]) =>
    $(id).addEventListener('change', () => { S[k] = $(id).value; renderTouchedFilters(); renderTouched(); }));
  $('t-clear').addEventListener('click', () => { Object.assign(S, {q: '', project: '', status: '', rel: '', assignee: ''}); renderTouchedFilters(); renderTouched(); });
  let rz = null;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => DATA && renderChart(), 150); });

  let navReady = false;
  function setupNav() {
    if (navReady) return; navReady = true;
    const nav = $('nav');
    const setH = () => document.documentElement.style.setProperty('--nav-h', `${nav.offsetHeight}px`);
    setH(); new ResizeObserver(setH).observe(nav);
    const sentinel = el('div'); sentinel.style.cssText = 'height:1px;margin-top:-21px'; sentinel.setAttribute('aria-hidden', 'true'); nav.before(sentinel);
    const tabs = [...document.querySelectorAll('.tt-tab[data-target]')];
    const mark = (id) => tabs.forEach((t) => t.setAttribute('aria-current', String(t.dataset.target === id)));
    const spy = () => {
      nav.classList.toggle('is-stuck', sentinel.getBoundingClientRect().top < 0);
      const line = nav.getBoundingClientRect().bottom + 40;
      let active = tabs[0].dataset.target;
      for (const t of tabs) { const sec = $(t.dataset.target); if (sec && sec.getBoundingClientRect().top <= line) active = t.dataset.target; }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) active = tabs[tabs.length - 1].dataset.target;
      mark(active);
    };
    let ticking = null;
    window.addEventListener('scroll', () => { if (!ticking) ticking = setTimeout(() => { spy(); ticking = null; }, 60); }, {passive: true});
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    tabs.forEach((t) => t.addEventListener('click', (e) => {
      const sec = $(t.dataset.target);
      if (!sec) return;
      e.preventDefault();
      sec.scrollIntoView({behavior: reduce ? 'auto' : 'smooth', block: 'start'});
      history.replaceState(null, '', `#${t.dataset.target}`);
      mark(t.dataset.target);
    }));
    spy();
  }

  // Try a remembered password first.
  const saved = store.get();
  if (saved) unlock(saved, true).catch(() => { store.clear(); });
})();
