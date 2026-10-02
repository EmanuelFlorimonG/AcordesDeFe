import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MOCK_SONGS } from '../src/data/mockSongs';
import { CATEGORY_STYLE } from '../src/utils/categoryStyle';
import { MASS_MOMENTS } from '../src/utils/setlists';
import { getSongSeasons } from '../src/utils/liturgicalSeasons';

/**
 * El cancionero después de la revisión del ministerio.
 *
 * Se revisó canción por canción: cuatro se van, el tiempo litúrgico deja de
 * ser un adorno, y las categorías pasan a llamarse como se llaman de verdad.
 * Lo que se vigila aquí es que las dos copias digan lo mismo —la de la nube y
 * la que viaja en la aplicación— y que no se haya colado ninguna categoría
 * retirada por una pantalla olvidada.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`songbookClassification.test: ${checks} comprobaciones`));

const porId = new Map(MOCK_SONGS.map((song) => [song.id, song]));
const categorias = new Set(MOCK_SONGS.flatMap((song) => song.categories));
const MIGRACION = readFileSync('supabase/migrations/20261001120000_songbook_classification.sql', 'utf8').replace(/\r\n/g, '\n');

/** Las cuatro que el ministerio retiró. La última, por estar repetida. */
const RETIRADAS = ['estamos-de-fiesta-con-jesus', 'pescador-de-hombres', 'alfarero', 'te-presentamos-el-vino-y-el-pan-ii'];

describe('El cancionero tiene 105 canciones', () => {
  it('ni una más, ni repetida', () => {
    eq(MOCK_SONGS.length, 105);
    eq(new Set(MOCK_SONGS.map((song) => song.id)).size, 105, 'sin ids repetidos');
  });

  it('las cuatro retiradas ya no están', () => {
    for (const id of RETIRADAS) eq(porId.has(id), false, id);
  });

  it('y la migración retira exactamente esas cuatro, ocultándolas', () => {
    // No se borran: 'song_versions' las referencia con 'on delete restrict' y
    // un trigger protege ese historial de cualquier borrado. Esta base de
    // datos ya dijo cómo se retira una canción, y es ocultándola.
    const ocultadas = [...MIGRACION.matchAll(/update public\.songs set status = 'hidden' where id = '([^']+)'/g)].map(
      (m) => m[1]
    );
    eq(ocultadas.sort(), [...RETIRADAS].sort());
    eq(MIGRACION.includes('delete from public.songs'), false, 'ni un borrado');
    eq(MIGRACION.includes('disable trigger'), false, 'ni una guarda desactivada');
    eq(MIGRACION.includes('on delete cascade'), false, 'ni una clave ajena debilitada');
  });

  it('la migración sólo clasifica canciones que siguen en el cancionero', () => {
    // Las cuatro bajas también son un update, pero de 'status': ésas sí tocan
    // canciones que ya no están en el cancionero, que es justo el punto.
    const clasificadas = [...MIGRACION.matchAll(/update public\.songs set ((?:title|categories|liturgical_seasons)[^;]+) where id = '([^']+)'/g)].map(
      (m) => m[2]
    );
    eq(clasificadas.length > 0, true);
    eq(clasificadas.filter((id) => !porId.has(id) && id !== 'forajidos-hakuna'), [], 'la clasificación histórica sólo incluye la baja posterior de Forajidos');
    eq(RETIRADAS.filter((id) => clasificadas.includes(id)), [], 'y a las retiradas no se les toca la clasificación');
  });

  it('y comprueba al final todo lo que tenía que pasar', () => {
    eq(MIGRACION.includes('if cuantas <> 106 then'), true, '106 en el cancionero');
    eq(MIGRACION.includes("where status = 'published' and id in ("), true, 'ninguna de las cuatro sigue');
    eq(MIGRACION.includes("where status = 'hidden' and id in ("), true, 'y las cuatro están ocultas');
    eq(MIGRACION.includes('Hay % versiones sin su canción'), true, 'sin referencias huérfanas');
    eq(MIGRACION.includes('Hay % propuestas apuntando a una canción que no existe'), true);
    eq(MIGRACION.includes("array['Paz', 'Jornadas', 'María', 'Otros']::text[]"), true, 'ninguna categoría retirada');
    eq(MIGRACION.includes('Quedan % canciones sin tiempo litúrgico'), true);
    // Transaccional, y se puede repetir si un intento se quedó a medias.
    eq(/^begin;$/m.test(MIGRACION), true);
    eq(MIGRACION.trimEnd().endsWith('commit;'), true);
  });

  it('nada de lo que mira el cancionero cuenta las ocultas', () => {
    // Las comprobaciones hablan del cancionero, no de la tabla: una canción
    // oculta sigue en 'songs' con su historial, y no sale por ningún lado.
    const cuentas = [...MIGRACION.matchAll(/select count\(\*\) into (?:cuantas|sobran) from public\.songs[^;]*/g)].map(
      (m) => m[0]
    );
    eq(cuentas.length > 0, true);
    for (const cuenta of cuentas) eq(cuenta.includes("status = "), true, cuenta.replace(/\s+/g, ' ').slice(0, 80));
  });
});

