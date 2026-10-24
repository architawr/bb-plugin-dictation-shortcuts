import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountKeyboard, toggleNativeVoice } from '../keyboard';

function fixture() {
  const spaces: string[] = [];
  const dom = new JSDOM('<div data-app-composer><form data-promptbox><textarea></textarea></form></div><input id="other">');
  const { document: doc } = dom.window;
  Object.defineProperty(dom.window.HTMLElement.prototype, 'getClientRects', { value() { return this.hidden ? [] : [{}]; } });
  const root = doc.querySelector<HTMLElement>('[data-app-composer]')!;
  const editor = root.querySelector('textarea')!;
  const clicks: string[] = [];
  function controls(...labels: string[]) {
    root.querySelectorAll('button').forEach(b => b.remove());
    for (const label of labels) {
      const b = doc.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', label);
      b.onclick = () => { clicks.push(label); }; root.append(b);
    }
  }
  const dispose = mountKeyboard(doc, {holdDelayMs: 20, insertSpace: () => { spaces.push(" "); }});
  function key(key: string, options: KeyboardEventInit = {}, target: Element = editor, type = 'keydown') {
    const e = new dom.window.KeyboardEvent(type, { key, bubbles: true, cancelable: true, ...options });
    target.dispatchEvent(e); return e;
  }
  return { spaces, dom, doc, root, editor, clicks, controls, dispose, key };
}

test('toggle targets native start, never send', () => {
  const f = fixture(); f.controls('Start voice input', 'Send voice input');
  assert.equal(toggleNativeVoice(f.root), true);
  assert.deepEqual(f.clicks, ['Start voice input']); f.dom.window.close();
});
test('Enter finishes into draft and does not submit; next fresh Enter works', () => {
  const f = fixture(); f.controls('Cancel recording', 'Stop and add to draft', 'Send voice input');
  assert.equal(f.key('Enter').defaultPrevented, true);
  f.controls('Start voice input');
  assert.equal(f.key('Enter', { repeat: true }).defaultPrevented, true);
  f.key('Enter', {}, f.editor, 'keyup');
  assert.equal(f.key('Enter').defaultPrevented, false);
  assert.deepEqual(f.clicks, ['Stop and add to draft']); f.dom.window.close();
});
test('Enter while transcribing is swallowed without clicking send', () => {
  const f = fixture(); f.controls('Cancel transcription', 'Send voice input');
  assert.equal(f.key('Enter').defaultPrevented, true); assert.deepEqual(f.clicks, []); f.dom.window.close();
});
for (const label of ['Cancel recording', 'Cancel transcription']) test(`Escape clicks ${label}`, () => {
  const f = fixture(); f.controls(label);
  assert.equal(f.key('Escape').defaultPrevented, true); assert.deepEqual(f.clicks, [label]); f.dom.window.close();
});
test('outside input and IME and modifier keys keep native behavior', () => {
  const f = fixture(); f.controls('Cancel recording', 'Stop and add to draft');
  assert.equal(f.key('Enter', {}, f.doc.querySelector('#other')!).defaultPrevented, false);
  assert.equal(f.key('Enter', { isComposing: true }).defaultPrevented, false);
  assert.equal(f.key('Enter', { shiftKey: true }).defaultPrevented, false);
  assert.deepEqual(f.clicks, []); f.dom.window.close();
});
test('visible menus and dialogs retain Escape', () => {
  const f = fixture(); f.controls('Cancel recording');
  const overlay = f.doc.createElement('div'); overlay.setAttribute('role', 'dialog'); f.doc.body.append(overlay);
  assert.equal(f.key('Escape').defaultPrevented, false); assert.deepEqual(f.clicks, []); f.dom.window.close();
});
test('body fallback handles native focus loss, but refuses ambiguous panes', () => {
  const f = fixture(); f.controls('Cancel recording');
  assert.equal(f.key('Escape', {}, f.doc.body).defaultPrevented, true);
  f.doc.body.append(f.root.cloneNode(true));
  assert.equal(f.key('Escape', {}, f.doc.body).defaultPrevented, false); f.dom.window.close();
});
test('missing/disabled/ambiguous controls fail closed', () => {
  const f = fixture(); f.controls('Send voice input'); assert.equal(toggleNativeVoice(f.root), false);
  f.controls('Start voice input'); f.root.querySelector('button')!.disabled = true;
  assert.equal(toggleNativeVoice(f.root), false);
  f.controls('Start voice input', 'Start voice input'); assert.equal(toggleNativeVoice(f.root), false);
  assert.deepEqual(f.clicks, []); f.dom.window.close();
});
test('cleanup removes listeners', () => {
  const f = fixture(); f.controls('Cancel recording'); f.dispose();
  assert.equal(f.key('Escape').defaultPrevented, false); assert.deepEqual(f.clicks, []); f.dom.window.close();
});

