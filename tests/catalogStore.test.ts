import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG_CACHE_KEY, CATALOG_CACHE_VERSION, MAX_CATALOG_CACHE_BYTES, createCatalogCache } from '../src/catalog/catalogCache';
import { createCatalogStore, unavailableText, type CatalogStore } from '../src/catalog/catalogStore';
import type { SongRepository } from '../src/catalog/songRepository';
import { SONG_PAGE_SIZE, createSupabaseSongRepository, songFromRow, songToRow, type SongRow } from '../src/catalog/supabaseSongRepository';
import { readCatalogSource } from '../src/catalog/useCatalog';
import { MOCK_SONGS } from '../src/data/mockSongs';
import type { SupabaseClient } from '../src/lib/supabase';
import type { Song } from '../src/types/song';
import { getFirstPlayableItem } from '../src/utils/setlists';
import { searchSongs } from '../src/utils/songSearch';

let checks = 0;
const eq = (actual: unknown, expected: unknown) => {
  assert.deepEqual(actual, expected);
  checks++;
};
after(() => console.log(`catalogStore: ${checks} comprobaciones`));

const PROJECT = 'https://abc.supabase.co';

/** What Supabase returns for a song: the row read back (youtubeId "" becomes absent). */
const remoteForm = (song: Song) => songFromRow(songToRow(song)) as Song;
const REMOTE_97 = MOCK_SONGS.map(remoteForm);
const NEW_SONG: Song = {
  id: 'cancion-nueva-6c',
  title: 'Canción nueva aprobada',
  artist: 'Coro de prueba',
  categories: ['Alabanza', 'Categoría nueva'],
  tags: [],
  content: '[Verso 1]\n[D]Una canción [A]nueva',
  chordsUsed: ['D', 'A'],
};

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

/** A remote that answers what `next` says, and counts how often it was asked. */
function fakeRemote(initial: Song[] | Error | 'never') {
  let next = initial;
  let calls = 0;
  const repository: SongRepository = {
    source: 'remote',
    listSongs: () => {
      calls++;
      return next === 'never' ? new Promise<Song[]>(() => {}) : next instanceof Error ? Promise.reject(next) : Promise.resolve([...next]);
    },
    getSong: async () => null,
  };
  return {
    repository,
    set: (value: Song[] | Error | 'never') => {
      next = value;
    },
    calls: () => calls,
  };
}

const ids = (store: CatalogStore) => store.getSnapshot().songs.map((song) => song.id).sort();
const BUNDLED_IDS = MOCK_SONGS.map((song) => song.id).sort();

// --- Cache --------------------------------------------------------------------------

