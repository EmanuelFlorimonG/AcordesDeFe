import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Song } from '../src/types/song';
import type { LiturgicalSeasonId } from '../src/data/liturgicalSeasons';
import { MOCK_SONGS } from '../src/data/mockSongs';
import {
  EMPTY_FILTERS,
  buildSearchIndex,
  compareKeys,
  countActiveFilters,
  getFilterOptions,
  hasActiveFilters,
  removeFilterValue,
  scoreSongMatch,
  searchSongs,
  sortSongs,
  toggleFilterValue,
  type SongFilters,
} from '../src/utils/songSearch';
import {
  MAX_RECENT_SONGS,
  RECENT_SONGS_KEY,
  createRecentSongsStore,
  parseRecentSongs,
  recordSongOpened,
  sanitizeRecentSongs,
} from '../src/storage/recentSongsStorage';
import { countSongUsage, formatSongUsage, getMostUsedSongs } from '../src/utils/songUsage';
import { addSongsToSetlist, createSetlist } from '../src/utils/setlists';
import { formatRelativeTime } from '../src/utils/relativeTime';

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`songDiscovery.test: ${checks} comprobaciones`));

function makeSong(
  id: string,
  title: string,
  details: { artist?: string; categories: string[]; seasons?: LiturgicalSeasonId[]; key?: string; content?: string }
): Song {
  return {
    id,
    title,
    artist: details.artist,
    originalKey: details.key,
    categories: details.categories,
    liturgicalSeasons: details.seasons,
    tags: [],
    chordsUsed: [],
    content: details.content ?? '',
  };
}

const HURACAN = makeSong('huracan', 'Huracán', {
  artist: 'Hakuna Group Music',
  categories: ['Adoración', 'Comunión'],
  seasons: ['cuaresma'],
  key: 'G',
});
const CONTIGO = makeSong('contigo', 'Contigo María', {
  artist: 'Athenas',
  categories: ['María', 'Adoración'],
  seasons: ['todo-el-ano'],
  key: 'G',
});
const RESUCITO = makeSong('resucito', 'Resucitó', { artist: 'Kiko', categories: ['Entrada'], seasons: ['pascua'], key: 'D' });
const PAN = makeSong('pan', 'Pan de Vida', {
  categories: ['Comunión'],
  seasons: ['todo-el-ano'],
  key: 'C',
  content: '[C]Yo soy el [G]pan de la vida eterna',
});
const VEN = makeSong('ven', 'Ven Señor', { artist: 'Kiko', categories: ['Entrada'], seasons: ['adviento'], key: 'Am' });
const SIN_CLASIFICAR = makeSong('sin-clasificar', 'Canción Antigua', { categories: ['Comunión'], key: 'G' });

const SONGS = [HURACAN, CONTIGO, RESUCITO, PAN, VEN, SIN_CLASIFICAR];
const INDEX = buildSearchIndex(SONGS);

const ids = (songs: Array<{ id: string } | { song: Song }>) =>
  songs.map((entry) => ('song' in entry ? entry.song.id : entry.id)).sort();
const search = (query: string, filters: SongFilters = EMPTY_FILTERS) => ids(searchSongs(INDEX, query, filters));
const filtersWith = (changes: Partial<SongFilters>): SongFilters => ({ ...EMPTY_FILTERS, ...changes });

