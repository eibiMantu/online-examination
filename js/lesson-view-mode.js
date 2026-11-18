/* ==================================================================
   Weekly lessons view switch (Student and Professor):
   Compact  = clean list of lesson rows; click a row for the slideshow.
   Expanded = every lesson's content shown inline (videos, visuals, text),
              read without opening the slideshow.
   The choice is remembered per role in this browser.
   ================================================================== */
const LessonViewMode = (() => {
  const key = () => `lessonViewMode:${document.body.dataset.role || 'user'}`;
  const read = () => { try { return localStorage.getItem(key()) === 'expanded' ? 'expanded' : 'compact'; } catch (_) { return 'compact'; } };
  function apply(root, mode) {
    root.classList.toggle('lessons-expanded', mode === 'expanded');
    root.querySelectorAll('.lesson-view-switch button').forEach(button => { const on = button.dataset.mode === mode; button.classList.toggle('active', on); button.setAttribute('aria-pressed', String(on)); });
    if (mode === 'expanded') root.querySelectorAll('details.learning-cell:not(.locked), details.student-content-block').forEach(cell => { cell.open = true; });
  }
  /* heading: the element the switch is placed after (the section title). */
  function mount(root, heading) {
    if (!root || !heading) return;
    if (!heading.parentElement.querySelector('.lesson-view-switch')) {
      heading.insertAdjacentHTML('afterend', `<div class="lesson-view-switch" role="group" aria-label="Lesson view"><button type="button" data-mode="compact">&#9776; Compact</button><button type="button" data-mode="expanded">&#9638; Expanded</button></div>`);
      heading.parentElement.querySelector('.lesson-view-switch').addEventListener('click', event => {
        const button = event.target.closest('button[data-mode]'); if (!button) return;
        try { localStorage.setItem(key(), button.dataset.mode); } catch (_) {}
        apply(root, button.dataset.mode);
      });
    }
    apply(root, read());
  }
  return { mount, mode: read };
})();
