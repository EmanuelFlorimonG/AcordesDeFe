import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG_CACHE_KEY, CATALOG_CACHE_VERSION, MAX_CATALOG_CACHE_BYTES, createCatalogCache } from '../src/catalog/catalogCache';
import { createCatalogStore, songOnScreen, unavailableText, type CatalogStore } from '../src/catalog/catalogStore';
import { fetchRemoteCatalog, validateCatalogSnapshot, type SongRepository } from '../src/catalog/songRepository';
import { songVersionOf } from '../src/catalog/songRepository';
import { buildSubmissionPayload } from '../src/catalog/submission';
import { songToDraft } from '../src/catalog/songDraft';
import { SONG_PAGE_SIZE, catalogRowProblem, createSupabaseSongRepository, songFromRow, songToRow, type SongRow } from '../src/catalog/supabaseSongRepository';
import { readCatalogSource } from '../src/catalog/useCatalog';
import { MOCK_SONGS } from '../src/data/mockSongs';
import type { SupabaseClient } from '../src/lib/supabase';
import type { Song } from '../src/types/song';
import { getFirstPlayableItem, listSongCategories } from '../src/utils/setlists';
import { searchSongs } from '../src/utils/songSearch';

let checks = 0;
const eq = (actual: unknown, expected: unknown, message?: string) => {
  assert.deepEqual(actual, expected, message);
  checks++;
};
after(() => console.log(`catalogStore: ${checks} comprobaciones`));

const PROJECT = 'https://abc.supabase.co';

/**
 * What Supabase returns for a song: the row read back (youtubeId "" becomes
 * absent), with the published version every row carries — the 110 imported
 * ones are at version 1, like in the real project.
 */
const remoteForm = (song: Song, version = 1) => songFromRow({ ...songToRow(song), current_version: version }) as Song;
const REMOTE_SONGS = MOCK_SONGS.map((song) => remoteForm(song));
const NEW_SONG: Song = {
  id: 'cancion-nueva-6c',
  title: 'Canción nueva aprobada',
  artist: 'Coro de prueba',
  categories: ['Alabanza', 'Categoría nueva'],
  tags: [],
  content: '[Verso 1]\n[D]Una canción [A]nueva',
  chordsUsed: ['D', 'A'],
  version: 1,
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
  it('las 110 van y vuelven idénticas a como las lee el remoto', () => {
    const storage = memoryStorage();
    const cache = createCatalogCache(storage, PROJECT);
    eq(cache.write(REMOTE_SONGS, new Date('2026-09-19T05:00:00Z')), true);
    const read = cache.read();
    eq(read?.savedAt, '2026-09-19T05:00:00.000Z');
    eq(read?.songs, REMOTE_SONGS);
  });

  it('otra versión, otro proyecto o JSON dañado: no se usa', () => {
    const storage = memoryStorage();
    createCatalogCache(storage, PROJECT).write(REMOTE_SONGS);
    eq(createCatalogCache(storage, 'https://otro.supabase.co').read(), null);
    const stored = JSON.parse(storage.data.get(CATALOG_CACHE_KEY)!);
    storage.data.set(CATALOG_CACHE_KEY, JSON.stringify({ ...stored, version: CATALOG_CACHE_VERSION + 1 }));
    eq(createCatalogCache(storage, PROJECT).read(), null);
    storage.data.set(CATALOG_CACHE_KEY, '{roto');
    eq(createCatalogCache(storage, PROJECT).read(), null);
  });

  it('una fila ilegible o un id repetido invalidan la caché entera', () => {
    const stored = (rows: unknown[]) =>
      memoryStorage({ [CATALOG_CACHE_KEY]: JSON.stringify({ version: CATALOG_CACHE_VERSION, projectUrl: PROJECT, savedAt: 'x', rows }) });
    const row = (song: Song) => ({ ...songToRow(song), current_version: 1 });
    // Media caché no es una caché: faltaría una canción sin que nadie se entere.
    eq(createCatalogCache(stored([row(MOCK_SONGS[0]), { id: 'sin-titulo' }]), PROJECT).read(), null);
    eq(createCatalogCache(stored([row(MOCK_SONGS[0]), null]), PROJECT).read(), null);
    eq(createCatalogCache(stored([row(MOCK_SONGS[0]), row(MOCK_SONGS[0])]), PROJECT).read(), null, 'id repetido');
    eq(createCatalogCache(stored([]), PROJECT).read(), null, 'vacía');
    // Guardada por una respuesta remota, cada fila dice su versión; sin ella no se usa.
    eq(createCatalogCache(stored([songToRow(MOCK_SONGS[0])]), PROJECT).read(), null, 'sin versión publicada');
    eq(createCatalogCache(stored([row(MOCK_SONGS[0])]), PROJECT).read()?.songs.map((song) => song.id), [MOCK_SONGS[0].id], 'legible: se usa');
  });

  it('guarda la versión publicada de cada canción y la devuelve igual', () => {
    const storage = memoryStorage();
    const versioned = [{ ...REMOTE_SONGS[0], version: 3 }, REMOTE_SONGS[1]];
    eq(createCatalogCache(storage, PROJECT).write(versioned), true);
    const stored = JSON.parse(storage.data.get(CATALOG_CACHE_KEY)!);
    eq([stored.version, stored.rows[0].current_version, stored.rows[1].current_version], [2, 3, 1]);
    eq(createCatalogCache(storage, PROJECT).read()?.songs, versioned);
    // Un catálogo sin versiones no es una respuesta remota: no se guarda.
    eq(createCatalogCache(memoryStorage(), PROJECT).write(MOCK_SONGS), false);
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
    eq(cache.read(), null);
    eq(storage.data.get('genesaret_favorites'), JSON.stringify(['huracan-hakuna']));
    eq(JSON.parse(storage.data.get('genesaret_setlists')!).setlists[0].items[0].songId, 'huracan-hakuna');
    eq(JSON.parse(storage.data.get('genesaret_performance_history')!).records.length, 1);
    // Y en cuanto vuelve la conexión, la respuesta remota la reemplaza.
    cache.write(REMOTE_SONGS, new Date('2026-09-20T05:00:00Z'));
    eq(cache.read()?.songs.length, REMOTE_SONGS.length);
  });

  it('sin espacio, demasiado grande o sin almacenamiento: no se guarda y nada se rompe', () => {
    const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
    eq(createCatalogCache(full, PROJECT).write(REMOTE_SONGS), false);
    const huge: Song[] = [{ ...NEW_SONG, content: 'x'.repeat(MAX_CATALOG_CACHE_BYTES) }];
    eq(createCatalogCache(memoryStorage(), PROJECT).write(huge), false);
    eq(createCatalogCache(null, PROJECT).write(REMOTE_SONGS), false);
    eq(createCatalogCache(null, PROJECT).read(), null);
    eq(createCatalogCache(memoryStorage(), PROJECT).write([]), false);
  });
});