describe('Búsqueda por texto', () => {
  it('por título', () => {
    eq(search('huracán'), ['huracan']);
    eq(search('Pan de'), ['pan']);
  });

  it('ignora mayúsculas y minúsculas', () => {
    eq(search('HURACÁN'), ['huracan']);
    eq(search('contigo MARÍA'), ['contigo']);
  });

  it('ignora tildes: "maria" encuentra "María"', () => {
    eq(search('maria'), ['contigo']);
    eq(search('huracan'), ['huracan']);
    eq(search('resucito'), ['resucito']);
  });

  it('por artista', () => {
    eq(search('athenas'), ['contigo']);
    eq(search('kiko'), ['resucito', 'ven']);
    eq(search('hakuna group'), ['huracan']);
  });

  it('por categoría y por tiempo litúrgico escrito', () => {
    eq(search('comunion'), ['huracan', 'pan', 'sin-clasificar']);
    // As text, a season finds the songs marked with it; all-year songs come with the filter.
    eq(search('cuaresma'), ['huracan']);
    eq(search('adviento'), ['ven']);
  });

  it('varias palabras: todas deben estar', () => {
    eq(search('comunion cuaresma'), ['huracan']);
    eq(search('adoracion athenas'), ['contigo']);
    eq(search('entrada athenas'), []);
  });

  it('una frase de la letra también encuentra la canción, con menos prioridad', () => {
    eq(search('pan de la vida'), ['pan']);
    eq(search('soy'), [], 'palabras cortas no buscan en la letra');
    const [title] = searchSongs(INDEX, 'pan de vida', EMPTY_FILTERS);
    const [lyrics] = searchSongs(INDEX, 'pan de la vida', EMPTY_FILTERS);
    eq(title.score > lyrics.score, true);
  });

  it('ordena la relevancia: título exacto, empieza, contiene, detalles', () => {
    const entry = INDEX.find((candidate) => candidate.song.id === 'contigo')!;
    eq(scoreSongMatch(entry, 'contigo maria'), 100);
    eq(scoreSongMatch(entry, 'contigo'), 90);
    eq(scoreSongMatch(entry, 'maria'), 80);
    eq(scoreSongMatch(entry, 'athenas'), 50);
    eq(scoreSongMatch(entry, 'xyz'), 0);
  });

  it('sin texto devuelve todas', () => {
    eq(search(''), ids(SONGS));
    eq(search('   '), ids(SONGS));
  });

  it('en el cancionero real, "maria" encuentra Contigo María', () => {
    const results = searchSongs(buildSearchIndex(MOCK_SONGS), 'maria', EMPTY_FILTERS).map((result) => result.song.id);
    eq(results.includes('contigo-maria'), true);
    eq(results.includes('salve-regina'), true, 'también por la categoría María');
  });
});

describe('Filtros combinados', () => {
  it('por categoría', () => {
    eq(search('', filtersWith({ categories: ['Comunión'] })), ['huracan', 'pan', 'sin-clasificar']);
  });

  it('por tiempo litúrgico: incluye Todo el año, no las sin clasificar', () => {
    eq(search('', filtersWith({ seasons: ['cuaresma'] })), ['contigo', 'huracan', 'pan']);
    eq(search('', filtersWith({ seasons: ['adviento'] })), ['contigo', 'pan', 'ven']);
  });

  it('Todo el año aparece con cualquier tiempo', () => {
    for (const season of ['adviento', 'navidad', 'tiempo-ordinario', 'cuaresma', 'triduo-pascual', 'pascua'] as const) {
      const found = search('', filtersWith({ seasons: [season] }));
      eq(found.includes('contigo') && found.includes('pan'), true, season);
      eq(found.includes('sin-clasificar'), false, season);
    }
  });

  it('por artista', () => {
    eq(search('', filtersWith({ artists: ['Kiko'] })), ['resucito', 'ven']);
  });

  it('por tonalidad', () => {
    eq(search('', filtersWith({ keys: ['G'] })), ['contigo', 'huracan', 'sin-clasificar']);
    eq(search('', filtersWith({ keys: ['Am'] })), ['ven']);
  });

  it('tipos distintos se combinan con Y: Comunión y Cuaresma y G', () => {
    eq(search('', filtersWith({ categories: ['Comunión'], seasons: ['cuaresma'] })), ['huracan', 'pan']);
    eq(search('', filtersWith({ categories: ['Comunión'], seasons: ['cuaresma'], keys: ['G'] })), ['huracan']);
    eq(search('', filtersWith({ categories: ['Comunión'], keys: ['G'] })), ['huracan', 'sin-clasificar']);
    eq(search('', filtersWith({ categories: ['Entrada'], artists: ['Athenas'] })), []);
  });

  it('valores del mismo tipo se combinan con O', () => {
    eq(search('', filtersWith({ keys: ['G', 'D'] })), ['contigo', 'huracan', 'resucito', 'sin-clasificar']);
    eq(search('', filtersWith({ categories: ['Entrada', 'María'] })), ['contigo', 'resucito', 'ven']);
    eq(search('', filtersWith({ seasons: ['pascua', 'adviento'] })), ['contigo', 'pan', 'resucito', 'ven']);
  });

  it('texto y filtros juntos', () => {
    eq(search('kiko', filtersWith({ categories: ['Entrada'], seasons: ['pascua'] })), ['resucito']);
  });

  it('añadir, quitar y limpiar filtros', () => {
    let filters = toggleFilterValue(EMPTY_FILTERS, 'categories', 'Comunión');
    filters = toggleFilterValue(filters, 'seasons', 'cuaresma');
    filters = toggleFilterValue(filters, 'keys', 'G');
    eq(filters, { categories: ['Comunión'], seasons: ['cuaresma'], artists: [], keys: ['G'] });
    eq(countActiveFilters(filters), 3);
    eq(hasActiveFilters(filters), true);

    const withoutLent = removeFilterValue(filters, 'seasons', 'cuaresma');
    eq(withoutLent.seasons, []);
    eq(filters.seasons, ['cuaresma'], 'no modifica el original');
    eq(search('', withoutLent), ['huracan', 'sin-clasificar'], 'al quitar Cuaresma entra la no clasificada');

    eq(toggleFilterValue(filters, 'keys', 'G').keys, [], 'tocar un filtro activo lo quita');
    eq(removeFilterValue(filters, 'artists', 'Nadie') === filters, true);
    eq(hasActiveFilters(EMPTY_FILTERS), false);
    eq(search('', EMPTY_FILTERS), ids(SONGS), 'limpiar filtros devuelve todas');
  });
});

