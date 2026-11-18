/* ==================================================================
   Professor Dashboard
   Greeting banner, top performing students, class performances,
   month calendar and selected-day agenda. Reads the Professor page's
   own data (faculty, subjects, students, exams, sectionSubjects,
   facultyId) and the shared marksAwarded() helper from grading.js.
   ================================================================== */
const FacultyDashboard = (() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const SERIES = ['#865b45', '#2f8d83', '#c89571', '#3576a8', '#7560ad', '#b5534b'];
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const state = { cursor: null, selected: null, topSubject: 'all', perfSubject: null, hiddenSeries: new Set() };

  const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const percentOf = sub => Number(sub.total) > 0 ? (marksAwarded(sub) / Number(sub.total)) * 100 : 0;
  const average = list => list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : null;
  const formatTime = value => {
    const [h, m] = String(value || '').split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return String(value || '');
    return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };
  const formatDate = key => {
    const date = new Date(`${key}T00:00:00`);
    return Number.isNaN(date.getTime()) ? 'Always open' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };
  function courseColor(code) {
    const subject = subjects.find(item => item.code === code);
    const saved = /^#[0-9a-f]{6}$/i.test(String(subject?.workspaceColor || '')) ? subject.workspaceColor : '';
    return saved || ['#2f8d83', '#3576a8', '#7560ad', '#b2762e'][Math.max(0, subjects.findIndex(item => item.code === code)) % 4];
  }

  /* Everything is read fresh on each render so new grades and exams appear. */
  function context() {
    const me = faculty.find(item => item.id == facultyId) || {};
    const myExams = exams.filter(exam => exam.facultyId === facultyId);
    const examById = new Map(myExams.map(exam => [exam.id, exam]));
    const subs = DB.read('studentSubmissions', []).filter(sub => examById.has(sub.examId) && Number(sub.total) > 0);
    const offerings = SectionService.offeringsForFaculty(facultyId, sectionSubjects, DB.read('subjectAssignments', []));
    const roster = DB.read('students', students);
    return { me, myExams, examById, subs, offerings, roster };
  }
  function sectionFor(sub, exam, roster) {
    const studentSections = roster.find(item => item.id === sub.studentId)?.sections || [];
    const examSections = exam?.sections || [];
    return studentSections.find(id => examSections.includes(id)) || examSections[0] || 'Unassigned';
  }

  function renderHero(ctx) {
    const today = new Date();
    const name = ctx.me.last ? `Prof. ${ctx.me.last}` : 'Professor';
    const avg = average(ctx.subs.map(percentOf));
    const sections = new Set(ctx.offerings.map(item => item.sectionId));
    const subjectCodes = new Set([...ctx.offerings.map(item => item.subjectCode), ...(typeof mySubjects !== 'undefined' ? mySubjects.map(item => item.code) : [])]);
    document.getElementById('fdDate').textContent = today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    document.getElementById('fdGreeting').textContent = `Welcome back, ${name}`;
    document.getElementById('fdSummary').innerHTML = avg === null
      ? 'Your students have not submitted any examinations yet. Results will appear here as they come in.'
      : `Your students' average score is <strong>${avg.toFixed(1)}%</strong> across ${ctx.subs.length} graded attempt${ctx.subs.length === 1 ? '' : 's'}.`;
    document.getElementById('fdHeroStats').innerHTML = [
      [subjectCodes.size, 'Subjects'], [sections.size, 'Sections'], [ctx.myExams.length, 'Exams']
    ].map(([value, label]) => `<div class="fd-hero-stat"><strong>${value}</strong><span>${label}</span></div>`).join('');
  }

  /* Every subject this professor teaches, whether or not it has results yet. */
  function teachingCodes(ctx) {
    return new Set([
      ...(typeof mySubjects !== 'undefined' ? mySubjects.map(item => item.code) : []),
      ...ctx.offerings.map(item => item.subjectCode),
      ...ctx.myExams.map(exam => exam.subjectCode)
    ].filter(Boolean));
  }
  function gradedCodes(ctx) { return new Set(ctx.subs.map(sub => ctx.examById.get(sub.examId)?.subjectCode).filter(Boolean)); }
  function subjectOptions(codes, selected, includeAll, withResults) {
    const list = [...codes].sort();
    return (includeAll ? `<option value="all"${selected === 'all' ? ' selected' : ''}>All subjects</option>` : '') +
      list.map(code => { const subject = subjects.find(item => item.code === code), empty = !withResults.has(code); return `<option value="${esc(code)}"${code === selected ? ' selected' : ''}>${esc(code)}${subject ? ` · ${esc(subject.name)}` : ''}${empty ? ' (no results yet)' : ''}</option>`; }).join('');
  }
  const subjectLabel = code => { const subject = subjects.find(item => item.code === code); return subject ? `${code} · ${subject.name}` : code; };

  function renderTopPerformers(ctx) {
    const select = document.getElementById('fdTopFilter'), host = document.getElementById('fdTopChart');
    const codes = teachingCodes(ctx), graded = gradedCodes(ctx);
    if (state.topSubject !== 'all' && !codes.has(state.topSubject)) state.topSubject = 'all';
    select.innerHTML = subjectOptions(codes, state.topSubject, true, graded);
    const scoped = ctx.subs.filter(sub => state.topSubject === 'all' || ctx.examById.get(sub.examId)?.subjectCode === state.topSubject);
    const byStudent = new Map();
    scoped.forEach(sub => { const list = byStudent.get(sub.studentId) || []; list.push(percentOf(sub)); byStudent.set(sub.studentId, list); });
    const ranked = [...byStudent.entries()].map(([id, scores]) => {
      const person = ctx.roster.find(item => item.id === id);
      return { id, name: person ? `${person.first} ${person.last}` : id, score: average(scores), count: scores.length };
    }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 5);
    if (!ranked.length) { host.innerHTML = `<div class="fd-empty">${state.topSubject === 'all' ? 'No graded attempts yet.' : `No graded attempts in ${esc(subjectLabel(state.topSubject))} yet.`}</div>`; return; }
    host.innerHTML = ranked.map((row, index) => {
      const width = Math.max(1, Math.min(100, row.score));
      return `<div class="fd-top-row${index === 0 ? ' is-leader' : ''}" tabindex="0" aria-label="${esc(row.name)}: ${row.score.toFixed(1)}% average over ${row.count} attempt${row.count === 1 ? '' : 's'}">
        <span class="fd-top-name" title="${esc(row.name)} · ${esc(row.id)}">${esc(row.name)}</span>
        <div class="fd-top-track"><div class="fd-top-bar${width > 78 ? ' tip-inside' : ''}" style="width:${width}%"><span class="fd-top-tip">Score: ${row.score.toFixed(1)}%<small>${row.count} attempt${row.count === 1 ? '' : 's'}</small></span></div></div>
      </div>`;
    }).join('') + `<div class="fd-axis" aria-hidden="true"><span></span><div class="fd-axis-scale">${[0, 20, 40, 60, 80, 100].map(v => `<span>${v}%</span>`).join('')}</div></div>`;
  }

  function renderClassPerformance(ctx) {
    const select = document.getElementById('fdPerfSubject'), chart = document.getElementById('fdPerfChart'), legend = document.getElementById('fdPerfLegend'), table = document.getElementById('fdPerfTable');
    const counts = new Map(), examSets = new Map();
    ctx.subs.forEach(sub => { const code = ctx.examById.get(sub.examId)?.subjectCode; if (!code) return; counts.set(code, (counts.get(code) || 0) + 1); examSets.set(code, (examSets.get(code) || new Set()).add(sub.examId)); });
    const codes = teachingCodes(ctx);
    if (!codes.has(state.perfSubject)) state.perfSubject = counts.size
      ? [...counts.keys()].sort((a, b) => examSets.get(b).size - examSets.get(a).size || counts.get(b) - counts.get(a) || a.localeCompare(b))[0]
      : [...codes].sort()[0] || null;
    select.hidden = !codes.size;
    select.innerHTML = subjectOptions(codes, state.perfSubject, false, new Set(counts.keys()));
    if (!counts.has(state.perfSubject)) {
      chart.innerHTML = `<div class="fd-empty">${state.perfSubject ? `No graded examinations in ${esc(subjectLabel(state.perfSubject))} yet. Class performance appears once students submit.` : 'Class performance appears once students submit examinations.'}</div>`;
      legend.innerHTML = ''; table.innerHTML = ''; return;
    }

    const subjectSubs = ctx.subs.filter(sub => ctx.examById.get(sub.examId)?.subjectCode === state.perfSubject);
    const examList = [...new Set(subjectSubs.map(sub => sub.examId))].map(id => ctx.examById.get(id))
      .sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')) || String(a.title).localeCompare(String(b.title)));
    const sectionIds = [...new Set(subjectSubs.map(sub => sectionFor(sub, ctx.examById.get(sub.examId), ctx.roster)))].sort();
    const colorOf = id => SERIES[sectionIds.indexOf(id) % SERIES.length];
    const cell = (examId, sectionId) => average(subjectSubs.filter(sub => sub.examId === examId && sectionFor(sub, ctx.examById.get(examId), ctx.roster) === sectionId).map(percentOf));

    const W = Math.max(300, Math.round(chart.clientWidth || 640)), H = 240, L = 34, R = 14, T = 12, B = 30, plotW = W - L - R, plotH = H - T - B;
    const x = i => examList.length === 1 ? L + plotW / 2 : L + (plotW * i) / (examList.length - 1);
    const y = v => T + plotH - (plotH * v) / 100;
    const grid = [0, 20, 40, 60, 80, 100].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 3}" text-anchor="end">${v}</text>`).join('');
    const labels = examList.map((exam, i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(examList.length > 6 ? `E${i + 1}` : `Exam ${i + 1}`)}<title>${esc(exam.title)}</title></text>`).join('');
    const visible = sectionIds.filter(id => !state.hiddenSeries.has(`${state.perfSubject}|${id}`));
    const series = visible.map((sectionId, order) => {
      const pts = examList.map((exam, i) => { const v = cell(exam.id, sectionId); return v === null ? null : { x: x(i), y: y(v), v, exam }; }).filter(Boolean);
      if (!pts.length) return '';
      const color = colorOf(sectionId), line = pts.map(p => `${p.x},${p.y}`).join(' ');
      const area = order === 0 && pts.length > 1 ? `<polygon class="fd-area" fill="${color}" points="${pts[0].x},${y(0)} ${line} ${pts[pts.length - 1].x},${y(0)}"/>` : '';
      const dots = pts.map(p => `<circle class="fd-point" cx="${p.x}" cy="${p.y}" r="4" fill="${color}"><title>${esc(sectionId)} · ${esc(p.exam.title)}: ${p.v.toFixed(1)}%</title></circle>`).join('');
      return `${area}${pts.length > 1 ? `<polyline class="fd-line" stroke="${color}" points="${line}"/>` : ''}${dots}`;
    }).join('');
    chart.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Average score per section for each ${esc(state.perfSubject)} examination"><g class="fd-grid">${grid}</g>${series}${labels}</svg>`;
    watchWidth(chart);
    legend.innerHTML = sectionIds.map(id => { const key = `${state.perfSubject}|${id}`, on = !state.hiddenSeries.has(key); return `<button type="button" data-fd-series="${esc(key)}" aria-pressed="${on}" style="--series:${colorOf(id)}"><i aria-hidden="true"></i>${esc(id)}</button>`; }).join('');

    let previous = null;
    const rows = examList.map(exam => {
      const accuracy = average(subjectSubs.filter(sub => sub.examId === exam.id).map(percentOf));
      const delta = previous === null ? null : accuracy - previous; previous = accuracy;
      const deltaMark = delta === null || Math.abs(delta) < 0.05 ? '' : `<span class="fd-delta ${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(1)}</span>`;
      return `<tr><td>${esc(exam.title)}</td><td>${esc(exam.date ? formatDate(exam.date) : 'Always open')}</td><td>${accuracy.toFixed(1)}%${deltaMark}</td></tr>`;
    }).join('');
    table.innerHTML = `<table><thead><tr><th scope="col">Test name</th><th scope="col">Attempt date</th><th scope="col">Class accuracy</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  let resizeWatcher = null, lastWidth = 0;
  function watchWidth(chart) {
    if (resizeWatcher || typeof ResizeObserver === 'undefined') return;
    lastWidth = chart.clientWidth;
    resizeWatcher = new ResizeObserver(() => { const width = chart.clientWidth; if (width && Math.abs(width - lastWidth) > 8) { lastWidth = width; renderClassPerformance(context()); } });
    resizeWatcher.observe(chart);
  }

  const BOOK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6.5A3.5 3.5 0 0 1 14 7.5V20a4.5 4.5 0 0 0-3.5-1.5H4V4Zm16 0h-3.5A3.5 3.5 0 0 0 14 5.1a5.5 5.5 0 0 1 1 3.2V20a4.5 4.5 0 0 1 3.5-1.5H20V4Z"/></svg>';
  /* One card per subject taught, in the same course colors as My Subjects. */
  function renderClasses(ctx) {
    const host = document.getElementById('fdClassRow'); if (!host) return;
    const codes = [...teachingCodes(ctx)].sort();
    if (!codes.length) { host.innerHTML = '<div class="fd-empty">No subjects assigned yet.</div>'; return; }
    host.innerHTML = codes.map(code => {
      const subject = subjects.find(item => item.code === code);
      const sections = [...new Set(ctx.offerings.filter(item => item.subjectCode === code).map(item => item.sectionId))].sort();
      const examCount = ctx.myExams.filter(exam => exam.subjectCode === code).length;
      const sectionLabel = sections.length > 2 ? `${sections.length} sections` : sections.join(', ') || 'No section';
      return `<button type="button" class="fd-class-card" style="--course-color:${courseColor(code)}" data-fd-subject="${esc(code)}" aria-label="Open ${esc(code)} ${esc(subject?.name || '')}">
        <span class="fd-class-icon">${BOOK_ICON}</span>
        <span class="fd-class-code">${esc(code)} · ${esc(sectionLabel)}</span>
        <h3>${esc(subject?.name || code)}</h3>
        <p>${sections.length} section${sections.length === 1 ? '' : 's'} · ${examCount} exam${examCount === 1 ? '' : 's'}</p>
      </button>`;
    }).join('');
  }

  function meetingsOn(date, ctx) {
    const weekday = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    return ctx.offerings.flatMap(offer => {
      const schedule = offer.schedule;
      if (!schedule?.start || !schedule?.end || !(schedule.days || []).some(day => String(day).toLowerCase() === weekday)) return [];
      const subject = subjects.find(item => item.code === offer.subjectCode);
      return [{ subjectCode: offer.subjectCode, name: subject?.name || offer.subjectCode, sectionId: offer.sectionId, start: String(schedule.start), end: String(schedule.end), room: String(schedule.room || ''), color: courseColor(offer.subjectCode) }];
    }).sort((a, b) => a.start.localeCompare(b.start));
  }

  function renderCalendar(ctx) {
    const year = state.cursor.getFullYear(), month = state.cursor.getMonth();
    const todayKey = dateKey(new Date()), selectedKey = dateKey(state.selected);
    const examDates = new Set(ctx.myExams.map(exam => exam.date).filter(Boolean));
    document.getElementById('fdCalendarTitle').textContent = state.cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const cells = WEEKDAYS.map(day => `<div class="fd-weekday" aria-hidden="true">${day}</div>`);
    for (let blank = 0; blank < new Date(year, month, 1).getDay(); blank++) cells.push('<span aria-hidden="true"></span>');
    for (let day = 1, days = new Date(year, month + 1, 0).getDate(); day <= days; day++) {
      const date = new Date(year, month, day), key = dateKey(date), hasExam = examDates.has(key);
      const cls = ['fd-day', key === todayKey ? 'today' : '', key === selectedKey ? 'selected' : '', hasExam ? 'has-exam' : ''].filter(Boolean).join(' ');
      cells.push(`<button type="button" class="${cls}" data-fd-date="${key}" aria-pressed="${key === selectedKey}" aria-label="${esc(date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))}${hasExam ? ', examination scheduled' : ''}">${day}</button>`);
    }
    document.getElementById('fdCalendar').innerHTML = cells.join('');
  }

  function renderAgenda(ctx) {
    const key = dateKey(state.selected);
    document.getElementById('fdDayTitle').textContent = state.selected.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const classes = meetingsOn(state.selected, ctx);
    const dayExams = ctx.myExams.filter(exam => exam.date === key).sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));
    const classMarkup = classes.map(item => `<article class="fd-agenda-item">
        <div class="fd-agenda-time">${esc(formatTime(item.start))}</div>
        <div><strong title="${esc(item.name)}">${esc(item.name)}</strong><small>${esc(item.subjectCode)} · ${esc(item.sectionId)}</small><small>${esc(formatTime(item.start))}–${esc(formatTime(item.end))}${item.room ? ` · ${esc(item.room)}` : ''}</small></div>
        <button type="button" class="fd-agenda-open" data-fd-subject="${esc(item.subjectCode)}" aria-label="Open ${esc(item.subjectCode)} workspace">→</button>
      </article>`).join('');
    const examMarkup = dayExams.map(exam => `<article class="fd-agenda-item exam">
        <div class="fd-agenda-time">${esc(exam.start ? formatTime(exam.start) : 'All day')}</div>
        <div><strong>${esc(exam.title)}</strong><small>${esc(exam.subjectCode)}${exam.start && exam.end ? ` · ${esc(formatTime(exam.start))}–${esc(formatTime(exam.end))}` : ''}${(exam.sections || []).length ? ` · ${esc(exam.sections.join(', '))}` : ''}</small></div>
        <button type="button" class="fd-agenda-open" data-fd-exams aria-label="Open My Exams">→</button>
      </article>`).join('');
    document.getElementById('fdAgenda').innerHTML =
      (examMarkup ? `<p class="fd-agenda-group">Examinations</p>${examMarkup}` : '') +
      (classMarkup ? `<p class="fd-agenda-group">Classes</p>${classMarkup}` : '') ||
      '<div class="fd-empty">No classes or examinations on this day.</div>';
  }

  function render() {
    if (!document.getElementById('facultyDashboard')) return;
    if (!state.selected) { const today = new Date(); today.setHours(0, 0, 0, 0); state.selected = today; state.cursor = new Date(today.getFullYear(), today.getMonth(), 1); }
    const ctx = context();
    renderHero(ctx); renderTopPerformers(ctx); renderClassPerformance(ctx); renderClasses(ctx); renderCalendar(ctx); renderAgenda(ctx);
  }
  function renderSide() { const ctx = context(); renderCalendar(ctx); renderAgenda(ctx); }

  function bind() {
    const root = document.getElementById('dashboard-tab');
    if (!root || root.dataset.fdBound) return; root.dataset.fdBound = '1';
    root.addEventListener('change', event => {
      if (event.target.id === 'fdTopFilter') { state.topSubject = event.target.value; renderTopPerformers(context()); }
      if (event.target.id === 'fdPerfSubject') { state.perfSubject = event.target.value; renderClassPerformance(context()); }
    });
    root.addEventListener('click', event => {
      const target = event.target.closest('button'); if (!target) return;
      if (target.dataset.fdDate) { state.selected = new Date(`${target.dataset.fdDate}T00:00:00`); renderSide(); root.querySelector(`[data-fd-date="${target.dataset.fdDate}"]`)?.focus(); }
      else if (target.dataset.fdMonth) { state.cursor.setMonth(state.cursor.getMonth() + Number(target.dataset.fdMonth)); state.selected = new Date(state.cursor.getFullYear(), state.cursor.getMonth(), 1); renderSide(); }
      else if (target.hasAttribute('data-fd-today')) { const today = new Date(); today.setHours(0, 0, 0, 0); state.selected = today; state.cursor = new Date(today.getFullYear(), today.getMonth(), 1); renderSide(); }
      else if (target.dataset.fdSeries) { const key = target.dataset.fdSeries; state.hiddenSeries.has(key) ? state.hiddenSeries.delete(key) : state.hiddenSeries.add(key); renderClassPerformance(context()); }
      else if (target.dataset.fdSubject) { FacultySubjectWorkspace.open(target.dataset.fdSubject); }
      else if (target.hasAttribute('data-fd-exams')) { facultyNav?.show('exams-tab'); }
      else if (target.hasAttribute('data-fd-subjects')) { facultyNav?.show('subjects-tab'); }
    });
  }

  return { render: () => { bind(); render(); } };
})();