// --- Store --------------------------------------------------------------------------

describe('Una sola fuente completa a la vez', () => {
  it('incluido sin caché → remoto: primero las incluidas, luego el remoto, y la caché queda guardada', async () => {
    const storage = memoryStorage();
    const remote = fakeRemote([...REMOTE_SONGS, NEW_SONG]);
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: remote.repository, cache: createCatalogCache(storage, PROJECT) });
    eq([store.getSnapshot().source, store.getSnapshot().remote, store.getSnapshot().songs.length], ['bundled', 'idle', 110]);
    await store.refresh({ force: true });
    eq([store.getSnapshot().source, store.getSnapshot().remote, store.getSnapshot().songs.length], ['remote', 'ok', 111]);
    eq(createCatalogCache(storage, PROJECT).read()?.songs.length, 111);
  });

  it('caché → remoto idéntico: mismas canciones, mismos objetos, nada vuelve a pintarse', async () => {
    const storage = memoryStorage();
    createCatalogCache(storage, PROJECT).write(REMOTE_SONGS);
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: fakeRemote(REMOTE_SONGS).repository, cache: createCatalogCache(storage, PROJECT) });
    const before = store.getSnapshot();
    eq(before.source, 'cache');
    await store.refresh({ force: true });
    const now = store.getSnapshot();
    eq(now.source, 'remote');
    eq([now.songs === before.songs, now.byId === before.byId, now.searchIndex === before.searchIndex], [true, true, true]);
  });

  it('caché → remoto actualizado: aparece la canción nueva y la caché se reemplaza', async () => {
    const storage = memoryStorage();
    createCatalogCache(storage, PROJECT).write(REMOTE_SONGS);
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: fakeRemote([...REMOTE_SONGS, NEW_SONG]).repository, cache: createCatalogCache(storage, PROJECT) });
    await store.refresh({ force: true });
    eq(store.getSnapshot().byId.get(NEW_SONG.id), NEW_SONG);
    eq(createCatalogCache(storage, PROJECT).read()?.songs.some((song) => song.id === NEW_SONG.id), true);
  });

  it('caché → Supabase caído: se sigue mostrando la caché (con la canción solo remota) y la caché no se toca', async () => {
    const storage = memoryStorage();
    createCatalogCache(storage, PROJECT).write([...REMOTE_SONGS, NEW_SONG], new Date('2026-09-19T05:00:00Z'));
    const saved = storage.data.get(CATALOG_CACHE_KEY);
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: fakeRemote(new Error('503')).repository, cache: createCatalogCache(storage, PROJECT) });
    await store.refresh({ force: true });
    const snapshot = store.getSnapshot();
    eq([snapshot.source, snapshot.remote, snapshot.savedAt, snapshot.songs.length], ['cache', 'failed', '2026-09-19T05:00:00.000Z', 111]);
    eq(store.availability(NEW_SONG.id), 'available');
    eq(storage.data.get(CATALOG_CACHE_KEY), saved);
  });

  it('incluido → Supabase caído: siguen las 110 incluidas, avisando del fallo', async () => {
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: fakeRemote(new Error('503')).repository, cache: createCatalogCache(memoryStorage(), PROJECT) });
    await store.refresh({ force: true });
    eq([store.getSnapshot().source, store.getSnapshot().remote, store.getSnapshot().songs.length], ['bundled', 'failed', 110]);
  });

  it('remoto cargado → el siguiente refresco falla o llega vacío: nada de lo que había se pierde', async () => {
    const remote = fakeRemote([...REMOTE_SONGS, NEW_SONG]);
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
    createCatalogCache(storage, PROJECT).write(REMOTE_SONGS);
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: fakeRemote([]).repository, cache: createCatalogCache(storage, PROJECT) });
    await store.refresh({ force: true });
    eq([store.getSnapshot().source, store.getSnapshot().songs.length], ['cache', 110]);
    eq(createCatalogCache(storage, PROJECT).read()?.songs.length, 110);
  });

  it('110 incluidas + 110 remotas = 110 visibles, y el remoto manda', async () => {
    const edited = { ...REMOTE_SONGS[0], title: `${REMOTE_SONGS[0].title} (corregida)` };
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: fakeRemote([edited, ...REMOTE_SONGS.slice(1)]).repository, cache: null });
    await store.refresh({ force: true });
    eq(store.getSnapshot().songs.length, 110);
    eq(ids(store), BUNDLED_IDS);
    eq(store.getSnapshot().byId.get(edited.id)?.title, edited.title);
  });

  it('una canción oculta en Supabase no reaparece desde las incluidas', async () => {
    const hidden = REMOTE_SONGS[5].id;
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: fakeRemote(REMOTE_SONGS.filter((song) => song.id !== hidden)).repository, cache: null });
    await store.refresh({ force: true });
    eq([store.getSnapshot().songs.length, store.getSnapshot().byId.has(hidden)], [109, false]);
    eq(store.availability(hidden), 'missing');
  });

  it('todas las fuentes en el mismo orden: pasar al remoto no reordena nada', async () => {
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: fakeRemote([...REMOTE_SONGS].reverse()).repository, cache: null });
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
    remote.set(REMOTE_SONGS);
    await store.refresh({ force: true });
    eq([store.availability(NEW_SONG.id), unavailableText('missing')], ['missing', 'Ya no está en el cancionero']);
  });

  it('un setlist resuelve una canción solo remota con el mismo mapa que el resto de la app', async () => {
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: fakeRemote([...REMOTE_SONGS, NEW_SONG]).repository, cache: null });
    const setlist = { items: [{ id: 'item-1', songId: NEW_SONG.id }] } as unknown as Parameters<typeof getFirstPlayableItem>[0];
    const playable = (item: { songId: string }) => store.getSnapshot().byId.has(item.songId);
    eq(getFirstPlayableItem(setlist, playable), null);
    await store.refresh({ force: true });
    eq(getFirstPlayableItem(setlist, playable)?.id, 'item-1');
  });

  it('búsqueda y categorías incluyen la canción aprobada en cuanto llega', async () => {
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: fakeRemote([...REMOTE_SONGS, NEW_SONG]).repository, cache: null });
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
    const remote = fakeRemote(REMOTE_SONGS);
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
    const remote = fakeRemote(REMOTE_SONGS);
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
    // Solo la palabra exacta "remote" pide el catálogo de Supabase: sin variable,
    // con un valor raro o con "bundled", se usa el cancionero incluido en la app.
    eq(
      ['bundled', ' BUNDLED ', undefined, '', 'REMOTE', ' remote ', 'supabase', 'true'].map(readCatalogSource),
      ['bundled', 'bundled', 'bundled', 'bundled', 'remote', 'remote', 'bundled', 'bundled']
    );
    const storage = memoryStorage();
    createCatalogCache(storage, PROJECT).write([...REMOTE_SONGS, NEW_SONG]);
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: null, cache: createCatalogCache(storage, PROJECT) });
    await store.refresh({ force: true });
    eq([store.getSnapshot().source, store.getSnapshot().remote, store.getSnapshot().songs.length], ['bundled', 'disabled', 110]);
    eq(store.availability(NEW_SONG.id), 'missing');
  });
});