describe('Opciones de filtro derivadas de las canciones', () => {
  it('tonalidades y artistas salen de los datos, sin repetir y ordenados', () => {
    const options = getFilterOptions(INDEX, '', EMPTY_FILTERS);
    eq(options.keys.map((option) => option.value), ['C', 'D', 'G', 'Am']);
    eq(options.artists.map((option) => option.value), ['Athenas', 'Hakuna Group Music', 'Kiko']);
    eq(options.categories.slice(0, 2).map((option) => option.value), ['Entrada', 'Comunión'], 'la misa primero');
    eq(options.seasons.map((option) => option.value).includes('todo-el-ano'), false);
  });

  it('cada opción cuenta lo que mostraría con los demás filtros', () => {
    const options = getFilterOptions(INDEX, '', filtersWith({ categories: ['Comunión'] }));
    const countOf = (list: Array<{ value: string; count: number }>, value: string) =>
      list.find((option) => option.value === value)?.count;
    eq(countOf(options.keys, 'G'), 2);
    eq(countOf(options.keys, 'C'), 1);
    eq(countOf(options.keys, 'D'), 0);
    eq(countOf(options.categories, 'Entrada'), 2, 'su propio tipo no se descuenta');
    eq(countOf(options.seasons, 'cuaresma'), 2);
  });

  it('el cancionero real no tiene listas escritas a mano', () => {
    const options = getFilterOptions(buildSearchIndex(MOCK_SONGS), '', EMPTY_FILTERS);
    const realArtists = new Set(MOCK_SONGS.map((song) => song.artist).filter(Boolean));
    const realKeys = new Set(MOCK_SONGS.map((song) => song.originalKey).filter(Boolean));
    eq(options.artists.length, realArtists.size);
    eq(options.keys.length, realKeys.size);
    eq(compareKeys('Am', 'C') > 0, true, 'los menores después de los mayores');
  });
});

