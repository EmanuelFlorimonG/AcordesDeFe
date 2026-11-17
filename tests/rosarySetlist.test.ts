import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React, { type ReactElement, type ReactNode } from 'react';
import {
  ROSARY_MOMENTS, MASS_MOMENTS, ADORATION_MOMENTS, BACKUP_MOMENT,
  createSetlist, updateSetlistDetails, duplicateSetlist, copySharedSetlist, addSongsToSetlist,
  updateSetlistItem, moveSetlistItem, transposeSetlistItem, groupSetlistItems,
  momentsFor, suggestedMoments, liveModeName,
} from '../src/utils/setlists';
import { createLocalSetlistRepository, sanitizeSetlist, SETLIST_STORAGE_KEY, SETLIST_BACKUP_KEY } from '../src/storage/setlistStorage';
import { cloudToSetlist, setlistToCloud } from '../src/storage/cloudSetlists';
import { portableFingerprint, reconcileSetlist, createSetlistSyncStore } from '../src/storage/setlistSync';
import { readSharedSetlist } from '../src/storage/setlistShares';
import { createSupabaseClient } from '../src/lib/supabase';
import { buildSetlistDocument } from '../src/utils/setlistExport';
import { SetlistFormDialog } from '../src/components/Setlists/SetlistFormDialog';
import { AddSongsDialog } from '../src/components/Setlists/AddSongsDialog';
import { runHook } from './hookHarness';
import type { Setlist, SetlistDetails } from '../src/types/setlist';
import type { Song } from '../src/types/song';

const now = Date.UTC(2026, 10, 4, 10);
let nextId = 0;
const options = () => ({ now, createId: () => `rosary-${++nextId}` });
const create = () => createSetlist({ name: 'Rosario de la Aurora', kind: 'rosario-aurora' }, options());
const song: Song = { id: 'song', title: 'Canción', originalKey: 'B', categories: [], tags: [], content: '[Coro]\n[B]Una letra', chordsUsed: ['B'] };
const add = (s: Setlist, moment: string) => addSongsToSetlist(s, [song], { ...options(), moment });
const storage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
};
const cloud = (s: Setlist) => ({ ...setlistToCloud(s, 2), deleted_at: null, updated_at: new Date(now).toISOString() });

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}

