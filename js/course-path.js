/* ==================================================================
   Course path: one "Weekly lessons" card for Student and Professor.
   - A calendar of week pills (W1, W2, …) with date ranges, the current
     week marked, and (Student) finished weeks filled in.
   - Opens on the current week; arrows / pills switch the week shown.
   - The selected week's lessons are listed and open the slideshow.
   - Student note: "You are behind by N lessons" / "You are ahead by N".
   The current week comes from the active academic period's startDate.

   CoursePath.render(container, {
     subjectCode, mode: 'student' | 'faculty',
     weeks: [{ week, title, lessons:[{ id, title, done, quiz }] }],
     selected,                       // week to show (defaults to current)
     onSelect(week), onOpen(lessonId)
   })
   ================================================================== */
const CoursePath = (() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const DAY = 86400000;
  const selection = new Map();     // subjectCode → selected week (kept while browsing)

  function startDate() {
    const periods = (typeof DB !== 'undefined' && DB.read('academicPeriods', [])) || [];
    const settings = (typeof DB !== 'undefined' && DB.read('systemSettings', {})) || {};
    const period = periods.find(item => item.status === 'active') || periods.find(item => item.id === settings.currentAcademicPeriodId);
    const start = period?.startDate ? new Date(`${period.startDate}T00:00:00`) : null;
    return start && !Number.isNaN(start.getTime()) ? start : null;
  }
  /* Week the calendar says we are in, limited to the weeks that exist. */
  function currentWeek(weeks) {
    const start = startDate(); if (!start || !weeks.length) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const n = Math.floor((today - start) / (7 * DAY)) + 1, numbers = weeks.map(w => Number(w.week));
    if (n < Math.min(...numbers)) return Math.min(...numbers);
    return Math.min(n, Math.max(...numbers));
  }
  function range(week) {
    const start = startDate(); if (!start) return '';
    const from = new Date(start.getTime() + (week - 1) * 7 * DAY), to = new Date(from.getTime() + 6 * DAY);
    const f = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${f(from)} – ${f(to)}`;
  }

  /* Lessons expected by now vs. lessons done (quizzes are not counted). */
  function pace(weeks, current) {
    if (current === null) return null;
    const lessons = weeks.flatMap(w => w.lessons.filter(l => !l.quiz).map(l => ({ ...l, week: Number(w.week) })));
    const due = lessons.filter(l => l.week <= current), behind = due.filter(l => !l.done).length;
    const ahead = lessons.filter(l => l.week > current && l.done).length;
    if (behind > 0) return { tone: 'behind', text: `You are behind by ${behind} lesson${behind === 1 ? '' : 's'}`, sub: `Finish the lessons up to Week ${current} to catch up.` };
    if (ahead > 0) return { tone: 'ahead', text: `You are ahead by ${ahead} lesson${ahead === 1 ? '' : 's'}`, sub: 'Great pace. Keep it up.' };
    return null;   // exactly on track: no note
  }

  function render(container, options) {
    if (!container) return;
    const { subjectCode, mode = 'student', weeks = [] } = options;
    const student = mode === 'student', current = currentWeek(weeks);
    const numbers = weeks.map(w => Number(w.week));
    let selected = Number(options.selected ?? selection.get(subjectCode) ?? current ?? numbers[0]);
    if (!numbers.includes(selected)) selected = numbers[0];
    selection.set(subjectCode, selected);
    container.dataset.coursePath = subjectCode || '';

    if (!weeks.length) {
      container.innerHTML = `<header class="cp-head"><div><span>Course path</span><strong>Weekly lessons</strong></div></header><p class="cp-empty">No lessons yet.</p>`;
      return;
    }
    const isDone = w => student && w.lessons.some(l => !l.quiz) && w.lessons.filter(l => !l.quiz).every(l => l.done);
    const pills = weeks.map(w => {
      const n = Number(w.week), classes = ['cp-pill', 'student-week-link', n === selected ? 'active selected' : '', n === current ? 'current' : '', isDone(w) ? 'done' : ''].filter(Boolean).join(' ');
      const label = `Week ${n}: ${w.title}${n === current ? ' (this week)' : ''}${isDone(w) ? ', completed' : ''}`;
      return `<button type="button" class="${classes}" data-week="${n}" aria-pressed="${n === selected}" aria-label="${esc(label)}" title="${esc(label)}"><b>W${n}</b><small>${isDone(w) ? '&#10003;' : n === current ? 'Now' : esc(range(n).split(' – ')[0] || '')}</small></button>`;
    }).join('');
    const week = weeks.find(w => Number(w.week) === selected), lessons = week.lessons;
    const doneCount = lessons.filter(l => !l.quiz && l.done).length, lessonCount = lessons.filter(l => !l.quiz).length;
    const note = student ? pace(weeks, current) : null;
    const list = lessons.map((l, i) => `<li><button type="button" class="cp-lesson${l.done ? ' done' : ''}${l.quiz ? ' quiz' : ''}" data-cp-open="${esc(l.id)}"><span class="cp-lesson-mark">${l.done ? '&#10003;' : l.quiz ? '&#9998;' : i + 1}</span><span>${esc(l.title)}</span></button></li>`).join('');
    const status = selected === current ? '<span class="cp-tag now">This week</span>' : current !== null && selected < current ? '<span class="cp-tag past">Past</span>' : current !== null ? '<span class="cp-tag next">Upcoming</span>' : '';

    container.innerHTML = `
      <header class="cp-head student-week-rail-head"><div><span>Course path</span><strong>Weekly lessons</strong></div><div class="cp-arrows student-week-nav-controls"><button type="button" data-cp-step="-1" aria-label="Previous week" ${selected === numbers[0] ? 'disabled' : ''}>&#8249;</button><button type="button" data-cp-step="1" aria-label="Next week" ${selected === numbers[numbers.length - 1] ? 'disabled' : ''}>&#8250;</button></div></header>
      <div class="cp-calendar student-week-links" role="group" aria-label="Weeks">${pills}</div>
      <div class="cp-legend"><span><i class="now"></i>This week</span>${student ? '<span><i class="done"></i>Completed</span>' : ''}<span><i class="sel"></i>Showing</span></div>
      ${note ? `<div class="cp-note ${note.tone}" role="status"><strong>${esc(note.text)}</strong><small>${esc(note.sub)}</small></div>` : ''}`;

    container.onclick = event => {
      const pill = event.target.closest('.cp-pill'), step = event.target.closest('[data-cp-step]'), open = event.target.closest('[data-cp-open]');
      if (open) return options.onOpen?.(open.dataset.cpOpen);
      let next = null;
      if (pill) next = Number(pill.dataset.week);
      if (step) { const at = numbers.indexOf(selected) + Number(step.dataset.cpStep); if (at >= 0 && at < numbers.length) next = numbers[at]; }
      if (next === null) return;
      selection.set(subjectCode, next);
      if (options.onSelect) options.onSelect(next); else render(container, { ...options, selected: next });
    };
    container.querySelector('.cp-pill.selected')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  return { render, currentWeek, select: (code, week) => selection.set(code, Number(week)), selected: code => selection.get(code) };
})();
