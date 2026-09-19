import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Song } from '../src/types/song';
import { MOCK_SONGS } from '../src/data/mockSongs';
import { extractUniqueChords } from '../src/utils/chordParser';
import { LITURGICAL_SEASONS, LITURGICAL_SEASON_IDS } from '../src/data/liturgicalSeasons';
import {
  SEASON_FILTER_OPTIONS,
  filterSongsBySeason,
  getSongSeasons,
  isAllYearSong,
  isLiturgicalSeasonId,
  normalizeLiturgicalSeasons,
  songFitsSeason,
} from '../src/utils/liturgicalSeasons';

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`liturgicalSeasons.test: ${checks} comprobaciones`));

type SongLike = Pick<Song, 'id' | 'liturgicalSeasons'>;

const ADVIENTO_SONG: SongLike = { id: 'adviento', liturgicalSeasons: ['adviento'] };
const CUARESMA_SONG: SongLike = { id: 'cuaresma', liturgicalSeasons: ['cuaresma'] };
const NAVIDAD_ADVIENTO_SONG: SongLike = { id: 'adviento-navidad', liturgicalSeasons: ['navidad', 'adviento'] };
const ALL_YEAR_SONG: SongLike = { id: 'todo-el-ano', liturgicalSeasons: ['todo-el-ano'] };
const PASCUA_SONG: SongLike = { id: 'pascua', liturgicalSeasons: ['pascua'] };
/** A song saved before seasons existed: no property at all */
const OLD_SONG: SongLike = { id: 'antigua' };
const EMPTY_SONG: SongLike = { id: 'vacia', liturgicalSeasons: [] };

const LIBRARY = [ADVIENTO_SONG, CUARESMA_SONG, NAVIDAD_ADVIENTO_SONG, ALL_YEAR_SONG, PASCUA_SONG, OLD_SONG, EMPTY_SONG];
const ids = (songs: SongLike[]) => songs.map((song) => song.id);
const findSong = (id: string) => {
  const song = MOCK_SONGS.find((candidate) => candidate.id === id);
  assert.ok(song, `falta la canción ${id}`);
  return song;
};

describe('Tiempos litúrgicos: fuente de verdad', () => {
  it('define los seis tiempos y Todo el año, en el orden del año litúrgico', () => {
    eq(
      LITURGICAL_SEASONS.map((season) => season.label),
      ['Adviento', 'Navidad', 'Tiempo Ordinario', 'Cuaresma', 'Triduo Pascual', 'Pascua', 'Todo el año']
    );
    eq(LITURGICAL_SEASONS.map((season) => season.id), [...LITURGICAL_SEASON_IDS]);
    eq(LITURGICAL_SEASONS.map((season) => season.order), [1, 2, 3, 4, 5, 6, 7]);
  });

  it('usa los colores litúrgicos, con el Triduo como variable', () => {
    const colorOf = Object.fromEntries(LITURGICAL_SEASONS.map((season) => [season.id, season.color]));
    eq(colorOf, {
      adviento: 'violeta',
      navidad: 'blanco',
      'tiempo-ordinario': 'verde',
      cuaresma: 'violeta',
      'triduo-pascual': 'variable',
      pascua: 'blanco',
      'todo-el-ano': 'ninguno',
    });
  });

  it('los filtros son los seis tiempos: Todo el año no es un filtro', () => {
    eq(
      SEASON_FILTER_OPTIONS.map((season) => season.id),
      ['adviento', 'navidad', 'tiempo-ordinario', 'cuaresma', 'triduo-pascual', 'pascua']
    );
  });

  it('las categorías y temas no son tiempos litúrgicos', () => {
    for (const notASeason of ['María', 'Mariano', 'Adoración', 'Eucaristía', 'Espíritu Santo', 'Comunión']) {
      eq(isLiturgicalSeasonId(notASeason), false, notASeason);
      eq(normalizeLiturgicalSeasons([notASeason]), [], notASeason);
    }
  });
});

describe('Canciones con uno, varios o todos los tiempos', () => {
  it('canción con un tiempo', () => {
    eq(getSongSeasons(ADVIENTO_SONG), ['adviento']);
    eq(isAllYearSong(ADVIENTO_SONG), false);
  });

  it('canción con varios tiempos: sin repetir y en el orden del año', () => {
    eq(getSongSeasons(NAVIDAD_ADVIENTO_SONG), ['adviento', 'navidad']);
    eq(normalizeLiturgicalSeasons(['pascua', 'cuaresma', 'pascua', 'adviento']), ['adviento', 'cuaresma', 'pascua']);
  });

  it('Todo el año', () => {
    eq(getSongSeasons(ALL_YEAR_SONG), ['todo-el-ano']);
    eq(isAllYearSong(ALL_YEAR_SONG), true);
    eq(
      normalizeLiturgicalSeasons(['pascua', 'todo-el-ano', 'cuaresma']),
      ['todo-el-ano'],
      'Todo el año ya incluye cualquier tiempo, así que va solo'
    );
  });
});