describe('Rosario de la Aurora: one existing setlist architecture', () => {
  it('creates a named rosary with no date and edits details without changing its kind', () => {
    const s = create();
    assert.equal(s.kind, 'rosario-aurora');
    assert.equal(s.date, '');
    assert.deepEqual(s.items, []);
    const updated = updateSetlistDetails(s, { name: 'Rosario del sábado', date: '2026-11-07', kind: 'misa' }, now + 1);
    assert.equal(updated.kind, 'rosario-aurora');
    assert.equal(updated.name, 'Rosario del sábado');
    assert.equal(updated.date, '2026-11-07');
    assert.equal(duplicateSetlist(updated, {}, options()).kind, 'rosario-aurora');
  });

  it('offers exactly the eight requested moments, including empty ones, in order', () => {
    const expected = ['Llegada del Señor', 'Invocación del Espíritu Santo', '1er Misterio', '2do Misterio', '3er Misterio', '4to Misterio', '5to Misterio', 'Salida'];
    assert.deepEqual(ROSARY_MOMENTS, expected);
    assert.deepEqual(momentsFor('rosario-aurora'), expected);
    assert.deepEqual(suggestedMoments('rosario-aurora'), expected);
    const groups = groupSetlistItems(create());
    assert.deepEqual(groups.map(g => g.moment), expected);
    assert.ok(groups.every(g => g.items.length === 0));
    assert.equal(liveModeName('rosario-aurora'), 'Modo Rosario');
  });

  it('groups multiple appearances and keeps the occasion order when adding out of order', () => {
    let s = add(create(), 'Salida');
    s = add(s, '1er Misterio');
    s = add(s, '1er Misterio');
    s = add(s, 'Llegada del Señor');
    assert.deepEqual(s.items.map(i => i.moment), ['Llegada del Señor', '1er Misterio', '1er Misterio', 'Salida']);
    assert.equal(new Set(s.items.map(i => i.id)).size, 4);
    assert.equal(groupSetlistItems(s)[2].items.length, 2);
    assert.equal(groupSetlistItems(s)[1].items.length, 0);
  });

  it('reorders within a moment and changing moment updates its position without losing musical settings', () => {
    let s = add(add(add(create(), '1er Misterio'), '1er Misterio'), 'Salida');
    const first = s.items[0].id;
    s = transposeSetlistItem(s, first, 2, now + 1);
    s = updateSetlistItem(s, first, { notes: 'Entrada suave', capoFret: 2, arrangement: { songVersion: 1, sections: [] } }, now + 2);
    s = moveSetlistItem(s, first, 1, now + 3);
    assert.equal(s.items[1].id, first);
    const musical = s.items[1];
    s = updateSetlistItem(s, first, { moment: 'Llegada del Señor' }, now + 4);
    assert.equal(s.items[0].id, first);
    assert.deepEqual({ ...s.items[0], moment: musical.moment }, musical);
    assert.equal(song.content, '[Coro]\n[B]Una letra');
    assert.equal(duplicateSetlist(s, {}, options()).items[0].notes, 'Entrada suave');
  });

  it('roundtrips local and cloud storage and keeps recovery data', () => {
    const s = add(create(), '5to Misterio');
    const mem = storage();
    assert.equal(createLocalSetlistRepository(mem).save([s]), true);
    assert.deepEqual(createLocalSetlistRepository(mem).load().setlists, [s]);
    assert.equal(sanitizeSetlist(s)?.kind, 'rosario-aurora');
    const result = cloudToSetlist(cloud(s));
    assert.equal(result.state, 'setlist');
    if (result.state !== 'setlist') throw Error('Unreadable cloud row');
    assert.deepEqual(result.setlist, s);
    const broken = storage({ [SETLIST_STORAGE_KEY]: '{broken' });
    assert.equal(createLocalSetlistRepository(broken).load().recoveredFromUnreadableData, true);
    assert.equal(broken.data.get(SETLIST_BACKUP_KEY), '{broken');
  });

  it('includes the type in sync fingerprints and detects changes after acknowledgement', () => {
    const s = add(create(), '1er Misterio');
    assert.notEqual(portableFingerprint(s), portableFingerprint({ ...s, kind: undefined }));
    assert.notEqual(portableFingerprint(s), portableFingerprint({ ...s, kind: 'adoracion' }));
    const remote = cloudToSetlist(cloud(s));
    assert.equal(reconcileSetlist({ local: s, remote }).kind, 'adopt-baseline');
    const base = { setlistId: s.id, cloudRevision: 2, fingerprint: portableFingerprint(s) };
    const mem = storage();
    const sync = createSetlistSyncStore(mem, { kind: 'user', userId: 'test-user' });
    sync.save(new Map([[s.id, base]]));
    assert.deepEqual(sync.load().get(s.id), base);
    const edited = updateSetlistItem(s, s.items[0].id, { moment: '2do Misterio' }, now + 1);
    assert.equal(reconcileSetlist({ local: edited, remote, base }).kind, 'upload-changes');
  });

  it('reads a shared rosary and copies its kind, ordered moments and musical settings', async () => {
    const original = add(add(create(), 'Salida'), '1er Misterio');
    const shared = updateSetlistItem(original, original.items[0].id, { notes: 'Piano solo', transposeSteps: 2 }, now + 1);
    const client = createSupabaseClient({ url: 'https://example.supabase.co', anonKey: 'public-test-key' }, async () =>
      new Response(JSON.stringify([{ ...cloud(shared), shared_at: new Date(now).toISOString() }]), { status: 200 })
    );
    const read = await readSharedSetlist(client, 'a'.repeat(32));
    assert.equal(read.state, 'setlist');
    if (read.state !== 'setlist') throw Error('Unreadable shared rosary');
    assert.equal(read.setlist.kind, 'rosario-aurora');
    const copy = copySharedSetlist(read.setlist, options());
    assert.equal(copy.kind, 'rosario-aurora');
    assert.deepEqual(copy.items.map(i => [i.moment, i.transposeSteps, i.notes]), shared.items.map(i => [i.moment, i.transposeSteps, i.notes]));
    assert.equal(liveModeName(copy.kind), 'Modo Rosario');
  });

  it('retains custom/unassigned songs and restores moment order on reading', () => {
    const s = add(add(add(create(), 'Salida'), ''), '1er Misterio');
    const restored = sanitizeSetlist({ ...s, items: [...s.items].reverse() });
    assert.ok(restored);
    assert.deepEqual(restored.items.map(i => i.moment), ['1er Misterio', 'Salida', '']);
    assert.equal(groupSetlistItems(restored).at(-1)?.items.length, 1);
    const custom = add(add(add(create(), 'Otro A'), 'Otro B'), 'Otro A');
    assert.deepEqual(custom.items.map(i => i.moment), ['Otro A', 'Otro A', 'Otro B']);
    assert.deepEqual(groupSetlistItems(custom).flatMap(g => g.items.map(i => i.id)), custom.items.map(i => i.id));
    const doc = buildSetlistDocument(restored, new Map([[song.id, song]]));
    assert.deepEqual(doc.moments.map(g => g.moment), ['1ER MISTERIO', 'SALIDA', '']);
  });

  it('preserves existing Mass and Adoration defaults, payloads and manual order', () => {
    assert.deepEqual(momentsFor(undefined), [...MASS_MOMENTS, BACKUP_MOMENT]);
    assert.deepEqual(momentsFor('adoracion'), [...ADORATION_MOMENTS, BACKUP_MOMENT]);
    for (const kind of [undefined, 'misa', 'adoracion'] as const) {
      let s = createSetlist({ name: 'Anterior', kind }, options());
      s = add(add(s, 'Salida'), 'Entrada');
      assert.deepEqual(s.items.map(i => i.moment), ['Salida', 'Entrada']);
      assert.equal(setlistToCloud(s, 1).kind, kind === 'adoracion' ? kind : null);
      assert.equal(sanitizeSetlist(s)?.kind, kind === 'adoracion' ? kind : undefined);
    }
    assert.equal(sanitizeSetlist({ ...create(), kind: 'unknown' })?.kind, undefined);
  });
});

