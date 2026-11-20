'use strict';
/* ==================================================================
   Exam integrity on the server (the browser can never be trusted).

   Reading, for Students:
   - questions: correct answers are removed (option isCorrect, accepted
     values, expected answers, explanations) unless the Student has
     submitted that exam and its answers are released. Matching and
     image-placement answers are shuffled the same way every time, so the
     order no longer gives the answer away.
   - studentSubmissions and examAttempts: only their own.

   Writing:
   - Students: only new submissions of their own are accepted, and the
     server grades them from the real answer keys. Earlier submissions
     and other Students' records are kept as they are. examAttempts:
     only their own entries.
   - Professors: exams, questions and drafts only in subjects they teach;
     when roles are in use, only in subjects where they hold a role that
     allows exam editing (Exam maker). Lessons only in subjects they
     teach; grading only for exams in subjects they teach.
   - Core permissions switched off by the Administrator (exam.own.manage,
     grade.own.manage) close those collections too.
   ================================================================== */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { isDeepStrictEqual } = require('util');
const PagePermissions = require('../js/page-permissions');

// The browser's own rules for grading and release, loaded unchanged.
const shared = vm.createContext({ console });
for (const file of ['question-types.js', 'dates.js', 'grading.js', 'result-visibility.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8'), shared, { filename: file });
}
const rules = vm.runInContext('({ isChoiceQuestion, numericAnswerIsCorrect, textAnswerIsCorrect, matchingAnswerIsCorrect, resultVisibility })', shared);

const SECRET = process.env.SESSION_SECRET || process.env.ANSWER_SHUFFLE_SECRET || 'neu-answer-shuffle';
const forbid = message => Object.assign(new Error(message), { status: 403, code: 'EXAM_GUARD_FORBIDDEN' });
const norm = PagePermissions.normalizeRole;

/* ---------- matching shuffle ---------- */
function permutation(id, n) {
  const order = [...Array(n).keys()];
  if (n < 2) return order;
  let seed = crypto.createHmac('sha256', SECRET).update(String(id)).digest();
  for (let i = n - 1; i > 0; i--) {
    if (!seed.length) seed = crypto.createHash('sha256').update(seed).digest();
    const j = seed[i % seed.length] % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (order.every((v, i) => v === i)) order.push(order.shift()); // never the real order
  return order;
}
const candidateField = q => (q.type === 'imagedrag' ? 'left' : 'right');
const hasPairs = q => (q.type === 'matching' || q.type === 'imagedrag') && Array.isArray(q.pairs);

/* ---------- read side ---------- */
const ANSWER_FIELDS = ['acceptedValue', 'tolerance', 'expectedAnswer', 'correctAnswer', 'answer', 'answerKey', 'explanation', 'answerExplanation', 'feedback', 'correctFeedback', 'rubric'];
function stripQuestion(q) {
  const out = { ...q };
  ANSWER_FIELDS.forEach(f => delete out[f]);
  if (Array.isArray(q.options)) out.options = q.options.map(({ isCorrect, correct, feedback, ...rest }) => rest);
  if (hasPairs(q)) {
    const order = permutation(q.id, q.pairs.length), field = candidateField(q);
    out.pairs = q.pairs.map((pair, i) => ({ ...pair, [field]: q.pairs[order[i]][field] }));
    out.pairsShuffled = true;
  }
  out.answersHidden = true;
  return out;
}
function releasedExams(store, studentId) {
  const exams = new Map((store.read('exams', []) || []).map(e => [e.id, e]));
  const released = new Set();
  for (const s of store.read('studentSubmissions', []) || []) {
    if (s.studentId !== studentId || released.has(s.examId)) continue;
    const exam = exams.get(s.examId);
    try { if (exam && rules.resultVisibility(exam, s).showCorrectAnswers) released.add(s.examId); } catch (_) {}
  }
  return released;
}
function ownAttempts(value, me) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.filter(a => a?.studentId === me);
  return Object.fromEntries(Object.entries(value).filter(([k, a]) => a?.studentId === me || k.startsWith(`${me}::`)));
}
function filterRead(store, session, key, value) {
  if (norm(session?.role) !== 'student' || value == null) return value;
  const me = session.username;
  if (key === 'questions' && Array.isArray(value)) {
    const open = releasedExams(store, me);
    return value.map(q => (open.has(q.examId) ? q : stripQuestion(q)));
  }
  if (key === 'studentSubmissions' && Array.isArray(value)) return value.filter(s => s?.studentId === me);
  if (key === 'examAttempts') return ownAttempts(value, me);
  return value;
}

