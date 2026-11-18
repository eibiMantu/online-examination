/* ==================================================================
   My Students analytics for the Professor page:
   - "Students performance" bars per section (passing rate, average
     score or exam completion);
   - "All students" donut of unique students per section;
   - roster rows with initials, exams taken and an average-score bar,
     plus sorting and search.
   Uses the Professor page's globals (facultyId, exams, DB) and
   marksAwarded() from grading.js at call time.
   ================================================================== */
let rosterPerformanceMetric = 'passing';
const ROSTER_COLORS = ['#865b45', '#c89571', '#2f8d83', '#3576a8', '#7560ad', '#b5534b'];
const rosterEsc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const rosterPercent = sub => Number(sub.total) > 0 ? (marksAwarded(sub) / Number(sub.total)) * 100 : 0;
const rosterMean = list => list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;

function rosterAnalytics(myOfferings, enrollments) {
  const myExams = DB.read('exams', exams).filter(exam => exam.facultyId === facultyId);
  const examById = new Map(myExams.map(exam => [exam.id, exam]));
  const subs = DB.read('studentSubmissions', []).filter(sub => examById.has(sub.examId) && Number(sub.total) > 0);
  const key = (sectionId, code) => `${sectionId}|${code}`;
  const taught = new Set(myOfferings.map(item => key(item.sectionId, item.subjectCode)));
  const seats = enrollments.filter(item => taught.has(key(item.sectionId, item.subjectCode)));
  const seatSet = new Set(seats.map(item => `${item.studentId}|${key(item.sectionId, item.subjectCode)}`));
  const today = new Date().toISOString().slice(0, 10);
  const sectionIds = [...new Set(myOfferings.map(item => item.sectionId).filter(Boolean))].sort();
  const sections = sectionIds.map(sectionId => {
    const attempts = subs.filter(sub => { const exam = examById.get(sub.examId); return (exam.sections || []).includes(sectionId) && seatSet.has(`${sub.studentId}|${key(sectionId, exam.subjectCode)}`); });
    const dueExams = myExams.filter(exam => exam.date && exam.date <= today && (exam.sections || []).includes(sectionId) && taught.has(key(sectionId, exam.subjectCode)));
    const expected = dueExams.reduce((sum, exam) => sum + seats.filter(item => item.sectionId === sectionId && item.subjectCode === exam.subjectCode).length, 0);
    const finished = attempts.filter(sub => dueExams.includes(examById.get(sub.examId))).length;
    const scores = attempts.map(rosterPercent);
    const passed = attempts.filter(sub => rosterPercent(sub) >= (Number(examById.get(sub.examId).passingPercent) || 70)).length;
    return {
      sectionId,
      students: new Set(seats.filter(item => item.sectionId === sectionId).map(item => item.studentId)).size,
      attempts: attempts.length,
      average: rosterMean(scores),
      passing: attempts.length ? (passed / attempts.length) * 100 : null,
      completion: expected ? Math.min(100, (finished / expected) * 100) : null
    };
  });
  return { myExams, subs, sections, seats, totalStudents: new Set(seats.map(item => item.studentId)).size };
}