describe('Caché del último catálogo remoto válido', () => {
  it('las 97 van y vuelven idénticas a como las lee el remoto', () => {
    const storage = memoryStorage();
    const cache = createCatalogCache(storage, PROJECT);
    eq(cache.write(REMOTE_97, new Date('2026-09-19T05:00:00Z')), true);
    const read = cache.read();
    eq(read?.savedAt, '2026-09-19T05:00:00.000Z');
    eq(read?.songs, REMOTE_97);
  });

  it('otra versión, otro proyecto o JSON dañado: no se usa', () => {
    const storage = memoryStorage();
    createCatalogCache(storage, PROJECT).write(REMOTE_97);
    eq(createCatalogCache(storage, 'https://otro.supabase.co').read(), null);
    const stored = JSON.parse(storage.data.get(CATALOG_CACHE_KEY)!);
    storage.data.set(CATALOG_CACHE_KEY, JSON.stringify({ ...stored, version: CATALOG_CACHE_VERSION + 1 }));
    eq(createCatalogCache(storage, PROJECT).read(), null);
    storage.data.set(CATALOG_CACHE_KEY, '{roto');
    eq(createCatalogCache(storage, PROJECT).read(), null);
  });

  it('las filas ilegibles se descartan; si no queda ninguna, no hay caché', () => {
    const rows: unknown[] = [songToRow(MOCK_SONGS[0]), { id: 'sin-titulo' }, null, songToRow(MOCK_SONGS[0])];
    const storage = memoryStorage({ [CATALOG_CACHE_KEY]: JSON.stringify({ version: CATALOG_CACHE_VERSION, projectUrl: PROJECT, savedAt: 'x', rows }) });
    eq(createCatalogCache(storage, PROJECT).read()?.songs.map((song) => song.id), [MOCK_SONGS[0].id]);
    storage.data.set(CATALOG_CACHE_KEY, JSON.stringify({ version: CATALOG_CACHE_VERSION, projectUrl: PROJECT, savedAt: 'x', rows: [null] }));
    eq(createCatalogCache(storage, PROJECT).read(), null);
  });

  it('guarda la versión publicada de cada canción y la devuelve igual', () => {
    const storage = memoryStorage();
    const versioned = [{ ...REMOTE_97[0], version: 3 }, REMOTE_97[1]];
    createCatalogCache(storage, PROJECT).write(versioned);
    const stored = JSON.parse(storage.data.get(CATALOG_CACHE_KEY)!);
    eq([stored.version, stored.rows[0].current_version, stored.rows[1].current_version], [2, 3, null]);
    eq(createCatalogCache(storage, PROJECT).read()?.songs, versioned);
  });

  it('una caché del formato 1 (sin versiones) no se usa: no puede decir en qué versión está cada canción', () => {
    const rows = MOCK_SONGS.slice(0, 2).map(songToRow);
    const storage = memoryStorage({ [CATALOG_CACHE_KEY]: JSON.stringify({ version: 1, projectUrl: PROJECT, savedAt: 'x', rows }) });
    eq(createCatalogCache(storage, PROJECT).read(), null);
  });

  it('descartar una caché vieja no toca nada más de este navegador', () => {
    const rows = MOCK_SONGS.slice(0, 2).map(songToRow);
    const storage = memoryStorage({
      [CATALOG_CACHE_KEY]: JSON.stringify({ version: 1, projectUrl: PROJECT, savedAt: 'x', rows }),
      genesaret_favorites: JSON.stringify(['huracan-hakuna']),
      genesaret_setlists: JSON.stringify({ version: 1, setlists: [{ id: 's1', items: [{ id: 'i1', songId: 'huracan-hakuna' }] }] }),
      genesaret_performance_history: JSON.stringify({ version: 1, records: [{ id: 'r1' }] }),
    });
    const cache = createCatalogCache(storage, PROJECT);
    eq(cache.read(), null, 'la caché del formato 1 no se usa');
    eq(storage.data.get('genesaret_favorites'), JSON.stringify(['huracan-hakuna']), 'las favoritas siguen ahí');
    eq(JSON.parse(storage.data.get('genesaret_setlists')!).setlists[0].items[0].songId, 'huracan-hakuna', 'los Setlists siguen apuntando a sus canciones');
    eq(JSON.parse(storage.data.get('genesaret_performance_history')!).records.length, 1, 'el historial sigue ahí');
    // Y en cuanto vuelve la conexión, la respuesta remota la reemplaza.
    cache.write(REMOTE_97, new Date('2026-09-20T05:00:00Z'));
    eq(cache.read()?.songs.length, REMOTE_97.length);
  });

  it('sin espacio, demasiado grande o sin almacenamiento: no se guarda y nada se rompe', () => {
    const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
    eq(createCatalogCache(full, PROJECT).write(REMOTE_97), false);
    const huge: Song[] = [{ ...NEW_SONG, content: 'x'.repeat(MAX_CATALOG_CACHE_BYTES) }];
    eq(createCatalogCache(memoryStorage(), PROJECT).write(huge), false);
    eq(createCatalogCache(null, PROJECT).write(REMOTE_97), false);
    eq(createCatalogCache(null, PROJECT).read(), null);
    eq(createCatalogCache(memoryStorage(), PROJECT).write([]), false);
  });
});

// --- Store --------------------------------------------------------------------------

