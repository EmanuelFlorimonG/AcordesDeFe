import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React, { isValidElement } from 'react';
import { LineEditor } from '../src/components/SongEditor/LineEditor';
import { ChordDialog } from '../src/components/SongEditor/ChordDialog';
import { runHook } from './hookHarness';

type Props = Record<string, any>;
function nodes(node: React.ReactNode): React.ReactElement<Props>[] {
  if (!isValidElement<Props>(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(nodes)];
}
const text = '¡Qué alegría cuando me';
function fixture() {
  const run = runHook(() => LineEditor({
    line: { id: 'line', text, chords: [], instrumental: false }, name: 'Coro, línea 1', suggestions: [], canRemove: true,
    registerInput() {}, onChange() {}, onSplit() {}, onMergeWithPrevious() {}, onFocusSibling() {}, onPaste() {}, onRemove() {},
  }));
  const all = () => nodes(run.current as React.ReactNode);
  const input = all().find(e => e.type === 'input')!;
  const dom = { value: text, selectionStart: 0 as number | null, scrollLeft: 0 };
  input.props.ref(dom);
  const select = (position: number) => { dom.selectionStart = position; input.props.onSelect({ currentTarget: dom }); };
  const add = () => {
    all().find(e => String(e.props['aria-label']).startsWith('Agregar acorde en'))!.props.onClick(); run.flush();
    return all().find(e => e.type === ChordDialog)!.props.position;
  };
  return { run, dom, select, add, input };
}
describe('El caret de la letra sobrevive a la transferencia de foco', () => {
  for (const position of [0, 5, text.length]) it(`conserva posición ${position} aunque el DOM cambie antes de pulsar +`, () => {
    const f = fixture(); f.select(position); f.dom.selectionStart = position === 0 ? text.length : 0;
    assert.equal(f.add(), position); f.run.unmount();
  });
  it('usa la última selección después de mover varias veces el cursor', () => {
    const f = fixture(); f.select(0); f.select(text.length); f.select(8); f.dom.selectionStart = null;
    assert.equal(f.add(), 8); f.run.unmount();
  });
  it('actualiza el caret al escribir', () => {
    const f = fixture(); f.dom.selectionStart = 7;
    f.input.props.onChange({ currentTarget: f.dom, target: { value: text, selectionEnd: 7 } });
    f.dom.selectionStart = 0; assert.equal(f.add(), 7); f.run.unmount();
  });
  it('sin selección preservada usa el caret DOM existente', () => {
    const f = fixture(); f.dom.selectionStart = 4; assert.equal(f.add(), 4); f.run.unmount();
  });
  it('sin selección ni caret DOM usa el final de la línea', () => {
    const f = fixture(); f.dom.selectionStart = null; assert.equal(f.add(), text.length); f.run.unmount();
  });
});
