import { ROOT, visible } from './keyboard';
interface Shortcut { key: string; mod?: boolean; meta?: boolean; control?: boolean; shift?: boolean; alt?: boolean }
interface Config {
  generalSettings?: { showKeyboardHints?: boolean };
  keybindingOverrides?: { command: string; platform?: string | null; shortcut: Shortcut | null }[];
}
export function mountHints(doc: Document, getConfig: () => Promise<Config | undefined>): () => void {
  let disposed = false;
  let enabled = true;
  let held = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let toggle = 'Ctrl+Shift+Space';
  const mac = /Mac|iPhone|iPad/.test(doc.defaultView!.navigator.platform);
  const originals = new Map<HTMLButtonElement, { title: string | null; aria: string | null }>();
  const badges = new Map<HTMLButtonElement, HTMLElement>();
  const tooltipTexts = new Map<Text, { original: string; replacement: string }>();
  const tooltipStyles = new Map<HTMLElement, string>();
  const pillClass = 'pointer-events-none inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-sm bg-state-hover px-1.5 py-1 font-sans text-xs font-normal leading-none tabular-nums text-subtle-foreground opacity-60';
  const labels: Record<string, { hint: string; title: string; aria: string }> = {
    'Start voice input': { hint: 'Space', title: 'Hold Space to dictate · Release to finish', aria: 'Space' },
    'Stop and add to draft': { hint: 'Enter', title: 'Finish dictation and add to draft · Enter / release Space', aria: 'Enter' },
    'Cancel recording': { hint: 'Esc', title: 'Cancel recording · Escape', aria: 'Escape' },
    'Cancel transcription': { hint: 'Esc', title: 'Cancel transcription · Escape', aria: 'Escape' },
  };
  const layer = doc.createElement('div');
  layer.dataset.dictationHints = '';
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:50';
  doc.body.append(layer);
  const setAttribute = (el: Element, key: string, value: string | null) => {
    if (value === null) el.removeAttribute(key); else if (el.getAttribute(key) !== value) el.setAttribute(key, value);
  };
  const update = () => {
    if (disposed) return;
    const current = new Set<HTMLButtonElement>();
    for (const b of doc.querySelectorAll<HTMLButtonElement>(`${ROOT} button[aria-label]`)) {
      const label = b.getAttribute('aria-label')!;
      const info = labels[label];
      if (!info || b.disabled || !visible(b)) continue;
      current.add(b);
      if (!originals.has(b)) originals.set(b, {title: b.getAttribute('title'), aria: b.getAttribute('aria-keyshortcuts')});
            // Do not add a browser title: BB already owns a Radix tooltip.
      setAttribute(b, 'title', null);
      setAttribute(b, 'aria-keyshortcuts', info.aria);
      if (held && enabled) {
        let badge = badges.get(b);
        if (!badge) {
          badge = doc.createElement('kbd'); badge.dataset.dictationHint = ''; badge.setAttribute('aria-hidden', 'true');
          badge.className = pillClass;
          badge.style.cssText = 'position:fixed;transform:translate(-50%,-100%)';
          layer.append(badge); badges.set(b,badge);
        }
        const text = info.hint;
        if (badge.textContent !== text) badge.textContent = text;
        const rect = b.getBoundingClientRect();
        badge.style.left = `${Math.max(30, Math.min(doc.documentElement.clientWidth-30, rect.left + rect.width/2))}px`;
        badge.style.top = `${Math.max(28,rect.top-4)}px`;
      }
    }
    // Follow aria-describedby to BB's existing tooltip; touch only known text
    // nodes, retaining the portal, placement, animation and accessible copy.
    for (const b of current) {
      const label = b.getAttribute('aria-label');
      const expected = label === 'Start voice input'
        ? 'Start voice input · Right-click for voice preferences'
        : label === 'Stop and add to draft' ? 'Add to draft' : null;
      if (!expected) continue;
      const replacement = label === 'Start voice input'
        ? `Hold Space to dictate; release to finish${toggle ? `\nToggle: ${toggle}` : ''}\nRight-click for voice preferences`
        : 'Finish and add to draft · Enter';
      for (const id of (b.getAttribute('aria-describedby') ?? '').split(/\s+/)) {
        const accessible = doc.getElementById(id);
        if (accessible?.getAttribute('role') !== 'tooltip') continue;
        const container = accessible.parentElement;
        if (!container?.hasAttribute('data-side')) continue;
        for (const parent of [container, accessible]) {
          for (const node of Array.from(parent.childNodes)) {
            if (node.nodeType !== 3) continue;
            const text = node as Text;
            const saved = tooltipTexts.get(text);
            if (text.data !== expected && (!saved || text.data !== saved.replacement)) continue;
            if (!tooltipStyles.has(parent)) tooltipStyles.set(parent, parent.style.whiteSpace);
            parent.style.whiteSpace = 'pre-line';
            if (text.data !== replacement) text.data = replacement;
            tooltipTexts.set(text, {original: saved?.original ?? expected, replacement});
          }
        }
      }
    }
    for (const [text,saved] of tooltipTexts) if (!text.isConnected) {
      if (text.data === saved.replacement) text.data = saved.original;
      tooltipTexts.delete(text);
    }
    for (const [element,original] of tooltipStyles) if (!element.isConnected) {
      element.style.whiteSpace = original; tooltipStyles.delete(element);
    }
    for (const [b,badge] of badges) if (!current.has(b) || !held || !enabled) { badge.remove(); badges.delete(b); }
    for (const [b,original] of originals) if (!current.has(b)) {
      setAttribute(b,'title',original.title); setAttribute(b,'aria-keyshortcuts',original.aria); originals.delete(b);
    }
  };
  let refreshedAt = -Infinity;
  const refresh = async () => {
    if (Date.now() - refreshedAt < 1000) return;
    refreshedAt = Date.now();
    try {
      const config = await getConfig(); if (disposed || !config) return;
      enabled = config.generalSettings?.showKeyboardHints !== false;
      const rows = config.keybindingOverrides?.filter(r => r.command === 'plugin:dictation-shortcuts/toggle') ?? [];
      const platform = mac ? 'mac' : /Win/.test(doc.defaultView!.navigator.platform) ? 'windows' : 'linux';
      const override = rows.find(r => r.platform === platform) ?? rows.find(r => !r.platform);
      const shortcut = override ? override.shortcut : { key:'Space',control:true,shift:true };
      toggle = shortcut ? [shortcut.control?(mac?'⌃':'Ctrl'):'',shortcut.alt?(mac?'⌥':'Alt'):'',shortcut.shift?(mac?'⇧':'Shift'):'',shortcut.mod?(mac?'⌘':'Ctrl'):'',shortcut.meta?(mac?'⌘':'Meta'):'',shortcut.key].filter(Boolean).join(mac?' ':'+') : '';
      update();
    } catch { /* Hints must never break dictation during a server disconnect. */ }
  };
  const clear = () => { clearTimeout(timer); timer=undefined; held=false; update(); };
  const down = (e: KeyboardEvent) => {
    const primary = e.key === 'Control' || (mac && e.key === 'Meta');
    if (!primary) { if (!held) clear(); return; }
    if (timer || held) return;
    if (e.shiftKey || e.altKey || (e.key === 'Meta' ? e.ctrlKey : e.metaKey)) { clear(); return; }
    void refresh();
    timer=setTimeout(() => {timer=undefined;held=true;update();},700);
  };
  const up = (e: KeyboardEvent) => { if (!e.ctrlKey && !(mac && e.metaKey)) clear(); };
  const hover = (event: Event) => { if ((event.target as Element)?.closest?.(`${ROOT} button`)) void refresh(); };
  const observer = new doc.defaultView!.MutationObserver(update);
  observer.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-label','disabled','aria-describedby']});
  doc.defaultView?.addEventListener('keydown',down,true);
  doc.defaultView?.addEventListener('keyup',up,true);
  doc.defaultView?.addEventListener('blur',clear);
  doc.defaultView?.addEventListener('resize',update);
  doc.addEventListener('scroll',update,true);
  doc.addEventListener('pointerover',hover);
  update(); void refresh();
  return () => {
    disposed=true;clearTimeout(timer);observer.disconnect();layer.remove();
    for (const [text,saved] of tooltipTexts) if (text.data === saved.replacement) text.data = saved.original;
    for (const [element,original] of tooltipStyles) element.style.whiteSpace = original;
    for (const [b,original] of originals) {setAttribute(b,'title',original.title);setAttribute(b,'aria-keyshortcuts',original.aria);}
    doc.defaultView?.removeEventListener('keydown',down,true);doc.defaultView?.removeEventListener('keyup',up,true);
    doc.defaultView?.removeEventListener('blur',clear);doc.defaultView?.removeEventListener('resize',update);
    doc.removeEventListener('scroll',update,true);doc.removeEventListener('pointerover',hover);
  };
}
