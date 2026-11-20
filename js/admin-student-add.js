/* ==================================================================
   Administrator · Add Student with one-click enrollment.
   The Add Student dialog also picks the curriculum and admission
   status (Regular, Irregular, Transferee). The current semester's
   curriculum subjects for that year are listed and ticked; untick any
   to leave them out, or add others. Saving creates the account and
   enrolls the subjects through the same review as the Students page
   (seats, schedule conflicts, unit limits; overloads go to the Dean).
   Edit Student keeps the plain form.
   ================================================================== */
const AdminStudentAdd = (() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const has = name => { try { return typeof eval(name) !== 'undefined'; } catch (_) { return false; } };
  const g = name => { try { return eval(name); } catch (_) { return undefined; } };
  const state = { status: 'regular', program: '', block: '', picks: new Map(), extras: [] }; // picks: code → offeringId|'' (unticked = absent)

  /* ---------- data ---------- */
  const norm = id => (typeof SectionService !== 'undefined' ? SectionService.normaliseId(id) : String(id || '').toUpperCase());
  const offerings = () => (has('studentAssignmentOfferings') ? g('studentAssignmentOfferings')() : []);
  const sectionsList = () => g('sections') || DB.read('sections', []);
  const subjectsList = () => g('subjects') || DB.read('subjects', []);
  const term = () => (typeof SectionService !== 'undefined' ? SectionService.currentAcademicContext().term : '');
  const roomIn = offer => { const cap = has('sectionStudentCapacity') ? g('sectionStudentCapacity')(offer.sectionId) : 50, used = has('offeringStudentCount') ? g('offeringStudentCount')(offer) : 0; return cap - used; };
  const unitsOf = code => { try { return AcademicWorkflowService.unitRecord(code)?.units; } catch (_) { return subjectsList().find(s => s.code === code)?.units; } };
  const professor = offer => { try { return g('professorForOffering')(offer); } catch (_) { return offer.facultyId || 'No professor yet'; } };
  function programs() {
    const labels = new Map([...document.querySelectorAll('#sectionProgram option')].map(o => [o.value, o.textContent.trim()]));
    const codes = [...new Set([...DB.read('curricula', []).map(c => c.program), ...sectionsList().map(s => s.program)].filter(Boolean))];
    return codes.map(code => [code, labels.get(code) || code]).sort((a, b) => a[1].localeCompare(b[1]));
  }
  function curriculumCodes(program, year) {
    const t = term();
    return [...new Set(DB.read('curricula', []).filter(c => c.program === program && Number(c.yearLevel) === Number(year) && (!t || c.term === t) && c.status !== 'archived' && c.removed !== true).map(c => c.subjectCode))];
  }
  const blockSections = (program, year) => sectionsList().filter(s => s.program === program && Number(s.yearLevel) === Number(year)).map(s => s.id).sort();
  const offersFor = code => offerings().filter(o => o.subjectCode === code);
  // Best section for a subject: the block section if it offers it with room, else the one with the most seats left.
  function bestOffer(code) {
    const list = offersFor(code).filter(o => roomIn(o) > 0);
    if (state.status === 'regular' && state.block) { const inBlock = list.find(o => norm(o.sectionId) === norm(state.block)); if (inBlock) return inBlock; }
    return list.sort((a, b) => roomIn(b) - roomIn(a))[0] || null;
  }

  /* ---------- view ---------- */
  function rebuildPicks() {
    const year = Number(document.getElementById('sYear')?.value || 1);
    state.picks = new Map(curriculumCodes(state.program, year).map(code => [code, bestOffer(code)?.id || '']));
    state.extras = [];
  }
  function chooseBlock() {
    const year = Number(document.getElementById('sYear')?.value || 1), list = blockSections(state.program, year);
    if (!list.includes(state.block)) {
      // The section with the most room across this year's subjects.
      const score = id => offerings().filter(o => norm(o.sectionId) === norm(id)).reduce((t, o) => t + Math.max(0, roomIn(o)), 0);
      state.block = list.sort((a, b) => score(b) - score(a))[0] || '';
    }
  }
  function rowHtml(code, extra) {
    const subject = subjectsList().find(s => s.code === code), offers = offersFor(code), picked = state.picks.has(code), chosen = state.picks.get(code) || '';
    const offer = offers.find(o => o.id === chosen), units = unitsOf(code);
    const sectionSelect = offers.length ? `<select data-sa-section="${esc(code)}" aria-label="Section for ${esc(code)}"${picked ? '' : ' disabled'}>${offers.map(o => { const room = roomIn(o); return `<option value="${esc(o.id)}"${o.id === chosen ? ' selected' : ''}${room <= 0 && o.id !== chosen ? ' disabled' : ''}>${esc(o.sectionId)} · ${room > 0 ? `${room} seat${room === 1 ? '' : 's'}` : 'full'}</option>`; }).join('')}</select>` : '<span class="sa-none">Not offered this semester</span>';
    return `<li class="sa-row${picked ? '' : ' off'}${offer ? '' : ' no-offer'}"><label class="sa-check"><input type="checkbox" data-sa-pick="${esc(code)}"${picked ? ' checked' : ''}${offers.length ? '' : ' disabled'}><span><strong>${esc(code)}</strong><small>${esc(subject?.name || 'Unknown subject')}${Number.isFinite(units) ? ` · ${units} unit${units === 1 ? '' : 's'}` : ''}</small></span></label><span class="sa-where">${sectionSelect}${offer ? `<small>${esc(professor(offer))}</small>` : ''}</span>${extra ? `<button type="button" class="sa-x" data-sa-drop="${esc(code)}" aria-label="Remove ${esc(code)}" title="Remove">×</button>` : ''}</li>`;
  }
  function render() {
    const host = document.getElementById('saEnroll'); if (!host) return;
    const year = Number(document.getElementById('sYear')?.value || 1), codes = curriculumCodes(state.program, year), blocks = blockSections(state.program, year);
    const picked = [...state.picks.entries()].filter(([, id]) => id), units = picked.reduce((t, [code]) => t + (Number(unitsOf(code)) || 0), 0);
    const others = [...new Set(offerings().map(o => o.subjectCode))].filter(code => !codes.includes(code) && !state.extras.includes(code)).sort();
    const roles = typeof RoleAccess !== 'undefined' ? RoleAccess.roles() : [];
    host.innerHTML = `
      <div class="sa-grid">
        <label class="student-form-field"><span>Curriculum</span><select id="saProgram">${programs().map(([code, label]) => `<option value="${esc(code)}"${code === state.program ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select></label>
        <label class="student-form-field"><span>Role</span><select id="saRole"><option value="">Student</option>${roles.map(r => `<option value="${esc(r.id)}">Student + ${esc(r.name)} (all subjects)</option>`).join('')}</select></label>
      </div>
      <div class="sa-status" role="radiogroup" aria-label="Admission status">${[['regular', 'Regular', 'Takes the block section'], ['irregular', 'Irregular', 'Mixes sections and subjects'], ['transferee', 'Transferee', 'Coming from another school']].map(([k, l, n]) => `<button type="button" role="radio" aria-checked="${state.status === k}" class="${state.status === k ? 'on' : ''}" data-sa-status="${k}"><strong>${l}</strong><small>${n}</small></button>`).join('')}</div>
      ${state.status === 'regular' ? `<label class="student-form-field sa-block"><span>Block section</span><select id="saBlock">${blocks.length ? blocks.map(id => `<option value="${esc(id)}"${id === state.block ? ' selected' : ''}>${esc(id)}</option>`).join('') : '<option value="">No section for this year yet</option>'}</select></label>` : ''}
      <section class="sa-subjects"><header><div><strong>Subjects to enroll</strong><small>${esc(term() ? term().replace(/^\w/, c => c.toUpperCase()) + (/semester|term|summer/i.test(term()) ? '' : ' semester') : 'Current semester')} · year ${year} curriculum · untick to leave one out</small></div><span class="sa-total">${picked.length} subject${picked.length === 1 ? '' : 's'} · ${units} unit${units === 1 ? '' : 's'}</span></header>
        <ul class="sa-list">${codes.map(code => rowHtml(code, false)).join('') || '<li class="sa-empty">No curriculum subjects for this year and semester.</li>'}${state.extras.map(code => rowHtml(code, true)).join('')}</ul>
        ${others.length ? `<label class="sa-add"><span>Add another subject</span><select id="saAdd"><option value="">Choose a subject…</option>${others.map(code => `<option value="${esc(code)}">${esc(code)} — ${esc(subjectsList().find(s => s.code === code)?.name || '')}</option>`).join('')}</select></label>` : ''}
      </section>`;
  }

  /* ---------- open / save ---------- */
  function ensureMarkup() {
    const modal = document.querySelector('#studentModal .modal'); if (!modal || modal.querySelector('#saEnroll')) return;
    modal.classList.add('sa-modal');
    // ID · Year, then Last · First · Middle initial, in one grid of their own.
    const basics = document.createElement('div'); basics.className = 'sa-basics';
    ['sID', 'sYear', 'sLast', 'sFirst', 'sMiddle'].forEach(id => { const l = modal.querySelector(`label[for="${id}"]`); if (l) basics.appendChild(l); });
    modal.querySelector('h3')?.after(basics);
    const help = modal.querySelector('#studentYearHelp');
    help?.insertAdjacentHTML('afterend', '<div id="saEnroll" class="sa-enroll"></div>');
    if (help) help.hidden = true;
    const save = modal.querySelector('button[onclick*="saveItem(\'students\')"]'); if (save) save.textContent = 'Save';
    modal.addEventListener('change', e => {
      const t = e.target;
      if (t.id === 'sYear' || t.id === 'saProgram') { if (t.id === 'saProgram') state.program = t.value; state.block = ''; chooseBlock(); rebuildPicks(); render(); return; }
      if (t.id === 'saBlock') { state.block = t.value; rebuildPicks(); render(); return; }
      if (t.matches('[data-sa-pick]')) { const code = t.dataset.saPick; if (t.checked) state.picks.set(code, bestOffer(code)?.id || ''); else state.picks.delete(code); render(); return; }
      if (t.matches('[data-sa-section]')) { state.picks.set(t.dataset.saSection, t.value); render(); return; }
      if (t.id === 'saAdd' && t.value) { state.extras.push(t.value); state.picks.set(t.value, bestOffer(t.value)?.id || ''); render(); }
    });
    modal.addEventListener('click', e => {
      const st = e.target.closest('[data-sa-status]'); if (st) { state.status = st.dataset.saStatus; if (state.status === 'regular') chooseBlock(); rebuildPicks(); render(); return; }
      const drop = e.target.closest('[data-sa-drop]'); if (drop) { state.extras = state.extras.filter(c => c !== drop.dataset.saDrop); state.picks.delete(drop.dataset.saDrop); render(); }
    });
  }
  function openForAdd() {
    ensureMarkup();
    const modal = document.querySelector('#studentModal .modal'); modal?.classList.add('sa-adding');
    const title = modal?.querySelector('h3'); if (title) title.textContent = 'Add Student';
    state.status = 'regular'; state.program = state.program || programs()[0]?.[0] || ''; state.block = '';
    chooseBlock(); rebuildPicks(); render();
  }
  function plan() {
    const offers = offerings();
    return { status: state.status, program: state.program, block: state.status === 'regular' ? state.block : '', role: document.getElementById('saRole')?.value || '', offers: [...state.picks.values()].filter(Boolean).map(id => offers.find(o => o.id === id)).filter(Boolean) };
  }
  async function enroll(studentId, p) {
    const list = g('students') || [], student = list.find(s => s.id === studentId); if (!student) return;
    Object.assign(student, { program: p.program, admissionStatus: p.status, ...(p.block ? { sections: [p.block] } : {}) });
    const messages = [];
    if (p.offers.length) {
      const review = AcademicWorkflowService.reviewAdminEnrollmentBatch(studentId, p.offers);
      if (!review.canSave) { g('persistAll')?.(); notify(`Student ${studentId} was added, but the subjects were not enrolled: ${review.problems[0]} Open the student to finish enrolling.`, 'error', 10000); return; }
      const context = SectionService.currentAcademicContext(), enrollments = g('studentEnrollments');
      review.normal.forEach((offer, i) => {
        enrollments.push({ id: `ENR-${studentId}-${Date.now()}-${i}`, studentId, offeringId: offer.id, subjectCode: offer.subjectCode, sectionId: offer.sectionId, enrollmentSource: 'admin-direct', ...(context.periodId ? { academicPeriodId: context.periodId, periodStatus: 'active' } : {}) });
        try { AuditLog.record('admin-direct-enroll', 'student-subject', `${studentId}:${offer.subjectCode}`, { studentId, subjectCode: offer.subjectCode, sectionId: offer.sectionId, facultyId: offer.facultyId, academicPeriod: context, admission: p.status }); } catch (_) {}
      });
      // Irregular and transferee students belong to the sections of the subjects they take.
      if (!p.block && review.normal.length) student.sections = [...new Set(review.normal.map(o => o.sectionId))];
      if (!g('persistAll')()) return;
      if (review.normal.length) messages.push(`${review.normal.length} subject${review.normal.length === 1 ? '' : 's'} enrolled`);
      if (review.overload.length) {
        const session = DB.read('currentUser', null);
        try { review.overload.forEach(offer => AcademicWorkflowService.requestStudentOverload({ studentId, offeringId: offer.id, reason: `Added at admission as a ${p.status} student.`, academicPeriod: context.periodId || '' }, session)); messages.push(`${review.overload.length} over the unit limit sent to the Dean`); } catch (error) { notify(error.message, 'error'); }
      }
    } else g('persistAll')?.();
    if (p.role && typeof RoleAccess !== 'undefined') { try { RoleAccess.assign({ username: studentId, roleId: p.role, subjectCode: '*' }); messages.push(`${RoleAccess.roleById(p.role)?.name} role given`); } catch (error) { notify(error.message, 'error'); } }
    try { g('loadAll')?.(); } catch (_) {}
    try { AdminPages.refresh(); } catch (_) {}
    // One message with the sign-in password (the plain save message would be replaced by this one).
    const password = String(student.last || '').toLowerCase().replace(/\s+/g, '') + (student.yearLevel || '');
    notify(`${student.first} ${student.last} added · ID ${studentId} · password ${password}${messages.length ? ` · ${messages.join(' · ')}` : ''}.`, 'success', 12000);
  }

  function install() {
    if (!has('openStudentModal') || !has('saveItem') || window.__saInstalled) return;
    window.__saInstalled = true;
    const open = g('openStudentModal'), save = g('saveItem'), edit = has('editItem') ? g('editItem') : null;
    window.openStudentModal = function (...args) { const out = open.apply(this, args); openForAdd(); return out; };
    if (edit) window.editItem = function (type, ...args) { const modal = document.querySelector('#studentModal .modal'); modal?.classList.remove('sa-adding'); const out = edit.call(this, type, ...args); if (type === 'students') { ensureMarkup(); const t = modal?.querySelector('h3'); if (t) t.textContent = 'Edit Student'; } return out; };
    window.saveItem = function (type, ...rest) {
      const modal = document.querySelector('#studentModal .modal'), adding = type === 'students' && modal?.classList.contains('sa-adding') && g('editType') !== 'students';
      if (!adding) return save.call(this, type, ...rest);
      const id = document.getElementById('sID')?.value.trim(), p = plan(), before = (g('students') || []).some(s => s.id === id);
      const out = save.call(this, type, ...rest);
      if (!before && (g('students') || []).some(s => s.id === id)) { modal.classList.remove('sa-adding'); enroll(id, p); }
      return out;
    };
  }
  // The page script defines its functions after this file loads; try until they exist.
  let tries = 0; (function wait() { install(); if (!window.__saInstalled && tries++ < 100) setTimeout(wait, 100); })();
  return { install, plan, state };
})();
