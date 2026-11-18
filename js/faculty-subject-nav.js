/* ==================================================================
   Professor sidebar: subjects nested under "My Subjects", like the
   Student sidebar. Each item opens that subject's workspace, shows a
   count of exams open today, and is highlighted while that subject is
   open. A chevron collapses or expands the list.
   Uses the Professor page globals (mySubjects, subjects, exams,
   facultyId, facultyNav, FacultySubjectWorkspace) at call time.
   ================================================================== */
const FacultySubjectNav = (() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  let activeCode = null;

  function courseColor(code) {
    const subject = subjects.find(item => item.code === code);
    if (/^#[0-9a-f]{6}$/i.test(String(subject?.workspaceColor || ''))) return subject.workspaceColor;
    return ['#2f8d83', '#3576a8', '#7560ad', '#b2762e'][Math.max(0, subjects.findIndex(item => item.code === code)) % 4];
  }
  const openCount = code => exams.filter(exam => exam.facultyId === facultyId && exam.subjectCode === code && exam.status !== 'draft' && (!exam.date || exam.date === today())).length;

  function mount() {
    const sidebar = document.getElementById('sidebar'), link = sidebar?.querySelector('[data-panel="subjects-tab"]');
    if (!link || sidebar.querySelector('.faculty-subject-nav-group')) return;
    const codes = (typeof mySubjects !== 'undefined' ? mySubjects : []).map(item => item.code);
    if (!codes.length) return;
    const group = document.createElement('section'), toggle = document.createElement('button'), tree = document.createElement('div');
    group.className = 'faculty-subject-nav-group';
    toggle.type = 'button'; toggle.className = 'faculty-subject-tree-toggle';
    toggle.setAttribute('aria-label', 'Collapse subjects'); toggle.setAttribute('aria-expanded', 'true');
    toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>';
    tree.className = 'faculty-subject-tree'; tree.setAttribute('aria-label', 'Your subjects');
    link.parentNode.insertBefore(group, link); group.append(link, toggle, tree);
    tree.innerHTML = codes.map(code => {
      const subject = subjects.find(item => item.code === code), count = openCount(code);
      return `<button type="button" class="faculty-subject-tree-item" data-subject="${esc(code)}" style="--tree-tone:${courseColor(code)}" title="${esc(code)} · ${esc(subject?.name || code)}"><span class="subject-tree-dot" aria-hidden="true"></span><span class="subject-tree-name">${esc(subject?.name || code)}</span>${count ? `<span class="subject-tree-count" aria-label="${count} examination${count === 1 ? '' : 's'} open today">${count}</span>` : ''}</button>`;
    }).join('');
    tree.addEventListener('click', event => {
      const item = event.target.closest('.faculty-subject-tree-item'); if (!item) return;
      FacultySubjectWorkspace.open(item.dataset.subject);
      if (window.matchMedia?.('(max-width: 760px)').matches) facultyNav?.close?.();
    });
    toggle.onclick = () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      toggle.setAttribute('aria-label', expanded ? 'Expand subjects' : 'Collapse subjects');
      tree.hidden = expanded; group.classList.toggle('is-collapsed', expanded);
    };
    mark(activeCode);
  }

  /* Highlight the open subject (null clears it). */
  function mark(code) {
    activeCode = code || null;
    document.querySelectorAll('.faculty-subject-tree-item').forEach(item => {
      const on = item.dataset.subject === activeCode;
      item.classList.toggle('active', on);
      if (on) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
    });
    if (activeCode) document.querySelector('#sidebar [data-panel="subjects-tab"]')?.classList.add('active');
  }

  return { mount, mark };
})();
