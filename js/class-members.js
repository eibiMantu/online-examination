/* ==================================================================
   Class tab: one members table for the Student and Professor subject
   pages. Lists everyone in the subject (professors, then students)
   with role pills, the shared table tools (search, sort, direction,
   group by) and clickable rows.
   - Professor view: every professor of the subject + the students in
     the sections this professor handles. Student rows open the
     academic profile.
   - Student view: the professors of the subject + classmates in the
     student's own section. Student rows open the limited profile;
     professor rows open the mail composer.
   ================================================================== */
const ClassMembers = (() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const ROLE_ORDER = { Professor: 0, Student: 1 };
  const filters = new Map();   // table key → active role pill

  function data() {
    const offerings = SectionService.offerings(DB.read('sectionSubjects', []));
    return { offerings, faculty: DB.read('faculty', []), students: DB.read('students', []), enrollments: DB.read('studentEnrollments', []) };
  }
  function professorsFor(d, code, sectionIds) {
    const ids = [...new Set(d.offerings.filter(o => o.subjectCode === code && o.facultyId).map(o => o.facultyId))];
    return ids.map(id => {
      const person = d.faculty.find(f => f.id === id), handled = [...new Set(d.offerings.filter(o => o.subjectCode === code && o.facultyId === id).map(o => o.sectionId))].sort();
      if (sectionIds && !handled.some(s => sectionIds.includes(s))) return null;
      return person && { id, first: person.first, last: person.last, role: 'Professor', section: handled.join(', ') };
    }).filter(Boolean);
  }
  function studentsFor(d, code, sectionIds) {
    return d.enrollments.filter(e => e.subjectCode === code && sectionIds.includes(e.sectionId)).map(e => {
      const person = d.students.find(s => s.id === e.studentId);
      return person && { id: person.id, first: person.first, last: person.last, role: 'Student', section: e.sectionId };
    }).filter(Boolean).filter((row, i, all) => all.findIndex(other => other.id === row.id) === i);
  }

  function render(host, { key, title, rows, onOpen, rowClass = () => '' }) {
    if (!host) return;
    rows.sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.last.localeCompare(b.last) || a.first.localeCompare(b.first));
    const count = role => rows.filter(r => r.role === role).length;
    const pills = [['all', `All · ${rows.length}`], ['Professor', `Professors · ${count('Professor')}`], ['Student', `Students · ${count('Student')}`]];
    const active = filters.get(key) || 'all';
    const body = rows.map((r, i) => `<tr class="cm-row ${rowClass(r)}" data-role="${r.role}" data-index="${i}" tabindex="0" role="button" aria-label="${esc(`${r.first} ${r.last}, ${r.role}`)}"><td><span class="cm-person"><span class="cm-avatar ${r.role.toLowerCase()}" aria-hidden="true">${esc(`${(r.first || '')[0] || ''}${(r.last || '')[0] || ''}`.toUpperCase())}</span><span><strong>${esc(r.last)}, ${esc(r.first)}</strong></span></span></td><td>${esc(r.id)}</td><td><span class="cm-role ${r.role.toLowerCase()}">${r.role}</span></td><td>${esc(r.section || '—')}</td></tr>`).join('');
    host.innerHTML = `<section class="cm-card"><header class="cm-head"><div><h3>${esc(title)}</h3><p>${rows.length} member${rows.length === 1 ? '' : 's'} · ${count('Professor')} professor${count('Professor') === 1 ? '' : 's'} · ${count('Student')} student${count('Student') === 1 ? '' : 's'}</p></div><div class="cm-tools role-table-tools"></div></header>
      <div class="cm-filters" role="group" aria-label="Filter by role">${pills.map(([value, label]) => `<button type="button" data-cm-filter="${value}" class="${value === active ? 'active' : ''}" aria-pressed="${value === active}">${label}</button>`).join('')}</div>
      <div class="cm-scroll"><table class="cm-table"><thead><tr><th scope="col">Member</th><th scope="col">ID</th><th scope="col">Role</th><th scope="col">Section</th></tr></thead><tbody>${body || '<tr><td colspan="4" class="cm-empty">No members yet.</td></tr>'}</tbody></table></div></section>`;
    const table = host.querySelector('.cm-table'), apply = value => {
      filters.set(key, value);
      host.querySelectorAll('[data-cm-filter]').forEach(b => { const on = b.dataset.cmFilter === value; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
      table.querySelectorAll('tbody tr[data-role]').forEach(tr => tr.classList.toggle('cm-out', value !== 'all' && tr.dataset.role !== value));
    };
    host.querySelector('.cm-filters').onclick = e => { const b = e.target.closest('[data-cm-filter]'); if (b) apply(b.dataset.cmFilter); };
    const open = tr => { const r = rows[Number(tr.dataset.index)]; if (r) onOpen?.(r); };
    table.onclick = e => { const tr = e.target.closest('tr[data-index]'); if (tr) open(tr); };
    table.onkeydown = e => { const tr = e.target.closest('tr[data-index]'); if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(tr); } };
    if (typeof AdminTableTools !== 'undefined') AdminTableTools.mount(key, table, host.querySelector('.cm-tools'));
    apply(active);
  }

  /* Professor subject page. */
  function mountFaculty(host, code) {
    const d = data(), mine = [...new Set(d.offerings.filter(o => o.subjectCode === code && o.facultyId === facultyId).map(o => o.sectionId))].sort();
    const rows = [...professorsFor(d, code, null), ...studentsFor(d, code, mine)];
    render(host, {
      key: 'class-members-faculty', title: 'Class members', rows,
      onOpen: r => { if (r.role === 'Student') RoleProfileViewer.openStudent(r.id, { viewerRole: 'faculty', viewerId: facultyId, subjectCode: code, sectionId: r.section }); }
    });
  }

  /* Student subject page. */
  function mountStudent(host, code, sectionId, me) {
    const d = data(), rows = [...professorsFor(d, code, [sectionId]), ...studentsFor(d, code, [sectionId]).filter(r => r.id !== me)];
    render(host, {
      key: 'class-members-student', title: 'Class members', rows,
      rowClass: r => r.role === 'Student' ? 'cm-classmate' : '',
      onOpen: r => r.role === 'Student'
        ? RoleProfileViewer.openStudent(r.id, { viewerRole: 'student', viewerId: me, subjectCode: code, sectionId })
        : (typeof openEmailComposer === 'function' && openEmailComposer(r.id, code))
    });
  }

  return { render, mountFaculty, mountStudent };
})();
