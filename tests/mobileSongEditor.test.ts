import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { MobileLineEditor } from '../src/components/SongEditor/MobileLineEditor';
import { mobileChordLanes } from '../src/editor/mobileChordLayout';
import { editorViewportMetrics, useEditorViewport } from '../src/components/SongEditor/useEditorViewport';
import type { EditorLine } from '../src/editor/songEditorModel';
import { runHook } from './hookHarness';

type NodeProps = Record<string, any>;
function nodes(node: any): React.ReactElement<NodeProps>[] {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (node.$$typeof === Symbol.for('react.portal')) return nodes(node.children);
  if (!React.isValidElement<NodeProps>(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(nodes)];
}
function fixture() {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { body: { nodeType: 1 } } });
  let line: EditorLine = { id: 'line-mobile', text: 'Una letra de prueba', instrumental: false, chords: [] };
  const run = runHook(() => MobileLineEditor({ line, name: 'Verso, línea 1', suggestions: ['B/D#'], canRemove: true,
    viewport: { mobile: true, bottom: 300, height: 400 }, active: true, menu: null,
    registerInput() {}, onChange(next) { line = next; }, onActivate() {}, onFinish() {},
    onSplit() {}, onMergeWithPrevious() {}, onFocusSibling() {}, onPaste() {}, onRemove() {},
  }));
  const all = () => nodes(run.current);
  const button = (label: string) => all().find(n => n.type === 'button' && n.props['aria-label'] === label)!;
  const input = () => all().find(n => n.type === 'input')!;
  return { run, all, button, input, line: () => line, dispose() { run.unmount(); if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document'); } };
}

describe('Barra móvil y posiciones del modelo', () => {
  for (const position of [0, 7, 19]) it(`inserta en el índice ${position} sin cambiar la letra`, () => {
    const f = fixture();
    try {
      const textarea = f.all().find(n => n.type === 'textarea')!;
      textarea.props.onSelect({ currentTarget: { selectionStart: position, selectionEnd: position } });
      f.all().find(n => n.type === 'button' && n.props.children?.some?.((c: any) => c === ' Acorde'))!.props.onClick();
      f.run.flush(); f.input().props.onChange({ target: { value: 'F#/A#' } }); f.run.flush();
      f.button('Guardar acorde').props.onClick(); f.run.flush();
      assert.equal(f.line().text, 'Una letra de prueba');
      assert.equal(f.line().chords[0].position, position);
      assert.equal(f.line().chords[0].chord, 'F#/A#');
    } finally { f.dispose(); }
  });

  it('cancelar un acorde no modifica el documento', () => {
    const f = fixture();
    try {
      f.all().find(n => n.type === 'button' && n.props.children?.some?.((c: any) => c === ' Acorde'))!.props.onClick(); f.run.flush();
      f.input().props.onChange({ target: { value: 'B/D#' } }); f.run.flush();
      f.button('Cancelar acorde').props.onClick(); f.run.flush();
      assert.deepEqual(f.line().chords, []);
    } finally { f.dispose(); }
  });
});

describe('Viewport visible del editor', () => {
  it('sigue el espacio sobre el teclado y el desplazamiento de Safari', () => {
    assert.deepEqual(editorViewportMetrics(844, 420, 60), { bottom: 364, height: 420 });
    assert.deepEqual(editorViewportMetrics(844, 844), { bottom: 0, height: 844 });
    assert.deepEqual(editorViewportMetrics(400, 500), { bottom: 0, height: 500 });
  });
  it('sin navegador conserva el editor de escritorio', () => {
    const run = runHook(useEditorViewport);
    assert.equal(run.current.mobile, false);
    run.unmount();
  });
});


describe('Etiquetas de acordes próximas', () => {
  it('separa dos etiquetas largas que empiezan sobre letras contiguas', () => {
    const lanes = mobileChordLanes([{ id: 'a', chord: 'B/D#', position: 0 }, { id: 'b', chord: 'F#/A#', position: 2 }]);
    assert.equal(lanes.get('a'), 0);
    assert.equal(lanes.get('b'), 1);
  });
  it('reutiliza el carril cuando ya hay espacio', () => {
    const lanes = mobileChordLanes([{ id: 'a', chord: 'B/D#', position: 0 }, { id: 'b', chord: 'G', position: 12 }]);
    assert.equal(lanes.get('b'), 0);
  });
});
