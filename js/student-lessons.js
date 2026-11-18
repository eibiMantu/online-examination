/* ==================================================================
   Student weekly lessons → LessonViewer slideshow.
   Clicking a lesson row opens that week as slides, starting at the row.
   Pages are marked done when shown; quiz pages open the quiz directly.
   Uses the Student page helpers (learningCellState, learningTypeMeta,
   learningCellCompleted, renderStudentLearningVideo, renderStudentVisualLesson,
   openExamDetails, openStudentSubject, captureStudentLearningViewState,
   selectedStudentSubjectCode, currentStudent, exams, subjects) at call time.
   ================================================================== */
const StudentLessons = (() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const ordered = code => DB.read('subjectWorkspaceContent', []).filter(item => item.subjectCode === code).sort((a, b) => a.week - b.week);

  function body(item) {
    // Same renderer as the Professor side, so both show identical pages.
    return LessonViewer.renderContent(item);
  }

  function slidesFor(code, week) {
    const content = ordered(code);
    return content.filter(item => item.week === week).map(item => {
      const position = content.indexOf(item), state = learningCellState(item, position, content), meta = learningTypeMeta(item);
      const sequentialLock = state.locked && /previous page/i.test(state.label);
      const firstOfWeek = content.filter(entry => entry.week === week)[0] === item;
      const exam = item.type === 'exam' ? exams.find(entry => entry.id === item.examId) : null;
      return {
        id: item.id, title: item.title || 'Lesson page', kind: meta.label, icon: meta.icon,
        done: item.type === 'exam' ? false : learningCellCompleted(item.id),
        requiresPrevious: !!item.requiresPrevious,
        // Hard locks (locked/scheduled), or a sequential lock that depends on an earlier week.
        lockedReason: state.locked && (!sequentialLock || firstOfWeek) ? state.label : '',
        html: item.type === 'exam' ? '' : body(item),
        quiz: item.type === 'exam' ? { examId: item.examId, label: 'Open quiz', meta: exam ? `${exam.date ? `Due ${exam.date}` : 'Always open'}${exam.durationMinutes ? ` · ${exam.durationMinutes} min` : ''}` : '' } : null
      };
    });
  }

  function markDone(blockId) {
    const views = DB.read('subjectContentViews', []), now = new Date().toISOString();
    const record = views.find(view => view.studentId === currentStudent.id && view.blockId === blockId);
    if (record) { if (record.completedAt) return; record.completedAt = now; record.viewedAt = record.viewedAt || now; }
    else views.push({ studentId: currentStudent.id, blockId, viewedAt: now, completedAt: now });
    DB.write('subjectContentViews', views);
  }

  function open(blockId) {
    const code = selectedStudentSubjectCode; if (!code) return;
    const item = ordered(code).find(entry => entry.id === blockId); if (!item) return;
    const subject = subjects.find(entry => entry.code === code), slides = slidesFor(code, item.week);
    LessonViewer.open({
      course: `${code}${subject ? ` · ${subject.name}` : ''}`, weekNumber: item.week, weekTitle: item.weekTitle || `Week ${item.week}`,
      slides, start: Math.max(0, slides.findIndex(slide => slide.id === blockId)), markDone: true,
      onView: slide => markDone(slide.id),
      onQuiz: slide => setTimeout(() => openExamDetails(slide.quiz.examId), 0),
      onClose: last => refresh(last?.id)
    });
  }

  /* Re-render the subject page so statuses update, keeping the same week in view. */
  function refresh(blockId) {
    if (!selectedStudentSubjectCode) return;
    pendingStudentLearningViewState = captureStudentLearningViewState(blockId || null);
    openStudentSubject(selectedStudentSubjectCode);
  }

  /* One delegated listener on the subject page: rows open the viewer. */
  function bind() {
    const root = document.getElementById('studentSubjectDetail');
    if (!root || root.dataset.lessonViewerBound) return; root.dataset.lessonViewerBound = '1';
    root.addEventListener('click', event => {
      if (event.target.closest('.learning-status-button,a,iframe,.attached-exam-link')) return;
      const row = event.target.closest('.learning-cell[data-learning-block]');
      if (!row) return;
      if (row.classList.contains('locked-exam-row')) return; // keeps the standard exam prompt
      if (!row.classList.contains('locked') && !event.target.closest('summary')) return;
      event.preventDefault(); event.stopPropagation();
      open(row.dataset.learningBlock);
    }, true);
    root.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const row = event.target.closest?.('.learning-cell.locked[data-learning-block]:not(.locked-exam-row)');
      if (row) { event.preventDefault(); open(row.dataset.learningBlock); }
    });
  }

  /* Locked rows become keyboard-reachable buttons. */
  function decorate() {
    document.querySelectorAll('#studentSubjectDetail .learning-cell.locked[data-learning-block]:not(.locked-exam-row)').forEach(row => { row.setAttribute('role', 'button'); row.tabIndex = 0; });
    const root = document.getElementById('studentSubjectDetail');
    if (typeof LessonViewMode !== 'undefined') LessonViewMode.mount(root, root?.querySelector('.weekly-learning-section>h3'));
  }

  return { open, bind, decorate };
})();