describe('Las categorías dicen lo que son', () => {
  it('«Paz» y «Jornadas» ya no clasifican nada', () => {
    for (const retirada of ['Paz', 'Jornadas']) eq(categorias.has(retirada), false, retirada);
    for (const retirada of ['Paz', 'Jornadas']) eq(retirada in CATEGORY_STYLE, false, `${retirada} en los estilos`);
  });

  it('quitar una categoría no quita ninguna canción', () => {
    // Las dos que eran «Paz» siguen en el cancionero, sin categoría, hasta que
    // el ministerio decida dónde van. Preferimos eso a inventarles un sitio.
    for (const id of ['la-paz-te-doy', 'no-hay-un-saludo-mas-lindo']) {
      eq(porId.has(id), true, id);
      eq(porId.get(id)?.categories, [], id);
    }
  });

  it('«María» se llama «Marianas», y es una sola categoría', () => {
    eq(categorias.has('María'), false);
    eq(categorias.has('Marianas'), true);
    eq('Marianas' in CATEGORY_STYLE, true);
    eq('María' in CATEGORY_STYLE, false);
    eq(MOCK_SONGS.filter((song) => song.categories.includes('Marianas')).length, 5);
  });

  it('el repertorio de la casa se llama «Claretiana», y no se duplica con «Otros»', () => {
    eq(categorias.has('Claretiana'), true);
    eq(categorias.has('Otros'), false, 'ninguna canción sigue en «Otros»');
    const claretianas = MOCK_SONGS.filter((song) => song.categories.includes('Claretiana'));
    eq(claretianas.length, 16);
    eq(claretianas.some((song) => song.id === 'mi-amigo-claret'), true);
    eq(claretianas.some((song) => song.id === 'claret-cristiano-de-fuego'), true);
    eq('Claretiana' in CATEGORY_STYLE, true, 'con su icono y su color');
  });

  it('«PostComunión» existe y va entre la Comunión y la Salida', () => {
    eq(categorias.has('PostComunión'), true);
    eq('PostComunión' in CATEGORY_STYLE, true);
    const orden = MASS_MOMENTS.indexOf('PostComunión');
    eq(MASS_MOMENTS.indexOf('Comunión') < orden && orden < MASS_MOMENTS.indexOf('Salida'), true, MASS_MOMENTS.join(' · '));
    // Se canta después de comulgar, así que deja de ser Comunión.
    eq(porId.get('puedo-entrar')?.categories, ['Adoración', 'PostComunión']);
  });

  it('María, Tú que Velas también se canta a la salida', () => {
    eq(porId.get('maria-tu-que-velas-junto-a-mi')?.categories, ['Marianas', 'Salida']);
  });

  it('todas las categorías que se usan tienen su presentación', () => {
    for (const categoria of [...categorias].sort()) eq(categoria in CATEGORY_STYLE, true, categoria);
  });
});