describe('Una sola fuente completa a la vez', () => {
  it('incluido sin caché → remoto: primero las incluidas, luego el remoto, y la caché queda guardada', async () => {
    const storage = memoryStorage();
    const remote = fakeRemote([...REMOTE_97, NEW_SONG]);
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: remote.repository, cache: createCatalogCache(storage, PROJECT) });
    eq([store.getSnapshot().source, store.getSnapshot().remote, store.getSnapshot().songs.length], ['bundled', 'idle', 97]);
    await store.refresh({ force: true });
    eq([store.getSnapshot().source, store.getSnapshot().remote, store.getSnapshot().songs.length], ['remote', 'ok', 98]);
    eq(createCatalogCache(storage, PROJECT).read()?.songs.length, 98);
  });

  it('caché → remoto idéntico: mismas canciones, mismos objetos, nada vuelve a pintarse', async () => {
    const storage = memoryStorage();
    createCatalogCache(storage, PROJECT).write(REMOTE_97);
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: fakeRemote(REMOTE_97).repository, cache: createCatalogCache(storage, PROJECT) });
    const before = store.getSnapshot();
    eq(before.source, 'cache');
    await store.refresh({ force: true });
    const now = store.getSnapshot();
    eq(now.source, 'remote');
    eq([now.songs === before.songs, now.byId === before.byId, now.searchIndex === before.searchIndex], [true, true, true]);
  });

  it('caché → remoto actualizado: aparece la canción nueva y la caché se reemplaza', async () => {
    const storage = memoryStorage();
    createCatalogCache(storage, PROJECT).write(REMOTE_97);
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: fakeRemote([...REMOTE_97, NEW_SONG]).repository, cache: createCatalogCache(storage, PROJECT) });
    await store.refresh({ force: true });
    eq(store.getSnapshot().byId.get(NEW_SONG.id), NEW_SONG);
    eq(createCatalogCache(storage, PROJECT).read()?.songs.some((song) => song.id === NEW_SONG.id), true);
  });

  it('caché → Supabase caído: se sigue mostrando la caché (con la canción solo remota) y la caché no se toca', async () => {
    const storage = memoryStorage();
    createCatalogCache(storage, PROJECT).write([...REMOTE_97, NEW_SONG], new Date('2026-09-19T05:00:00Z'));
    const saved = storage.data.get(CATALOG_CACHE_KEY);
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: fakeRemote(new Error('503')).repository, cache: createCatalogCache(storage, PROJECT) });
    await store.refresh({ force: true });
    const snapshot = store.getSnapshot();
    eq([snapshot.source, snapshot.remote, snapshot.savedAt, snapshot.songs.length], ['cache', 'failed', '2026-09-19T05:00:00.000Z', 98]);
    eq(store.availability(NEW_SONG.id), 'available');
    eq(storage.data.get(CATALOG_CACHE_KEY), saved);
  });

  it('incluido → Supabase caído: siguen las 97 incluidas, avisando del fallo', async () => {
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: fakeRemote(new Error('503')).repository, cache: createCatalogCache(memoryStorage(), PROJECT) });
    await store.refresh({ force: true });
    eq([store.getSnapshot().source, store.getSnapshot().remote, store.getSnapshot().songs.length], ['bundled', 'failed', 97]);
  });

  it('remoto cargado → el siguiente refresco falla o llega vacío: nada de lo que había se pierde', async () => {
    const remote = fakeRemote([...REMOTE_97, NEW_SONG]);
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: remote.repository, cache: null });
    await store.refresh({ force: true });
    const loaded = store.getSnapshot().songs;
    for (const failure of [new Error('red'), [] as Song[]]) {
      remote.set(failure);
      await store.refresh({ force: true });
      eq([store.getSnapshot().songs === loaded, store.getSnapshot().source, store.getSnapshot().remote], [true, 'remote', 'failed']);
      eq(store.availability(NEW_SONG.id), 'available');
    }
  });

  it('una respuesta vacía nunca reemplaza un catálogo válido ni la caché', async () => {
    const storage = memoryStorage();
    createCatalogCache(storage, PROJECT).write(REMOTE_97);
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: fakeRemote([]).repository, cache: createCatalogCache(storage, PROJECT) });
    await store.refresh({ force: true });
    eq([store.getSnapshot().source, store.getSnapshot().songs.length], ['cache', 97]);
    eq(createCatalogCache(storage, PROJECT).read()?.songs.length, 97);
  });

  it('97 incluidas + 97 remotas = 97 visibles, y el remoto manda', async () => {
    const edited = { ...REMOTE_97[0], title: `${REMOTE_97[0].title} (corregida)` };
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: fakeRemote([edited, ...REMOTE_97.slice(1)]).repository, cache: null });
    await store.refresh({ force: true });
    eq(store.getSnapshot().songs.length, 97);
    eq(ids(store), BUNDLED_IDS);
    eq(store.getSnapshot().byId.get(edited.id)?.title, edited.title);
  });

  it('una canción oculta en Supabase no reaparece desde las incluidas', async () => {
    const hidden = REMOTE_97[5].id;
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: fakeRemote(REMOTE_97.filter((song) => song.id !== hidden)).repository, cache: null });
    await store.refresh({ force: true });
    eq([store.getSnapshot().songs.length, store.getSnapshot().byId.has(hidden)], [96, false]);
    eq(store.availability(hidden), 'missing');
  });

  it('todas las fuentes en el mismo orden: pasar al remoto no reordena nada', async () => {
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: fakeRemote([...REMOTE_97].reverse()).repository, cache: null });
    const before = store.getSnapshot().songs.map((song) => song.id);
    await store.refresh({ force: true });
    eq(store.getSnapshot().songs.map((song) => song.id), before);
  });
});