describe('Catálogo remoto por páginas', () => {
  it('pide páginas de 1000 hasta la última, en un orden estable', async () => {
    const all: SongRow[] = Array.from({ length: SONG_PAGE_SIZE * 2 + 5 }, (_, index) => ({ ...songToRow(MOCK_SONGS[0]), id: `cancion-${index}`, current_version: 1 }));
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

// --- Turning the remote catalog on --------------------------------------------------

describe('Catálogo remoto: una sola fuente, entera o ninguna', () => {
  const cacheWith = (songs: Song[]) => {
    const storage = memoryStorage();
    createCatalogCache(storage, PROJECT).write(songs, new Date('2026-09-21T05:00:00Z'));
    return storage;
  };
  const storeOn = (
    answer: Parameters<typeof fakeRemote>[0],
    storage: ReturnType<typeof memoryStorage> | null,
    options: { timeoutMs?: number } = {}
  ) =>
    createCatalogStore({
      bundled: MOCK_SONGS,
      remote: fakeRemote(answer).repository,
      cache: storage ? createCatalogCache(storage, PROJECT) : null,
      ...options,
    });
  const state = (store: CatalogStore) => {
    const snapshot = store.getSnapshot();
    return [snapshot.configuredSource, snapshot.source, snapshot.remote, snapshot.fallbackReason, snapshot.songs.length];
  };
  /** A remote answer that is not a catalog: one row that can't be read. */
  const withBrokenSong = [...REMOTE_SONGS.slice(0, 3), { id: 'rota', title: 'Rota' } as unknown as Song];

  it('1. bundled explícito: no pregunta a Supabase ni lee la caché', async () => {
    const storage = cacheWith([...REMOTE_SONGS, NEW_SONG]);
    const remote = fakeRemote([...REMOTE_SONGS, NEW_SONG]);
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: null, cache: createCatalogCache(storage, PROJECT) });
    await store.refresh({ force: true });
    eq(state(store), ['bundled', 'bundled', 'disabled', null, 110]);
    eq(remote.calls(), 0);
    eq(store.availability(NEW_SONG.id), 'missing');
  });

  it('2, 16. remote válido: se usa y se guarda en la caché', async () => {
    const storage = memoryStorage();
    const store = storeOn(REMOTE_SONGS, storage);
    await store.refresh({ force: true });
    eq(state(store), ['remote', 'remote', 'ok', null, 110]);
    eq(createCatalogCache(storage, PROJECT).read()?.songs.length, 110);
  });

  it('3, 4, 17, 25. el catálogo remoto se usa entero y tal cual: ni se le suman las incluidas ni se repite nada', async () => {
    const bigger = [...REMOTE_SONGS, NEW_SONG, { ...NEW_SONG, id: 'otra-aprobada', title: 'Otra aprobada' }];
    const store = storeOn(bigger, memoryStorage());
    await store.refresh({ force: true });
    const snapshot = store.getSnapshot();
    eq([snapshot.source, snapshot.songs.length], ['remote', 112]);
    eq(snapshot.songs.length, new Set(snapshot.songs.map((song) => song.id)).size, 'sin duplicados');
    eq(snapshot.byId.has(NEW_SONG.id), true);

    // Un catálogo remoto más corto que el incluido tampoco se completa con él.
    const shorter = storeOn(REMOTE_SONGS.slice(0, 5), null);
    await shorter.refresh({ force: true });
    eq(shorter.getSnapshot().songs.map((song) => song.id).sort(), REMOTE_SONGS.slice(0, 5).map((song) => song.id).sort());
  });

  it('5, 26. red caída o lenta con caché válida: se usa la caché, y la caché sigue intacta', async () => {
    const storage = cacheWith([...REMOTE_SONGS, NEW_SONG]);
    const store = storeOn(new Error('sin red'), storage);
    eq(state(store), ['remote', 'cache', 'idle', null, 111], 'la caché se muestra desde el primer render');
    await store.refresh({ force: true });
    eq(state(store), ['remote', 'cache', 'failed', 'error', 111]);
    eq(createCatalogCache(storage, PROJECT).read()?.songs.length, 111, 'no se borró por fallar la petición');

    const slow = storeOn('never', cacheWith(REMOTE_SONGS), { timeoutMs: 10 });
    await slow.refresh({ force: true });
    eq(state(slow), ['remote', 'cache', 'failed', 'timeout', 110]);
  });

  it('6. red caída sin caché: las canciones incluidas', async () => {
    const store = storeOn(new Error('sin red'), memoryStorage());
    await store.refresh({ force: true });
    eq(state(store), ['remote', 'bundled', 'failed', 'error', 110]);
    eq(store.getSnapshot().byId.has(NEW_SONG.id), false);
  });

  it('7, 15. respuesta remota inválida con caché válida: se usa la caché y no se sobrescribe', async () => {
    const storage = cacheWith([...REMOTE_SONGS, NEW_SONG]);
    const store = storeOn(withBrokenSong, storage);
    await store.refresh({ force: true });
    eq(state(store), ['remote', 'cache', 'failed', 'invalid', 111]);
    eq(createCatalogCache(storage, PROJECT).read()?.songs.length, 111, 'la caché buena sigue ahí');

    // Ids repetidos: lo mismo.
    const repeated = storeOn([...REMOTE_SONGS, REMOTE_SONGS[0]], cacheWith(REMOTE_SONGS));
    await repeated.refresh({ force: true });
    eq(state(repeated), ['remote', 'cache', 'failed', 'invalid', 110]);
  });

  it('8, 9, 10, 11. caché inválida, corrupta, de otro formato o ilegible: las canciones incluidas', async () => {
    const corrupt = memoryStorage({ [CATALOG_CACHE_KEY]: '{roto' });
    const store = storeOn(withBrokenSong, corrupt);
    await store.refresh({ force: true });
    eq(state(store), ['remote', 'bundled', 'failed', 'invalid', 110]);

    const unknownFormat = memoryStorage({
      [CATALOG_CACHE_KEY]: JSON.stringify({ version: 99, projectUrl: PROJECT, savedAt: 'x', rows: REMOTE_SONGS.map(songToRow) }),
    });
    const other = storeOn(new Error('sin red'), unknownFormat);
    await other.refresh({ force: true });
    eq(state(other), ['remote', 'bundled', 'failed', 'error', 110]);

    const throwing = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => undefined,
    };
    const blocked = createCatalogStore({ bundled: MOCK_SONGS, remote: fakeRemote(new Error('sin red')).repository, cache: createCatalogCache(throwing, PROJECT) });
    await blocked.refresh({ force: true });
    eq(state(blocked), ['remote', 'bundled', 'failed', 'error', 110]);
  });

  it('12. si no se puede escribir la caché, el catálogo remoto se usa igual', async () => {
    const readOnly = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: fakeRemote([...REMOTE_SONGS, NEW_SONG]).repository, cache: createCatalogCache(readOnly, PROJECT) });
    await store.refresh({ force: true });
    eq(state(store), ['remote', 'remote', 'ok', null, 111]);
  });

  it('13, 14. lo que no es un catálogo se rechaza entero', () => {
    eq(validateCatalogSnapshot([]), { ok: false, reason: 'empty' });
    eq(validateCatalogSnapshot([REMOTE_SONGS[0], REMOTE_SONGS[0]]).ok, false, 'id repetido');
    eq(validateCatalogSnapshot([REMOTE_SONGS[0], null]).ok, false, 'entrada vacía');
    eq(validateCatalogSnapshot([{ ...REMOTE_SONGS[0], id: '' }]).ok, false, 'id vacío');
    eq(validateCatalogSnapshot([{ ...REMOTE_SONGS[0], content: undefined } as unknown as Song]).ok, false, 'sin letra');
    eq(validateCatalogSnapshot([{ ...REMOTE_SONGS[0], tags: 'no' } as unknown as Song]).ok, false, 'etiquetas que no son lista');
    eq(validateCatalogSnapshot([{ ...REMOTE_SONGS[0], version: 0 }]).ok, false, 'versión imposible');
    eq(validateCatalogSnapshot([{ ...REMOTE_SONGS[0], version: 1.5 }]).ok, false, 'versión decimal');
    eq(validateCatalogSnapshot(REMOTE_SONGS).ok, true);
    eq(validateCatalogSnapshot([{ ...REMOTE_SONGS[0], version: 4 }]).ok, true);
  });

  it('14. una fila ilegible del servidor no se esconde: invalida la respuesta', async () => {
    const rows = [songToRow(MOCK_SONGS[0]), { id: 'rota' } as unknown as SongRow];
    const client: SupabaseClient = {
      select: async <T,>() => rows as T[],
      rpc: async <T,>() => [] as T,
      invoke: async <T,>() => ({}) as T,
      count: async () => 0,
    };
    const result = await fetchRemoteCatalog(createSupabaseSongRepository(client));
    eq(result, { ok: false, reason: 'invalid' });
  });

  it('18, 19, 20. al pasar a remoto, los datos de este navegador siguen resolviendo', async () => {
    const favorites = ['huracan-hakuna', 'alfarero'];
    const setlistSongIds = ['sencillamente-dios', NEW_SONG.id];
    const store = storeOn([...REMOTE_SONGS, NEW_SONG], memoryStorage());
    const bundledIds = store.getSnapshot().songs.map((song) => song.id).sort();
    await store.refresh({ force: true });
    const snapshot = store.getSnapshot();

    // Los 110 ids históricos son exactamente los mismos.
    eq(snapshot.songs.filter((song) => song.id !== NEW_SONG.id).map((song) => song.id).sort(), bundledIds);
    eq(favorites.every((id) => snapshot.byId.has(id)), true, 'favoritas');
    eq(setlistSongIds.every((id) => snapshot.byId.has(id)), true, 'entradas de Setlist, incluida la canción solo remota');
    eq(snapshot.byId.get('huracan-hakuna')?.title, MOCK_SONGS.find((song) => song.id === 'huracan-hakuna')?.title);
  });

  it('21, 22. la versión publicada viaja hasta la propuesta de edición', async () => {
    const published = { ...REMOTE_SONGS[0], version: 4 };
    const store = storeOn([published, ...REMOTE_SONGS.slice(1)], memoryStorage());
    await store.refresh({ force: true });
    const song = store.getSnapshot().byId.get(published.id)!;
    eq(song.version, 4, 'Song.version es current_version, no un 1 inventado');

    // Y es la que lleva la propuesta: nada de suponer la 1.
    const payload = buildSubmissionPayload(songToDraft(song), { type: 'update', targetSongId: song.id, baseVersion: songVersionOf(song) });
    eq([payload.targetSongId, payload.baseVersion], [song.id, 4]);
    eq(songVersionOf({ ...song, version: undefined }), 1, 'una canción incluida cuenta como la 1');
  });
});

