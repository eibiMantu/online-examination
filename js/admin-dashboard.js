/* ==================================================================
   Administrator dashboard: hero counts, two charts (accounts by role,
   activity over the last 14 days), the current academic period and the
   latest audit events. Live monitoring itself is js/admin-monitoring.js.
   ================================================================== */
const AdminDashboard = (() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const read = (key, fallback = []) => { try { const v = DB.read(key, fallback); return v ?? fallback; } catch (_) { return fallback; } };
  const $ = id => document.getElementById(id);
  const ROLES = [['student', 'Students', '#2f8d83'], ['faculty', 'Professors', 'var(--ad-accent)'], ['coordinator', 'Coordinators', '#d39a2c'], ['dean', 'Dean', '#c8692e'], ['admin', 'Administrators', '#8a8f99']];
  const roleOf = value => { const r = String(value || '').toLowerCase().replace(/[\s_-]+/g, ''); return r.includes('admin') ? 'admin' : r.includes('dean') ? 'dean' : r.includes('coordinator') ? 'coordinator' : r.includes('student') ? 'student' : r.includes('faculty') || r.includes('professor') ? 'faculty' : 'other'; };
  const go = section => { const link = document.querySelector(`#sidebar [data-panel="${section}"]`); if (link) link.click(); window.scrollTo?.(0, 0); };

  function hero() {
    const date = $('adminHeroDate'); if (date) date.textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const stats = [[read('users').length, 'Accounts'], [read('students').length, 'Students'], [read('faculty').length, 'Faculty'], [read('exams').length, 'Exams']];
    const box = $('adminHeroStats'); if (box) box.innerHTML = stats.map(([v, l]) => `<div><strong>${Number(v).toLocaleString()}</strong><span>${l}</span></div>`).join('');
  }

  function donut(parts) {
    const total = parts.reduce((s, p) => s + p.value, 0), r = 46, c = 2 * Math.PI * r; let off = 0;
    const arcs = parts.filter(p => p.value).map(p => { const len = total ? p.value / total * c : 0, arc = `<circle r="${r}" cx="60" cy="60" fill="none" stroke="${p.color}" stroke-width="16" stroke-dasharray="${Math.max(0, len - 2)} ${c}" stroke-dashoffset="${-off}" transform="rotate(-90 60 60)"/>`; off += len; return arc; }).join('');
    return `<div class="cd-donut"><svg viewBox="0 0 120 120" aria-hidden="true"><circle r="${r}" cx="60" cy="60" fill="none" class="cd-donut-track" stroke-width="16"/>${arcs}<text x="60" y="64" text-anchor="middle">${total.toLocaleString()}</text></svg><ul>${parts.map(p => `<li><i style="background:${p.color}"></i>${esc(p.label)}<b>${p.value.toLocaleString()}</b></li>`).join('')}</ul></div>`;
  }

  function charts() {
    const host = $('adminCharts'); if (!host) return;
    const users = read('users'), count = new Map();
    users.forEach(u => { const r = roleOf(u.role); count.set(r, (count.get(r) || 0) + 1); });
    const parts = ROLES.map(([key, label, color]) => ({ label, value: count.get(key) || 0, color })).filter(p => p.value);
    // Activity: audit events per day for the last 14 days, sign-ins vs changes.
    const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 13 + i); return { at: d, signIns: 0, changes: 0 }; });
    read('applicationAuditLog').forEach(e => {
      const t = new Date(e.at); if (Number.isNaN(t.getTime())) return;
      const day = days.find(d => t >= d.at && t < new Date(d.at.getTime() + 864e5)); if (!day) return;
      if (/login|logout|session/i.test(`${e.action} ${e.entityType}`)) day.signIns++; else day.changes++;
    });
    const top = Math.max(1, ...days.map(d => d.signIns + d.changes)), total = days.reduce((s, d) => s + d.signIns + d.changes, 0);
    const cols = `<div class="ad-cols">${days.map(d => { const label = d.at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); return `<span title="${label}: ${d.signIns} sign-ins, ${d.changes} changes"><i class="changes" style="height:${d.changes / top * 100}%"></i><i class="signins" style="height:${d.signIns / top * 100}%"></i></span>`; }).join('')}</div><div class="ad-cols-axis"><span>${days[0].at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><span>Today</span></div><footer class="cd-legend"><span><i class="ad-swatch signins"></i>Sign-ins</span><span><i class="ad-swatch changes"></i>Changes</span></footer>`;
    host.innerHTML = `<section class="cd-card"><header class="cd-card-head"><div><h2>Accounts by role</h2><p>${users.length.toLocaleString()} accounts</p></div><button type="button" class="cd-link" data-ad-go="governanceSection">Manage &#8250;</button></header>${parts.length ? donut(parts) : '<p class="cd-empty">No accounts yet.</p>'}</section>
      <section class="cd-card"><header class="cd-card-head"><div><h2>Activity</h2><p>Last 14 days · ${total} events</p></div><button type="button" class="cd-link" data-ad-go="auditSection">Audit log &#8250;</button></header>${cols}</section>`;
  }

  function period() {
    const card = $('adminPeriodCard'); if (!card) return;
    const settings = read('systemSettings', {}) || {}, periods = read('academicPeriods');
    const current = periods.find(p => p.id === settings.currentAcademicPeriodId) || periods.find(p => p.status === 'active') || null;
    const status = current?.status || settings.academicPeriodStatus || 'not set';
    const start = current?.startDate ? new Date(current.startDate) : null, endDate = current?.endDate ? new Date(current.endDate) : null;
    let progress = '';
    if (start && endDate && !Number.isNaN(start) && !Number.isNaN(endDate) && endDate > start) {
      const pct = Math.max(0, Math.min(100, (Date.now() - start) / (endDate - start) * 100)), left = Math.ceil((endDate - Date.now()) / 864e5);
      progress = `<div class="ad-progress"><i style="width:${pct}%"></i></div><p class="ad-progress-note">${left > 0 ? `${left} day${left === 1 ? '' : 's'} left` : 'Ended'} · ${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>`;
    }
    const title = current ? `${current.term || settings.semester || ''} ${current.schoolYear || settings.schoolYear || ''}`.trim() : `${settings.semester || 'No period'} ${settings.schoolYear || ''}`.trim();
    card.innerHTML = `<header class="cd-card-head"><div><h2>Academic period</h2></div><button type="button" class="cd-link" data-ad-go="academicPeriodsSection">Open &#8250;</button></header><div class="ad-period"><strong>${esc(title)}</strong><span class="ad-pill ${esc(status)}">${esc(status)}</span></div>${progress}<p class="ad-period-meta">${periods.length} period${periods.length === 1 ? '' : 's'} configured</p>`;
  }

  // Things an administrator can act on, each opening the page where it is fixed.
  function attention() {
    const card = $('adminActivityCard'); if (!card) return;
    const students = read('students'), faculty = read('faculty'), users = read('users');
    const offers = read('sectionSubjects').flatMap(r => (r.assignments || []).map(a => ({ ...a, sectionId: r.sectionId })));
    const weekAgo = Date.now() - 7 * 864e5;
    const inactive = users.filter(u => u.disabled === true || ['deactivated', 'archived', 'graduated', 'transferred'].includes(String(u.status || u.lifecycleStatus || '').toLowerCase())).length;
    const denied = read('applicationAuditLog').filter(e => e.result && e.result !== 'success' && new Date(e.at).getTime() >= weekAgo).length;
    const rows = [
      [students.filter(s => !(s.sections || []).length).length, 'Students without a section', 'Not placed in any section yet', 'studentSection'],
      [faculty.filter(f => !offers.some(o => o.facultyId === f.id)).length, 'Professors without a class', 'No teaching load assigned', 'facultySection'],
      [offers.filter(o => !o.facultyId).length, 'Offerings without a professor', 'Subject-section pairs nobody teaches', 'loadPolicySection'],
      [inactive, 'Inactive accounts', 'Deactivated, archived, graduated or transferred', 'accountLifecycleSection'],
      [denied, 'Denied or failed actions', 'Blocked in the last 7 days', 'auditSection']
    ];
    const open = rows.filter(r => r[0]).length;
    card.innerHTML = `<header class="cd-card-head"><div><h2>Needs attention</h2><p>${open ? `${open} of ${rows.length} need a look` : 'Everything is in order'}</p></div></header><div class="ad-attention">${rows.map(([n, title, copy, target]) => `<button type="button" class="ad-attn ${n ? 'has' : 'clear'}" data-ad-go="${target}"><span class="ad-attn-count">${n ? n.toLocaleString() : '&#10003;'}</span><span class="ad-attn-text"><strong>${title}</strong><small>${n ? copy : 'All clear'}</small></span><span class="ad-attn-arrow" aria-hidden="true">&#8250;</span></button>`).join('')}</div>`;
  }

  // Navigation counts are filled in by the page; show them with thousands separators like the hero.
  function counts() { document.querySelectorAll('#dashboardSection .ad-nav .card-count').forEach(el => { const n = Number(String(el.textContent).replace(/,/g, '')); const text = el.textContent.trim(), pretty = Number.isFinite(n) && text !== '' ? n.toLocaleString() : text; if (pretty !== text) el.textContent = pretty; }); }
  function render() { [hero, charts, period, attention, counts].forEach(fn => { try { fn(); } catch (e) { console.warn(e); } }); }
  function mount() {
    render();
    $('dashboardSection')?.addEventListener('click', e => { const t = e.target.closest('[data-ad-go]'); if (t) go(t.dataset.adGo); });
    document.querySelector('#sidebar [data-panel="dashboardSection"]')?.addEventListener('click', render);
    // Re-format counts whenever the page updates one of them.
    document.querySelectorAll('#dashboardSection .ad-nav .card-count').forEach(el => new MutationObserver(counts).observe(el, { childList: true, characterData: true, subtree: true }));
  }
  return { mount, render };
})();
if (typeof window !== 'undefined') window.AdminDashboard = AdminDashboard;