describe('Disponibilidad de una canción por su id', () => {
  it('esperando, sin conexión o retirada: tres cosas distintas', async () => {
    const remote = fakeRemote('never');
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: remote.repository, cache: null, timeoutMs: 10 });
    eq(store.availability(NEW_SONG.id), 'checking');
    await store.refresh({ force: true });
    eq(store.availability(NEW_SONG.id), 'unverified');
    eq(unavailableText(store.availability(NEW_SONG.id)), 'No disponible sin conexión');
    eq(store.availability(MOCK_SONGS[0].id), 'available');
    remote.set(REMOTE_97);
    await store.refresh({ force: true });
    eq([store.availability(NEW_SONG.id), unavailableText('missing')], ['missing', 'Ya no está en el cancionero']);
  });

  it('un setlist resuelve una canción solo remota con el mismo mapa que el resto de la app', async () => {
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: fakeRemote([...REMOTE_97, NEW_SONG]).repository, cache: null });
    const setlist = { items: [{ id: 'item-1', songId: NEW_SONG.id }] } as unknown as Parameters<typeof getFirstPlayableItem>[0];
    const playable = (item: { songId: string }) => store.getSnapshot().byId.has(item.songId);
    eq(getFirstPlayableItem(setlist, playable), null);
    await store.refresh({ force: true });
    eq(getFirstPlayableItem(setlist, playable)?.id, 'item-1');
  });

  it('búsqueda y categorías incluyen la canción aprobada en cuanto llega', async () => {
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: fakeRemote([...REMOTE_97, NEW_SONG]).repository, cache: null });
    const empty = { categories: [], artists: [], keys: [], seasons: [] } as unknown as Parameters<typeof searchSongs>[2];
    eq(searchSongs(store.getSnapshot().searchIndex, 'canción nueva aprobada', empty).some((match) => match.song.id === NEW_SONG.id), false);
    await store.refresh({ force: true });
    eq(searchSongs(store.getSnapshot().searchIndex, 'canción nueva aprobada', empty).some((match) => match.song.id === NEW_SONG.id), true);
    eq(store.getSnapshot().categories.includes('Categoría nueva'), true);
  });
});

describe('Refrescos y vuelta atrás', () => {
  it('como máximo uno por intervalo salvo forzado, y dos a la vez comparten la misma petición', async () => {
    let clock = 0;
    const remote = fakeRemote(REMOTE_97);
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: remote.repository, cache: null, minIntervalMs: 1000, now: () => clock });
    await Promise.all([store.refresh({ force: true }), store.refresh({ force: true })]);
    eq(remote.calls(), 1);
    await store.refresh();
    eq(remote.calls(), 1);
    clock = 1500;
    await store.refresh();
    eq(remote.calls(), 2);
    await store.refresh({ force: true });
    eq(remote.calls(), 3);
  });

  it('el lector remoto se carga una sola vez, en el primer refresco', async () => {
    let loads = 0;
    const remote = fakeRemote(REMOTE_97);
    const store = createCatalogStore({
      bundled: MOCK_SONGS,
      remote: async () => {
        loads++;
        return remote.repository;
      },
      cache: null,
    });
    eq(loads, 0);
    await store.refresh({ force: true });
    await store.refresh({ force: true });
    eq([loads, store.getSnapshot().source], [1, 'remote']);
  });

  it('VITE_CATALOG_SOURCE=bundled: solo las incluidas, sin preguntar a Supabase ni usar la caché', async () => {
    eq([readCatalogSource('bundled'), readCatalogSource(' BUNDLED '), readCatalogSource(undefined), readCatalogSource('remote')], ['bundled', 'bundled', 'remote', 'remote']);
    const storage = memoryStorage();
    createCatalogCache(storage, PROJECT).write([...REMOTE_97, NEW_SONG]);
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: null, cache: createCatalogCache(storage, PROJECT) });
    await store.refresh({ force: true });
    eq([store.getSnapshot().source, store.getSnapshot().remote, store.getSnapshot().songs.length], ['bundled', 'disabled', 97]);
    eq(store.availability(NEW_SONG.id), 'missing');
  });
});

describe('Catálogo remoto por páginas', () => {
  it('pide páginas de 1000 hasta la última, en un orden estable', async () => {
    const all: SongRow[] = Array.from({ length: SONG_PAGE_SIZE * 2 + 5 }, (_, index) => ({ ...songToRow(MOCK_SONGS[0]), id: `cancion-${index}` }));
    const queries: string[] = [];
    const client = {
      async select<T>(_table: string, query: string) {
        queries.push(query);
        const offset = Number(/offset=(\d+)/.exec(query)?.[1] ?? 0);
        return all.slice(offset, offset + SONG_PAGE_SIZE) as T[];
      },
    } as unknown as SupabaseClient;
    const songs = await createSupabaseSongRepository(client).listSongs();
    eq(songs.length, SONG_PAGE_SIZE * 2 + 5);
    eq(queries.length, 3);
    eq(queries.every((query) => query.includes('status=eq.published') && query.includes('order=title.asc,id.asc')), true);
    eq(queries.map((query) => /offset=(\d+)/.exec(query)?.[1]), ['0', '1000', '2000']);
  });
});