describe('El tiempo litúrgico vive en su campo', () => {
  it('el Gloria de Pascua pierde el paréntesis del título', () => {
    const gloria = porId.get('gloria-a-dios-en-el-cielo-pascua');
    eq(gloria?.title, 'Gloria a Dios en el Cielo', 'el id no cambia: lo que apunte a él sigue apuntando');
    eq(getSongSeasons(gloria!), ['pascua'], 'el tiempo, en su sitio');
    eq(MIGRACION.includes("title = 'Gloria a Dios en el Cielo'"), true);
  });

  it('ninguna canción lleva el tiempo escrito en el nombre', () => {
    for (const song of MOCK_SONGS) {
      eq(/\((Pascua|Adviento|Cuaresma|Navidad)\)/i.test(song.title), false, song.title);
    }
  });

  it('ya hay canciones de Cuaresma, que antes no había ninguna', () => {
    const cuaresma = MOCK_SONGS.filter((song) => getSongSeasons(song).includes('cuaresma'));
    eq(cuaresma.length, 23);
    eq(cuaresma.some((song) => song.id === 'llevame-a-la-cruz'), true);
  });

  it('y «todo el año» deja de ser el cajón de lo no revisado', () => {
    const todoElAno = MOCK_SONGS.filter((song) => getSongSeasons(song).includes('todo-el-ano'));
    eq(todoElAno.length, 41, 'antes eran 78 de 110');
  });

  it('ejemplos de lo que decidió el ministerio', () => {
    eq(getSongSeasons(porId.get('ven-senor-no-tardes')!), ['adviento', 'cuaresma'], 'se canta esperando');
    eq(getSongSeasons(porId.get('hoy-perdoname')!), ['cuaresma']);
    eq(getSongSeasons(porId.get('yo-soy-el-pan-de-vida')!), ['pascua']);
    eq(getSongSeasons(porId.get('su-palabra-es-la-verdad')!), ['navidad', 'tiempo-ordinario', 'pascua'], 'ni Adviento ni Cuaresma');
    eq(getSongSeasons(porId.get('te-presentamos-el-vino-y-el-pan')!), ['adviento', 'navidad', 'tiempo-ordinario', 'pascua']);
    eq(getSongSeasons(porId.get('piedad-don-martin')!), ['adviento', 'navidad', 'tiempo-ordinario', 'cuaresma', 'pascua'], 'cualquier tiempo');
  });

  it('los cinco Glorias se callan en Adviento y en Cuaresma', () => {
    const glorias = MOCK_SONGS.filter((song) => song.categories.includes('Gloria'));
    eq(glorias.length, 5);
    for (const gloria of glorias) {
      const tiempos = getSongSeasons(gloria);
      eq(tiempos.includes('adviento'), false, gloria.id);
      eq(tiempos.includes('cuaresma'), false, gloria.id);
    }
  });

  it('ninguna se queda sin tiempo', () => {
    const sinTiempo = MOCK_SONGS.filter((song) => getSongSeasons(song).length === 0).map((song) => song.id);
    eq(sinTiempo, []);
    // Y la migración no deja pasar que vuelva a haberlas.
    eq(MIGRACION.includes('Quedan % canciones sin tiempo litúrgico'), true);
    eq(MIGRACION.includes("and id <> 'salve-regina'"), false, 'sin excepciones');
  });
});

describe('Retirada posterior de Forajidos', () => {
  it('no está empaquetada; el seed histórico conserva la identidad hasta su ocultación', () => {
    eq(porId.has('forajidos-hakuna'), false);
    for (const path of ['supabase/scripts/import_bundled_catalog.sql', 'supabase/scripts/import_bundled_catalog.dry-run.sql']) {
      const sql = readFileSync(path, 'utf8');
      const rows = JSON.parse(sql.slice(sql.indexOf('$rows$') + 6, sql.lastIndexOf('$rows$'))) as { id: string; title: string; artist: string }[];
      eq(rows.filter((row) => row.id === 'forajidos-hakuna').map(({ id, title, artist }) => ({ id, title, artist })), [{ id: 'forajidos-hakuna', title: 'Forajidos', artist: 'Hakuna Group Music' }], path);
      eq(rows.length, 110, 'seed histórico: cuatro bajas anteriores y Forajidos se ocultan después');
      eq(sql.includes('v_expected constant integer := 110'), true);
    }
  });

  it('la nueva migración sólo oculta su fila sin tocar historial ni clasificación', () => {
    const sql = readFileSync('supabase/migrations/20261002120000_hide_forajidos.sql', 'utf8');
    const statements = sql.replace(/--[^\n]*/g, '');
    eq([...statements.matchAll(/update public\.songs set status = 'hidden' where id = '([^']+)'/g)].map((m) => m[1]), ['forajidos-hakuna']);
    eq(/\b(delete|truncate|drop|alter|insert)\b/i.test(statements), false);
    eq(/\b(categories|liturgical_seasons|song_versions)\b/i.test(statements), false);
    eq(statements.includes("id = 'forajidos-hakuna' and status = 'hidden'"), true);
    eq(/^begin;$/m.test(sql), true);
    eq(sql.trimEnd().endsWith('commit;'), true);
  });
});
