import { it } from 'node:test';
import assert from 'node:assert/strict';
import React, { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SongEditorSplit } from '../src/components/SongEditor/SongEditorSplit';
import { SongPreviewPanel } from '../src/components/SongEditor/SongPreviewPanel';
import { clampEditorSplit, readEditorSplit, saveEditorSplit, EDITOR_SPLIT_STORAGE_KEY } from '../src/editor/splitPreference';
import { contentToEditor, emptySongMeta } from '../src/editor/songEditorModel';
import { runHook } from './hookHarness';

type Element = ReactElement<Record<string, unknown>>;
function elements(node: ReactNode): Element[] {
  const found: Element[] = [];
  React.Children.forEach(node, (child) => {
    if (!isValidElement<Record<string, unknown>>(child)) return;
    found.push(child, ...elements(child.props.children as ReactNode));
  });
  return found;
}
const content = { editor: createElement('p', null, 'Editor'), preview: createElement('p', null, 'Vista previa') };

function memoryStorage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

it('split ratios start at 50, remain between 30 and 70 and reject invalid values', () => {
  assert.deepEqual([-100, 30, 49.7, 50, 70, 200, NaN, Infinity, null, '60'].map(clampEditorSplit), [30, 30, 50, 50, 70, 70, 50, 50, 50, 50]);
});

it('preferences survive new editor sessions, corrupted storage and storage failures', () => {
  const storage = memoryStorage();
  storage.setItem('existing-song-draft', 'unchanged');
  assert.equal(readEditorSplit(storage), 50);
  saveEditorSplit(63, storage);
  assert.equal(readEditorSplit(storage), 63);
  saveEditorSplit(90, storage);
  assert.equal(readEditorSplit(storage), 70);
  saveEditorSplit(-1, storage);
  assert.equal(readEditorSplit(storage), 30);
  for (const raw of ['invalid', 'null', '"60"', '{}', 'false']) {
    storage.setItem(EDITOR_SPLIT_STORAGE_KEY, raw);
    assert.equal(readEditorSplit(storage), 50);
  }
  const blocked = { getItem: () => { throw new Error('Blocked'); }, setItem: () => { throw new Error('Blocked'); } };
  assert.equal(readEditorSplit(blocked), 50);
  assert.doesNotThrow(() => saveEditorSplit(60, blocked));
  assert.equal(storage.getItem('existing-song-draft'), 'unchanged');
});

it('separator exposes a name, orientation, limits, current value and its controlled panel', () => {
  const html = renderToStaticMarkup(createElement(SongEditorSplit, content));
  assert.match(html, /role="separator"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /aria-orientation="vertical"/);
  assert.match(html, /aria-valuemin="30"/);
  assert.match(html, /aria-valuemax="70"/);
  assert.match(html, /aria-valuenow="50"/);
  const panelId = /aria-controls="([^"]+)"/.exec(html)![1];
  assert.ok(html.includes(`id="${panelId}"`));
  assert.match(html, /focus-visible:ring-2/);
  assert.match(html, /motion-reduce:transition-none/);
  assert.match(html, /hidden[^"]*xl:flex/);
});

it('keyboard resizing, Home, End and reset save the preference for another song', () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const storage = memoryStorage();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage } });
  const view = runHook(() => SongEditorSplit(content));
  const separator = () => elements(view.current as ReactNode).find((entry) => entry.props.role === 'separator')!;
  const press = (key: string) => {
    let prevented = false;
    (separator().props.onKeyDown as (event: unknown) => void)({ key, preventDefault: () => { prevented = true; }, stopPropagation: () => {} });
    view.flush();
    return prevented;
  };
  try {
    assert.equal(press('ArrowLeft'), true);
    assert.equal(separator().props['aria-valuenow'], 49);
    press('ArrowRight');
    assert.equal(separator().props['aria-valuenow'], 50);
    press('Home'); press('ArrowLeft');
    assert.equal(separator().props['aria-valuenow'], 30);
    press('End'); press('ArrowRight');
    assert.equal(separator().props['aria-valuenow'], 70);
    assert.equal(storage.getItem(EDITOR_SPLIT_STORAGE_KEY), '70');
    (separator().props.onDoubleClick as () => void)();
    view.flush();
    assert.equal(separator().props['aria-valuenow'], 50);
    assert.equal(storage.getItem(EDITOR_SPLIT_STORAGE_KEY), '50');
    press('End'); press('Enter');
    assert.equal(separator().props['aria-valuenow'], 50);
    assert.equal(press('Tab'), false);
    press('ArrowRight');
    const another = runHook(() => SongEditorSplit(content));
    assert.equal(elements(another.current as ReactNode).find((entry) => entry.props.role === 'separator')!.props['aria-valuenow'], 51);
    another.unmount();
  } finally {
    view.unmount();
    if (saved) Object.defineProperty(globalThis, 'window', saved); else Reflect.deleteProperty(globalThis, 'window');
  }
});

