import { it } from 'node:test';
import assert from 'node:assert/strict';
import React, { createElement, isValidElement, type ReactElement, type ReactNode, type ReactPortal } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ListboxSelect } from '../src/components/ui/ListboxSelect';
import { findSelectMatch, placeSelectPanel } from '../src/components/ui/selectLayout';
import { HistoryView } from '../src/components/History/HistoryView';
import type { PerformanceRecord } from '../src/types/performance';
import { EMPTY_PERFORMANCE_FILTERS } from '../src/utils/performanceHistory';
import { SongMetaForm } from '../src/components/SongEditor/SongMetaForm';
import { emptySongMeta, contentToEditor, editorToSongDraft, type SongMeta } from '../src/editor/songEditorModel';
import { runHook } from './hookHarness';

type Element = ReactElement<Record<string, unknown>>;
function elements(node: ReactNode): Element[] {
  const found: Element[] = [];
  React.Children.forEach(node, (child) => {
    if (isValidElement<Record<string, unknown>>(child)) {
      found.push(child, ...elements(child.props.children as ReactNode));
    } else if (child && typeof child === 'object' && 'children' in child) {
      found.push(...elements((child as ReactPortal).children));
    }
  });
  return found;
}

it('positions desktop and mobile menus inside the screen and above the player when necessary', () => {
  for (const width of [320, 390, 1280]) {
    for (const top of [8, 240, 500]) {
      const rect = { top, bottom: top + 44, right: width - 8, width: 160 };
      const panel = placeSelectPanel(rect, { width, bottom: 600 }, 256, 360);
      assert.ok(panel.left >= 8);
      assert.ok(panel.left + panel.width <= width - 8);
      assert.ok(panel.top >= 8);
      assert.ok(panel.top + panel.maxHeight <= 592);
    }
  }
  const rect = { top: 450, bottom: 494, right: 360, width: 200 };
  const panel = placeSelectPanel(rect, { width: 390, bottom: 550 }, 240, 360);
  assert.ok(panel.top + panel.maxHeight < rect.top);
});

it('typeahead matches case-insensitively, wraps, and leaves unknown queries alone', () => {
  const labels = ['Sin indicar', 'C', 'Cm', 'D', 'Dm'];
  assert.equal(findSelectMatch(labels, 'c', 3), 1);
  assert.equal(findSelectMatch(labels, 'cm', 0), 2);
  assert.equal(findSelectMatch(labels, 'd', 4), 4);
  assert.equal(findSelectMatch(labels, 'z', 0), -1);
  assert.equal(findSelectMatch([], 'c', 0), -1);
});

it('disabled and empty selectors expose their state without submitting a form', () => {
  for (const options of [[], [{ value: 0, label: 'Sin capotraste' }]]) {
    const html = renderToStaticMarkup(createElement(ListboxSelect, { id: 'capo', value: 0, options, label: 'Capotraste', disabled: true, onChange: () => assert.fail('Disabled') }));
    assert.match(html, /disabled=""/);
    assert.match(html, /type="button"/);
    assert.match(html, /role="combobox"/);
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /id="capo"/);
  }
});

it('song controls keep numeric capo, null optional fields and alternative spellings through edits', () => {
  let meta: SongMeta = { ...emptySongMeta(), title: 'Prueba', originalKey: 'Dbm', recommendedCapo: 5, timeSignature: '5/4' };
  const view = runHook(() => SongMetaForm({ meta, categories: [], onChange: (next) => { meta = { ...meta, ...next }; } }));
  try {
    const controls = () => elements(view.current as ReactNode).filter((entry) => entry.type === ListboxSelect);
    const change = (label: string, value: unknown) => {
      const control = controls().find((entry) => entry.props.label === label)!;
      (control.props.onChange as (value: unknown) => void)(value);
      view.flush();
    };
    const capo = controls().find((entry) => entry.props.label === 'Capotraste')!;
    assert.equal(capo.props.value, 5);
    assert.deepEqual((capo.props.options as Array<{ value: number }>).map((entry) => entry.value), Array.from({ length: 12 }, (_, index) => index));
    for (const [label, value] of [['Tonalidad original', 'Dbm'], ['Compás', '5/4']]) {
      assert.ok((controls().find((entry) => entry.props.label === label)!.props.options as Array<{ value: unknown }>).some((entry) => entry.value === value));
    }
    change('Capotraste', 11);
    assert.equal(editorToSongDraft(contentToEditor('[G]Hola', meta)).recommendedCapo, 11);
    change('Capotraste', 0);
    change('Tonalidad original', '');
    change('Compás', '');
    assert.equal(meta.recommendedCapo, 0);
    assert.equal(meta.originalKey, null);
    assert.equal(meta.timeSignature, null);
  } finally { view.unmount(); }
});

