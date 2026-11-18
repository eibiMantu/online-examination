/* ==================================================================
   Weekly lessons are always shown expanded (videos, visuals and text
   inline). Clicking a lesson row still opens the slideshow viewer.
   ================================================================== */
const LessonViewMode = (() => {
  function mount(root) {
    if (!root) return;
    root.querySelectorAll('.lesson-view-switch').forEach(control => control.remove());
    root.classList.add('lessons-expanded');
    root.querySelectorAll('details.learning-cell:not(.locked), details.student-content-block').forEach(cell => { cell.open = true; });
  }
  return { mount, mode: () => 'expanded' };
})();
