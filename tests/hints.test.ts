import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountHints} from '../hints';
const wait = () => new Promise(r=>setTimeout(r,750));
function setup(enabled=true) {
 const dom=new JSDOM('<div data-app-composer><button aria-label="Start voice input" title="Original"></button></div>');
 Object.defineProperty(dom.window.HTMLElement.prototype,'getClientRects',{value(){return [{}];}});
 const doc=dom.window.document;
 const dispose=mountHints(doc,async()=>({generalSettings:{showKeyboardHints:enabled}}));
 return {dom,doc,dispose};
}
test('no browser tooltip, compact modifier badges, release and restoration',async()=>{
 const f=setup();const button=f.doc.querySelector('button')!;
 assert.equal(button.hasAttribute('title'),false);
 f.dom.window.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'Control',ctrlKey:true}));
 assert.equal(f.doc.querySelectorAll('[data-dictation-hint]').length,0);await wait();
 assert.equal(f.doc.querySelector('[data-dictation-hint]')!.textContent,'Space');
 assert.ok(f.doc.querySelector('[data-dictation-hint]')!.classList.contains('bg-state-hover'));
 assert.ok(f.doc.querySelector('[data-dictation-hint]')!.classList.contains('opacity-60'));
 f.dom.window.dispatchEvent(new f.dom.window.KeyboardEvent('keyup',{key:'Control'}));
 assert.equal(f.doc.querySelectorAll('[data-dictation-hint]').length,0);
 f.dispose();assert.equal(button.title,'Original');assert.equal(button.hasAttribute('aria-keyshortcuts'),false);f.dom.window.close();
});
test('BB showKeyboardHints=false suppresses badges',async()=>{
 const f=setup(false);
 f.dom.window.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'Control',ctrlKey:true}));await wait();
 assert.equal(f.doc.querySelectorAll('[data-dictation-hint]').length,0);f.dispose();f.dom.window.close();
});

test('augments only linked native tooltip and restores its original text',async()=>{
 const f=setup();const b=f.doc.querySelector('button')!;
 const tooltip=f.doc.createElement('div');tooltip.dataset.side='top';
 tooltip.append('Start voice input · Right-click for voice preferences');
 const accessible=f.doc.createElement('span');accessible.id='voice-tooltip';accessible.setAttribute('role','tooltip');accessible.textContent=tooltip.textContent;
 tooltip.append(accessible);f.doc.body.append(tooltip);b.setAttribute('aria-describedby','voice-tooltip');
 await new Promise(r=>setTimeout(r,20));
 assert.match(tooltip.firstChild!.textContent!,/Hold Space/);assert.match(accessible.textContent!,/Right-click/);
 assert.equal(f.doc.querySelectorAll('[role=tooltip]').length,1);assert.equal(b.hasAttribute('title'),false);
 f.dispose();assert.equal(tooltip.firstChild!.textContent,'Start voice input · Right-click for voice preferences');
 assert.equal(accessible.textContent,'Start voice input · Right-click for voice preferences');
 assert.equal(tooltip.style.whiteSpace,'');f.dom.window.close();
});
