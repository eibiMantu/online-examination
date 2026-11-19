/* ==================================================================
   Administrator · Accounts & Permissions.
   Underline tabs: Users · Roles · Policies.
   - Users: every account with system role, permission role and status;
     search, filters, pages; add a user; click a row to assign a role.
   - Roles: all roles in a table; open one for a Discord-style editor
     (role list on the left, Display / Permissions / Members on the right).
     Built-in roles map to the system roles; custom roles are built on a
     base role and can only narrow it (enforced in PermissionService).
   - Policies: Coordinator appointment authority and Professor load policy.
   Data: users (accounts) and systemSettings.permissionOverrides,
   .permissionRoles, .coordinatorAppointmentAuthority, .professorLoadPolicy.
   ================================================================== */
const AdminGovernance = (() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const read = (k, f = []) => { try { return DB.read(k, f) ?? f; } catch (_) { return f; } };
  const settings = () => read('systemSettings', {}) || {};
  const SYSTEM = [['admin', 'Administrator', '#66547f'], ['dean', 'Dean', '#c8692e'], ['coordinator', 'Faculty Coordinator', '#d39a2c'], ['faculty', 'Professor', '#3d8fd4'], ['student', 'Student', '#2f8d83']];
  const sysLabel = r => SYSTEM.find(s => s[0] === r)?.[1] || r;
  const sysColor = r => SYSTEM.find(s => s[0] === r)?.[2] || '#8a8f99';
  const norm = r => (typeof PermissionService !== 'undefined' ? PermissionService.normalizeRole(r) : String(r || '').toLowerCase());
  // Permissions an Administrator may switch off per role (everything else is a protected boundary).
  const CONFIGURABLE = { dean: ['personnel.professor.manage', 'personnel.coordinator.manage', 'approval.professor-assignment.review', 'approval.student-overload.review'], coordinator: ['offering.manage', 'schedule.manage', 'approval.professor-assignment.submit', 'approval.student-overload.submit'], faculty: ['exam.own.manage', 'grade.own.manage'], student: ['exam.eligible.take', 'result.own.view'] };
  const CATALOG = [
    ['Workspace', { 'dashboard.dean.view': 'Open the Dean workspace', 'dashboard.coordinator.view': 'Open the Coordinator workspace', 'dashboard.faculty.view': 'Open the Professor workspace', 'dashboard.student.view': 'Open the Student workspace' }],
    ['People', { 'personnel.view': 'See college personnel', 'personnel.professor.manage': 'Hire and manage Professors', 'personnel.coordinator.manage': 'Appoint Faculty Coordinators', 'profile.faculty.view': 'View Professor profiles', 'profile.coordinator.view': 'View Coordinator profiles', 'profile.student.view': 'View Student profiles', 'profile.student.assigned.view': 'View profiles of their own students', 'profile.student.shared.view': 'See classmates’ basic profiles' }],
    ['Academics', { 'offering.manage': 'Manage sections and subject offerings', 'schedule.manage': 'Set class schedules and rooms', 'enrollment.view': 'View enrollments', 'load.view': 'View teaching loads' }],
    ['Approvals', { 'approval.professor-assignment.review': 'Approve Professor assignments', 'approval.student-overload.review': 'Approve Student overloads', 'approval.faculty-student-enrollment.review': 'Approve enrollment changes', 'approval.professor-assignment.submit': 'Request Professor assignments', 'approval.student-overload.submit': 'Request Student overloads', 'approval.faculty-student-enrollment.submit': 'Request enrollment changes', 'approval.own.withdraw': 'Withdraw their own requests' }],
    ['Exams & grades', { 'exam.own.manage': 'Create and manage their exams', 'grade.own.manage': 'Grade their students', 'exam.eligible.take': 'Take exams they are enrolled in', 'result.own.view': 'See their own results' }],
    ['Records', { 'audit.college.view': 'Read the college activity log', 'audit.own.view': 'Read their own activity log', 'statistics.college.view': 'See college statistics' }]
  ];
  const labelOf = p => { for (const [, map] of CATALOG) if (map[p]) return map[p]; return p.replace(/[.-]/g, ' '); };
  const groupOf = p => CATALOG.find(([, map]) => map[p])?.[0] || 'Other';
  const state = { panel: null, tab: 'users', q: '', sys: '', prole: '', page: 0, roleView: null, roleTab: 'display', memberQ: '' };

  /* ---------- data ---------- */
  function names() {
    const m = new Map();
    ['students', 'faculty', 'coordinators'].forEach(k => read(k).forEach(p => m.set(p.id || p.username, `${p.first || ''} ${p.last || ''}`.trim())));
    return m;
  }
  const customRoles = () => (settings().permissionRoles || []).map(r => ({ ...r, members: r.members || [], permissions: r.permissions || {} }));
  function roleOfUser(username, sys) { return customRoles().find(r => r.members.includes(username) && norm(r.baseRole) === sys) || null; }
  function users() {
    const n = names();
    return read('users').map(u => {
      const sys = norm(u.role), status = u.disabled === true ? 'Disabled' : String(u.status || u.lifecycleStatus || 'active').replace(/^\w/, c => c.toUpperCase());
      return { username: u.username, name: `${u.first || ''} ${u.last || ''}`.trim() || n.get(u.username) || u.username, sys, status, custom: roleOfUser(u.username, sys) };
    });
  }
  function builtinRoles() {
    const all = read('users'), overrides = settings().permissionOverrides || {};
    return SYSTEM.map(([key, name, color]) => {
      const base = typeof PermissionService !== 'undefined' ? PermissionService.permissionsFor(key, { baselineOnly: true }) : [];
      const off = base.filter(p => overrides[key]?.[p] === false).length;
      return { id: `system:${key}`, builtin: true, name, color, baseRole: key, members: all.filter(u => norm(u.role) === key).map(u => u.username), full: base.includes('*'), total: base.length, on: base.length - off };
    });
  }
  function basePerms(role) { return typeof PermissionService !== 'undefined' ? PermissionService.permissionsFor(role, { baselineOnly: true }) : []; }
  function effectiveCount(r) {
    if (r.builtin) return r.full ? 'All' : `${r.on}/${r.total}`;
    const base = basePerms(r.baseRole), overrides = settings().permissionOverrides?.[r.baseRole] || {};
    const on = base.filter(p => overrides[p] !== false && r.permissions[p] !== false).length;
    return `${on}/${base.length}`;
  }
  function save(patch, message, details) {
    const before = settings(), next = { ...before, ...patch };
    if (!DB.write('systemSettings', next)) return false;
    try { AuditLog.record('update', 'permissions', details || 'roles', { fields: Object.keys(patch) }, { username: read('currentUser', {}).username, role: 'admin' }); } catch (_) {}
    if (message && typeof notify === 'function') notify(message, 'success');
    return true;
  }
  const saveCustom = (roles, message) => save({ permissionRoles: roles.map(({ id, name, color, baseRole, members, permissions, createdAt }) => ({ id, name, color, baseRole, members, permissions, createdAt })) }, message, 'permission-roles');

  /* ---------- shared bits ---------- */
  const avatar = (name, color) => `<span class="gv-avatar" style="--c:${color}">${esc(String(name).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?')}</span>`;
  const pill = (text, color) => `<span class="gv-pill" style="--c:${color}">${esc(text)}</span>`;
  const statusPill = s => `<span class="gv-status ${/active/i.test(s) ? 'ok' : /disabled|deactivated|archived/i.test(s) ? 'bad' : 'warn'}">${esc(s)}</span>`;
  const icon = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  const ICON = { plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z', search: 'm20 19-4.3-4.3a7 7 0 1 0-1.4 1.4L18.6 20 20 19ZM5 10.5a5.5 5.5 0 1 1 11 0 5.5 5.5 0 0 1-11 0Z', back: 'M15.4 6.6 14 5.2 7.2 12l6.8 6.8 1.4-1.4L10 12l5.4-5.4Z', lock: 'M7 10V8a5 5 0 1 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1Zm2 0h6V8a3 3 0 1 0-6 0v2Z', trash: 'M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Z', x: 'm6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z' };
  function modal(title, body, actions) {
    document.getElementById('gvModal')?.remove();
    document.body.insertAdjacentHTML('beforeend', `<div class="gv-modal" id="gvModal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="gv-modal-card"><header><h3>${esc(title)}</h3><button type="button" class="gv-icon-btn" data-gv-close aria-label="Close">${icon(ICON.x)}</button></header><div class="gv-modal-body">${body}</div><footer>${actions}</footer></div></div>`);
    const m = document.getElementById('gvModal');
    m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-gv-close]')) m.remove(); });
    m.addEventListener('keydown', e => { if (e.key === 'Escape') m.remove(); });
    m.querySelector('input,select')?.focus();
    return m;
  }

  /* ---------- shared icon toolbar (same markup as the other tables) ---------- */
  const TOOL = { add: ICON.plus, search: ICON.search, filter: 'M3 5h18l-7 8v6l-4 2v-8L3 5Zm4.3 2 4.7 5.3V18l.1-.1V12.3L16.7 7H7.3Z', export: 'M11 3h2v8.2l2.6-2.6L17 10l-5 5-5-5 1.4-1.4 2.6 2.6V3ZM5 19v-4h2v2h10v-2h2v4H5Z' };
  // items: [kind, label, act?] ; panels: html for the search / filter popovers
  function toolbar(items, panels) {
    const open = state.panel;
    return `<div class="table-tools gv-table-tools">${items.map(([kind, label, act]) => {
      if (kind === 'add') return `<button type="button" class="tool-icon table-add-action" data-gv-act="${act}" title="${esc(label)}" aria-label="${esc(label)}">${icon(TOOL.add)}</button>`;
      if (kind === 'export') return `<div class="table-export-wrap"><button type="button" class="tool-icon table-export-action${open === 'export' ? ' active' : ''}" data-gv-panel="export" title="${esc(label)}" aria-label="${esc(label)}" aria-expanded="${open === 'export'}">${icon(TOOL.export)}</button><div class="table-export-menu" role="menu"${open === 'export' ? '' : ' hidden'}><button type="button" data-gv-export="csv">Export as CSV <small>.csv</small></button><button type="button" data-gv-export="doc">Export as Word <small>.doc</small></button></div></div>`;
      const used = kind === 'search' ? !!state.q : !!(state.sys || state.prole);
      return `<div class="gv-tool"><button type="button" class="tool-icon${open === kind ? ' active' : ''}${used ? ' has-query' : ''}" data-gv-panel="${kind}" title="${esc(label)}" aria-label="${esc(label)}" aria-expanded="${open === kind}">${icon(TOOL[kind])}</button>${panels[kind] ? panels[kind](open === kind) : ''}</div>`;
    }).join('')}</div>`;
  }
  function usersToolbar(roles) {
    return toolbar([['add', 'Add user', 'add-user'], ['search', 'Search users'], ['filter', 'Filter users'], ['export', 'Export users']], {
      search: on => `<div class="table-search-box"${on ? '' : ' hidden'}><input type="search" data-gv="q" placeholder="Search name or ID" value="${esc(state.q)}" aria-label="Search users"></div>`,
      filter: on => `<div class="table-tool-select gv-filter-panel"${on ? '' : ' hidden'}><label><span>System role</span><select data-gv="sys"><option value="">All system roles</option>${SYSTEM.map(([k, l]) => `<option value="${k}"${state.sys === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label><label><span>Permission role</span><select data-gv="prole"><option value="">All permission roles</option><option value="none"${state.prole === 'none' ? ' selected' : ''}>Default only</option>${roles.map(r => `<option value="${esc(r.id)}"${state.prole === r.id ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>${state.sys || state.prole ? '<button type="button" class="gv-clear" data-gv-act="clear-filters">Clear filters</button>' : ''}</div>`
    });
  }
  function exportRows(format) {
    if (typeof AdminTableTools === 'undefined') return;
    const table = document.createElement('table');
    if (state.tab === 'roles') {
      table.innerHTML = `<thead><tr><th>Role</th><th>Type</th><th>Based on</th><th>Members</th><th>Permissions</th></tr></thead><tbody>${allRoles().map(r => `<tr><td>${esc(r.name)}</td><td>${r.builtin ? 'Built-in' : 'Custom'}</td><td>${esc(sysLabel(r.baseRole))}</td><td>${r.members.length}</td><td>${esc(effectiveCount(r))}</td></tr>`).join('')}</tbody>`;
      return AdminTableTools.exportTable(table, 'roles', format);
    }
    table.innerHTML = `<thead><tr><th>Name</th><th>Username</th><th>System role</th><th>Permission role</th><th>Status</th></tr></thead><tbody>${filteredUsers().map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.username)}</td><td>${esc(sysLabel(u.sys))}</td><td>${esc(u.custom ? u.custom.name : 'Default')}</td><td>${esc(u.status)}</td></tr>`).join('')}</tbody>`;
    AdminTableTools.exportTable(table, 'users', format);
  }
  function filteredUsers() {
    const q = state.q.toLowerCase();
    return users().filter(u => (!state.sys || u.sys === state.sys) && (!state.prole || (state.prole === 'none' ? !u.custom : u.custom?.id === state.prole)) && (!q || `${u.name} ${u.username}`.toLowerCase().includes(q)));
  }

  /* ---------- Users tab ---------- */
  function renderUsers() {
    const root = document.getElementById('accountManagementRoot'); if (!root) return;
    const all = users(), roles = customRoles(), list = filteredUsers();
    // Infinite scroll: render the first batch, then append more as the end comes into view.
    const key = `${state.q}|${state.sys}|${state.prole}`, same = key === feed.key; feed.key = key;
    feed.list = list; feed.shown = Math.min(list.length, same ? Math.max(BATCH, feed.shown) : BATCH);
    const rows = list.slice(0, feed.shown);
    const active = all.filter(u => /active/i.test(u.status)).length;
    root.innerHTML = `<div class="gv-stats"><div><span>All users</span><strong>${all.length.toLocaleString()}</strong></div><div><span>Active</span><strong>${active.toLocaleString()}</strong></div><div><span>In a custom role</span><strong>${all.filter(u => u.custom).length.toLocaleString()}</strong></div><div><span>Roles</span><strong>${SYSTEM.length + roles.length}</strong><small>${roles.length} custom</small></div></div>
      <section class="gv-card"><header class="gv-card-head"><div><h3>Users</h3><p>${list.length.toLocaleString()} of ${all.length.toLocaleString()} accounts</p></div>${usersToolbar(roles)}</header>
      <div class="gv-table-wrap"><table class="gv-table"><thead><tr><th>User</th><th>System role</th><th>Permission role</th><th>Status</th><th aria-label="Actions"></th></tr></thead><tbody id="gvUserRows">${rows.map(userRow).join('') || '<tr><td colspan="5" class="gv-empty">No users match.</td></tr>'}</tbody></table><div class="gv-feed-end" id="gvFeedEnd">${feedNote()}</div></div></section>`;
    watchFeed();
  }
  const BATCH = 40, feed = { list: [], shown: 0, keep: 0, observer: null };
  const userRow = u => `<tr data-gv-user="${esc(u.username)}" tabindex="0"><td><span class="gv-person">${avatar(u.name, sysColor(u.sys))}<span><strong>${esc(u.name)}</strong><small>${esc(u.username)}</small></span></span></td><td>${pill(sysLabel(u.sys), sysColor(u.sys))}</td><td>${u.custom ? pill(u.custom.name, u.custom.color) : `<span class="gv-muted">Default ${esc(sysLabel(u.sys))}</span>`}</td><td>${statusPill(u.status)}</td><td class="gv-row-end"><span class="gv-link">Manage &#8250;</span></td></tr>`;
  const feedNote = () => !feed.list.length ? '' : feed.shown < feed.list.length ? `<span class="gv-spinner" aria-hidden="true"></span>Loading more · ${feed.shown.toLocaleString()} of ${feed.list.length.toLocaleString()}` : `All ${feed.list.length.toLocaleString()} shown`;
  // Appends the next batch to the existing rows (no full redraw, scroll position kept).
  function loadMore() {
    const body = document.getElementById('gvUserRows'), end = document.getElementById('gvFeedEnd');
    if (!body || feed.shown >= feed.list.length) return;
    const next = feed.list.slice(feed.shown, feed.shown + BATCH);
    body.insertAdjacentHTML('beforeend', next.map(userRow).join(''));
    feed.shown += next.length;
    if (end) end.innerHTML = feedNote();
  }
  function watchFeed() {
    feed.observer?.disconnect();
    const end = document.getElementById('gvFeedEnd'); if (!end) return;
    if (typeof IntersectionObserver === 'function') { feed.observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) loadMore(); }, { rootMargin: '400px 0px' }); feed.observer.observe(end); }
  }
  function addUser() {
    const m = modal('Add user', `<form class="gv-form" id="gvAddUser"><label>Institutional ID or username<input name="username" required pattern="[A-Za-z0-9._-]{3,40}"></label><label>System role<select name="role">${SYSTEM.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label><label>First name<input name="first" required></label><label>Last name<input name="last" required></label><label>Program or unit<input name="program" placeholder="e.g. BSCS"></label><label>Effective date<input name="effectiveDate" type="date" required value="${new Date().toISOString().slice(0, 10)}"></label><label>Initial status<select name="status"><option value="active">Active</option><option value="inactive">Inactive</option></select></label><label>Initial password<input name="password" type="password" minlength="8" required></label><p class="gv-note">Creating an account does not enroll a Student or assign a Professor to a Subject.</p></form>`, `<button type="button" class="gv-btn" data-gv-close>Cancel</button><button type="submit" form="gvAddUser" class="gv-btn gv-primary">Create account</button>`);
    m.querySelector('form').addEventListener('submit', async e => { e.preventDefault(); if (await createAccount(Object.fromEntries(new FormData(e.currentTarget)))) { m.remove(); renderUsers(); } });
  }
  async function createAccount(body) {
    try {
      if (/^https?:$/.test(location.protocol) && typeof fetch === 'function' && location.port === '3000') {
        const token = sessionStorage.getItem('serverSessionToken');
        const r = await fetch('/api/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
        const d = await r.json(); if (!r.ok) throw new Error(d.error || 'The change was rejected.');
        if (typeof sqliteBootstrap === 'function') sqliteBootstrap();
      } else {
        const list = read('users'); if (list.some(u => u.username.toLowerCase() === body.username.toLowerCase())) throw new Error('That institutional ID or username already exists.');
        if (!DB.write('users', [...list, { ...body, createdAt: new Date().toISOString() }])) return false;
        const key = body.role === 'student' ? 'students' : body.role === 'faculty' ? 'faculty' : body.role === 'coordinator' ? 'coordinators' : '';
        if (key) DB.write(key, [...read(key), { id: body.username, username: body.username, first: body.first, last: body.last, program: body.program, role: body.role, status: body.status }]);
        try { AuditLog.record('create-account', 'account', body.username, { role: body.role, status: body.status }); } catch (_) {}
      }
      if (typeof loadAll === 'function') loadAll();
      if (typeof notify === 'function') notify(`${sysLabel(body.role)} account created.`, 'success');
      return true;
    } catch (error) { if (typeof notify === 'function') notify(error.message, 'error'); return false; }
  }
  function manageUser(username, after) {
    const u = users().find(x => x.username === username); if (!u) return;
    const options = customRoles().filter(r => norm(r.baseRole) === u.sys);
    const m = modal('Manage access', `<div class="gv-user-head">${avatar(u.name, sysColor(u.sys))}<div><strong>${esc(u.name)}</strong><small>${esc(u.username)} · ${esc(sysLabel(u.sys))}</small></div>${statusPill(u.status)}</div><label class="gv-form-row">Permission role<select id="gvUserRole"><option value="">Default ${esc(sysLabel(u.sys))}</option>${options.map(r => `<option value="${esc(r.id)}"${u.custom?.id === r.id ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label><p class="gv-note">${options.length ? 'Only roles built on this account’s system role are listed.' : `No custom roles are built on ${esc(sysLabel(u.sys))} yet. <button type="button" class="gv-inline-link" data-gv-create-for="${esc(u.sys)}">Create one now</button>.`} Account status is changed in Account Lifecycle.</p>`, `<button type="button" class="gv-btn" data-gv-close>Cancel</button><button type="button" class="gv-btn gv-primary" data-gv-save>Save</button>`);
    m.querySelector('[data-gv-create-for]')?.addEventListener('click', () => { m.remove(); state.tab = 'roles'; show('roles'); newRole(u.sys); });
    m.querySelector('[data-gv-save]').addEventListener('click', () => { setMembership(username, m.querySelector('#gvUserRole').value, u.sys); m.remove(); (after || renderUsers)(); });
  }
  function setMembership(username, roleId, sys) {
    const roles = customRoles().map(r => norm(r.baseRole) === sys ? { ...r, members: r.members.filter(x => x !== username) } : r);
    const target = roles.find(r => r.id === roleId); if (target) target.members.push(username);
    saveCustom(roles, target ? `${username} now has the ${target.name} role.` : `${username} uses the default role.`);
  }

  /* ---------- Roles tab ---------- */
  function allRoles() { return [...builtinRoles(), ...customRoles().map(r => ({ ...r, builtin: false }))]; }
  function renderRoles() {
    const root = document.getElementById('rolePermissionsRoot'); if (!root) return;
    if (state.roleView) return renderEditor(root);
    const roles = allRoles();
    root.innerHTML = `<section class="gv-card"><header class="gv-card-head"><div><h3>Roles</h3><p>${roles.length} roles · built-in roles follow the system role; custom roles narrow a base role</p></div>${toolbar([['add', 'Create role', 'new-role'], ['export', 'Export roles']], '')}</header>
      <div class="gv-table-wrap"><table class="gv-table"><thead><tr><th>Role</th><th>Type</th><th>Based on</th><th>Members</th><th>Permissions</th><th aria-label="Actions"></th></tr></thead><tbody>${roles.map(r => { const shown = r.members.slice(0, 4), n = names(); return `<tr data-gv-role="${esc(r.id)}" tabindex="0"><td><span class="gv-role-name"><i style="background:${r.color}"></i><strong>${esc(r.name)}</strong></span></td><td>${r.builtin ? '<span class="gv-muted">Built-in</span>' : pill('Custom', r.color)}</td><td>${esc(sysLabel(r.baseRole))}</td><td><span class="gv-stack">${shown.map(u => avatar(n.get(u) || u, r.color)).join('')}</span><span class="gv-count">${r.members.length.toLocaleString()}</span></td><td><span class="gv-perm-count">${effectiveCount(r)}</span></td><td class="gv-row-end"><span class="gv-link">Edit &#8250;</span></td></tr>`; }).join('')}</tbody></table></div></section>`;
  }
  function newRole(base) {
    const colors = ['#7c6bd6', '#2f8d83', '#d39a2c', '#3d8fd4', '#c8692e', '#b5537b', '#6d7fd6', '#2fae78'];
    const m = modal('Create role', `<form class="gv-form gv-form-1" id="gvNewRole"><label>Role name<input name="name" required maxlength="40" placeholder="e.g. Senior Coordinator"></label><label>Based on<select name="baseRole">${SYSTEM.filter(s => s[0] !== 'admin').map(([k, l]) => `<option value="${k}"${base === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label><fieldset class="gv-colors"><legend>Color</legend>${colors.map((c, i) => `<label><input type="radio" name="color" value="${c}"${i ? '' : ' checked'}><i style="background:${c}"></i></label>`).join('')}</fieldset><p class="gv-note">A custom role starts with every permission of its base role. You can switch permissions off, but never add ones the base role does not have.</p></form>`, `<button type="button" class="gv-btn" data-gv-close>Cancel</button><button type="submit" form="gvNewRole" class="gv-btn gv-primary">Create role</button>`);
    m.querySelector('form').addEventListener('submit', e => {
      e.preventDefault(); const v = Object.fromEntries(new FormData(e.currentTarget)); const name = v.name.trim();
      if (allRoles().some(r => r.name.toLowerCase() === name.toLowerCase())) { notify('A role with that name already exists.', 'error'); return; }
      const role = { id: `role_${Date.now().toString(36)}`, name, color: v.color, baseRole: v.baseRole, members: [], permissions: {}, createdAt: new Date().toISOString() };
      if (saveCustom([...customRoles(), role], `Role “${name}” created.`)) { m.remove(); state.roleView = role.id; state.roleTab = 'permissions'; renderRoles(); }
    });
  }
  function renderEditor(root) {
    const roles = allRoles(), r = roles.find(x => x.id === state.roleView); if (!r) { state.roleView = null; return renderRoles(); }
    const tabs = [['display', 'Display'], ['permissions', 'Permissions'], ['members', `Members · ${r.members.length.toLocaleString()}`]];
    root.innerHTML = `<section class="gv-card gv-editor"><aside class="gv-role-list"><button type="button" class="gv-back" data-gv-act="roles-back">${icon(ICON.back)}All roles</button><p class="gv-list-head">Roles · ${roles.length}</p>${roles.map(x => `<button type="button" class="gv-role-item${x.id === r.id ? ' active' : ''}" data-gv-open="${esc(x.id)}"><i style="background:${x.color}"></i><span>${esc(x.name)}</span><small>${x.members.length.toLocaleString()}</small></button>`).join('')}<button type="button" class="gv-role-item gv-new" data-gv-act="new-role">${icon(ICON.plus)}<span>Create role</span></button></aside>
      <div class="gv-editor-main"><header class="gv-editor-head"><span class="gv-role-name big"><i style="background:${r.color}"></i><strong>${esc(r.name)}</strong></span><span class="gv-muted">${r.builtin ? 'Built-in role' : `Custom role · based on ${esc(sysLabel(r.baseRole))}`}</span></header>
      <nav class="gv-subtabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" class="${state.roleTab === k ? 'active' : ''}" aria-selected="${state.roleTab === k}" data-gv-rtab="${k}">${l}</button>`).join('')}</nav>
      <div class="gv-editor-body">${state.roleTab === 'permissions' ? permissionsPane(r) : state.roleTab === 'members' ? membersPane(r) : displayPane(r)}</div></div></section>`;
  }
  function displayPane(r) {
    if (r.builtin) return `<div class="gv-form gv-form-1"><label>Role name<input value="${esc(r.name)}" disabled></label><p class="gv-note">Built-in roles come from each account’s system role. Their name, color and members follow the account records; you can still switch off configurable permissions in the Permissions tab.</p></div>`;
    const colors = ['#7c6bd6', '#2f8d83', '#d39a2c', '#3d8fd4', '#c8692e', '#b5537b', '#6d7fd6', '#2fae78'];
    return `<form class="gv-form gv-form-1" id="gvRoleDisplay"><label>Role name<input name="name" required maxlength="40" value="${esc(r.name)}"></label><label>Based on<input value="${esc(sysLabel(r.baseRole))}" disabled></label><fieldset class="gv-colors"><legend>Color</legend>${colors.map(c => `<label><input type="radio" name="color" value="${c}"${c === r.color ? ' checked' : ''}><i style="background:${c}"></i></label>`).join('')}</fieldset><div class="gv-actions"><button type="submit" class="gv-btn gv-primary">Save changes</button><button type="button" class="gv-btn gv-danger" data-gv-act="delete-role">${icon(ICON.trash)}Delete role</button></div></form>`;
  }
  function permissionsPane(r) {
    if (r.baseRole === 'admin') return `<div class="gv-banner">${icon(ICON.lock)}<div><strong>Full system authority</strong><p>Administrators can do everything. This role cannot be narrowed.</p></div></div>`;
    const base = basePerms(r.baseRole), overrides = settings().permissionOverrides?.[r.baseRole] || {}, editable = new Set(CONFIGURABLE[r.baseRole] || []);
    const groups = new Map(); base.forEach(p => { const g = groupOf(p); groups.set(g, [...(groups.get(g) || []), p]); });
    const row = p => {
      const lockedOff = !r.builtin && overrides[p] === false; // switched off for everyone in the base role
      const on = r.builtin ? overrides[p] !== false : !lockedOff && r.permissions[p] !== false;
      const canEdit = editable.has(p) && !lockedOff;
      return `<label class="gv-perm${canEdit ? '' : ' locked'}"><span><strong>${esc(labelOf(p))}</strong><small>${esc(p)}${lockedOff ? ' · off for every ' + esc(sysLabel(r.baseRole)) : !editable.has(p) ? ' · protected' : ''}</small></span>${canEdit ? `<input type="checkbox" class="gv-switch" data-gv-perm="${esc(p)}"${on ? ' checked' : ''}>` : `<span class="gv-lock" title="Protected">${icon(ICON.lock)}${on ? 'On' : 'Off'}</span>`}</label>`;
    };
    return `<p class="gv-note">${r.builtin ? `Applies to every ${esc(sysLabel(r.baseRole))}. Protected permissions keep the safety boundaries (for example, Coordinators cannot enroll and Students cannot grade).` : `Members get these permissions instead of the default ${esc(sysLabel(r.baseRole))} set. A custom role can switch permissions off, never add new ones.`}</p>${[...groups.entries()].map(([g, ps]) => `<section class="gv-perm-group"><h4>${esc(g)}</h4>${ps.map(row).join('')}</section>`).join('')}<div class="gv-actions"><button type="button" class="gv-btn gv-primary" data-gv-act="save-perms">Save permissions</button>${r.builtin ? '<button type="button" class="gv-btn" data-gv-act="reset-perms">Restore defaults</button>' : ''}</div>`;
  }
  function membersPane(r) {
    const n = names(), q = state.memberQ.toLowerCase(), PAGE_M = 50;
    const nameOf = u => n.get(u) || u;
    const row = (u, end) => { const cr = roleOfUser(u, r.baseRole); return `<li class="gv-mrow">${avatar(nameOf(u), r.color)}<span class="gv-mname"><strong>${esc(nameOf(u))}</strong><small>${esc(u)}</small></span><span class="gv-mrole">${cr ? pill(cr.name, cr.color) : `<span class="gv-muted">Default ${esc(sysLabel(r.baseRole))}</span>`}</span>${end}</li>`; };
    const assign = u => `<button type="button" class="gv-btn gv-sm" data-gv-assign="${esc(u)}" aria-label="Assign a role to ${esc(nameOf(u))}">${icon(ICON.plus)}Assign role</button>`;
    if (r.builtin) {
      const list = r.members.filter(u => !q || `${nameOf(u)} ${u}`.toLowerCase().includes(q));
      const assignable = r.baseRole !== 'admin';
      return `<div class="gv-mhead"><label class="gv-search">${icon(ICON.search)}<input type="search" data-gv="memberQ" placeholder="Search members" value="${esc(state.memberQ)}" aria-label="Search members"></label><span class="gv-muted">${list.length.toLocaleString()} member${list.length === 1 ? '' : 's'}</span></div><p class="gv-note">Everyone whose system role is ${esc(sysLabel(r.baseRole))}. ${assignable ? 'Use Assign role to give someone a custom role built on it.' : 'Administrators always have full access.'}</p><ul class="gv-mlist">${list.slice(0, PAGE_M).map(u => row(u, assignable ? assign(u) : '')).join('') || '<li class="gv-empty">No members match.</li>'}</ul>${list.length > PAGE_M ? `<p class="gv-muted gv-more">Showing ${PAGE_M} of ${list.length.toLocaleString()} · search to narrow</p>` : ''}`;
    }
    const pool = read('users').filter(u => norm(u.role) === r.baseRole && !r.members.includes(u.username));
    const matches = q ? pool.filter(u => `${nameOf(u.username)} ${u.username}`.toLowerCase().includes(q)).slice(0, 8) : [];
    return `<div class="gv-mhead"><div class="gv-add-member"><label class="gv-search">${icon(ICON.search)}<input type="search" data-gv="memberQ" placeholder="Find ${esc(sysLabel(r.baseRole))}s to add" value="${esc(state.memberQ)}" aria-label="Find people to add"></label>${matches.length ? `<div class="gv-suggest">${matches.map(u => `<button type="button" data-gv-add="${esc(u.username)}">${avatar(nameOf(u.username), r.color)}<span><strong>${esc(nameOf(u.username))}</strong><small>${esc(u.username)}${roleOfUser(u.username, r.baseRole) ? ` · now in ${esc(roleOfUser(u.username, r.baseRole).name)}` : ''}</small></span>${icon(ICON.plus)}</button>`).join('')}</div>` : q ? '<div class="gv-suggest"><p class="gv-muted">No matching accounts.</p></div>' : ''}</div><button type="button" class="gv-btn gv-primary" data-gv-act="focus-add">${icon(ICON.plus)}Add members</button></div>
      <ul class="gv-mlist">${r.members.map(u => row(u, `<button type="button" class="gv-icon-btn" data-gv-remove="${esc(u)}" aria-label="Remove ${esc(nameOf(u))} from ${esc(r.name)}" title="Remove from role">${icon(ICON.x)}</button>`)).join('') || `<li class="gv-empty">No members yet. Use Add members to find ${esc(sysLabel(r.baseRole))}s.</li>`}</ul>`;
  }

  function savePerms() {
    const r = allRoles().find(x => x.id === state.roleView); if (!r) return;
    const toggles = [...document.querySelectorAll('#rolePermissionsRoot [data-gv-perm]')];
    if (r.builtin) {
      const all = { ...(settings().permissionOverrides || {}) }; all[r.baseRole] = { ...(all[r.baseRole] || {}) };
      toggles.forEach(t => { all[r.baseRole][t.dataset.gvPerm] = t.checked; });
      save({ permissionOverrides: all }, `${r.name} permissions saved.`, `role:${r.baseRole}`);
    } else {
      const roles = customRoles(), target = roles.find(x => x.id === r.id); target.permissions = { ...target.permissions };
      toggles.forEach(t => { target.permissions[t.dataset.gvPerm] = t.checked; });
      saveCustom(roles, `${r.name} permissions saved.`);
    }
    renderRoles();
  }
  async function resetPerms() {
    const r = allRoles().find(x => x.id === state.roleView); if (!r?.builtin) return;
    if (typeof confirmDialog === 'function' && !await confirmDialog({ title: `Restore ${r.name} defaults?`, message: 'Every configurable permission of this role is switched back on.', confirmLabel: 'Restore defaults' })) return;
    const all = { ...(settings().permissionOverrides || {}) }; delete all[r.baseRole];
    save({ permissionOverrides: all }, `${r.name} permissions restored.`, `role:${r.baseRole}`); renderRoles();
  }
  async function deleteRole() {
    const r = customRoles().find(x => x.id === state.roleView); if (!r) return;
    if (typeof confirmDialog === 'function' && !await confirmDialog({ title: `Delete “${r.name}”?`, message: `${r.members.length} member${r.members.length === 1 ? '' : 's'} go back to the default ${sysLabel(r.baseRole)} permissions.`, confirmLabel: 'Delete role', danger: true })) return;
    saveCustom(customRoles().filter(x => x.id !== r.id), `Role “${r.name}” deleted.`); state.roleView = null; renderRoles();
  }
  function editMembers(add, remove) {
    const roles = customRoles(), r = roles.find(x => x.id === state.roleView); if (!r) return;
    if (add) { roles.forEach(x => { if (norm(x.baseRole) === norm(r.baseRole)) x.members = x.members.filter(u => u !== add); }); r.members.push(add); }
    if (remove) r.members = r.members.filter(u => u !== remove);
    saveCustom(roles, add ? `${add} added to ${r.name}.` : `${remove} removed from ${r.name}.`); renderRoles();
    if (add) document.querySelector('#rolePermissionsRoot [data-gv="memberQ"]')?.focus();
  }

  /* ---------- Policies tab ---------- */
  function renderPolicies() {
    const root = document.getElementById('governancePolicyRoot'); if (!root) return;
    const s = settings(), l = s.professorLoadPolicy || { normal: 18, maximum: 24, labWeight: 1, effectiveDate: new Date().toISOString().slice(0, 10) };
    const direct = s.coordinatorAppointmentAuthority === 'dean-direct';
    const date = d => { const x = new Date(`${d}T00:00:00`); return Number.isNaN(x.getTime()) ? d : x.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };
    const pen = 'M4 17.3V20h2.7l8-8-2.7-2.7-8 8Zm12.7-7.6a.9.9 0 0 0 0-1.3l-1.1-1.1a.9.9 0 0 0-1.3 0l-.9.9 2.4 2.4.9-.9Z';
    const head = (svg, title, sub, act, label) => `<header class="gv-pc-head"><span class="gv-pc-icon">${icon(svg)}</span><div><h3>${title}</h3><p>${sub}</p></div><button type="button" class="gv-pc-edit" data-gv-act="${act}" title="${label}" aria-label="${label}">${icon(pen)}</button></header>`;
    // Appointment flow: Dean -> (Administrator) -> Coordinator
    const step = (svg, name, note, on) => `<div class="gv-flow-step${on ? '' : ' skipped'}"><span>${icon(svg)}</span><strong>${name}</strong><small>${note}</small></div>`;
    const arrow = '<i class="gv-flow-arrow" aria-hidden="true"></i>';
    const flow = `<div class="gv-flow">${step('M12 3 2 8l10 5 8-4v6h2V8L12 3Zm-6 9.2V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-3.8l-6 3-6-3Z', 'Dean', 'Appoints', true)}${arrow}${step('M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 4.6-4.6 1.4 1.4-6 6Z', 'Administrator', direct ? 'Skipped' : 'Confirms', !direct)}${arrow}${step('M12 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 12c4.4 0 8 2 8 4.5V21H4v-2.5C4 16 7.6 14 12 14Z', 'Coordinator', 'Takes office', true)}</div>`;
    // Load gauge: 0..(max * 1.25); green up to normal, amber up to max, red beyond.
    const top = Math.max(1, l.maximum * 1.25), pct = v => Math.min(100, v / top * 100);
    const gauge = `<div class="gv-gauge" role="img" aria-label="Normal load ${l.normal} units, maximum ${l.maximum} units"><div class="gv-gauge-bar"><i class="ok" style="width:${pct(l.normal)}%"></i><i class="warn" style="width:${pct(l.maximum) - pct(l.normal)}%"></i><i class="over" style="width:${100 - pct(l.maximum)}%"></i></div><span class="gv-gauge-mark" style="left:${pct(l.normal)}%">${esc(l.normal)}</span><span class="gv-gauge-mark max" style="left:${pct(l.maximum)}%">${esc(l.maximum)}</span></div><div class="gv-gauge-key"><span><i class="ok"></i>Normal</span><span><i class="warn"></i>Overload (needs approval)</span><span><i class="over"></i>Blocked</span></div>`;
    root.innerHTML = `<div class="gv-policy-cards">
      <section class="gv-pc">${head('M12 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 12c4.4 0 8 2 8 4.5V21H4v-2.5C4 16 7.6 14 12 14Z', 'Coordinator appointment', 'How a Faculty Coordinator is appointed', 'edit-authority', 'Edit coordinator appointment')}
        ${flow}<p class="gv-pc-foot"><span class="gv-pill" style="--c:${direct ? '#c8692e' : '#2f8d83'}">${direct ? 'Dean appoints directly' : 'Administrator confirms'}</span>${direct ? 'Appointments take effect immediately.' : 'Appointments wait for an Administrator.'}</p></section>
      <section class="gv-pc">${head('M4 19h16v2H4v-2Zm2-2V9h3v8H6Zm5 0V5h3v12h-3Zm5 0v-6h3v6h-3Z', 'Professor load policy', 'Teaching units per Professor each term', 'edit-limits', 'Edit Professor load policy')}
        <div class="gv-pc-stats"><div><strong>${esc(l.normal)}</strong><span>Normal load</span></div><div><strong>${esc(l.maximum)}</strong><span>Maximum</span></div><div><strong>×${esc(l.labWeight)}</strong><span>Lab weighting</span></div></div>
        ${gauge}<p class="gv-pc-foot">Effective since <b>${esc(date(l.effectiveDate))}</b></p></section>
    </div>`;
  }
  async function confirmSave(title) { return typeof confirmDialog !== 'function' || confirmDialog({ title, message: 'This changes the rule for the whole college and is recorded in the audit log.', confirmLabel: 'Save change' }); }
  function editAuthority() {
    const s = settings();
    const m = modal('Coordinator appointment', `<label class="gv-form-row">Appointment authority<select id="gvAuthority"><option value="admin-confirmation"${s.coordinatorAppointmentAuthority !== 'dean-direct' ? ' selected' : ''}>Require Administrator confirmation</option><option value="dean-direct"${s.coordinatorAppointmentAuthority === 'dean-direct' ? ' selected' : ''}>Dean appoints directly</option></select></label><p class="gv-note">With confirmation, a Dean’s appointment waits until an Administrator approves it.</p>`, `<button type="button" class="gv-btn" data-gv-close>Cancel</button><button type="button" class="gv-btn gv-primary" data-gv-save>Save</button>`);
    m.querySelector('[data-gv-save]').addEventListener('click', async () => { const v = m.querySelector('#gvAuthority').value; if (v === (settings().coordinatorAppointmentAuthority || 'admin-confirmation')) { m.remove(); return; } if (!await confirmSave('Change appointment authority?')) return; save({ coordinatorAppointmentAuthority: v }, 'Appointment authority saved.', 'appointment-authority'); m.remove(); renderPolicies(); });
  }
  function editLimits() {
    const l = settings().professorLoadPolicy || { normal: 18, maximum: 24, labWeight: 1, effectiveDate: new Date().toISOString().slice(0, 10) };
    const m = modal('Professor load policy', `<form class="gv-form" id="gvLimits"><label>Normal teaching load<input name="normal" type="number" min="1" required value="${esc(l.normal)}"></label><label>Absolute maximum<input name="maximum" type="number" min="1" required value="${esc(l.maximum)}"></label><label>Laboratory weighting<input name="labWeight" type="number" min="0" step="0.1" required value="${esc(l.labWeight)}"></label><label>Effective date<input name="effectiveDate" type="date" required value="${esc(l.effectiveDate)}"></label><p class="gv-note">The maximum cannot be below the normal load.</p></form>`, `<button type="button" class="gv-btn" data-gv-close>Cancel</button><button type="submit" form="gvLimits" class="gv-btn gv-primary">Save</button>`);
    m.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault(); const v = Object.fromEntries(new FormData(e.currentTarget)), normal = Number(v.normal), maximum = Number(v.maximum), labWeight = Number(v.labWeight);
      if (!normal || maximum < normal || !v.effectiveDate) return notify('Enter valid limits; the maximum cannot be below the normal load.', 'error');
      if (!await confirmSave('Change the Professor load policy?')) return;
      save({ professorLoadPolicy: { normal, maximum, labWeight, effectiveDate: v.effectiveDate } }, 'Professor load policy saved.', 'professor-load-policy'); m.remove(); renderPolicies();
    });
  }

  /* ---------- tabs and events ---------- */
  const PANES = { users: 'accountManagementPane', roles: 'rolePermissionsPane', policies: 'governancePolicyPane' };
  function show(view = 'users') {
    if (view === 'accounts') view = 'users'; if (view === 'permissions') view = 'roles';
    state.tab = view; state.panel = null;
    Object.entries(PANES).forEach(([k, id]) => { const p = document.getElementById(id); if (p) p.hidden = k !== view; });
    document.querySelectorAll('.governance-tab').forEach(t => { const on = t.dataset.gvTab === view; t.classList.toggle('active', on); t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
    ({ users: renderUsers, roles: renderRoles, policies: renderPolicies })[view]();
  }
  function bind() {
    const host = document.getElementById('governanceSection'); if (!host || host.dataset.gvBound) return; host.dataset.gvBound = '1';
    host.addEventListener('click', e => {
      const t = e.target;
      const act = t.closest('[data-gv-act]')?.dataset.gvAct;
      if (act === 'add-user') return addUser();
      if (act === 'new-role') return newRole(state.roleView && !String(state.roleView).startsWith('system:admin') ? allRoles().find(x => x.id === state.roleView)?.baseRole : undefined);
      if (act === 'roles-back') { state.roleView = null; state.memberQ = ''; return renderRoles(); }
      if (act === 'save-perms') return savePerms();
      if (act === 'reset-perms') return resetPerms();
      if (act === 'delete-role') return deleteRole();
      if (act === 'edit-authority') return editAuthority();
      if (act === 'edit-limits') return editLimits();
      const panel = t.closest('[data-gv-panel]');
      if (panel) { state.panel = state.panel === panel.dataset.gvPanel ? null : panel.dataset.gvPanel; (state.tab === 'roles' ? renderRoles : renderUsers)(); if (state.panel === 'search') host.querySelector('[data-gv="q"]')?.focus(); return; }
      const exp = t.closest('[data-gv-export]'); if (exp) { state.panel = null; (state.tab === 'roles' ? renderRoles : renderUsers)(); return exportRows(exp.dataset.gvExport); }
      if (act === 'clear-filters') { state.sys = ''; state.prole = ''; return renderUsers(); }
      if (state.panel && !t.closest('.gv-table-tools')) { state.panel = null; (state.tab === 'roles' ? renderRoles : renderUsers)(); }
      const assign = t.closest('[data-gv-assign]'); if (assign) return manageUser(assign.dataset.gvAssign, () => renderRoles());
      if (act === 'focus-add') return document.querySelector('#rolePermissionsRoot [data-gv="memberQ"]')?.focus();
      const user = t.closest('[data-gv-user]'); if (user) return manageUser(user.dataset.gvUser);
      const role = t.closest('[data-gv-role],[data-gv-open]'); if (role) { state.roleView = role.dataset.gvRole || role.dataset.gvOpen; state.roleTab = 'display'; state.memberQ = ''; return renderRoles(); }
      const rtab = t.closest('[data-gv-rtab]'); if (rtab) { state.roleTab = rtab.dataset.gvRtab; state.memberQ = ''; return renderRoles(); }
      const add = t.closest('[data-gv-add]'); if (add) { state.memberQ = ''; return editMembers(add.dataset.gvAdd, null); }
      const rem = t.closest('[data-gv-remove]'); if (rem) return editMembers(null, rem.dataset.gvRemove);
    });
    host.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-gv-user],[data-gv-role]')) { e.preventDefault(); e.target.click(); } });
    let timer;
    host.addEventListener('input', e => {
      const key = e.target.dataset?.gv; if (!key) return;
      state[key] = e.target.value; 
      clearTimeout(timer); timer = setTimeout(() => { const pos = e.target.selectionStart; (key === 'memberQ' ? renderRoles : renderUsers)(); const again = host.querySelector(`[data-gv="${key}"]`); if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (_) {} } }, key === 'q' || key === 'memberQ' ? 180 : 0);
    });
    host.addEventListener('submit', e => {
      if (e.target.id !== 'gvRoleDisplay') return; e.preventDefault();
      const v = Object.fromEntries(new FormData(e.target)), roles = customRoles(), r = roles.find(x => x.id === state.roleView); if (!r) return;
      r.name = v.name.trim(); r.color = v.color || r.color; saveCustom(roles, 'Role saved.'); renderRoles();
    });
  }
  function mount() { bind(); show(state.tab); }
  return { mount, show, accounts: renderUsers, permissions: renderRoles, setMembership };
})();
if (typeof window !== 'undefined') window.AdminGovernance = AdminGovernance;