function rosterPerformanceCard(analytics) {
  const labels = { passing: 'Passing rate', average: 'Average score', completion: 'Exam completion' };
  // Best first; sections without results yet go last. Colors alternate by position.
  const ordered = [...analytics.sections].sort((x, y) => (y[rosterPerformanceMetric] ?? -1) - (x[rosterPerformanceMetric] ?? -1) || x.sectionId.localeCompare(y.sectionId));
  const rows = ordered.map((item, index) => {
    const value = item[rosterPerformanceMetric], width = value === null ? 0 : Math.max(2, Math.min(100, value));
    const tip = `${item.sectionId}: ${value === null ? 'no results yet' : `${value.toFixed(1)}%`} · ${item.attempts} graded attempt${item.attempts === 1 ? '' : 's'}`;
    return `<div class="roster-perf-row" title="${rosterEsc(tip)}"><span class="roster-perf-label">${rosterEsc(item.sectionId)}</span><span class="roster-perf-track"><i style="width:${width}%;--bar:${ROSTER_COLORS[index % 2]}"></i></span><b>${value === null ? '—' : `${Math.round(value)}%`}</b></div>`;
  }).join('');
  const options = Object.entries(labels).map(([value, label]) => `<option value="${value}"${value === rosterPerformanceMetric ? ' selected' : ''}>${label}</option>`).join('');
  return `<section class="roster-insight-card" aria-labelledby="rosterPerfTitle"><header><h3 id="rosterPerfTitle">Students performance</h3><select class="roster-insight-select" aria-label="Performance measure" onchange="setRosterPerformanceMetric(this.value)">${options}</select></header><div class="roster-perf-list">${rows || '<p class="roster-insight-empty">No sections assigned.</p>'}</div></section>`;
}

/* "All students" donut, filterable by subject: All subjects = every section
   you teach; one subject = only that subject's sections and enrolments. */
let rosterDonutSubject = 'all';
function setRosterDonutSubject(value) { rosterDonutSubject = value; renderStudentSectionTable(); }
function rosterStudentsCard(analytics) {
  const codes = [...new Set(analytics.seats.map(item => item.subjectCode))].sort();
  if (rosterDonutSubject !== 'all' && !codes.includes(rosterDonutSubject)) rosterDonutSubject = 'all';
  const seats = rosterDonutSubject === 'all' ? analytics.seats : analytics.seats.filter(item => item.subjectCode === rosterDonutSubject);
  const slices = [...new Set(seats.map(item => item.sectionId))].sort().map(sectionId => ({ sectionId, students: new Set(seats.filter(item => item.sectionId === sectionId).map(item => item.studentId)).size }));
  const unique = new Set(seats.map(item => item.studentId)).size;
  const options = `<option value="all"${rosterDonutSubject === 'all' ? ' selected' : ''}>All subjects</option>` + codes.map(code => { const subject = (typeof subjects !== 'undefined' ? subjects : []).find(item => item.code === code); return `<option value="${rosterEsc(code)}"${code === rosterDonutSubject ? ' selected' : ''}>${rosterEsc(code)}${subject ? ` · ${rosterEsc(subject.name)}` : ''}</option>`; }).join('');
  analytics = { ...analytics, sections: slices, totalStudents: unique };
  const total = analytics.sections.reduce((sum, item) => sum + item.students, 0), radius = 54, circumference = 2 * Math.PI * radius;
  let offset = 0;
  const select = `<select class="roster-insight-select" aria-label="Subject shown in the student chart" onchange="setRosterDonutSubject(this.value)">${options}</select>`;
  const arcs = analytics.sections.map((item, index) => {
    const length = total ? (item.students / total) * circumference : 0;
    const arc = `<circle r="${radius}" cx="70" cy="70" fill="none" stroke="${ROSTER_COLORS[index % ROSTER_COLORS.length]}" stroke-width="18" stroke-dasharray="${Math.max(0, length - 2)} ${circumference}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)"><title>${rosterEsc(item.sectionId)}: ${item.students} students</title></circle>`;
    offset += length; return arc;
  }).join('');
  const legend = analytics.sections.map((item, index) => `<li><i style="background:${ROSTER_COLORS[index % ROSTER_COLORS.length]}"></i><span>${rosterEsc(item.sectionId)}</span><b>${item.students}</b></li>`).join('');
  return `<section class="roster-insight-card roster-donut-card" aria-labelledby="rosterDonutTitle"><header><h3 id="rosterDonutTitle">${rosterDonutSubject === 'all' ? 'All students' : 'Students in subject'}</h3>${select}</header><div class="roster-donut-body"><svg viewBox="0 0 140 140" role="img" aria-label="${analytics.totalStudents} students across ${analytics.sections.length} sections"><circle r="${radius}" cx="70" cy="70" fill="none" class="roster-donut-track" stroke-width="18"/>${arcs}<text x="70" y="68" text-anchor="middle" class="roster-donut-total">${analytics.totalStudents}</text><text x="70" y="86" text-anchor="middle" class="roster-donut-caption">students</text></svg><ul class="roster-donut-legend">${legend}</ul></div></section>`;
}

