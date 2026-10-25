// Narrow adapter to native BB recorder controls. Only BB's own "Send voice input"
// recorder button is used, and only for Enter while Space is held; never the composer Send.
export const ROOT = '[data-app-composer]';
const OVERLAY = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-promptbox-typeahead-menu]';
export function visible(element: HTMLElement): boolean {
  return element.isConnected && element.getClientRects().length > 0
    && element.ownerDocument.defaultView?.getComputedStyle(element).visibility !== 'hidden';
}
export function voiceButton(root: HTMLElement, label: string): HTMLButtonElement | null {
  const matches = Array.from(root.querySelectorAll<HTMLButtonElement>(`button[aria-label="${label}"]`))
    .filter(b => !b.disabled && visible(b));
  return matches.length === 1 ? matches[0] : null;
}
function activeVoice(root: HTMLElement): boolean {
  return !!(voiceButton(root, 'Cancel recording') || voiceButton(root, 'Cancel transcription'));
}
const toggledAt = new WeakMap<HTMLElement, number>();
export function toggleNativeVoice(root: HTMLElement): boolean {
  if (!visible(root)) return false;
  if (voiceButton(root, 'Cancel transcription')) return true;
  const target = voiceButton(root, 'Stop and add to draft') || voiceButton(root, 'Start voice input');
  if (!target) return false;
  const now = Date.now();
  if (now - (toggledAt.get(root) ?? -Infinity) < 400) return true;
  toggledAt.set(root, now); target.click(); return true;
}
export interface KeyboardOptions {
  insertSpace?: (root: HTMLElement) => void;
  focusComposer?: (root: HTMLElement) => void;
  holdDelayMs?: number;
}
export function mountKeyboard(doc: Document, options: KeyboardOptions = {}): () => void {
  let swallowedEnter = false;
  let swallowSpaceUp = false;
  // finish: draft (release Space) < send (Enter while holding) < cancel (Escape).
  type Finish = 'draft' | 'send' | 'cancel';
  const rank: Record<Finish, number> = { draft: 0, send: 1, cancel: 2 };
  let hold: { root: HTMLElement; started: boolean; released: boolean; finish: Finish } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const blockedByOverlay = () => Array.from(doc.querySelectorAll<HTMLElement>(OVERLAY)).some(visible);
  const consume = (e: KeyboardEvent) => { e.preventDefault(); e.stopImmediatePropagation(); };
  const clearTimer = () => { clearTimeout(timer); timer = undefined; };
  const insertSpace = (root: HTMLElement) => {
    if (options.insertSpace) options.insertSpace(root);
    else doc.execCommand('insertText', false, ' ');
  };
  const flushTap = () => {
    if (!hold || hold.started) return;
    const root = hold.root;
    hold = null; clearTimer();
    if (root.isConnected) insertSpace(root);
  };
  // Native start is asynchronous (permissions/device acquisition). If released
  // before it finishes, stop as soon as BB presents recording controls.
  const settleHold = () => {
    if (!hold) return;
    if (!hold.root.isConnected) { hold = null; clearTimer(); return; }
    if (!hold.started || !hold.released) return;
    const target = hold.finish === 'cancel'
      ? voiceButton(hold.root, 'Cancel recording') || voiceButton(hold.root, 'Cancel transcription')
      : hold.finish === 'send'
        ? voiceButton(hold.root, 'Send voice input') || voiceButton(hold.root, 'Stop and add to draft')
        : voiceButton(hold.root, 'Stop and add to draft');
    if (target) { hold = null; target.click(); }
  };
  const releaseHold = (finish: Finish) => {
    clearTimer();
    if (!hold) return;
    if (!hold.started) { hold = null; return; }
    hold.released = true;
    if (rank[finish] > rank[hold.finish]) hold.finish = finish;
    settleHold();
  };
  // A click or window switch interrupts the hold and leaves focus outside the
  // composer; once the transcript lands in the draft, put the caret back so Enter sends.
  let refocus: HTMLElement | null = null;
  const textEntry = (el: Element | null) => !!el?.closest('input, textarea, select, [contenteditable="true"]');
  const focusComposer = (root: HTMLElement) => {
    if (options.focusComposer) options.focusComposer(root);
    else root.querySelector<HTMLElement>('[contenteditable="true"], textarea')?.focus();
  };
  const settleRefocus = () => {
    const root = refocus;
    if (!root) return;
    if (!root.isConnected) { refocus = null; return; }
    if (hold?.root === root || activeVoice(root)) return;
    // The user moved on to another field (or is already back in the editor): leave it.
    if (textEntry(doc.activeElement)) { refocus = null; return; }
    setTimeout(() => {
      if (refocus !== root || !root.isConnected || activeVoice(root) || textEntry(doc.activeElement)) return;
      refocus = null; focusComposer(root);
    }, 0);
  };
  const interrupt = () => {
    if (hold?.started) refocus = hold.root;
    releaseHold('draft');
  };
  const observer = new doc.defaultView!.MutationObserver(() => { settleHold(); settleRefocus(); });
  observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label', 'disabled'] });
  const rootForEvent = (event: KeyboardEvent): HTMLElement | null => {
    const target = event.target instanceof doc.defaultView!.Element ? event.target : null;
    const root = target?.closest<HTMLElement>(ROOT);
    if (root) return root;
    if (target !== doc.body && target !== doc.documentElement) return null;
    const active = Array.from(doc.querySelectorAll<HTMLElement>(ROOT)).filter(r => visible(r) && activeVoice(r));
    return active.length === 1 ? active[0] : null;
  };
  const down = (e: KeyboardEvent) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && swallowedEnter) { consume(e); return; }
    if (hold && e.key === 'Escape') { consume(e); releaseHold('cancel'); return; }
    // Enter while Space is held: stop, transcribe and send in one step via BB's recorder.
    if (hold?.started && e.key === 'Enter') { consume(e); swallowedEnter = true; releaseHold('send'); return; }
    if (e.key === ' ' && swallowSpaceUp) { consume(e); return; }
    if (hold && !hold.started && e.key !== ' ') flushTap();
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || blockedByOverlay()) return;
    if (e.key === ' ' && !e.repeat && !hold) {
      const target = e.target instanceof doc.defaultView!.Element ? e.target : null;
      const editor = target?.closest('[contenteditable="true"], textarea');
      const root = editor?.closest<HTMLElement>(ROOT);
      if (!root || activeVoice(root) || !voiceButton(root, 'Start voice input')) return;
      consume(e); swallowSpaceUp = true;
      hold = { root, started: false, released: false, finish: 'draft' };
      timer = setTimeout(() => {
        if (!hold || !visible(root) || blockedByOverlay()) { releaseHold('cancel'); return; }
        const start = voiceButton(root, 'Start voice input');
        if (!start) { flushTap(); return; }
        hold.started = true;
        start.click();
      }, options.holdDelayMs ?? 300);
      return;
    }
    if (e.key !== 'Enter' && e.key !== 'Escape') return;
    const root = rootForEvent(e);
    if (!root || !activeVoice(root)) return;
    consume(e);
    if (e.key === 'Enter') {
      swallowedEnter = true;
      if (!e.repeat) voiceButton(root, 'Stop and add to draft')?.click();
    } else if (!e.repeat) {
      (voiceButton(root, 'Cancel recording') || voiceButton(root, 'Cancel transcription'))?.click();
    }
  };
  const up = (e: KeyboardEvent) => {
    if (e.key === 'Enter') swallowedEnter = false;
    if (e.key === ' ' && swallowSpaceUp) {
      consume(e); swallowSpaceUp = false;
      if (hold?.started) releaseHold('draft'); else flushTap();
    }
  };
  const blur = () => { swallowedEnter = false; swallowSpaceUp = false; interrupt(); };
  const pointer = () => { if (hold && !hold.started) flushTap(); else interrupt(); };
  const hidden = () => { if (doc.hidden) blur(); };
  doc.addEventListener('keydown', down, true);
  doc.addEventListener('keyup', up, true);
  doc.addEventListener('pointerdown', pointer, true);
  doc.addEventListener('visibilitychange', hidden);
  doc.defaultView?.addEventListener('blur', blur);
  return () => {
    releaseHold('cancel'); hold = null; refocus = null; observer.disconnect();
    doc.removeEventListener('keydown', down, true);
    doc.removeEventListener('keyup', up, true);
    doc.removeEventListener('pointerdown', pointer, true);
    doc.removeEventListener('visibilitychange', hidden);
    doc.defaultView?.removeEventListener('blur', blur);
  };
}