/* ---------- grading ---------- */
function grade(store, submission) {
  const questions = (store.read('questions', []) || []).filter(q => q.examId === submission.examId);
  const byId = new Map(questions.map(q => [q.id, q]));
  const seen = new Set(), answers = [];
  let total = 0, earned = 0, pending = 0;
  for (const given of Array.isArray(submission.answers) ? submission.answers : []) {
    const q = byId.get(given?.questionId);
    if (!q || seen.has(q.id)) continue;
    seen.add(q.id);
    const points = Number(q.points) || 5; total += points;
    const base = { questionId: q.id, type: q.type, points };
    if (q.manualCheck || q.needsManualGrading || !['mcq', 'truefalse', 'number', 'fillblank', 'matching', 'imagedrag'].includes(q.type)) {
      pending += points;
      const idx = Number.isInteger(given.selectedIndex) ? given.selectedIndex : null;
      answers.push({ ...base, response: typeof given.response === 'string' ? given.response.trim() : '', selectedIndex: idx, selectedText: idx !== null && q.options?.[idx] ? q.options[idx].text : null, matches: Array.isArray(given.matches) ? given.matches : [], awarded: null, needsManualGrading: true });
      continue;
    }
    let isCorrect = false, extra = {};
    if (hasPairs(q)) {
      const order = permutation(q.id, q.pairs.length), shown = Array.isArray(given.matchesShown) ? given.matchesShown : Array.isArray(given.matches) ? given.matches : [];
      const valid = j => j !== null && j !== '' && Number.isInteger(Number(j)) && Number(j) >= 0 && Number(j) < q.pairs.length;
      // Shuffled on the page (answers hidden): map back to the real order. Otherwise the indices are already real.
      const matches = shown.map(j => (!valid(j) ? null : given.pairsShuffled === false || (given.pairsShuffled !== true && !Array.isArray(given.matchesShown)) ? Number(j) : order[Number(j)]));
      isCorrect = rules.matchingAnswerIsCorrect(matches, q.pairs);
      extra = { matches, matchesShown: shown };
    } else if (rules.isChoiceQuestion(q) && Array.isArray(q.options)) {
      const idx = Number.isInteger(given.selectedIndex) ? given.selectedIndex : null;
      isCorrect = idx !== null && !!q.options[idx]?.isCorrect;
      extra = { selectedIndex: idx, selectedText: idx !== null && q.options[idx] ? q.options[idx].text : null };
    } else if (q.type === 'number') {
      const response = typeof given.response === 'string' ? given.response.trim() : String(given.response ?? '').trim();
      isCorrect = rules.numericAnswerIsCorrect(response, q.acceptedValue, q.tolerance);
      extra = { response, needsManualGrading: false };
    } else if (q.type === 'fillblank') {
      const response = typeof given.response === 'string' ? given.response.trim() : '';
      isCorrect = rules.textAnswerIsCorrect(response, q.expectedAnswer, { caseSensitive: q.caseSensitive, whitespaceSensitive: q.whitespaceSensitive, symbolSensitive: q.symbolSensitive !== false });
      extra = { response, needsManualGrading: false };
    }
    if (isCorrect) earned += points;
    answers.push({ ...base, ...extra, isCorrect, awarded: isCorrect ? points : 0, needsManualGrading: false });
  }
  // Questions the attempt left out still count, as unanswered.
  for (const q of questions) {
    if (seen.has(q.id) || submission.partialDraw === true) continue;
    const points = Number(q.points) || 5; total += points;
    const manual = q.manualCheck || q.needsManualGrading || !['mcq', 'truefalse', 'number', 'fillblank', 'matching', 'imagedrag'].includes(q.type);
    if (manual) pending += points;
    answers.push({ questionId: q.id, type: q.type, points, isCorrect: false, awarded: manual ? null : 0, needsManualGrading: !!manual, unanswered: true });
  }
  return { ...submission, answers, score: earned, total, autoGradedTotal: total - pending, pendingPoints: pending, gradedBy: 'server' };
}

/* ---------- write side ---------- */
const byId = list => new Map((Array.isArray(list) ? list : []).filter(x => x && x.id != null).map(x => [String(x.id), x]));
function changedRecords(before, after) {
  const a = byId(before), b = byId(after), out = [];
  for (const [id, item] of b) if (!a.has(id) || !isDeepStrictEqual(a.get(id), item)) out.push({ id, before: a.get(id), after: item });
  for (const [id, item] of a) if (!b.has(id)) out.push({ id, before: item, after: undefined });
  return out;
}
function teaches(store, username, subjectCode) {
  return (store.read('subjectAssignments', []) || []).some(a => a.subjectCode === subjectCode && ((a.facultyIds || []).includes(username) || a.facultyId === username));
}
function examMaker(store, username, subjectCode) {
  const assignments = store.read('roleAssignments', null);
  if (!Array.isArray(assignments)) return true; // roles not in use
  const roles = new Map((store.read('accessRoles', []) || []).map(r => [r.id, r]));
  const now = Date.now();
  return assignments.some(a => a.username === username && (a.subjectCode === '*' || a.subjectCode === subjectCode)
    && roles.get(a.roleId)?.grants?.['exam.manage'] && !(a.expiresAt && Date.parse(a.expiresAt) <= now));
}
function coreAllowed(store, session, permission) {
  const role = norm(session.role);
  const legacyOff = store.read('systemSettings', {})?.permissionOverrides?.[role]?.[permission] === false;
  const doc = store.read('pagePermissions', {}) || {};
  return PagePermissions.decide(doc, { role, username: session.username, assignments: store.read('roleAssignments', []) || [] }, permission, !legacyOff);
}
const CORE_FOR = { exams: 'exam.own.manage', questions: 'exam.own.manage', questionDrafts: 'exam.own.manage', studentSubmissions: 'grade.own.manage' };

