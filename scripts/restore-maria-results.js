'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');
const databasePath = path.join(root, 'data', 'neu-examination.sqlite');
const backupDirectory = path.join(root, 'data', 'backups');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDirectory, `neu-examination-before-maria-results-restore-${stamp}.sqlite`);

fs.mkdirSync(backupDirectory, { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec('PRAGMA wal_checkpoint(FULL)');
database.exec(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);

const read = key => {
  const row = database.prepare('SELECT value_json FROM app_collections WHERE collection_key = ?').get(key);
  return row ? JSON.parse(row.value_json) : [];
};
const write = database.prepare(`INSERT INTO app_collections(collection_key,value_json,updated_at) VALUES(?,?,?)
  ON CONFLICT(collection_key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at`);

const exams = read('exams');
const questions = read('questions');
const subjects = read('subjects');
let submissions = read('studentSubmissions');
const targets = [
  { examId: 'DEMO-EXAM-014', submittedAt: '2026-08-18T09:18:00+08:00' },
  { examId: 'DEMO-EXAM-015', submittedAt: '2026-08-23T10:42:00+08:00' },
  { examId: 'DEMO-EXAM-021', submittedAt: '2026-08-21T11:18:00+08:00' },
  { examId: 'DEMO-EXAM-023', submittedAt: '2026-08-24T12:42:00+08:00' },
  { examId: 'DEMO-EXAM-026', submittedAt: '2026-08-19T13:18:00+08:00' },
  { examId: 'DEMO-EXAM-028', submittedAt: '2026-08-22T14:42:00+08:00' },
  { examId: 'DEMO-REVIEW-MISTAKES', submittedAt: '2026-08-24T15:18:00+08:00' }
];

// Normalize only the deterministic demo restore set. Preserve every genuine
// Student submission, including the later Always-Open attempt.
submissions = submissions.filter(item => !/^DEMO-MARIA-SUB-\d+$/.test(String(item.id || '')));
const restored = [];
for (const [index, target] of targets.entries()) {
  const id = `DEMO-MARIA-SUB-${String(index + 1).padStart(2, '0')}`;
  const exam = exams.find(item => item.id === target.examId);
  if (!exam) throw new Error(`Missing examination ${target.examId}.`);
  const paper = questions.filter(question => question.examId === exam.id);
  if (!paper.length) throw new Error(`Missing questions for ${target.examId}.`);
  const subjectName = subjects.find(subject => subject.code === exam.subjectCode)?.name || 'the topic';
  const answers = paper.map((question, questionIndex) => {
    const correct = exam.id === 'DEMO-REVIEW-MISTAKES' ? questionIndex % 2 === 0 : questionIndex % 6 !== 5;
    const common = {
      questionId: question.id,
      needsManualGrading: false,
      awarded: correct ? (question.points || 2) : 0,
      remark: correct ? '' : 'Review this concept before the next assessment.'
    };
    if (question.type === 'mcq' || question.type === 'truefalse') {
      const selectedIndex = correct
        ? question.options.findIndex(option => option.isCorrect)
        : Math.max(0, question.options.findIndex(option => !option.isCorrect));
      return { ...common, selectedIndex, selectedText: question.options[selectedIndex]?.text || '' };
    }
    if (question.type === 'number') return { ...common, response: correct ? String(question.acceptedValue) : String(Number(question.acceptedValue) + 2) };
    if (question.type === 'fillblank') return { ...common, response: correct ? (question.expectedAnswer || 'practice') : 'study' };
    if (question.type === 'matching') return { ...common, matches: correct ? question.pairs.map((_, pairIndex) => pairIndex) : question.pairs.map((_, pairIndex) => (pairIndex + 1) % question.pairs.length) };
    return { ...common, response: `A practical use of ${subjectName} is applying its concepts to solve a real user or system problem.` };
  });
  const total = paper.reduce((sum, question) => sum + (question.points || 2), 0);
  const score = answers.reduce((sum, answer) => sum + answer.awarded, 0);
  const submission = {
    id,
    studentId: '2025-00002',
    examId: exam.id,
    submittedAt: target.submittedAt,
    total,
    score,
    status: 'graded',
    gradedAt: `${target.submittedAt.slice(0, 10)}T18:00:00+08:00`,
    remarks: index % 3 === 0 ? 'Good work. Review the marked item for improvement.' : 'Well done. Keep practicing the key concepts.',
    answers
  };
  submissions.push(submission);
  restored.push({ id, examId: exam.id, title: exam.title, score, total, answers: answers.length });
}

database.exec('BEGIN IMMEDIATE');
try {
  write.run('studentSubmissions', JSON.stringify(submissions), new Date().toISOString());
  database.exec('COMMIT');
} catch (error) {
  database.exec('ROLLBACK');
  throw error;
} finally {
  database.close();
}

console.log(JSON.stringify({ backupPath, restored, totalMariaSubmissions: submissions.filter(item => item.studentId === '2025-00002').length }, null, 2));