describe('Ordenar', () => {
  const context = {
    lastOpenedAt: new Map([
      ['pan', 300],
      ['huracan', 100],
    ]),
    uses: new Map([
      ['ven', 2],
      ['pan', 2],
      ['huracan', 5],
    ]),
  };
  const order = (sort: Parameters<typeof sortSongs>[1]) => sortSongs(SONGS, sort, context).map((song) => song.id);

  it('A–Z y Z–A', () => {
    eq(order('az'), ['sin-clasificar', 'contigo', 'huracan', 'pan', 'resucito', 'ven']);
    eq(order('za'), ['ven', 'resucito', 'pan', 'huracan', 'contigo', 'sin-clasificar']);
  });

  it('más recientes: las nunca abiertas van después, por título', () => {
    eq(order('recent'), ['pan', 'huracan', 'sin-clasificar', 'contigo', 'resucito', 'ven']);
  });

  it('más usadas: empate por reciente y luego título', () => {
    eq(order('used'), ['huracan', 'pan', 'ven', 'sin-clasificar', 'contigo', 'resucito']);
  });

  it('no modifica la lista original y siempre da el mismo orden', () => {
    const before = SONGS.map((song) => song.id);
    eq(order('used'), order('used'));
    eq(SONGS.map((song) => song.id), before);
  });
});

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe('Tocadas recientemente', () => {
  it('añade una canción arriba con su fecha', () => {
    eq(recordSongOpened([], 'huracan', 1000), [{ songId: 'huracan', lastOpenedAt: 1000 }]);
  });

  it('volver a abrir actualiza la fecha, sube al primer lugar y no duplica', () => {
    let recents = recordSongOpened([], 'a', 1000);
    recents = recordSongOpened(recents, 'b', 2000);
    recents = recordSongOpened(recents, 'c', 3000);
    eq(recents.map((entry) => entry.songId), ['c', 'b', 'a']);
    recents = recordSongOpened(recents, 'a', 4000);
    eq(recents, [
      { songId: 'a', lastOpenedAt: 4000 },
      { songId: 'c', lastOpenedAt: 3000 },
      { songId: 'b', lastOpenedAt: 2000 },
    ]);
  });

  it('respeta el límite máximo', () => {
    let recents = recordSongOpened([], 'song-0', 1);
    for (let index = 1; index < 30; index++) recents = recordSongOpened(recents, `song-${index}`, index + 1);
    eq(recents.length, MAX_RECENT_SONGS);
    eq(recents[0].songId, 'song-29');
    eq(recents.at(-1)?.songId, 'song-10');
    eq(recordSongOpened(recents, 'nueva', 99, 3).length, 3);
  });

  it('persiste y vuelve a cargar lo mismo', () => {
    const storage = memoryStorage();
    const store = createRecentSongsStore(storage);
    const recents = recordSongOpened(recordSongOpened([], 'a', 1000), 'b', 2000);
    store.save(recents);
    eq(JSON.parse(storage.data.get(RECENT_SONGS_KEY) ?? '{}').version, 1);
    eq(createRecentSongsStore(storage).load(), recents);
  });

  it('datos corruptos: se ignoran sin romper nada', () => {
    eq(parseRecentSongs('{roto'), []);
    eq(parseRecentSongs(JSON.stringify({ version: 99, songs: [{ songId: 'a', lastOpenedAt: 1 }] })), []);
    eq(parseRecentSongs(JSON.stringify([{ songId: 'a', lastOpenedAt: 1 }])), []);
    eq(parseRecentSongs(null), []);
    eq(
      sanitizeRecentSongs([
        { songId: 'a', lastOpenedAt: 100 },
        { songId: 'a', lastOpenedAt: 300 },
        { songId: '', lastOpenedAt: 50 },
        { songId: 'b', lastOpenedAt: 'ayer' },
        { songId: 'c', lastOpenedAt: -5 },
        null,
        'basura',
        { songId: ' d ', lastOpenedAt: 200 },
      ]),
      [
        { songId: 'a', lastOpenedAt: 300 },
        { songId: 'd', lastOpenedAt: 200 },
      ]
    );
    const blocked = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('lleno');
      },
    };
    eq(createRecentSongsStore(blocked).load(), []);
    createRecentSongsStore(blocked).save([{ songId: 'a', lastOpenedAt: 1 }]);
    eq(createRecentSongsStore(null).load(), []);
  });
});

