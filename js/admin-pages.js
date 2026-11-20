/* ==================================================================
   Admin System Management / Academic Periods / Accounts & Permissions /
   Audit Log in the shared look: the banner names the page, two charts on
   top, then the page's own content. Audit filters move into a filter
   icon on the table. Works on top of each page's own renderer and
   re-applies after it re-renders. Uses CoordinatorPages (charts) and
   CoordinatorWorkspaces (icon toolbar).
   ================================================================== */
const AdminPages = (() => {
  const read = (key, fallback = []) => { try { const v = DB.read(key, fallback); return v ?? fallback; } catch (_) { return fallback; } };
  const P = () => (typeof CoordinatorPages !== 'undefined' ? CoordinatorPages : null);
  const W = () => (typeof CoordinatorWorkspaces !== 'undefined' ? CoordinatorWorkspaces : null);
  const COLORS = ['#66547f', '#2f8d83', '#d39a2c', '#3d8fd4', '#c8692e', '#8a8f99'];
  const ROLE = { admin: 'Administrators', dean: 'Dean', coordinator: 'Coordinators', faculty: 'Professors', student: 'Students' };
  const roleOf = v => { const r = String(v || '').toLowerCase().replace(/[\s_-]+/g, ''); return r.includes('admin') ? 'admin' : r.includes('dean') ? 'dean' : r.includes('coordinator') ? 'coordinator' : r.includes('student') ? 'student' : 'faculty'; };
  const barsOf = entries => { const max = Math.max(1, ...entries.map(e => e[1])); return entries.map(([label, n, color]) => ({ label, pct: n / max * 100, text: Number(n).toLocaleString(), title: `${label}: ${Number(n).toLocaleString()}`, color })); };
  const donutOf = entries => entries.filter(e => e[1]).map(([label, value, color], i) => ({ label, value, color: color || COLORS[i % COLORS.length] }));
  // Thousands separators inside a donut (centre total and legend).
  const pretty = html => html.replace(/>(\d{4,})</g, (m, n) => `>${Number(n).toLocaleString()}<`);

  // Puts (or replaces) the charts row right before `anchor` inside `host`.
  function place(host, anchor, html) {
    if (!host || !anchor) return;
    host.querySelector(':scope .ap-insights')?.remove();
    anchor.insertAdjacentHTML('beforebegin', html.replace('class="ck-insights"', 'class="ck-insights ap-insights"'));
  }

  function system() {
    const root = document.getElementById('systemManagementRoot'), grid = root?.querySelector('.system-grid'), p = P(); if (!grid || !p) return;
    const stored = [['Students', read('students').length], ['Questions', read('questions').length], ['Enrollments', read('studentEnrollments').length], ['Submissions', read('studentSubmissions').length], ['Accounts', read('users').length], ['Lesson content', read('subjectWorkspaceContent').length], ['Exams', read('exams').length], ['Audit events', read('applicationAuditLog').length]].sort((a, b) => b[1] - a[1]);
    const audience = new Map(); read('adminAnnouncements').forEach(a => { const k = a.audience && a.audience !== 'all' ? (ROLE[roleOf(a.audience)] || a.audience) : 'Everyone'; audience.set(k, (audience.get(k) || 0) + 1); });
    const ann = [...audience.entries()];
    place(root, grid, p.insights(p.card('Stored records', 'Largest collections on the server', p.bars(barsOf(stored))), p.card('Announcements', `${read('adminAnnouncements').length} published`, ann.length ? p.donut(donutOf(ann), 'notices') : '<p class="ck-empty">No announcements yet.</p>')));
  }

  function periods() {
    const root = document.getElementById('academicPeriodsRoot'), anchor = root?.querySelector('.workspace-summary'), p = P(); if (!anchor || !p) return;
    const list = read('academicPeriods'), settings = read('systemSettings', {}) || {};
    const status = new Map(); list.forEach(x => status.set(x.status || 'draft', (status.get(x.status || 'draft') || 0) + 1));
    const tone = { active: '#2f8d83', draft: '#8a8f99', closed: '#b5534b', archived: '#66547f' };
    const current = settings.currentAcademicPeriodId || list.find(x => x.status === 'active')?.id;
    const inCurrent = key => read(key).filter(r => !r.academicPeriodId || r.academicPeriodId === current).length;
    const rec = [['Enrollments', inCurrent('studentEnrollments')], ['Questions', inCurrent('questions')], ['Submissions', inCurrent('studentSubmissions')], ['Exams', inCurrent('exams')], ['Offerings', read('sectionSubjects').reduce((s, r) => s + (r.assignments || []).length, 0)]];
    place(root, anchor, p.insights(p.card('Periods by status', `${list.length} configured`, p.donut(donutOf([...status.entries()].map(([k, n]) => [k[0].toUpperCase() + k.slice(1), n, tone[k]])), 'periods')), p.card('Records in the current period', 'What closing this period will archive', p.bars(barsOf(rec)))));
  }

  function accounts() {
    const host = document.getElementById('governanceSection'), anchor = host?.querySelector('.governance-tabs'), p = P(); if (!anchor || !p) return;
    const users = read('users'), byRole = new Map(), byStatus = new Map();
    users.forEach(u => { const r = ROLE[roleOf(u.role)]; byRole.set(r, (byRole.get(r) || 0) + 1); const s = u.disabled === true ? 'Disabled' : String(u.status || u.lifecycleStatus || 'active').replace(/^\w/, c => c.toUpperCase()); byStatus.set(s, (byStatus.get(s) || 0) + 1); });
    const order = ['Students', 'Professors', 'Coordinators', 'Dean', 'Administrators'], colors = ['#2f8d83', '#66547f', '#d39a2c', '#c8692e', '#8a8f99'];
    const roles = order.map((r, i) => [r, byRole.get(r) || 0, colors[i]]);
    const statuses = [...byStatus.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, n, /active/i.test(k) ? '#2f8d83' : /disabled|deactivated/i.test(k) ? '#b5534b' : '#d39a2c']);
    place(host, anchor, p.insights(p.card('Accounts by role', `${users.length.toLocaleString()} accounts`, pretty(p.donut(donutOf(roles), 'accounts'))), p.card('Account status', 'Who can sign in today', p.bars(barsOf(statuses)))));
  }

  function auditCharts() {
    const host = document.getElementById('auditSection'), anchor = host?.querySelector('.audit-filter-grid') || host?.querySelector('.audit-table-shell'), p = P(); if (!anchor || !p) return;
    const all = read('applicationAuditLog'), now = new Date();
    const weekStart = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x; };
    const weeks = Array.from({ length: 12 }, (_, i) => ({ at: weekStart(now.getTime() - (11 - i) * 7 * 864e5), n: 0 }));
    all.forEach(e => { const t = new Date(e.at).getTime(); const w = weeks.filter(x => x.at.getTime() <= t).pop(); if (w) w.n++; });
    const top = Math.max(1, ...weeks.map(w => w.n));
    const cols = `<div class="cw-cols" style="--n:${weeks.length}">${weeks.map(w => `<span title="Week of ${w.at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${w.n} events"><i style="height:${w.n ? Math.max(6, w.n / top * 100) : 0}%"></i></span>`).join('')}</div><div class="cw-cols-axis"><span>${weeks[0].at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><span>This week</span></div>`;
    const cat = new Map(); all.forEach(e => { const k = String(e.category || e.entityType || 'other'); cat.set(k, (cat.get(k) || 0) + 1); });
    const cats = [...cat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => [k.replace(/^\w/, c => c.toUpperCase()), n]);
    place(host, anchor, p.insights(p.card('Activity per week', `${all.length.toLocaleString()} events · last 12 weeks`, cols), p.card('By category', 'What the events were about', p.bars(barsOf(cats)))));
  }

  // Audit filters: the ten fields go into a filter icon on the table card.
  function auditTools() {
    const host = document.getElementById('auditSection'), grid = host?.querySelector('.audit-filter-grid'), shell = host?.querySelector('.audit-table-shell'), tools = document.getElementById('auditTableTools');
    if (!grid || !shell || !tools || !W() || shell.querySelector('.ap-table-head')) return;
    const head = document.createElement('header'); head.className = 'ap-table-head';
    const title = document.createElement('div'); title.innerHTML = '<h3>Recorded activity</h3>';
    const summary = document.getElementById('auditFilterSummary'); if (summary) title.appendChild(summary);
    const fields = [...grid.children];
    const bar = W().toolbar([{ name: 'filter', label: 'Filter activity', icon: W().ICONS.filter, panel: fields }]);
    bar.classList.add('ap-filter-tool');
    fields.find(el => el.tagName === 'BUTTON')?.classList.add('cw-reset');
    head.append(title); shell.prepend(head); head.appendChild(tools); tools.prepend(...bar.children);
    grid.classList.add('cw-emptied');
  }

  // Audit results as soft pills (success / denied / failed).
  function auditPills() { const rows = [...document.querySelectorAll('#auditTable tr')], headRow = rows.find(r => r.querySelector('th')); if (!headRow) return; const i = [...headRow.cells].findIndex(c => /^result$/i.test(c.textContent.trim())); if (i < 0) return; rows.forEach(tr => { if (tr.querySelector('th')) return; const td = tr.cells[i]; if (!td || td.querySelector('.ap-pill')) return; const v = td.textContent.trim(); if (!v || v === '—') return; td.innerHTML = `<span class="ap-pill ${/success/i.test(v) ? 'ok' : 'bad'}">${v.replace(/[<>&]/g, '')}</span>`; }); }
  /* Academic Periods: list on the left, current period + rollover steps on the right;
     the New period form lives in a dialog (the same form element, so its submit handler stays). */
  function periodsLayout() {
    const root = document.getElementById('academicPeriodsRoot');
    const form = root?.querySelector('#academicPeriodForm'), list = root?.querySelector('.workspace-list'), head = root?.querySelector('.workspace-list-head');
    if (!form || !list || !head || root.querySelector('.ap-period-layout')) return;
    const layout = document.createElement('div'); layout.className = 'ap-period-layout';
    const left = document.createElement('section'); left.className = 'ap-period-list';
    const right = document.createElement('aside'); right.className = 'ap-period-side';
    const newBtn = document.createElement('button'); newBtn.type = 'button'; newBtn.className = 'ap-new-period';
    newBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z"/></svg>New period';
    head.appendChild(newBtn); left.append(head, list);
    [root.querySelector('.workspace-summary'), root.querySelector('.workspace-rollover-guide')].forEach(el => el && right.appendChild(el));
    layout.append(left, right);
    form.after(layout);
    form.classList.add('ap-form-parked');
    newBtn.addEventListener('click', () => openPeriodForm(form));
  }
  function openPeriodForm(form) {
    document.getElementById('apPeriodModal')?.remove();
    document.body.insertAdjacentHTML('beforeend', '<div class="gv-modal" id="apPeriodModal" role="dialog" aria-modal="true" aria-label="New academic period"><div class="gv-modal-card"><header><h3>New academic period</h3><button type="button" class="gv-icon-btn" data-ap-close aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z"/></svg></button></header><div class="gv-modal-body ap-period-form"></div></div></div>');
    const modal = document.getElementById('apPeriodModal'), home = form.parentElement, marker = document.createComment('period-form');
    home.insertBefore(marker, form); form.classList.remove('ap-form-parked'); modal.querySelector('.ap-period-form').appendChild(form);
    const close = () => { if (marker.isConnected) { form.classList.add('ap-form-parked'); marker.replaceWith(form); } modal.remove(); };
    modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('[data-ap-close]')) close(); });
    modal.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    // A successful create re-renders the page; the dialog then has nothing left to do.
    new MutationObserver((_, obs) => { if (!marker.isConnected) { obs.disconnect(); modal.remove(); } }).observe(document.getElementById('academicPeriodsRoot'), { childList: true });
    form.querySelector('input:not([readonly]),select')?.focus();
  }
  /* ---------- System Management: summary cards, forms in dialogs ---------- */
  const SVG = {
    plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z', pen: 'M4 17.3V20h2.7l8-8-2.7-2.7-8 8Zm12.7-7.6a.9.9 0 0 0 0-1.3l-1.1-1.1a.9.9 0 0 0-1.3 0l-.9.9 2.4 2.4.9-.9Z',
    x: 'm6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z', go: 'M8.6 5.4 10 4l8 8-8 8-1.4-1.4 6.6-6.6-6.6-6.6Z',
    download: 'M11 3h2v8.2l2.6-2.6L17 10l-5 5-5-5 1.4-1.4 2.6 2.6V3ZM5 19v-4h2v2h10v-2h2v4H5Z', upload: 'M11 15V6.8L8.4 9.4 7 8l5-5 5 5-1.4 1.4L13 6.8V15h-2Zm-6 4v-4h2v2h10v-2h2v4H5Z', play: 'M8 5.5v13l11-6.5-11-6.5Z',
    megaphone: 'M3 10v4h3l6 4V6L6 10H3Zm13.5 2A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4Z', shield: 'M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Z', key: 'M7 14a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm5.6-4A6 6 0 1 0 12.6 14H16v3h3v-3h2v-4h-8.4Z',
    calendar: 'M7 2h2v2h6V2h2v2h3v18H4V4h3V2Zm11 8H6v10h12V10Z', box: 'M12 2 3 6.5v11L12 22l9-4.5v-11L12 2Zm0 2.2 6.3 3.2L12 10.5 5.7 7.4 12 4.2ZM5 9l6 3v7.4l-6-3V9Zm14 0v7.4l-6 3V12l6-3Z', check: 'm9.5 16.2-4.2-4.2-1.4 1.4 5.6 5.6 11-11-1.4-1.4-9.6 9.6Z'
  };
  const ic = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  const escS = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let smEditPending = false;
  // Moves existing nodes into a dialog (handlers keep working) and puts them back on close.
  function nodesDialog(title, nodes) {
    document.getElementById('smModal')?.remove();
    document.body.insertAdjacentHTML('beforeend', `<div class="gv-modal" id="smModal" role="dialog" aria-modal="true" aria-label="${escS(title)}"><div class="gv-modal-card"><header><h3>${escS(title)}</h3><button type="button" class="gv-icon-btn" data-sm-close aria-label="Close">${ic(SVG.x)}</button></header><div class="gv-modal-body sm-dialog"></div></div></div>`);
    const modal = document.getElementById('smModal'), body = modal.querySelector('.sm-dialog');
    const markers = nodes.filter(Boolean).map(n => { const m = document.createComment('sm'); n.before(m); body.appendChild(n); return [m, n]; });
    const close = () => { markers.forEach(([m, n]) => { if (m.isConnected) m.replaceWith(n); }); modal.remove(); };
    modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('[data-sm-close],[onclick*="clearAnnouncementForm"]')) close(); });
    modal.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    // Saving re-renders the page; then the moved nodes are stale and the dialog is done.
    new MutationObserver((_, obs) => { if (markers.some(([m]) => !m.isConnected)) { obs.disconnect(); modal.remove(); } }).observe(document.getElementById('systemManagementRoot'), { childList: true });
    body.querySelector('input:not([type="checkbox"]),textarea,select')?.focus();
  }
  function systemLayout() {
    const root = document.getElementById('systemManagementRoot'), grid = root?.querySelector('.system-grid');
    if (!grid || root.querySelector('.sm-layout')) return;
    const cards = [...grid.querySelectorAll(':scope > .system-card')], byTitle = t => cards.find(c => new RegExp(t, 'i').test(c.querySelector('h4')?.textContent || ''));
    const ann = byTitle('Announcement'), maint = byTitle('Maintenance'), period = byTitle('Academic period'), backup = byTitle('Backup'), integrity = byTitle('Integrity'), access = byTitle('access rules');
    const cfg = read('systemSettings', {}) || {}, items = read('adminAnnouncements');
    const onOff = (on, a = 'On', b = 'Off') => `<span class="sm-state ${on ? 'on' : 'off'}">${on ? a : b}</span>`;
    const head = (svg, title, sub, actions) => `<header class="gv-pc-head"><span class="gv-pc-icon">${ic(svg)}</span><div><h3>${title}</h3><p>${sub}</p></div>${actions}</header>`;
    const btn = (svg, label, attr) => `<button type="button" class="gv-pc-edit" ${attr} title="${label}" aria-label="${label}">${ic(svg)}</button>`;
    const live = items.filter(a => !a.archived).length;
    const layout = document.createElement('div'); layout.className = 'sm-layout';
    layout.innerHTML = `<section class="gv-pc sm-ann">${head(SVG.megaphone, 'Announcements', `${live} live · ${items.length - live} archived`, btn(SVG.plus, 'New announcement', 'data-sm="announce"'))}<div class="sm-ann-list"></div></section>
      <div class="sm-side">
        <section class="gv-pc sm-card">${head(SVG.shield, 'Maintenance mode', 'Pause access for everyone except Administrators', btn(SVG.pen, 'Edit maintenance mode', 'data-sm="maintenance"'))}<div class="sm-row"><span>Status</span>${onOff(cfg.maintenance !== true, 'Site running', 'Maintenance on')}</div><p class="sm-quote">${escS(cfg.maintenanceMessage || 'The examination portal is temporarily unavailable while maintenance is in progress.')}</p></section>
        <section class="gv-pc sm-card">${head(SVG.key, 'Account access', 'Who can sign in and for how long', btn(SVG.pen, 'Edit account access', 'data-sm="access"'))}<div class="sm-row"><span>Professor sign-in</span>${onOff(cfg.allowFacultyLogin !== false, 'Allowed', 'Paused')}</div><div class="sm-row"><span>Student sign-in</span>${onOff(cfg.allowStudentLogin !== false, 'Allowed', 'Paused')}</div><div class="sm-row"><span>Session timeout</span><b>${escS(cfg.sessionTimeoutMinutes || 120)} min</b></div></section>
        <section class="gv-pc sm-card">${head(SVG.calendar, 'Academic period', 'Shown across the portal', btn(SVG.go, 'Open Academic Periods', 'data-sm="periods"'))}<div class="sm-row"><span>Current</span><b>${escS(cfg.semester || '—')} ${escS(cfg.schoolYear || '')}</b></div><div class="sm-row"><span>Status</span>${onOff(cfg.academicPeriodStatus !== 'closed', 'Active', 'Closed')}</div></section>
        <section class="gv-pc sm-card">${head(SVG.box, 'Backup and restore', 'Download or restore all portal data', `${btn(SVG.download, 'Download JSON backup', 'data-sm="backup"')}<label class="gv-pc-edit sm-restore" title="Restore backup" aria-label="Restore backup">${ic(SVG.upload)}<input type="file" accept="application/json,.json" onchange="SystemManagement.importBackup(this)"></label>`)}<p class="sm-note">Restoring replaces matching records only after you confirm.</p></section>
        <section class="gv-pc sm-card">${head(SVG.check, 'Integrity check', 'Broken references and missing logins', btn(SVG.play, 'Run integrity check', 'data-sm="scan"'))}<div class="sm-integrity"></div></section>
      </div>`;
    grid.after(layout);
    // Live content moved in: the announcement list and the integrity results keep their ids and handlers.
    const list = ann?.querySelector('.announcement-list'); if (list) layout.querySelector('.sm-ann-list').appendChild(list);
    const results = document.getElementById('integrityResults'); if (results) layout.querySelector('.sm-integrity').appendChild(results);
    grid.classList.add('sm-parked');
    const body = card => card ? [...card.children].filter(el => el.tagName !== 'HEADER') : [];
    layout.addEventListener('click', e => {
      const k = e.target.closest('[data-sm]')?.dataset.sm; if (!k) return;
      if (k === 'announce') { SystemManagement.clearAnnouncementForm?.(); return setTimeout(() => nodesDialog('New announcement', [document.querySelector('#systemManagementRoot .system-grid .announcement-form')]), 40); }
      if (k === 'maintenance') return nodesDialog('Maintenance mode', body(maint));
      if (k === 'access') return nodesDialog('Account access', body(access));
      if (k === 'periods') return document.querySelector('#sidebar [data-panel="academicPeriodsSection"]')?.click();
      if (k === 'backup') return SystemManagement.downloadBackup();
      if (k === 'scan') return SystemManagement.scanIntegrity();
    });
    // Editing an announcement re-renders the page and fills the form: reopen it in the dialog.
    layout.querySelector('.sm-ann-list').addEventListener('click', e => { if (e.target.closest('[onclick*="editAnnouncement"]')) smEditPending = true; }, true);
    if (smEditPending) { smEditPending = false; nodesDialog('Edit announcement', [ann?.querySelector('.announcement-form')]); }
  }
  /* ---------- Faculty / Students: charts + one table card with our toolbar ---------- */
  function offerings() { return read('sectionSubjects').flatMap(r => (r.assignments || []).map(a => ({ ...a, sectionId: r.sectionId }))); }
  function tableCard(sectionId, title, count) {
    const host = document.getElementById(sectionId), shell = host?.querySelector('.management-table-shell'), box = shell?.querySelector('.action-box');
    if (!shell || !box) return;
    let head = shell.querySelector(':scope > .ap-table-head');
    if (!head) { head = document.createElement('header'); head.className = 'ap-table-head'; head.innerHTML = '<div><h3></h3><p></p></div>'; shell.prepend(head); head.appendChild(box); shell.classList.add('ap-card-shell'); }
    head.querySelector('h3').textContent = title; head.querySelector('p').textContent = count;
  }
  function faculty() {
    const host = document.getElementById('facultySection'), shell = host?.querySelector('.management-table-shell'), p = P(); if (!shell || !p) return;
    const people = read('faculty'), subjects = read('subjects'), units = c => Number(subjects.find(x => x.code === c)?.units) || 3, NORMAL = Number((read('systemSettings', {}) || {}).professorLoadPolicy?.maximum) || 24;
    const load = new Map(); offerings().forEach(o => { if (o.facultyId) load.set(o.facultyId, (load.get(o.facultyId) || 0) + units(o.subjectCode)); });
    const rows = people.map(f => ({ name: `${f.last}, ${f.first}`, u: load.get(f.id) || 0 }));
    const groups = [['Overloaded', r => r.u > NORMAL, '#b5534b'], ['Full load', r => r.u >= NORMAL * .75 && r.u <= NORMAL, '#66547f'], ['Light load', r => r.u > 0 && r.u < NORMAL * .75, '#d39a2c'], ['No classes', r => !r.u, '#8a8f99']].map(([l, t, c]) => [l, rows.filter(t).length, c]);
    const top = rows.slice().sort((a, b) => b.u - a.u).slice(0, 8).map(r => [r.name, r.u]);
    place(host, shell, p.insights(p.card('Teaching load status', `${people.length} faculty · maximum ${NORMAL} units`, p.donut(donutOf(groups), 'faculty')), p.card('Heaviest teaching loads', 'Units assigned this period', p.bars(barsOf(top)))));
    tableCard('facultySection', 'Faculty accounts', `${people.length.toLocaleString()} accounts · right-click a row to manage access or status`);
  }
  function students() {
    const host = document.getElementById('studentSection'), shell = host?.querySelector('.management-table-shell'), p = P(); if (!shell || !p) return;
    const list = read('students'), sections = new Map(read('sections').map(x => [x.id, x]));
    const year = new Map(), program = new Map();
    list.forEach(st => { const sec = (st.sections || []).map(id => sections.get(id)).find(Boolean); const y = sec?.yearLevel ? `Year ${sec.yearLevel}` : 'No section'; year.set(y, (year.get(y) || 0) + 1); const pr = sec?.program || st.program || 'Unassigned'; program.set(pr, (program.get(pr) || 0) + 1); });
    const colors = ['#2f8d83', '#66547f', '#d39a2c', '#3d8fd4', '#8a8f99'];
    const years = [...year.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, n], i) => [k, n, colors[i % colors.length]]);
    const programs = [...program.entries()].sort((a, b) => b[1] - a[1]);
    place(host, shell, p.insights(p.card('Students by year level', `${list.length.toLocaleString()} students`, pretty(p.donut(donutOf(years), 'students'))), p.card('Students by program', 'Based on section membership', p.bars(barsOf(programs)))));
    tableCard('studentSection', 'Students', `${list.length.toLocaleString()} students · right-click a row to open the profile`);
  }
  function subjects() {
    const root = document.getElementById('loadPolicyRoot'), page = root?.querySelector('.load-policy-page'), p = P(); if (!page || !p) return;
    if (root.querySelector(':scope > .ap-insights')) return;
    const rows = read('curricula'), byProgram = new Map(), byUnits = new Map();
    rows.forEach(r => { const k = r.program || r.curriculumId || 'Other'; byProgram.set(k, (byProgram.get(k) || 0) + 1); const u = `${Number(r.units) || 0} unit${Number(r.units) === 1 ? '' : 's'}`; byUnits.set(u, (byUnits.get(u) || 0) + 1); });
    const colors = ['#66547f', '#2f8d83', '#d39a2c', '#3d8fd4', '#c8692e', '#8a8f99'];
    const units = [...byUnits.entries()].sort((a, b) => parseFloat(a[0]) - parseFloat(b[0])).map(([k, n], i) => [k, n, colors[i % colors.length]]);
    place(root, page, p.insights(p.card('Subjects per curriculum', `${rows.length} curriculum entries`, p.bars(barsOf([...byProgram.entries()].sort((a, b) => b[1] - a[1])))), p.card('Subjects by units', 'How heavy each subject is', p.donut(donutOf(units), 'subjects'))));
  }
  /* ---------- Account Lifecycle: charts + one table card ---------- */
  function lifecycleCharts() {
    const section = document.getElementById('accountLifecycleSection'), root = document.getElementById('accountLifecycleRoot'), p = P(); if (!root || !p) return;
    if (section.querySelector(':scope > .ap-insights')) return;
    const users = read('users');
    const statusOf = u => u.disabled === true ? 'Deactivated' : String(u.lifecycleStatus || u.status || 'active').replace(/^\w/, c => c.toUpperCase());
    const tone = { Active: '#2f8d83', Deactivated: '#b5534b', Archived: '#8a8f99', Graduated: '#66547f', Transferred: '#d39a2c' };
    const status = new Map(Object.keys(tone).map(k => [k, 0])); users.forEach(u => { const k = statusOf(u); status.set(k, (status.get(k) || 0) + 1); });
    const roleRows = [...['student','faculty','coordinator','dean','admin'].map(r => [ROLE[r], users.filter(u => roleOf(u.role) === r).length])].filter(e => e[1]);
    const active = status.get('Active') || 0;
    place(section, root, p.insights(p.card('Account status', `${active.toLocaleString()} of ${users.length.toLocaleString()} can sign in`, pretty(p.donut(donutOf([...status.entries()].map(([k, n]) => [k, n, tone[k]])), 'accounts'))), p.card('Accounts by role', 'Every login account in the portal', p.bars(barsOf(roleRows)))));
  }
  function lifecycleLayout() {
    const root = document.getElementById('accountLifecycleRoot'), tools = root?.querySelector('.lifecycle-tools');
    if (!root || !tools || root.querySelector(':scope > .ap-table-head')) return;
    const total = read('users').length;
    const head = document.createElement('header'); head.className = 'ap-table-head';
    head.innerHTML = `<div><h3>Accounts</h3><p>${total.toLocaleString()} accounts · right-click a row to change its status</p></div>`;
    root.prepend(head); head.appendChild(tools);
    root.classList.add('ap-lc-card');
  }
  function refresh() { [lifecycleCharts, lifecycleLayout, faculty, students, subjects, system, systemLayout, periods, periodsLayout, accounts, auditCharts, auditTools, auditPills].forEach(fn => { try { fn(); } catch (e) { console.warn(e); } }); }
  function mount() {
    document.body.classList.add('ap-ready');
    refresh();
    // Re-apply after a page re-renders its own content (charts only when they went missing).
    const watch = (id, fn) => { const el = document.getElementById(id); if (!el) return; let q = false; new MutationObserver(() => { if (q) return; q = true; setTimeout(() => { q = false; fn(); }, 0); }).observe(el, { childList: true }); };
    watch('systemManagementRoot', () => { if (!document.querySelector('#systemManagementRoot .ap-insights')) system(); systemLayout(); });
    watch('academicPeriodsRoot', () => { if (!document.querySelector('#academicPeriodsRoot .ap-insights')) periods(); periodsLayout(); });
    watch('accountManagementRoot', accounts);
    watch('accountLifecycleRoot', () => { lifecycleLayout(); lifecycleCharts(); });
    document.querySelector('#sidebar [data-panel="accountLifecycleSection"]')?.addEventListener('click', () => setTimeout(refresh, 0));
    watch('loadPolicyRoot', () => { if (!document.querySelector('#loadPolicyRoot > .ap-insights')) subjects(); });
    ['facultySection', 'studentSection', 'loadPolicySection'].forEach(id => document.querySelector(`#sidebar [data-panel="${id}"]`)?.addEventListener('click', () => setTimeout(refresh, 0)));
    const table = document.getElementById('auditTable'); if (table) { let q = false; new MutationObserver(() => { if (q) return; q = true; setTimeout(() => { q = false; auditPills(); }, 0); }).observe(table, { childList: true, subtree: true }); }
    ['systemSection', 'academicPeriodsSection', 'governanceSection', 'auditSection'].forEach(id => document.querySelector(`#sidebar [data-panel="${id}"]`)?.addEventListener('click', () => setTimeout(refresh, 0)));
  }
  return { mount, refresh };
})();
if (typeof window !== 'undefined') window.AdminPages = AdminPages;