// --- What the backend has to say for its answer to be the catalog --------------------

describe('Un catálogo remoto se acepta entero y con su versión', () => {
  const rowsOf = (rows: SongRow[]): SupabaseClient => ({
    select: async <T,>() => rows as T[],
    rpc: async <T,>() => [] as T,
    invoke: async <T,>() => ({}) as T,
    count: async () => 0,
  });
  const answerFor = (patch: Partial<SongRow>) =>
    fetchRemoteCatalog(createSupabaseSongRepository(rowsOf([{ ...songToRow(MOCK_SONGS[0]), current_version: 1, ...patch }])));

  it('la versión publicada tiene que ser un entero de 1 o más', async () => {
    for (const current_version of [null, undefined, 0, -1, 1.5, '4' as unknown as number, Number.NaN, '' as unknown as number]) {
      eq(await answerFor({ current_version }), { ok: false, reason: 'invalid' }, `current_version=${String(current_version)}`);
    }
    const good = await answerFor({ current_version: 4 });
    eq(good.ok && good.songs[0].version, 4, 'una versión de verdad se conserva');
    eq((await answerFor({ current_version: 1 })).ok, true);
  });

  it('un dato que rompería el arranque invalida la respuesta, no una canción', async () => {
    for (const patch of [
      { title: '' },
      { title: '   ' },
      { content: '' },
      { content: '   ' },
      { id: '' },
      { categories: [null] as unknown as string[] },
      { tags: [null] as unknown as string[] },
      { chords_used: [null] as unknown as string[] },
      { categories: [''] as unknown as string[] },
      { liturgical_seasons: [null] as unknown as string[] },
    ]) {
      eq(await answerFor(patch), { ok: false, reason: 'invalid' }, JSON.stringify(patch));
    }
  });

  it('una caché con una categoría nula se descarta entera, y el cancionero arranca', () => {
    const broken = { ...songToRow(MOCK_SONGS[0]), current_version: 1, categories: [null] as unknown as string[] };
    const storage = memoryStorage({
      [CATALOG_CACHE_KEY]: JSON.stringify({ version: CATALOG_CACHE_VERSION, projectUrl: PROJECT, savedAt: 'x', rows: [broken] }),
    });
    eq(createCatalogCache(storage, PROJECT).read(), null);
    // Lo que llega a la app son las incluidas, y listar sus categorías no revienta.
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: fakeRemote(new Error('sin red')).repository, cache: createCatalogCache(storage, PROJECT) });
    eq(store.getSnapshot().source, 'bundled');
    eq(listSongCategories([...store.getSnapshot().songs]).length > 0, true);
  });

  it('una respuesta con la versión rota no reemplaza una caché buena', async () => {
    const storage = memoryStorage();
    createCatalogCache(storage, PROJECT).write([...REMOTE_SONGS, NEW_SONG]);
    const withoutVersion = REMOTE_SONGS.map(({ version: _dropped, ...song }) => song as Song);
    const store = createCatalogStore({
      bundled: MOCK_SONGS,
      remote: fakeRemote(withoutVersion).repository,
      cache: createCatalogCache(storage, PROJECT),
    });
    await store.refresh({ force: true });
    eq([store.getSnapshot().source, store.getSnapshot().fallbackReason, store.getSnapshot().songs.length], ['cache', 'invalid', 111]);
    eq(createCatalogCache(storage, PROJECT).read()?.songs.length, 111, 'la caché buena sigue entera');
  });

  it('un catálogo que no cabe en las páginas que se piden no se da por bueno', async () => {
    let page = 0;
    const client: SupabaseClient = {
      select: async <T,>() => {
        page++;
        return Array.from({ length: SONG_PAGE_SIZE }, (_, index) => ({
          ...songToRow(MOCK_SONGS[0]),
          id: `cancion-${page}-${index}`,
          current_version: 1,
        })) as T[];
      },
      rpc: async <T,>() => [] as T,
      invoke: async <T,>() => ({}) as T,
      count: async () => 0,
    };
    eq(await fetchRemoteCatalog(createSupabaseSongRepository(client)), { ok: false, reason: 'invalid' });
  });

  it('el reloj cubre también abrir el lector, y un corte por tiempo se llama timeout', async () => {
    // Un módulo que nunca llega no deja el cancionero esperando para siempre.
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: () => new Promise(() => {}), cache: null, timeoutMs: 20 });
    await store.refresh({ force: true });
    eq([store.getSnapshot().source, store.getSnapshot().remote, store.getSnapshot().fallbackReason], ['bundled', 'failed', 'timeout']);

    // Y si la petición se corta por el abort, el motivo sigue siendo el reloj.
    const aborting: SongRepository = {
      source: 'remote',
      listSongs: ({ signal } = {}) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('abortada')));
        }),
      getSong: async () => null,
    };
    eq(await fetchRemoteCatalog(aborting, { timeoutMs: 20 }), { ok: false, reason: 'timeout' });
  });

  it('una canción que el catálogo activo ya no tiene deja de estar abierta', async () => {
    const retirada = MOCK_SONGS[0];
    const remote = fakeRemote('never');
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: remote.repository, cache: null, timeoutMs: 10 });
    // Mientras no hay respuesta, lo que se abrió se sigue leyendo.
    eq(songOnScreen(store, retirada.id, retirada)?.id, retirada.id);

    remote.set(REMOTE_SONGS.filter((song) => song.id !== retirada.id));
    await store.refresh({ force: true });
    eq(store.getSnapshot().source, 'remote');
    eq(songOnScreen(store, retirada.id, retirada), null, 'retirada: no se sigue mostrando la versión incluida');
    eq(songOnScreen(store, REMOTE_SONGS[1].id, null)?.id, REMOTE_SONGS[1].id, 'las demás se leen del catálogo activo');
    eq(songOnScreen(store, null, retirada), null);
  });
});