describe('Rosary in the existing dialogs', () => {
  it('selects the third occasion and submits it with an optional empty date', () => {
    let submitted: SetlistDetails | undefined;
    const run = runHook(() => SetlistFormDialog({ mode: 'create', initialDetails: { name: 'Rosario del sábado' }, onSubmit: d => { submitted = d; }, onClose() {} }) as ReactElement);
    let radios = elements(run.current).filter(e => e.props.role === 'radio');
    // Cuatro celebraciones; la boda añade además sus dos modalidades al elegirla.
    assert.equal(radios.length, 4);
    (radios[2].props.onClick as () => void)();
    run.flush();
    radios = elements(run.current).filter(e => e.props.role === 'radio');
    assert.equal(radios[2].props['aria-checked'], true);
    assert.equal(radios.filter(r => r.props.tabIndex === 0).length, 1);
    (run.current.props as { onSubmit: () => void }).onSubmit();
    assert.equal(submitted?.kind, 'rosario-aurora');
    assert.equal(submitted?.date, '');
    run.unmount();
  });

  it('offers the same eight moments when adding, and opens the requested group', () => {
    const run = runHook(() => AddSongsDialog({ songs: [song], setlist: create(), initialMoment: '3er Misterio', onAdd() {}, onClose() {} }) as ReactElement);
    const select = elements(run.current).find(e => e.props.label === 'Momento en la celebración');
    assert.ok(select);
    assert.equal(select.props.value, '3er Misterio');
    assert.deepEqual((select.props.options as Array<{ value: string }>).slice(0,8).map(o => o.value), ROSARY_MOMENTS);
    run.unmount();
  });
});