describe('Más usadas por GENESARET', () => {
  let counter = 0;
  const makeId = () => `id-${++counter}`;
  const setlistWith = (name: string, songs: Song[]) =>
    addSongsToSetlist(createSetlist({ name }, { now: 1, createId: makeId }), songs, { now: 1, createId: makeId });

  it('sin Setlists no hay canciones usadas', () => {
    eq(countSongUsage([]).size, 0);
    eq(getMostUsedSongs(SONGS, countSongUsage([])), []);
  });

  it('una aparición', () => {
    const usage = countSongUsage([setlistWith('Misa', [HURACAN])]);
    eq(usage.get('huracan'), { songId: 'huracan', uses: 1, setlistCount: 1 });
    eq(formatSongUsage(usage.get('huracan')!), 'Usada 1 vez en 1 Setlist');
  });

  it('la misma canción dos veces en un Setlist suma dos usos', () => {
    const usage = countSongUsage([setlistWith('Misa', [HURACAN, PAN, HURACAN])]);
    eq(usage.get('huracan'), { songId: 'huracan', uses: 2, setlistCount: 1 });
    eq(formatSongUsage(usage.get('huracan')!), 'Usada 2 veces en 1 Setlist');
  });

  it('varios Setlists', () => {
    const usage = countSongUsage([
      setlistWith('Misa', [HURACAN, PAN]),
      setlistWith('Adoración', [HURACAN]),
      setlistWith('Retiro', [HURACAN, CONTIGO]),
    ]);
    eq(usage.get('huracan'), { songId: 'huracan', uses: 3, setlistCount: 3 });
    eq(formatSongUsage(usage.get('huracan')!), 'Usada 3 veces en 3 Setlists');
    eq(getMostUsedSongs(SONGS, usage).map((entry) => entry.song.id), ['huracan', 'contigo', 'pan']);
  });

  it('una canción que ya no está en el cancionero no aparece', () => {
    const removed = makeSong('borrada', 'Borrada', { categories: ['Entrada'] });
    const usage = countSongUsage([setlistWith('Misa', [removed, removed, PAN])]);
    eq(usage.get('borrada')?.uses, 2, 'se cuenta en los datos');
    eq(getMostUsedSongs(SONGS, usage).map((entry) => entry.song.id), ['pan'], 'pero no se muestra');
  });

  it('empates en orden estable: usos, apertura reciente, título', () => {
    const usage = countSongUsage([setlistWith('Misa', [VEN, CONTIGO, RESUCITO, PAN])]);
    eq(getMostUsedSongs(SONGS, usage).map((entry) => entry.song.id), ['contigo', 'pan', 'resucito', 'ven'], 'por título');
    const opened = new Map([['ven', 500], ['resucito', 100]]);
    eq(getMostUsedSongs(SONGS, usage, opened).map((entry) => entry.song.id), ['ven', 'resucito', 'contigo', 'pan']);
    eq(getMostUsedSongs(SONGS, usage, opened), getMostUsedSongs(SONGS, usage, opened), 'mismo orden cada vez');
  });
});

describe('Tiempo relativo', () => {
  const NOW = new Date(2026, 8, 16, 18, 0).getTime();
  it('dice cuánto hace de forma natural', () => {
    eq(formatRelativeTime(NOW - 10_000, NOW), 'hace un momento');
    eq(formatRelativeTime(NOW - 5 * 60_000, NOW), 'hace 5 min');
    eq(formatRelativeTime(NOW - 3 * 3_600_000, NOW), 'hace 3 h');
    eq(formatRelativeTime(new Date(2026, 8, 15, 20, 0).getTime(), NOW), 'ayer');
    eq(formatRelativeTime(new Date(2026, 8, 13, 9, 0).getTime(), NOW), 'hace 3 días');
    eq(formatRelativeTime(NOW + 60_000, NOW), 'hace un momento', 'un reloj adelantado no da tiempos negativos');
  });
});