function guardFaculty(store, session, key, next) {
  const me = session.username;
  if (CORE_FOR[key] && !coreAllowed(store, session, CORE_FOR[key])) {
    if (changedRecords(store.read(key, []), next).length) throw forbid('That action is turned off for your role.');
    return next;
  }
  if (key === 'exams') {
    for (const c of changedRecords(store.read('exams', []), next)) {
      const subject = (c.after || c.before)?.subjectCode, also = c.before && c.after && c.before.subjectCode !== c.after.subjectCode ? c.before.subjectCode : null;
      for (const code of [subject, also].filter(Boolean)) {
        if (!teaches(store, me, code)) throw forbid(`You do not teach ${code}.`);
        if (!examMaker(store, me, code)) throw forbid(`Only Exam makers can create or change exams in ${code}.`);
      }
    }
  }
  if (key === 'questions' || key === 'questionDrafts') {
    const exams = new Map((store.read('exams', []) || []).map(e => [e.id, e]));
    for (const c of changedRecords(store.read(key, []), next)) {
      const examId = (c.after || c.before)?.examId; if (!examId) continue;
      const code = exams.get(examId)?.subjectCode; if (!code) continue; // a new exam not saved yet (drafts)
      if (!teaches(store, me, code)) throw forbid(`You do not teach ${code}.`);
      if (!examMaker(store, me, code)) throw forbid(`Only Exam makers can change questions in ${code}.`);
    }
  }
  if (key === 'subjectWorkspaceContent') {
    for (const c of changedRecords(store.read(key, []), next)) {
      const code = (c.after || c.before)?.subjectCode;
      if (code && !teaches(store, me, code)) throw forbid(`You do not teach ${code}.`);
    }
  }
  if (key === 'studentSubmissions') {
    const exams = new Map((store.read('exams', []) || []).map(e => [e.id, e]));
    for (const c of changedRecords(store.read(key, []), next)) {
      const code = exams.get((c.after || c.before)?.examId)?.subjectCode;
      if (!c.after) continue; // a stale page left it out; kept below
      if (!c.before) throw forbid('Professors cannot create student submissions.');
      if (code && !teaches(store, me, code)) throw forbid(`You do not teach ${code}.`);
    }
    // Grading updates records; a submission missing from the page (it arrived after the page loaded) is kept.
    const incoming = byId(next), kept = (store.read(key, []) || []).filter(x => !incoming.has(String(x.id)));
    return [...(Array.isArray(next) ? next : []), ...kept];
  }
  return next;
}

function guardStudent(store, session, key, next) {
  const me = session.username;
  if (key === 'studentSubmissions') {
    const existing = Array.isArray(store.read(key, [])) ? store.read(key, []) : [];
    const known = new Set(existing.map(s => String(s.id)));
    const exams = new Map((store.read('exams', []) || []).map(e => [e.id, e]));
    const added = (Array.isArray(next) ? next : []).filter(s => s && s.studentId === me && !known.has(String(s.id)));
    for (const s of added) {
      const exam = exams.get(s.examId);
      if (!exam) throw forbid('That examination does not exist.');
      const limit = Math.max(1, Number(exam.maxAttempts) || 1);
      const used = existing.filter(x => x.studentId === me && x.examId === s.examId).length;
      if (used >= limit) throw forbid('No attempts are left for this examination.');
    }
    // Everything already on the server stays exactly as it is; only new attempts are added, graded here.
    return [...existing, ...added.map(s => grade(store, s))];
  }
  if (key === 'examAttempts') {
    const existing = store.read(key, {}) || {};
    if (Array.isArray(existing) || Array.isArray(next)) {
      const others = (Array.isArray(existing) ? existing : []).filter(a => a?.studentId !== me);
      return [...others, ...(Array.isArray(next) ? next : []).filter(a => a?.studentId === me)];
    }
    const mine = Object.fromEntries(Object.entries(next || {}).filter(([k, a]) => k.startsWith(`${me}::`) && (!a?.studentId || a.studentId === me)));
    const others = Object.fromEntries(Object.entries(existing).filter(([k]) => !k.startsWith(`${me}::`)));
    return { ...others, ...mine };
  }
  return next;
}

function guardWrite(store, session, key, next) {
  const role = norm(session?.role);
  if (role === 'student') return guardStudent(store, session, key, next);
  if (role === 'faculty') return guardFaculty(store, session, key, next);
  return next;
}

module.exports = { filterRead, guardWrite, grade, stripQuestion, permutation };