const pause = () => new Promise(resolve => setTimeout(resolve, 40));
test('tap Space inserts exactly one space, never records', () => {
  const f=fixture(); f.controls('Start voice input');
  assert.equal(f.key(' ').defaultPrevented,true); f.key(' ',{},f.editor,'keyup');
  assert.deepEqual(f.spaces,[' ']);assert.deepEqual(f.clicks,[]);f.dispose();f.dom.window.close();
});
test('hold Space starts once and release stops into draft, no space inserted', async () => {
  const f=fixture(); f.controls('Start voice input'); f.key(' '); await pause();
  f.key(' ',{repeat:true}); f.controls('Cancel recording','Stop and add to draft','Send voice input');
  f.key(' ',{},f.editor,'keyup');
  assert.deepEqual(f.clicks,['Start voice input','Stop and add to draft']);assert.deepEqual(f.spaces,[]);f.dispose();f.dom.window.close();
});
test('release before asynchronous microphone start still stops when ready', async () => {
  const f=fixture(); f.controls('Start voice input'); f.key(' ');await pause(); f.key(' ',{},f.editor,'keyup');
  f.controls('Cancel recording','Stop and add to draft');await pause();
  assert.deepEqual(f.clicks,['Start voice input','Stop and add to draft']);f.dispose();f.dom.window.close();
});
test('Escape cancels held dictation and release never restarts or inserts', async () => {
  const f=fixture();f.controls('Start voice input');f.key(' ');await pause();f.controls('Cancel recording','Stop and add to draft');
  f.key('Escape');f.key(' ',{repeat:true});f.key(' ',{},f.editor,'keyup');
  assert.deepEqual(f.clicks,['Start voice input','Cancel recording']);assert.deepEqual(f.spaces,[]);f.dispose();f.dom.window.close();
});
test('normal fast typing flushes pending space before following character', () => {
  const f=fixture();f.controls('Start voice input');f.key(' ');f.key('a');f.key(' ',{},f.editor,'keyup');
  assert.deepEqual(f.spaces,[' ']);assert.deepEqual(f.clicks,[]);f.dispose();f.dom.window.close();
});
test('Space on other inputs and on buttons is not intercepted', () => {
  const f=fixture();f.controls('Start voice input');
  assert.equal(f.key(' ',{},f.doc.querySelector('#other')!).defaultPrevented,false);
  assert.equal(f.key(' ',{},f.root.querySelector('button')!).defaultPrevented,false);
  f.dispose();f.dom.window.close();
});
test('window blur finishes active hold so microphone cannot remain stuck', async () => {
  const f=fixture();f.controls('Start voice input');f.key(' ');await pause();f.controls('Cancel recording','Stop and add to draft');
  f.dom.window.dispatchEvent(new f.dom.window.Event('blur'));
  assert.deepEqual(f.clicks,['Start voice input','Stop and add to draft']);f.dispose();f.dom.window.close();
});
test('Escape before permission resolves remains cancel after Space release',async()=>{
 const f=fixture();f.controls('Start voice input');f.key(' ');await pause();
 f.key('Escape');f.key(' ',{},f.editor,'keyup');f.controls('Cancel recording','Stop and add to draft');await pause();
 assert.deepEqual(f.clicks,['Start voice input','Cancel recording']);f.dispose();f.dom.window.close();
});
