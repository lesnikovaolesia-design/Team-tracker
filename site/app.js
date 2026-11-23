(() => {
  'use strict';

  const STORE_KEY = 'tt-pass';
  const COLORS = ['#4a9dff', '#ff5fa8', '#2fc48d', '#ff9a3c', '#9a6bff', '#ffcf3a', '#2ec5d3', '#e76f51', '#8ab17d', '#c77dff'];
  const JOKES = {
    1: ['☕🥶', 'Monday stand-up. The American PM asks “How is everyone?” We say “Normal.” The PM writes down: team morale critical.'],
    2: ['🏆🙂', 'Tuesday: a Slavic designer looks at your work and says “not bad”. Translation for our American colleagues: best work of the decade, frame it.'],
    3: ['🐛💻', 'Wednesday. Dev: “It works on my machine.” QA: “Great, then we ship your machine.” Product Owner: “Can it be ready by Friday?”'],
    4: ['📋🙃', 'Thursday: the Product Owner adds “one small thing” to the sprint. The small thing has 14 subtasks and depends on a team nobody has met.'],
    5: ['🎉🚫', 'Friday 17:55. Americans: “Have an awesome weekend!” Us: “We will see.” Both mean the same thing: nobody deploys.'],
    6: ['🥟💜', 'Saturday: grandma asks what you do at work. “I move rectangles and argue in Jira.” She nods and gives you more varenyky anyway.'],
    0: ['🌻🍋', 'Sunday: no stand-ups, no “quick syncs”, no “just circling back”. Only tea with lemon and quiet fear of Monday’s calendar.'],
  };
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
    const t = DATA.weeks.findIndex((w) => w.week_start <= todayIso() && todayIso() <= w.week_end);
    S.week = t >= 0 ? t : DATA.weeks.length - 1;
    $('lock').hidden = true; $('app').hidden = false;
    renderAll();
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

  function renderHeader() {
    const w = week();
    const a = parseDay(w.week_start), b = parseDay(w.week_end);
    const txt = a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${MON[b.getMonth()]} ${b.getFullYear()}` : `${a.getDate()} ${MON[a.getMonth()]} – ${b.getDate()} ${MON[b.getMonth()]} ${b.getFullYear()}`;
    $('week-text').textContent = txt; $('week-label').textContent = txt;
    const total = weekLogs().reduce((s, r) => s + r.hours, 0);
    $('team-hours').textContent = fmtH(total);
    $('team-goal').textContent = fmtH(DATA.team.length * 5 * GOAL());
    $('prev').disabled = S.week <= 0;
    $('next').disabled = S.week >= DATA.weeks.length - 1;
    const at = new Date(DATA.generated_at);
    const mins = Math.round((Date.now() - at.getTime()) / 60000);
    $('updated-at').textContent = `Updated ${at.toLocaleString(undefined, {weekday: 'short', hour: '2-digit', minute: '2-digit'})}${mins >= 0 && mins < 600 ? ` (${mins} min ago)` : ''}`;
  }

  function renderFun() {
    const dow = new Date().getDay();
    $('joke-emoji').textContent = JOKES[dow][0];
    $('joke-text').textContent = JOKES[dow][1];
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
    const all = ['', ...DATA.team];
    $('chips').replaceChildren(...all.map((p) => {
      const b = el('button', 'tt-chip' + ((S.person || '') === p ? ' is-on' : ''), p || 'Everyone'); b.type = 'button';
      b.setAttribute('aria-pressed', String((S.person || '') === p));
      b.addEventListener('click', () => { S.person = p; S.day = ''; renderAfterFilter(); });
      return b;
    }));
    $('filter-text').textContent = S.person ? `Showing ${S.person}${S.day ? ` on ${dayLabel(S.day)}` : ''}.` : (S.day ? `Showing ${dayLabel(S.day)}.` : 'Showing everyone.');
    $('clear-day').hidden = !S.day;
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
    const labelW = Math.min(170, W * 0.32);
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
      svg.append(mk('text', {x: 0, y: y + barH / 2, dy: '0.35em'}, person));
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

  function renderLog() {
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
  $('this-week').addEventListener('click', () => { const t = DATA.weeks.findIndex((w) => w.week_start <= todayIso() && todayIso() <= w.week_end); go(t >= 0 ? t : DATA.weeks.length - 1); });
  $('clear-day').addEventListener('click', () => { S.day = ''; renderAfterFilter(); });
  $('update').addEventListener('click', async () => {
    const b = $('update'); b.disabled = true; b.textContent = '⏳ Loading…';
    try { const ws = week().week_start; DATA = await load(PASS); const i = DATA.weeks.findIndex((w) => w.week_start === ws); if (i >= 0) S.week = i; renderAll(); }
    catch { $('updated-at').textContent = 'Couldn’t load the newest copy. Try again.'; }
    finally { b.disabled = false; b.textContent = '🔄 Update'; }
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

  // Try a remembered password first.
  const saved = store.get();
  if (saved) unlock(saved, true).catch(() => { store.clear(); });
})();