// --- Every column of a row, against the contract the database keeps ---------

describe('Una fila del catálogo es lo que la base de datos promete', () => {
  const rowsOf = (rows: SongRow[]): SupabaseClient => ({
    select: async <T,>() => rows as T[],
    rpc: async <T,>() => [] as T,
    invoke: async <T,>() => ({}) as T,
    count: async () => 0,
  });
  const rowOf = (patch: Partial<SongRow>): SongRow => ({ ...songToRow(MOCK_SONGS[0]), current_version: 1, ...patch });
  const answerFor = (patch: Partial<SongRow>) => fetchRemoteCatalog(createSupabaseSongRepository(rowsOf([rowOf(patch)])));
  const cacheOf = (rows: SongRow[]) =>
    createCatalogCache(
      memoryStorage({
        [CATALOG_CACHE_KEY]: JSON.stringify({ version: CATALOG_CACHE_VERSION, projectUrl: PROJECT, savedAt: '2026-09-23T10:00:00.000Z', rows }),
      }),
      PROJECT
    );
  const failingRemote: SongRepository = {
    source: 'remote',
    listSongs: () => Promise.reject(new Error('sin red')),
    getSong: async () => null,
  };

  /**
   * Column by column: what the `songs` table allows, and what it never holds.
   * The app reads these values without asking twice (it trims a key, counts a
   * capo, lists categories), so a value of the wrong shape is not a song with
   * an odd field: it is an answer that is not the catalog.
   */
  const CONTRACT: Array<[keyof SongRow, unknown[], unknown[]]> = [
    ['id', ['huracan-hakuna'], [42, null, undefined, '', '   ', {}, [], true, 'Con Mayusculas', 'con espacio']],
    ['title', ['Un título'], ['', '   ', 42, null, {}, [], true]],
    ['artist', [null, 'Hakuna', ''], [42, { name: 'bad' }, [], ['Hakuna'], true]],
    ['original_key', [null, 'G', 'F#m', 'Bb'], [4, {}, [], true, '', 'nueve car']],
    ['recommended_capo', [null, 0, 2, 11], ['dos', 1.5, -1, 12, {}, [], true]],
    ['time_signature', [null, '4/4', '12/8'], [4, '4/5', '4-4', '', {}, [], true]],
    ['tempo', [null, 30, 120, 300], ['120', 29, 301, 90.5, {}, [], true]],
    ['rhythm_pattern', [null, '↓ ↓↑ ↑↓↑', ''], [7, {}, [], true]],
    ['categories', [[], ['Alabanza']], [null, 'not-array', 42, {}, true, [null], [42], [''], ['   '], [{}]]],
    ['tags', [[], ['lento']], [null, 'not-array', 42, {}, true, [null], [42], [''], [[]]]],
    ['chords_used', [[], ['G', 'D']], [null, 'not-array', 42, {}, true, [null], [42], [''], [['G']]]],
    ['liturgical_seasons', [null, [], ['adviento']], ['adviento', 42, {}, true, [null], [42], ['']]],
    ['content', ['[Verso 1]'], ['', '   ', 42, null, {}, [], true]],
    ['difficulty', [null, 'Fácil', 'Intermedio', 'Avanzado'], ['Imposible', '', 42, {}, [], true]],
    ['year', [null, '1998'], [1998, '98', '', {}, [], true]],
    ['youtube_id', [null, 'dQw4w9WgXcQ'], [true, 42, '', 'corto', {}, []]],
    ['current_version', [1, 7], [null, undefined, 0, -1, 1.5, '4', Number.NaN, {}, []]],
  ];

  it('lo que la base de datos permite en cada columna se acepta', async () => {
    for (const [column, allowed] of CONTRACT) {
      for (const value of allowed) {
        const patch = { [column]: value } as Partial<SongRow>;
        eq((await answerFor(patch)).ok, true, `remoto rechazó ${column}=${JSON.stringify(value)}`);
        eq(cacheOf([rowOf(patch)]).read()?.songs.length, 1, `caché rechazó ${column}=${JSON.stringify(value)}`);
      }
    }
  });

  it('un tipo que el contrato no permite invalida la respuesta entera, y también la caché', async () => {
    for (const [column, , refused] of CONTRACT) {
      for (const value of refused) {
        const patch = { [column]: value } as Partial<SongRow>;
        eq(await answerFor(patch), { ok: false, reason: 'invalid' }, `remoto aceptó ${column}=${JSON.stringify(value)}`);
        eq(cacheOf([rowOf(patch)]).read(), null, `caché aceptó ${column}=${JSON.stringify(value)}`);
      }
    }
  });

  it('una fila mala no se convierte en una canción con valores inventados', async () => {
    // La tonalidad que rompía el motor de acordes: ni se normaliza, ni entra.
    eq(await answerFor({ original_key: 4 as unknown as string }), { ok: false, reason: 'invalid' });
    // Y una lista que no es una lista no se convierte en la lista vacía.
    eq(await answerFor({ categories: 'Alabanza' as unknown as string[] }), { ok: false, reason: 'invalid' });
    eq(await answerFor({ chords_used: 42 as unknown as string[] }), { ok: false, reason: 'invalid' });
    // Una fila bien formada pasa con sus campos tal cual llegaron.
    const good = await answerFor({ original_key: 'F#m', recommended_capo: 2, difficulty: 'Intermedio', year: '2019' });
    eq(good.ok && [good.songs[0].originalKey, good.songs[0].recommendedCapo, good.songs[0].difficulty, good.songs[0].year], [
      'F#m',
      2,
      'Intermedio',
      '2019',
    ]);
  });

  it('las 110 incluidas cumplen el contrato: la frontera no endurece el cancionero', () => {
    const problems = MOCK_SONGS.map((song) => catalogRowProblem({ ...songToRow(song), current_version: 1 })).filter(Boolean);
    eq(problems, [], 'las canciones que trae la app no pasarían por la frontera remota');
    // Y dan la vuelta entera: guardadas en la caché, se leen igual.
    const cache = createCatalogCache(memoryStorage(), PROJECT);
    eq(cache.write(REMOTE_SONGS), true);
    eq(cache.read()?.songs.length, 110);
  });

  it('remota inválida, caché buena: se queda la caché, intacta', async () => {
    const storage = memoryStorage();
    createCatalogCache(storage, PROJECT).write(REMOTE_SONGS);
    const badRemote: SongRepository = {
      source: 'remote',
      listSongs: () => createSupabaseSongRepository(rowsOf([rowOf({ original_key: 4 as unknown as string })])).listSongs(),
      getSong: async () => null,
    };
    const store = createCatalogStore({ bundled: MOCK_SONGS, remote: badRemote, cache: createCatalogCache(storage, PROJECT) });
    await store.refresh({ force: true });
    eq([store.getSnapshot().source, store.getSnapshot().fallbackReason, store.getSnapshot().songs.length], ['cache', 'invalid', 110]);
    eq(createCatalogCache(storage, PROJECT).read()?.songs.length, 110, 'la caché buena no se toca');
  });

  it('remota inválida sin caché: las incluidas; caché inválida: las incluidas', async () => {
    const badRemote: SongRepository = {
      source: 'remote',
      listSongs: () => createSupabaseSongRepository(rowsOf([rowOf({ artist: { name: 'bad' } as unknown as string })])).listSongs(),
      getSong: async () => null,
    };
    const sinCache = createCatalogStore({ bundled: MOCK_SONGS, remote: badRemote, cache: null });
    await sinCache.refresh({ force: true });
    eq([sinCache.getSnapshot().source, sinCache.getSnapshot().fallbackReason], ['bundled', 'invalid']);

    // Una caché rota (una tonalidad que es un número) se descarta entera.
    const rota = cacheOf([rowOf({ original_key: 4 as unknown as string })]);
    eq(rota.read(), null);
    const conCacheRota = createCatalogStore({ bundled: MOCK_SONGS, remote: failingRemote, cache: rota });
    await conCacheRota.refresh({ force: true });
    eq([conCacheRota.getSnapshot().source, conCacheRota.getSnapshot().songs.length], ['bundled', 110]);
  });

  it('remota válida: se usa, y se guarda para la próxima vez', async () => {
    const storage = memoryStorage();
    const rows = MOCK_SONGS.map((song) => ({ ...songToRow(song), current_version: 1 }));
    const store = createCatalogStore({ bundled: [], remote: createSupabaseSongRepository(rowsOf(rows)), cache: createCatalogCache(storage, PROJECT) });
    await store.refresh({ force: true });
    eq([store.getSnapshot().source, store.getSnapshot().fallbackReason, store.getSnapshot().songs.length], ['remote', null, 110]);
    eq(createCatalogCache(storage, PROJECT).read()?.songs.length, 110);
  });
});
