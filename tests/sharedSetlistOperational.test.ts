import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MOCK_SONGS } from '../src/data/mockSongs';
import type { Setlist } from '../src/types/setlist';
import { parseSharedRoute, sharedPlayback, sharedRootHash, sharedSongHash } from '../src/utils/sharedSetlistRoutes';
import { SharedSetlistScreen, SharedSetlistView } from '../src/components/Setlists/SharedSetlistScreen';
import { SongViewer } from '../src/components/SongViewer/SongViewer';
import { TransposeMenu } from '../src/components/SongViewer/TransposeMenu';
import { useLocalStorage } from '../src/hooks/useLocalStorage';
import { runHook } from './hookHarness';

const token = '0123456789abcdef0123456789abcdef';
const root = sharedRootHash(token);
const songs = new Map(MOCK_SONGS.slice(0, 2).map(s => [s.id, s]));
const list: Setlist = { id: 'private-id', name: 'Celebración', date: '', description: '', participantIds: [], createdAt: 1, updatedAt: 1,
  items: MOCK_SONGS.slice(0, 2).map((s, i) => ({ id: `item-${i}`, songId: s.id, moment: 'Entrada', transposeSteps: 2, capoFret: 1, notes: 'Suave', transitionToNext: { type: 'direct', instruction: 'Sin pausa' } })) };

describe('operational public setlist', () => {
  for (const [suffix, view] of [['', 'root'], ['/song/item-0', 'song'], ['/rehearsal', 'rehearsal'], ['/live', 'live']]) {
    it(`parses ${view}`, () => assert.equal(parseSharedRoute(root + suffix)?.view, view));
  }
  it('invalid tokens and malformed item encoding do not throw', () => {
    assert.equal(parseSharedRoute('#/shared/setlist/invalid/live'), null);
    assert.equal(parseSharedRoute(root + '/song/%E0'), null);
    assert.equal(parseSharedRoute(sharedSongHash(token, 'a b'))?.itemId, 'a b');
  });
  it('navigation preserves owner settings and has no write capability', () => {
    const before = JSON.stringify(list); const visits: string[] = [];
    const playback = sharedPlayback(list, songs, token, 'item-0', h => visits.push(h))!;
    assert.equal(playback.shared, true); assert.equal(playback.item.transposeSteps, 2);
    assert.equal(playback.item.capoFret, 1); assert.equal(playback.item.transitionToNext?.instruction, 'Sin pausa');
    assert.equal(playback.onKeySettingsChange, undefined); assert.equal(playback.onArrangementNeedsReview, undefined);
    playback.next!.onSelect(); playback.onBackToSetlist();
    assert.deepEqual(visits, [root + '/song/item-1', root]); assert.equal(JSON.stringify(list), before);
    assert.equal(sharedPlayback(list, songs, token, 'absent', () => {}), null);
  });
  for (const kind of [undefined, 'misa', 'adoracion'] as const) {
    it(`offers existing modes for ${kind ?? 'legacy'}`, () => {
      const html = renderToStaticMarkup(createElement(SharedSetlistView, { setlist: { ...list, kind }, songsById: songs, onGoToSongbook() {}, onOpenSong() {}, onRehearsal() {}, onLive() {} }));
      assert.match(html, /Modo Ensayo/); assert.ok(html.includes(kind === 'adoracion' ? 'Modo Adoración' : 'Modo Misa'));
      assert.match(html, /sólo lectura/); assert.doesNotMatch(html, /Editar|Eliminar|Desactivar enlace|Guardar cambios/);
    });
  }
  it('loads once and keeps the document across subroutes and network loss', async () => {
    let route = root; let reads = 0;
    const load = async () => { reads++; return { state: 'setlist' as const, setlist: list, sharedAt: null }; };
    const run = runHook(() => SharedSetlistScreen({ token, route, songsById: songs, load, onGoToSongbook() {} }));
    await run.settle();
    for (const suffix of ['/song/item-0', '/rehearsal', '/live', '']) {
      route = root + suffix; run.flush(); await run.settle();
      assert.equal((run.current as ReactElement<{ setlist: Setlist }>).props.setlist, list);
    }
    assert.equal(reads, 1); run.unmount();
  });
  it('retains revoked and recoverable error screens', async () => {
    for (const gone of [true, false]) {
      const load = async () => { if (!gone) throw new TypeError('network'); return { state: 'gone' as const }; };
      const run = runHook(() => SharedSetlistScreen({ token, route: root + '/live', songsById: songs, load, onGoToSongbook() {} }));
      await run.settle(); const html = renderToStaticMarkup(run.current as ReactElement);
      assert.ok(html.includes(gone ? 'ya no está disponible' : 'No se pudo abrir'));
      assert.equal(html.includes('Reintentar'), !gone); run.unmount();
    }
  });
  it('temporary preferences neither read nor write browser storage', () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'); let calls = 0;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem() { calls++; return null; }, setItem() { calls++; } } });
    try {
      const run = runHook(() => useLocalStorage('private-pref', 1, false));
      run.current[1](3); run.flush(); assert.equal(run.current[0], 3); assert.equal(calls, 0); run.unmount();
    } finally { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else Reflect.deleteProperty(globalThis, 'localStorage'); }
  });
  it('real SongViewer transposes in memory even if persistent callbacks are supplied', () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
    let saves = 0;
    const playback = sharedPlayback(list, songs, token, 'item-0', () => {})!;
    playback.onKeySettingsChange = () => { saves++; };
    playback.onArrangementNeedsReview = () => { saves++; };
    const before = JSON.stringify(list);
    const findMenu = (node: unknown): ReactElement<{currentKey: string; onTranspose: (delta: number) => void}> | null => {
      if (Array.isArray(node)) { for (const child of node) { const found = findMenu(child); if (found) return found; } return null; }
      if (!node || typeof node !== 'object' || !('props' in node)) return null;
      const element = node as ReactElement<{children?: unknown}>;
      if (element.type === TransposeMenu) return element as unknown as ReturnType<typeof findMenu>;
      return findMenu(element.props.children);
    };
    try {
      const run = runHook(() => SongViewer({ song: MOCK_SONGS[0], setlist: playback, onBack() {}, isFavorite: false, playlists: [], isRehearsing: false, onRehearsalChange() {}, player: null }));
      const originalKey = findMenu(run.current)!.props.currentKey;
      findMenu(run.current)!.props.onTranspose(1); run.flush();
      assert.notEqual(findMenu(run.current)!.props.currentKey, originalKey);
      assert.equal(saves, 0); assert.equal(JSON.stringify(list), before);
      run.unmount();
    } finally { if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window'); }
  });
  it('shared entry connects existing renderers without repositories or owner actions', () => {
    const source = readFileSync('src/components/Setlists/SharedSetlistPlayer.tsx', 'utf8');
    assert.match(source, /SongViewer/); assert.match(source, /MassMode/);
    assert.doesNotMatch(source, /updateItem|syncAll|createSetlist|sharesFor|onArrangementNeedsReview|onKeySettingsChange/);
    const viewer = readFileSync('src/components/SongViewer/SongViewer.tsx', 'utf8');
    assert.match(viewer, /setlist && !setlist.shared/);
    assert.match(viewer, /setlist\?\.shared \? undefined : setlist\?\.onKeySettingsChange/);
    assert.match(viewer, /setlist\?\.shared \? undefined : setlist\?\.onArrangementNeedsReview/);
    assert.match(viewer, /<RehearsalMode/);
    assert.match(readFileSync('src/components/Mass/MassMode.tsx', 'utf8'), /shared \? transientSession : undefined/);
  });
});