describe('Filtro por tiempo litúrgico', () => {
  it('filtro por Adviento: las de Adviento y las de Todo el año', () => {
    eq(ids(filterSongsBySeason(LIBRARY, 'adviento')), ['adviento', 'adviento-navidad', 'todo-el-ano']);
  });

  it('filtro por Cuaresma: las de Cuaresma y las de Todo el año', () => {
    eq(ids(filterSongsBySeason(LIBRARY, 'cuaresma')), ['cuaresma', 'todo-el-ano']);
  });

  it('Todo el año aparece en cualquier filtro', () => {
    for (const season of SEASON_FILTER_OPTIONS) {
      eq(songFitsSeason(ALL_YEAR_SONG, season.id as Exclude<typeof season.id, 'todo-el-ano'>), true, season.label);
    }
  });

  it('sin filtro aparecen todas, también las no clasificadas', () => {
    eq(ids(filterSongsBySeason(LIBRARY, null)), ids(LIBRARY));
  });

  it('una canción sin clasificar no aparece bajo un tiempo concreto', () => {
    for (const season of SEASON_FILTER_OPTIONS) {
      const id = season.id as Exclude<typeof season.id, 'todo-el-ano'>;
      eq(songFitsSeason(OLD_SONG, id), false, season.label);
      eq(songFitsSeason(EMPTY_SONG, id), false, season.label);
    }
  });

  it('el filtro usa el id, no el nombre visible', () => {
    // A song stored with the visible name still filters by id once read.
    const byName: SongLike = { id: 'por-nombre', liturgicalSeasons: ['Tiempo Ordinario'] as never };
    eq(getSongSeasons(byName), ['tiempo-ordinario']);
    eq(songFitsSeason(byName, 'tiempo-ordinario'), true);
  });
});

describe('Datos inválidos y canciones antiguas', () => {
  it('descarta valores que no son tiempos', () => {
    eq(normalizeLiturgicalSeasons(['cuaresma', 'verano', '', 42, null, undefined, {}, ['pascua']]), ['cuaresma']);
    eq(normalizeLiturgicalSeasons('cuaresma'), [], 'un texto suelto no es una lista');
    eq(normalizeLiturgicalSeasons(null), []);
    eq(normalizeLiturgicalSeasons({ 0: 'pascua' }), []);
  });

  it('acepta el nombre visible con otras mayúsculas o sin tilde', () => {
    eq(normalizeLiturgicalSeasons(['CUARESMA', 'cuaresma', ' Cuaresma ']), ['cuaresma']);
    eq(normalizeLiturgicalSeasons(['tiempo ordinario', 'TODO EL AÑO']), ['todo-el-ano']);
    eq(normalizeLiturgicalSeasons(['Triduo  Pascual']), ['triduo-pascual']);
  });

  it('una canción antigua sin la propiedad sigue funcionando', () => {
    eq(getSongSeasons(OLD_SONG), []);
    eq(isAllYearSong(OLD_SONG), false);
    eq(getSongSeasons({ liturgicalSeasons: 'Adviento' as never }), []);
  });
});

