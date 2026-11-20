/* ==================================================================
   Prompt / dialog stacking for every page.
   - The prompt opened last is always on top (a confirm opened from a
     profile no longer appears behind it).
   - Opening a prompt that is already open (same title, same kind) does
     not stack a copy: the duplicate is removed and the open one is
     brought forward and focused.
   - Escape closes only the top prompt that has a close button.
   ================================================================== */
const OverlayStack = (() => {
  const SELECTOR = '.modal-bg, .confirm-bg, .gv-modal, .role-profile-overlay, .student-profile-dialog, .section-dialog, .professor-load-dialog, .subject-schedule-dialog';
  const BASE = 3000;
  let top = BASE;
  const shown = new WeakSet();
  const visible = el => el.isConnected && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && !el.hidden && el.getClientRects().length > 0;
  const titleOf = el => (el.querySelector('h1,h2,h3,[id$="Title"],[id$="Name"]')?.textContent || el.getAttribute('aria-label') || '').trim().toLowerCase();
  const kindOf = el => el.id || [...el.classList].filter(c => /bg|modal|dialog|overlay/.test(c)).sort().join('.');
  const openOverlays = () => [...document.querySelectorAll(SELECTOR)].filter(visible);

  function raise(el) {
    top += 2;
    el.style.zIndex = String(top);
  }
  function check() {
    const open = openOverlays();
    open.forEach(el => {
      if (shown.has(el)) return;
      // A dynamically created duplicate of an already-open prompt: drop it, keep the first.
      const twin = open.find(o => o !== el && shown.has(o) && !el.id && kindOf(o) === kindOf(el) && titleOf(o) && titleOf(o) === titleOf(el));
      if (twin) { el.remove(); raise(twin); twin.querySelector('button,input,select,textarea')?.focus?.(); return; }
      shown.add(el); raise(el);
    });
    // Forget prompts that were closed, so reopening them brings them to the top again.
    document.querySelectorAll(SELECTOR).forEach(el => { if (shown.has(el) && !visible(el)) shown.delete(el); });
    if (!open.length) top = BASE;
  }
  let queued = false;
  function schedule() { if (queued) return; queued = true; (window.requestAnimationFrame || setTimeout)(() => { queued = false; check(); }); }
  function mount() {
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'open'] });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      const open = openOverlays().sort((a, b) => (Number(b.style.zIndex) || 0) - (Number(a.style.zIndex) || 0));
      const topmost = open[0]; if (!topmost) return;
      const closer = topmost.querySelector('.confirm-cancel,[data-gv-close],[data-sm-close],[data-ap-close],[data-pu-close],.profile-close,.role-profile-close,.section-dialog-close,.professor-load-close,.subject-schedule-close,button.cancel,[aria-label^="Close"]');
      if (closer) { e.preventDefault(); e.stopPropagation(); closer.click(); }
    }, true);
    check();
  }
  return { mount, check };
})();
if (typeof window !== 'undefined') { window.OverlayStack = OverlayStack; if (document.readyState !== 'loading') OverlayStack.mount(); else document.addEventListener('DOMContentLoaded', () => OverlayStack.mount()); }
