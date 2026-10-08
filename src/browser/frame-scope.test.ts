import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { buildFindJs, buildSemanticFindJs, type FindResult, type FindError } from './find.js';
import { boundingRectResolvedJs, clickResolvedJs, getValueResolvedJs, resolveTargetJs } from './target-resolver.js';
import { generateSnapshotJs } from './dom-snapshot.js';

describe('same-origin frame targets', () => {
  it('allocates a fresh ref when a later snapshot reused the old number on another control', () => {
    const dom = new JSDOM('<button id="parent">Parent edit</button><iframe id="reservations"></iframe>', { runScripts: 'outside-only' });
    const doc = dom.window.document.querySelector('iframe')!.contentDocument!;
    doc.body.innerHTML = '<table><tr><th>Action</th></tr><tr><td><button id="edit">Edit reservation</button></td></tr></table>';
    const first = dom.window.eval(buildFindJs('#edit', { frame: '#reservations' })) as FindResult;
    dom.window.eval(generateSnapshotJs());
    const second = dom.window.eval(buildFindJs('#edit', { frame: '#reservations' })) as FindResult;
    expect(second.entries[0].ref).not.toBe(first.entries[0].ref);
    expect(dom.window.eval(resolveTargetJs(String(second.entries[0].ref), { frame: '#reservations' }))).toMatchObject({ ok: true, match_level: 'exact' });
    dom.window.close();
  });

  it('finds, resolves and clicks the requested frame without touching an identical parent control', () => {
    const dom = new JSDOM('<button id="edit">Parent edit</button><iframe id="reservations"></iframe>', { runScripts: 'outside-only' });
    const frame = dom.window.document.querySelector('iframe')!;
    frame.contentDocument!.body.innerHTML = '<button id="edit">Edit reservation</button><input id="start" value="12:30">';
    const button = frame.contentDocument!.querySelector('button')!;
    dom.window.document.elementFromPoint = () => frame;
    let clicks = 0;
    button.addEventListener('click', () => clicks++);

    const result = dom.window.eval(buildFindJs('#edit', { frame: '#reservations' })) as FindResult;
    expect(result.entries.map((entry: { text: string }) => entry.text)).toEqual(['Edit reservation']);
    expect(dom.window.eval(resolveTargetJs(String(result.entries[0].ref)))).toMatchObject({ ok: false, code: 'frame_mismatch' });
    expect(dom.window.eval(resolveTargetJs(String(result.entries[0].ref), { frame: '#reservations' }))).toMatchObject({ ok: true });
    button.scrollIntoView = () => {};
    dom.window.eval(clickResolvedJs());
    expect(clicks).toBe(1);

    expect(dom.window.eval(resolveTargetJs('#start', { frame: '#reservations' }))).toMatchObject({ ok: true });
    expect(dom.window.eval(getValueResolvedJs())).toBe('12:30');
    dom.window.close();
  });

  it('scopes semantic discovery to the selected frame', () => {
    const dom = new JSDOM('<button>Edit</button><iframe id="reservations"></iframe>', { runScripts: 'outside-only' });
    const doc = dom.window.document.querySelector('iframe')!.contentDocument!;
    doc.body.innerHTML = '<button>Edit</button>';
    const button = doc.querySelector('button')!;
    button.getBoundingClientRect = () => ({ width: 100, height: 30, left: 0, top: 0, right: 100, bottom: 30, x: 0, y: 0, toJSON() {} });
    const result = dom.window.eval(buildSemanticFindJs({ role: 'button', name: 'Edit', frame: '#reservations' })) as FindResult;
    expect(result.matches_n).toBe(1);
    expect(button.getAttribute('data-opencli-ref')).toBe(String(result.entries[0].ref));
    dom.window.close();
  });

  it('rejects a missing or ambiguous frame instead of falling back to the parent', () => {
    const dom = new JSDOM('<button>Edit</button><iframe></iframe><iframe></iframe>', { runScripts: 'outside-only' });
    for (const [frame, code] of [['#missing', 'selector_not_found'], ['iframe', 'selector_ambiguous']]) {
      expect((dom.window.eval(buildFindJs('button', { frame })) as FindError).error.code).toBe(code);
      expect(dom.window.eval(resolveTargetJs('button', { frame }))).toMatchObject({ ok: false, code });
    }
    dom.window.close();
  });

  it('translates a frame click into top-level viewport coordinates', () => {
    const dom = new JSDOM('<iframe></iframe>', { runScripts: 'outside-only' });
    const frame = dom.window.document.querySelector('iframe')!;
    frame.contentDocument!.body.innerHTML = '<button>Edit</button>';
    const button = frame.contentDocument!.querySelector('button')!;
    Object.defineProperties(frame, { clientLeft: { value: 2 }, clientTop: { value: 2 } });
    frame.getBoundingClientRect = () => ({ left: 100, top: 200, width: 300, height: 200, right: 400, bottom: 400, x: 100, y: 200, toJSON() {} });
    button.getBoundingClientRect = () => ({ left: 10, top: 20, width: 80, height: 30, right: 90, bottom: 50, x: 10, y: 20, toJSON() {} });
    frame.contentDocument!.elementFromPoint = () => button;
    dom.window.document.elementFromPoint = () => frame;
    (dom.window as unknown as { __resolved: Element }).__resolved = button;
    const result = dom.window.eval(boundingRectResolvedJs({ skipScroll: true, forClick: true }));
    expect(result).toMatchObject({ x: 152, y: 237, hit: 'target', visible: true });
    dom.window.close();
  });
});