describe('Las canciones del cancionero', () => {
  it('todos los tiempos guardados son válidos y ya están normalizados', () => {
    for (const song of MOCK_SONGS) {
      if (song.liturgicalSeasons === undefined) continue;
      eq(normalizeLiturgicalSeasons(song.liturgicalSeasons), song.liturgicalSeasons, song.id);
      eq(song.liturgicalSeasons.length > 0, true, `${song.id}: lista vacía en vez de omitir la propiedad`);
    }
  });

  it('91 clasificadas y 6 pendientes de revisar', () => {
    const unclassified = MOCK_SONGS.filter((song) => getSongSeasons(song).length === 0).map((song) => song.id);
    eq(MOCK_SONGS.length, 97);
    eq(unclassified.sort(), [
      'gloria-a-dios-en-el-cielo-pascua',
      'llegara-con-la-luz',
      'mi-amigo-claret',
      'que-alegria-cuando-me-dijeron',
      'salve-regina',
      'siempre-es-pentecostes',
    ]);
    eq(MOCK_SONGS.filter(isAllYearSong).length, 78);
  });

  it('ejemplos: Adviento, Pascua y Todo el año', () => {
    eq(getSongSeasons(findSong('ven-senor-no-tardes')), ['adviento']);
    eq(getSongSeasons(findSong('resucita-hoy')), ['pascua']);
    eq(getSongSeasons(findSong('nadie-te-ama-como-yo')), ['todo-el-ano']);
    eq(findSong('nadie-te-ama-como-yo').categories, ['Adoración', 'Comunión'], 'las categorías no cambian');
  });

  it('ningún Gloria aparece en Adviento ni en Cuaresma', () => {
    const glorias = MOCK_SONGS.filter((song) => song.categories.includes('Gloria') && getSongSeasons(song).length > 0);
    eq(glorias.length, 4);
    for (const song of glorias) {
      eq(songFitsSeason(song, 'adviento'), false, song.id);
      eq(songFitsSeason(song, 'cuaresma'), false, song.id);
      eq(songFitsSeason(song, 'navidad') && songFitsSeason(song, 'tiempo-ordinario') && songFitsSeason(song, 'pascua'), true, song.id);
    }
  });

  it('ningún canto con Aleluya aparece en Cuaresma', () => {
    const withAlleluia = MOCK_SONGS.filter((song) => /aleluya/i.test(song.content.replace(/\[[^\]]*\]/g, '')));
    eq(withAlleluia.length, 8);
    for (const song of withAlleluia) eq(songFitsSeason(song, 'cuaresma'), false, song.id);
  });

  it('el filtro de Cuaresma incluye las de Todo el año y ninguna solo de Pascua', () => {
    const lent = filterSongsBySeason(MOCK_SONGS, 'cuaresma');
    eq(lent.length, 78);
    eq(lent.some((song) => getSongSeasons(song).includes('pascua')), false);
  });
});

describe('Canciones de las hojas de agosto y septiembre', () => {
  const ADDED: Array<[id: string, key: string | undefined, capo: number | undefined, category: string]> = [
    ['gloria-a-nuestro-dios', 'C', undefined, 'Gloria'],
    ['queremos-escuchar-tu-voz', 'C', undefined, 'Aclamación'],
    ['santo-joel', undefined, undefined, 'Santo'],
    ['cordero-de-dios-nuevo', 'G', undefined, 'Cordero'],
    ['es-un-deleite', 'D', undefined, 'Comunión'],
    ['me-has-seducido', 'Am', undefined, 'Comunión'],
    ['presencia-real', 'Am', undefined, 'Adoración'],
    ['sopla-fuerte', 'G', undefined, 'Adoración'],
    ['que-bien-se-esta-aqui', 'A', 1, 'Adoración'],
    ['tu-el-unico-rey', 'C', undefined, 'Alabanza'],
    ['puedo-entrar', 'G', 1, 'Adoración'],
    ['bendito-sea-dios', 'C', undefined, 'Adoración'],
  ];

  it('las 12 canciones nuevas, con el tono y la cejilla de la hoja', () => {
    for (const [id, key, capo, category] of ADDED) {
      const song = findSong(id);
      eq(song.originalKey, key, `${id}: tono`);
      eq(song.recommendedCapo, capo, `${id}: cejilla`);
      eq(song.categories[0], category, `${id}: categoría`);
      eq(song.chordsUsed, extractUniqueChords(song.content), `${id}: los acordes declarados son los de la letra`);
      eq(getSongSeasons(song).length > 0, true, `${id}: clasificada`);
    }
  });

  it('los tonos indicados en las hojas para canciones que ya estaban', () => {
    const keys = Object.fromEntries(
      [
        'bendecire-al-senor',
        'piedad-don-martin',
        'atentos-a-escuchar',
        'te-ofrecemos-nuestra-juventud',
        'santo-lento',
        'pongo-en-tus-manos',
        'oh-cordero',
        'eucaristia-milagro-de-amor',
      ].map((id) => [id, findSong(id).originalKey])
    );
    eq(keys, {
      'bendecire-al-senor': 'C',
      'piedad-don-martin': 'C',
      'atentos-a-escuchar': 'D',
      'te-ofrecemos-nuestra-juventud': 'D',
      'santo-lento': 'Am',
      'pongo-en-tus-manos': 'C',
      'oh-cordero': 'C',
      'eucaristia-milagro-de-amor': 'C',
    });
  });

  it('los acordes declarados son los que aparecen en la letra, en todo el cancionero', () => {
    // The order is how they are listed; what matters is that they are the same chords.
    for (const song of MOCK_SONGS) {
      eq([...song.chordsUsed].sort(), [...extractUniqueChords(song.content)].sort(), song.id);
    }
  });

  it('no hay ids repetidos en el cancionero', () => {
    const ids = MOCK_SONGS.map((song) => song.id);
    eq(new Set(ids).size, ids.length);
  });
});