it('mouse and touch resizing clamp, capture pointers and preserve edited song data', () => {
  const saved = ['window', 'document'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  const storage = memoryStorage();
  storage.setItem('existing-song-draft', 'unchanged');
  const style = { userSelect: 'text', cursor: 'crosshair' };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { body: { style } } });
  const original = contentToEditor('[Verso 1]\n[G]Hola', { ...emptySongMeta(), title: 'Original', recommendedCapo: 5 });
  const view = runHook(() => {
    const [doc, setDoc] = React.useState(original);
    const tree = SongEditorSplit({
      editor: createElement('input', { value: doc.meta.title, onChange: (event: React.ChangeEvent<HTMLInputElement>) => setDoc({ ...doc, meta: { ...doc.meta, title: event.target.value } }) }),
      preview: createElement(SongPreviewPanel, { doc }),
    });
    return { doc, tree };
  });
  const nodes = () => elements(view.current.tree as ReactNode);
  const separator = () => nodes().find((entry) => entry.props.role === 'separator')!;
  const captured = new Set<number>();
  let focused = false;
  const target = {
    getBoundingClientRect: () => ({ width: 16 }), focus: () => { focused = true; },
    setPointerCapture: (id: number) => captured.add(id), hasPointerCapture: (id: number) => captured.has(id),
    releasePointerCapture: (id: number) => captured.delete(id),
  };
  const pointer = (name: string, x: number, id = 1, pointerType = 'mouse', button = 0) => {
    (separator().props[name] as (event: unknown) => void)({ currentTarget: target, clientX: x, pointerId: id, pointerType, button, isPrimary: true, preventDefault: () => {} });
    view.flush();
  };
  try {
    (nodes().find((entry) => entry.type === 'input')!.props.onChange as (event: unknown) => void)({ target: { value: 'Editada' } });
    view.flush();
    const edited = view.current.doc;
    const snapshot = JSON.stringify(edited);
    const root = view.current.tree as Element;
    (root.props.ref as { current: unknown }).current = { getBoundingClientRect: () => ({ width: 1016 }) };
    pointer('onPointerDown', 500, 1, 'mouse', 2);
    assert.equal(captured.size, 0);
    pointer('onPointerDown', 500);
    assert.equal(focused, true);
    assert.equal(captured.has(1), true);
    assert.equal(style.userSelect, 'none');
    assert.equal(style.cursor, 'col-resize');
    pointer('onPointerMove', 900, 2);
    assert.equal(separator().props['aria-valuenow'], 50);
    pointer('onPointerMove', 600);
    assert.equal(separator().props['aria-valuenow'], 60);
    pointer('onPointerMove', 2000);
    assert.equal(separator().props['aria-valuenow'], 70);
    pointer('onPointerMove', -2000);
    assert.equal(separator().props['aria-valuenow'], 30);
    pointer('onPointerUp', -2000);
    assert.equal(captured.size, 0);
    assert.equal(storage.getItem(EDITOR_SPLIT_STORAGE_KEY), '30');
    assert.deepEqual(style, { userSelect: 'text', cursor: 'crosshair' });
    pointer('onPointerDown', 300, 3, 'touch');
    pointer('onPointerMove', 500, 3, 'touch');
    assert.equal(separator().props['aria-valuenow'], 50);
    pointer('onPointerCancel', 500, 3, 'touch');
    assert.equal(storage.getItem(EDITOR_SPLIT_STORAGE_KEY), '50');
    assert.deepEqual(style, { userSelect: 'text', cursor: 'crosshair' });
    assert.equal(view.current.doc, edited);
    assert.equal(JSON.stringify(view.current.doc), snapshot);
    assert.equal(nodes().find((entry) => entry.type === SongPreviewPanel)!.props.doc, edited);
    assert.equal(storage.getItem('existing-song-draft'), 'unchanged');
    pointer('onPointerDown', 500, 4);
    pointer('onPointerMove', 600, 4);
  } finally {
    view.unmount();
    assert.deepEqual(style, { userSelect: 'text', cursor: 'crosshair' });
    assert.equal(storage.getItem(EDITOR_SPLIT_STORAGE_KEY), '60');
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name);
    }
  }
});
