/* ==================================================================
   Professor "Reports" in the layout of the other pages:
   status cards with rings (Pending / Resolved / Dismissed), a reports-
   per-week chart, "by problem type" and "most reported examinations"
   cards, then the existing filter tabs + sort tools and report cards.
   Runs after displayQuestionReports() and only adds/rearranges markup,
   so every report action (review, resolve, dismiss, settings, open
   question, open profile) keeps working.
   ================================================================== */
const FacultyReportsOverview = (() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const label = text => { const s = String(text || 'other').replace(/[-_]+/g, ' '); return s[0].toUpperCase() + s.slice(1); };
  const TONES = { pending: 'var(--role-shell-yellow, #c89571)', resolved: 'var(--accent)', dismissed: '#8a7a6d' };

  function ring(value, total, color) {
    const r = 26, c = 2 * Math.PI * r, share = total ? value / total : 0;
    return `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="${r}" class="fx-ring-track"/>${share ? `<circle cx="32" cy="32" r="${r}" class="fx-ring-value" stroke="${color}" stroke-dasharray="${c * share} ${c}" transform="rotate(-90 32 32)"/>` : ''}</svg><span class="fx-ring-label"><strong>${value}</strong><small>${Math.round(share * 100)}%</small></span>`;
  }

  function statusCards(reports, active) {
    const count = key => reports.filter(r => reportStatusGroup(r) === key).length;
    const cards = [['pending', 'Pending', 'Open or under review'], ['resolved', 'Resolved', 'Question fixed or answered'], ['dismissed', 'Dismissed', 'Closed without changes']];
    return `<section class="fx-status-grid" aria-label="Report status overview">${cards.map(([key, title, copy]) =>
      `<button type="button" class="fx-status-card${active === key ? ' active' : ''}" onclick="selectReportTab('${active === key ? 'all' : key}')"><span class="fx-ring">${ring(count(key), reports.length, TONES[key])}</span><span><strong>${title}</strong><small>${copy}</small></span></button>`).join('')}</section>`;
  }

  function weekChart(reports) {
    const weekOf = iso => { const d = new Date(iso); if (Number.isNaN(d.getTime())) return null; d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); return d; };
    const weeks = new Map();
    reports.forEach(r => { const w = weekOf(r.createdAt); if (!w) return; const key = w.toISOString().slice(0, 10); const e = weeks.get(key) || { start: w, pending: 0, closed: 0 }; reportStatusGroup(r) === 'pending' ? e.pending++ : e.closed++; weeks.set(key, e); });
    // Eight consecutive weeks ending with the latest report, empty weeks shown as zero.
    const sorted = [...weeks.values()].sort((a, b) => a.start - b.start);
    const list = [];
    if (sorted.length) { const last = sorted[sorted.length - 1].start; for (let i = 7; i >= 0; i--) { const d = new Date(last); d.setDate(d.getDate() - i * 7); const key = d.toISOString().slice(0, 10); list.push(weeks.get(key) || { start: d, pending: 0, closed: 0 }); } }
    const head = `<header class="fx-chart-head"><div><span class="fx-eyebrow">Student feedback</span><h2>Reports per week</h2></div><div class="fx-legend"><span><i style="background:${TONES.pending}"></i>Still pending</span><span><i style="background:var(--accent)"></i>Handled</span></div></header>`;
    if (!list.length) return `<section class="fx-chart-card rx-chart">${head}<p class="fx-empty">No reports yet.</p></section>`;
    const max = Math.max(1, ...list.map(w => w.pending + w.closed));
    const bars = list.map(w => { const total = w.pending + w.closed; return `<div class="rx-bar" title="Week of ${esc(w.start.toLocaleDateString())}: ${total} report${total === 1 ? '' : 's'} (${w.pending} pending)"><div class="rx-stack" style="height:${(total / max) * 100}%"><i class="pending" style="flex:${w.pending}"></i><i class="closed" style="flex:${w.closed}"></i></div><b>${total}</b><span>${esc(w.start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))}</span></div>`; }).join('');
    return `<section class="fx-chart-card rx-chart">${head}<div class="rx-bars">${bars}</div></section>`;
  }

  function breakdowns(reports) {
    const byType = new Map(); reports.forEach(r => byType.set(r.category || 'other', (byType.get(r.category || 'other') || 0) + 1));
    const types = [...byType.entries()].sort((a, b) => b[1] - a[1]);
    const maxType = Math.max(1, ...types.map(t => t[1]));
    const typeRows = types.map(([key, n]) => `<div class="rx-row"><span>${esc(label(key))}</span><i><b style="width:${(n / maxType) * 100}%"></b></i><strong>${n}</strong></div>`).join('') || '<p class="fx-empty">No reports yet.</p>';
    const byExam = new Map(); reports.forEach(r => { const e = byExam.get(r.examId) || { total: 0, pending: 0 }; e.total++; if (reportStatusGroup(r) === 'pending') e.pending++; byExam.set(r.examId, e); });
    const examRows = [...byExam.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 5).map(([id, e]) => {
      const exam = exams.find(x => x.id === id);
      return `<button type="button" class="rx-exam" onclick="manageQuestions('${esc(id)}')"><span><strong>${esc(exam?.title || 'Exam removed')}</strong><small>${esc(exam?.subjectCode || '')}${e.pending ? ` · ${e.pending} pending` : ' · all handled'}</small></span><em>${e.total}</em></button>`;
    }).join('') || '<p class="fx-empty">No reports yet.</p>';
    return `<div class="rx-grid"><section class="rx-card"><header><h3>By problem type</h3><span>${reports.length} total</span></header><div class="rx-rows">${typeRows}</div></section><section class="rx-card"><header><h3>Most reported examinations</h3><span>Top ${Math.min(5, byExam.size)}</span></header><div class="rx-exams">${examRows}</div></section></div>`;
  }

  /* Called at the end of displayQuestionReports(). */
  function decorate(host, allReports, active) {
    const section = host?.querySelector('.exams-section'); if (!section) return;
    section.classList.add('rx-page');
    section.querySelector(':scope > .exams-header')?.remove();
    const tabs = section.querySelector(':scope > .report-filter-tabs'), sort = section.querySelector(':scope > .report-sort-tools');
    const controls = document.createElement('div'); controls.className = 'rx-controls';
    if (tabs) controls.appendChild(tabs); if (sort) controls.appendChild(sort);
    section.prepend(controls);
    controls.insertAdjacentHTML('beforebegin', statusCards(allReports, active) + weekChart(allReports) + breakdowns(allReports));
  }
  return { decorate };
})();