it('history selectors update their filters without dropping dates or other choices', () => {
  const record: PerformanceRecord = {
    id: 'record', eventId: 'event', occurrenceDate: '2026-10-14',
    event: { title: 'Misa', type: 'mass', allDay: true, startTime: null, location: '' },
    setlistId: null, setlistName: '', notes: '', createdAt: 0, updatedAt: 0,
    participants: [{ memberId: 'ana', name: 'Ana', roles: [] }],
    songs: [{ id: 'entry', songId: 'song', title: 'Prueba', artist: '', moment: '', performed: true,
      key: 'G', chordKey: null, capoFret: 0, transposeSteps: 0, sections: null, notes: '', transitionToNext: null }],
  };
  let filters = { ...EMPTY_PERFORMANCE_FILTERS, from: '2026-10-01' };
  const view = runHook(() => HistoryView({ records: [record], filters, onChangeFilters: (next) => { filters = next; }, onOpenRecord: () => {}, onGoToCalendar: () => {}, recoveredFromUnreadableData: false }));
  try {
    const change = (label: string, value: string) => {
      const control = elements(view.current as ReactNode).find((entry) => entry.type === ListboxSelect && entry.props.label === label)!;
      assert.ok((control.props.options as Array<{ value: string }>).some((option) => option.value === value));
      (control.props.onChange as (value: string) => void)(value);
      view.flush();
    };
    change('Canci\u00f3n', 'song');
    change('Miembro', 'ana');
    change('Tipo de actividad', 'mass');
    assert.deepEqual(filters, { ...EMPTY_PERFORMANCE_FILTERS, from: '2026-10-01', songId: 'song', memberId: 'ana', type: 'mass' });
    change('Miembro', '');
    assert.equal(filters.memberId, '');
    assert.equal(filters.songId, 'song');
  } finally { view.unmount(); }
});

it('keyboard navigation, selection, Escape, Tab and pointer selection run through the actual component', () => {
  const saved = ['document', 'window', 'Node'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  class TestNode {}
  Object.defineProperty(globalThis, 'Node', { configurable: true, value: TestNode });
  const listeners = new Map<string, EventListener>();
  const addEventListener = (name: string, listener: EventListener) => listeners.set(name, listener);
  const removeEventListener = (name: string) => listeners.delete(name);
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { body: { nodeType: 1 }, querySelector: () => null, addEventListener, removeEventListener } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { innerWidth: 390, innerHeight: 700, addEventListener, removeEventListener } });
  let focusCount = 0;
  const chosen: number[] = [];
  const props = { value: 0, options: [{ value: 0, label: 'Sin capotraste' }, { value: 1, label: 'Traste 1' }, { value: 11, label: 'Traste 11' }], label: 'Capotraste', onChange: (value: number) => chosen.push(value) };
  const view = runHook(() => ListboxSelect(props));
  const trigger = () => elements(view.current).find((entry) => entry.props.role === 'combobox')!;
  (trigger().props.ref as { current: unknown }).current = { contains: () => false, closest: () => null, getBoundingClientRect: () => ({ top: 450, bottom: 494, right: 370, width: 200 }), focus: () => { focusCount++; } };
  const key = (value: string) => {
    let prevented = false;
    let stopped = false;
    (trigger().props.onKeyDown as (event: unknown) => void)({ key: value, preventDefault: () => { prevented = true; }, stopPropagation: () => { stopped = true; } });
    view.flush();
    return { prevented, stopped };
  };
  const open = () => { key('ArrowDown'); assert.equal(trigger().props['aria-expanded'], true); };
  try {
    open();
    key('End');
    assert.match(String(trigger().props['aria-activedescendant']), /option-2$/);
    key('ArrowDown');
    assert.match(String(trigger().props['aria-activedescendant']), /option-0$/);
    key('ArrowUp');
    assert.match(String(trigger().props['aria-activedescendant']), /option-2$/);
    key('Home');
    key('t');
    assert.match(String(trigger().props['aria-activedescendant']), /option-1$/);
    key('Enter');
    assert.deepEqual(chosen, [1]);
    assert.equal(trigger().props['aria-expanded'], false);
    open();
    assert.deepEqual(key('Escape'), { prevented: true, stopped: true });
    assert.equal(trigger().props['aria-expanded'], false);
    open();
    assert.deepEqual(key('Tab'), { prevented: false, stopped: false });
    assert.equal(trigger().props['aria-expanded'], false);
    open();
    const option = elements(view.current).find((entry) => entry.props.role === 'option' && String(entry.props.id).endsWith('option-2'))!;
    assert.equal(option.props.tabIndex, -1);
    (option.props.onClick as () => void)();
    view.flush();
    assert.deepEqual(chosen, [1, 11]);
    assert.ok(focusCount >= 3);
    for (const name of ['pointerdown', 'focusin', 'scroll', 'resize']) {
      open();
      listeners.get(name)!({ target: new TestNode() } as unknown as Event);
      view.flush();
      assert.equal(trigger().props['aria-expanded'], false);
    }
    open();
    props.options = [];
    view.flush();
    assert.equal(trigger().props.disabled, true);
    assert.equal(trigger().props['aria-expanded'], false);
  } finally {
    view.unmount();
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
  assert.equal(listeners.size, 0);
});