/* Attach exams-taken and average score for the active subject + section. */
function rosterWithStats(list, analytics, subjectCode, sectionId) {
  const rosterExams = analytics.myExams.filter(exam => exam.subjectCode === subjectCode && (exam.sections || []).includes(sectionId));
  const ids = new Set(rosterExams.map(exam => exam.id));
  const rows = list.map(student => {
    const attempts = analytics.subs.filter(sub => sub.studentId === student.id && ids.has(sub.examId));
    return { ...student, stats: { taken: new Set(attempts.map(sub => sub.examId)).size, average: rosterMean(attempts.map(rosterPercent)) } };
  });
  return { rows, examCount: rosterExams.length };
}

function rosterRowCells(student, index, examCount) {
  const initials = `${(student.first || '')[0] || ''}${(student.last || '')[0] || ''}`.toUpperCase();
  const avg = student.stats.average, tone = avg === null ? 'none' : avg >= 95 ? 'top' : avg >= 70 ? 'pass' : 'low';
  return {
    person: `<span class="roster-person"><span class="roster-avatar" style="--avatar:${ROSTER_COLORS[index % ROSTER_COLORS.length]}" aria-hidden="true">${rosterEsc(initials)}</span><span class="roster-name">${rosterEsc(student.last)}, ${rosterEsc(student.first)}</span></span>`,
    taken: `<td class="roster-taken">${student.stats.taken}<small>/${examCount}</small></td>`,
    score: `<td><span class="roster-score ${tone}" title="${avg === null ? 'No graded attempts yet' : `Average ${avg.toFixed(1)}%`}"><span class="roster-score-bar"><i style="width:${avg === null ? 0 : Math.min(100, avg)}%"></i></span><b>${avg === null ? '—' : Math.round(avg)}</b></span></td>`,
    search: rosterEsc(`${student.id} ${student.first} ${student.last}`.toLowerCase())
  };
}

/* Toolbar: count, the shared table tools (search, sort, direction, group by)
   mounted into #rosterToolHost after render, and Add student. */
function rosterTableTools(count, sectionId) {
  return `<div class="roster-table-tools"><span><strong>${count}</strong> student${count === 1 ? '' : 's'} in ${rosterEsc(sectionId || '')}</span><div class="roster-tool-host role-table-tools" id="rosterToolHost"></div><button type="button" class="roster-manage-button primary roster-add-button" onclick="openStudentAssignModal()" title="Enroll any student in one of your subjects"><span aria-hidden="true">+</span> Add student</button></div>`;
}

/* One shared tools state: a search stays applied while switching subjects
   and sections, until the professor clears it. */
function mountRosterTableTools() {
  const table = document.querySelector('#studentsView .student-roster-table'), host = document.getElementById('rosterToolHost');
  if (typeof AdminTableTools !== 'undefined' && table && host) AdminTableTools.mount('faculty-roster', table, host);
  // The header count follows the search ("1 of 20 students").
  const label = document.querySelector('#studentsView .roster-table-tools>span strong'), rows = () => [...table.querySelectorAll('tbody tr[role="link"]')];
  const total = rows().length, update = () => { if (!label) return; const shown = rows().filter(row => !row.hidden).length; label.textContent = shown === total ? String(total) : `${shown} of ${total}`; };
  host.querySelector('.table-search-box input')?.addEventListener('input', update); update();
}

function setRosterPerformanceMetric(value) { rosterPerformanceMetric = value; renderStudentSectionTable(); }
