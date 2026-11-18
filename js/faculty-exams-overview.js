/* ==================================================================
   Professor "My Exams" in the Student Examinations layout:
   status cards (Open now / Upcoming / Closed) with rings, a performance
   chart, filter tabs with counts + search/sort/direction/group tools,
   and one row card per exam. Rows keep the existing behaviour: clicking
   opens the question bank and the settings menu (examActionsMenu) is
   unchanged. Uses the Professor page globals (exams, subjects, facultyId,
   questions, DB) and marksAwarded() from grading.js at call time.
   ================================================================== */
const FacultyExamsOverview = (() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const state = { filter: 'all', query: '', sort: 'date', dir: -1, group: false, searchOpen: false, sortOpen: false };
  const STATUS_LABEL = { open: 'Open', upcoming: 'Upcoming', closed: 'Closed', draft: 'Draft' };
  const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const percentOf = sub => Number(sub.total) > 0 ? (marksAwarded(sub) / Number(sub.total)) * 100 : 0;
  const mean = list => list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
  const formatDate = key => { const d = new Date(`${key}T00:00:00`); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };
  const formatTime = value => { const [h, m] = String(value || '').split(':').map(Number); if (Number.isNaN(h) || Number.isNaN(m)) return ''; return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };

  function statusOf(exam, today) {
    if (exam.status === 'draft') return 'draft';
    if (!exam.date || exam.date === today) return 'open';
    return exam.date > today ? 'upcoming' : 'closed';
  }

  function context() {
    const today = todayKey();
    const mine = exams.filter(exam => exam.facultyId === facultyId);
    const ids = new Set(mine.map(exam => exam.id));
    const subs = DB.read('studentSubmissions', []).filter(sub => ids.has(sub.examId) && Number(sub.total) > 0);
    const allQuestions = DB.read('questions', typeof questions !== 'undefined' ? questions : []);
    const enrollments = DB.read('studentEnrollments', []);
    const rows = mine.map(exam => {
      const attempts = subs.filter(sub => sub.examId === exam.id);
      const takers = new Set(enrollments.filter(item => item.subjectCode === exam.subjectCode && (exam.sections || []).includes(item.sectionId)).map(item => item.studentId)).size;
      const scores = attempts.map(percentOf);
      return {
        exam, status: statusOf(exam, today), subject: subjects.find(item => item.code === exam.subjectCode),
        items: allQuestions.filter(q => q.examId === exam.id).length,
        submitted: new Set(attempts.map(sub => sub.studentId)).size, takers,
        average: mean(scores),
        passing: scores.length ? (scores.filter((v, i) => v >= (Number(exam.passingPercent) || 70)).length / scores.length) * 100 : null
      };
    });
    return { rows, subs };
  }

  /* ---------- Status cards ---------- */
  function ring(value, total, color) {
    const r = 26, c = 2 * Math.PI * r, share = total ? value / total : 0;
    return `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="${r}" class="fx-ring-track"/>${share > 0 ? `<circle cx="32" cy="32" r="${r}" class="fx-ring-value" stroke="${color}" stroke-dasharray="${c * share} ${c}" transform="rotate(-90 32 32)"/>` : ''}</svg><span class="fx-ring-label"><strong>${value}</strong><small>${Math.round(share * 100)}%</small></span>`;
  }
  function statusCards(ctx) {
    const live = ctx.rows.filter(row => row.status !== 'draft'), count = key => live.filter(row => row.status === key).length;
    const cards = [
      ['open', 'Open now', 'Available to students today', 'var(--accent)'],
      ['upcoming', 'Upcoming', 'Scheduled for a later date', 'var(--role-shell-yellow, #c89571)'],
      ['closed', 'Closed', 'Windows that have ended', '#8a7a6d']
    ];
    return `<section class="fx-status-grid" aria-label="Examination status overview">${cards.map(([key, title, copy, color]) =>
      `<button type="button" class="fx-status-card${state.filter === key ? ' active' : ''}" data-fx-filter="${key}"><span class="fx-ring">${ring(count(key), live.length, color)}</span><span><strong>${title}</strong><small>${copy}</small></span></button>`).join('')}</section>`;
  }

  /* ---------- Performance chart (by exam week) ---------- */
  function weekStart(key) { const d = new Date(`${key}T00:00:00`); d.setDate(d.getDate() - d.getDay()); return d; }
  function chart(ctx) {
    const byWeek = new Map();
    ctx.rows.filter(row => row.exam.date && row.average !== null).forEach(row => {
      const start = weekStart(row.exam.date), key = start.toISOString().slice(0, 10);
      const entry = byWeek.get(key) || { start, scores: [], passed: 0, total: 0 };
      ctx.subs.filter(sub => sub.examId === row.exam.id).forEach(sub => { const p = percentOf(sub); entry.scores.push(p); entry.total++; if (p >= (Number(row.exam.passingPercent) || 70)) entry.passed++; });
      byWeek.set(key, entry);
    });
    const weeks = [...byWeek.values()].sort((a, b) => a.start - b.start).map(w => ({ label: w.start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), average: mean(w.scores), passing: w.total ? (w.passed / w.total) * 100 : 0, attempts: w.total }));
    const head = `<header class="fx-chart-head"><div><span class="fx-eyebrow">This academic period</span><h2>Examination performance</h2></div><div class="fx-legend"><span><i style="background:var(--fx-avg)"></i>Average score</span><span><i style="background:var(--fx-pass)"></i>Passing rate</span></div></header>`;
    if (!weeks.length) return `<section class="fx-chart-card">${head}<p class="fx-empty">Results appear here once students submit your examinations.</p></section>`;
    const W = 1000, H = 230, L = 40, R = 18, T = 14, B = 30, pw = W - L - R, ph = H - T - B;
    const x = i => weeks.length === 1 ? L + pw / 2 : L + (pw * i) / (weeks.length - 1), y = v => T + ph - (ph * v) / 100;
    const grid = [0, 25, 50, 75, 100].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 10}" y="${y(v) + 4}" text-anchor="end">${v}%</text>`).join('');
    const line = (key, color) => { const pts = weeks.map((w, i) => `${x(i)},${y(w[key])}`).join(' '); return `${weeks.length > 1 ? `<polyline class="fx-line" stroke="${color}" points="${pts}"/>` : ''}${weeks.map((w, i) => `<circle class="fx-point" cx="${x(i)}" cy="${y(w[key])}" r="4.5" fill="${color}"><title>Week of ${w.label}: ${key === 'average' ? 'average score' : 'passing rate'} ${w[key].toFixed(1)}% · ${w.attempts} attempts</title></circle>`).join('')}`; };
    const labels = weeks.map((w, i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(w.label)}</text>`).join('');
    return `<section class="fx-chart-card">${head}<div class="fx-chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Average score and passing rate by exam week"><g class="fx-grid">${grid}</g>${line('average', 'var(--fx-avg)')}${line('passing', 'var(--fx-pass)')}${labels}</svg></div></section>`;
  }

  /* ---------- Filter tabs + tools ---------- */
  const ICONS = {
    search: '<path d="m20 19-4.3-4.3a7 7 0 1 0-1.4 1.4L18.6 20 20 19ZM5 10.5a5.5 5.5 0 1 1 11 0 5.5 5.5 0 0 1-11 0Z"/>',
    sort: '<path d="M7 4h2v13l3-3 1.4 1.4L8 21l-5.4-5.6L4 14l3 3V4Zm7 1h7v2h-7V5Zm0 6h5v2h-5v-2Zm0 6h3v2h-3v-2Z"/>',
    dir: '<path d="m7 4 4 4H8v12H6V8H3l4-4Zm8 1h6v2h-6V5Zm0 6h5v2h-5v-2Zm0 6h4v2h-4v-2Z"/>',
    group: '<path d="M4 4h7v7H4V4Zm2 2v3h3V6H6Zm7-2h7v7h-7V4Zm2 2v3h3V6h-3ZM4 13h7v7H4v-7Zm2 2v3h3v-3H6Zm7-2h7v7h-7v-7Zm2 2v3h3v-3h-3Z"/>',
    add: '<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z"/>'
  };
  const icon = path => `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
  function controls(ctx) {
    const count = key => key === 'all' ? ctx.rows.length : ctx.rows.filter(row => row.status === key).length;
    const tabs = [['all', 'All'], ['open', 'Open'], ['upcoming', 'Upcoming'], ['closed', 'Closed'], ['draft', 'Drafts']]
      .map(([key, label]) => `<button type="button" class="fx-tab${state.filter === key ? ' active' : ''}" data-fx-filter="${key}" aria-pressed="${state.filter === key}">${label}<span>${count(key)}</span></button>`).join('');
    return `<div class="fx-controls"><nav class="fx-tabs" aria-label="Filter examinations">${tabs}</nav><div class="fx-tools role-table-tools">
      <div class="table-search-box"${state.searchOpen ? '' : ' hidden'}><input type="search" id="fxSearch" placeholder="Search title or subject…" aria-label="Search examinations" value="${esc(state.query)}"></div>
      <button type="button" class="tool-icon${state.searchOpen ? ' active' : ''}" data-fx-tool="search" aria-label="Search" title="Search">${icon(ICONS.search)}</button>
      <label class="table-tool-select"${state.sortOpen ? '' : ' hidden'}><span>Sort by</span><select id="fxSort"><option value="date"${state.sort === 'date' ? ' selected' : ''}>Date</option><option value="title"${state.sort === 'title' ? ' selected' : ''}>Title</option><option value="subject"${state.sort === 'subject' ? ' selected' : ''}>Subject</option><option value="average"${state.sort === 'average' ? ' selected' : ''}>Class average</option></select></label>
      <button type="button" class="tool-icon${state.sortOpen ? ' active' : ''}" data-fx-tool="sort" aria-label="Choose sort field" title="Sort">${icon(ICONS.sort)}</button>
      <button type="button" class="tool-icon${state.dir < 0 ? ' descending' : ''}" data-fx-tool="dir" aria-label="${state.dir > 0 ? 'Sort ascending' : 'Sort descending'}" title="${state.dir > 0 ? 'Ascending' : 'Descending'}">${icon(ICONS.dir)}</button>
      <button type="button" class="tool-icon${state.group ? ' active' : ''}" data-fx-tool="group" aria-pressed="${state.group}" aria-label="Group by subject" title="Group by subject">${icon(ICONS.group)}</button>
      <button type="button" class="add-exam-btn exam-icon-btn fx-add" onclick="openExamModal()" aria-label="Create exam" title="Create exam">${icon(ICONS.add)}</button>
    </div></div>`;
  }

  /* ---------- Exam rows ---------- */
  function row(item) {
    const { exam, status, subject } = item;
    const when = exam.date ? `${formatDate(exam.date)}${exam.start ? ` · ${formatTime(exam.start)}${exam.end ? `–${formatTime(exam.end)}` : ''}` : ''}` : 'Always open';
    const meta = [`${esc(exam.subjectCode)} — ${esc(subject?.name || 'Unknown subject')}`, `${item.items} item${item.items === 1 ? '' : 's'}`, Number(exam.durationMinutes) > 0 ? `${exam.durationMinutes} min` : 'No time limit', esc(when)];
    const stats = status === 'draft' ? '<span class="fx-row-stat muted">Not published</span>'
      : `<span class="fx-row-stat"><strong>${item.submitted}${item.takers ? `/${item.takers}` : ''}</strong> submitted</span>${item.average === null ? '' : `<span class="fx-row-score">${item.average.toFixed(1)}% avg</span>`}`;
    return `<div class="exam-item fx-row status-${status}" data-exam-id="${esc(exam.id)}" role="button" tabindex="0" onclick="if(!event.target.closest('.exam-item-actions'))manageQuestions('${esc(exam.id)}')" onkeydown="if((event.key==='Enter'||event.key===' ')&&!event.target.closest('.exam-item-actions')){event.preventDefault();manageQuestions('${esc(exam.id)}')}">
      <div class="exam-item-info"><h4>${esc(exam.title)}</h4><div class="fx-meta">${meta.map(part => `<span>${part}</span>`).join('')}<span class="fx-pill ${status}">${STATUS_LABEL[status]}</span></div>${exam.desc ? `<div class="fx-desc">${esc(exam.desc)}</div>` : ''}</div>
      <div class="fx-row-side">${stats}</div>
      <div class="exam-item-actions">${examActionsMenu(exam.id)}</div>
    </div>`;
  }
  function list(ctx) {
    const q = state.query.trim().toLowerCase();
    let rows = ctx.rows.filter(item => (state.filter === 'all' || item.status === state.filter) &&
      (!q || `${item.exam.title} ${item.exam.subjectCode} ${item.subject?.name || ''} ${item.exam.desc || ''}`.toLowerCase().includes(q)));
    const key = item => state.sort === 'title' ? item.exam.title : state.sort === 'subject' ? item.exam.subjectCode : state.sort === 'average' ? (item.average ?? -1) : (item.exam.date || '9999-12-31');
    rows.sort((a, b) => { const ka = key(a), kb = key(b); return (typeof ka === 'number' ? ka - kb : String(ka).localeCompare(String(kb), undefined, { numeric: true })) * state.dir; });
    if (!rows.length) return `<div class="no-exams fx-empty-list">${ctx.rows.length ? 'No examinations match this view.' : 'No exams created yet. Use the + button to create one.'}</div>`;
    if (!state.group) return `<div class="fx-list">${rows.map(row).join('')}</div>`;
    const groups = new Map(); rows.forEach(item => groups.set(item.exam.subjectCode, [...(groups.get(item.exam.subjectCode) || []), item]));
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([code, items]) =>
      `<div class="fx-group"><h4>${esc(code)} - ${esc(items[0].subject?.name || 'Unknown Subject')}<span>${items.length}</span></h4><div class="fx-list">${items.map(row).join('')}</div></div>`).join('');
  }

  /* ---------- Render + events ---------- */
  function render() {
    const host = document.getElementById('examsView'); if (!host) return;
    const ctx = context();
    const focusSearch = document.activeElement?.id === 'fxSearch';
    host.innerHTML = `<div class="exams-section fx-page">${statusCards(ctx)}${chart(ctx)}${controls(ctx)}<div id="fxListHost">${list(ctx)}</div></div>`;
    if (focusSearch || state.searchOpen) { const input = document.getElementById('fxSearch'); if (input && (focusSearch || state.justOpened)) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); } }
    state.justOpened = false;
  }
  function bind() {
    const host = document.getElementById('examsView'); if (!host || host.dataset.fxBound) return; host.dataset.fxBound = '1';
    host.addEventListener('click', event => {
      if (!host.querySelector('.fx-page')) return;
      const filter = event.target.closest('[data-fx-filter]');
      if (filter) { state.filter = state.filter === filter.dataset.fxFilter && filter.classList.contains('fx-status-card') ? 'all' : filter.dataset.fxFilter; render(); return; }
      const tool = event.target.closest('[data-fx-tool]'); if (!tool) return;
      const kind = tool.dataset.fxTool;
      if (kind === 'search') { state.searchOpen = !state.searchOpen; state.sortOpen = false; state.justOpened = state.searchOpen; if (!state.searchOpen) state.query = ''; }
      if (kind === 'sort') { state.sortOpen = !state.sortOpen; state.searchOpen = false; }
      if (kind === 'dir') state.dir *= -1;
      if (kind === 'group') state.group = !state.group;
      render();
    });
    host.addEventListener('input', event => { if (event.target.id === 'fxSearch') { state.query = event.target.value; document.getElementById('fxListHost').innerHTML = list(context()); } });
    host.addEventListener('change', event => { if (event.target.id === 'fxSort') { state.sort = event.target.value; render(); } });
  }
  return { render: () => { bind(); render(); } };
})();
