import type { Song } from '../types/song';
import { auditCatalogRows } from './catalogImport';
import { songToDraft } from './songDraft';
import { validateSongDraft } from './validateSongDraft';

/**
 * El respaldo del cancionero: Supabase hacia `mockSongs.ts`.
 *
 * Supabase es la fuente de verdad de lo publicado. Ahí trabaja el ministerio,
 * ahí se revisan las propuestas y ahí vive el historial de versiones. El
 * archivo incluido es una instantánea para cuando no hay red, y como toda
 * copia, se queda atrás si nadie la renueva: cuando se escribió esto llevaba
 * veintiuna canciones de retraso, diecisiete de ellas con acordes que alguien
 * transcribió a mano y que el respaldo no tenía.
 *
 * Aquí viven las partes que no tocan la red ni el disco, para poder probarlas
 * sin ninguna de las dos. Lo que sí las toca son los dos scripts de
 * `scripts/`: uno informa y el otro escribe un archivo candidato aparte.
 *
 * Nada de esto lee `song_versions`. No es una limitación que se acepta a
 * regañadientes: la clave pública no puede leer esa tabla, ni las propuestas
 * pendientes, ni las canciones sin publicar. Significa que «no exportar lo
 * oculto» no depende de que alguien escriba bien un filtro, sino de que RLS no
 * entrega esas filas. Y que el exportador no necesita ningún secreto.
 */

/** El orden en que el archivo escribe los campos; `content` siempre al final. */
export const CATALOG_FIELD_ORDER = [
  'id',
  'title',
  'artist',
  'youtubeId',
  'originalKey',
  'recommendedCapo',
  'timeSignature',
  'tempo',
  'categories',
  'liturgicalSeasons',
  'tags',
  'chordsUsed',
  'difficulty',
  'year',
  'content',
] as const satisfies ReadonlyArray<keyof Song>;

/** Campos que el archivo escribe siempre, aunque vengan vacíos. */
const SIEMPRE = new Set<keyof Song>(['id', 'title', 'categories', 'liturgicalSeasons', 'tags', 'chordsUsed', 'content']);

const texto = (valor: string) => `'${valor.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const lista = (valores: readonly string[]) => (valores.length ? `[${valores.map(texto).join(', ')}]` : '[]');
/** La letra va en plantilla, con sus saltos de línea tal cual. */
const letra = (valor: string) => `\`${valor.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')}\``;

function valorDe(song: Song, campo: keyof Song): string | null {
  const valor = song[campo];
  if (valor === undefined || valor === null) return null;
  if (campo === 'content') return letra(valor as string);
  if (Array.isArray(valor)) return lista(valor as string[]);
  if (typeof valor === 'number') return String(valor);
  return texto(String(valor));
}

/** Una canción como la escribe el archivo, sin la coma que la separa de la siguiente. */
export function serializeSong(song: Song): string {
  const lineas: string[] = [];
  for (const campo of CATALOG_FIELD_ORDER) {
    const valor = valorDe(song, campo);
    if (valor === null && !SIEMPRE.has(campo)) continue;
    lineas.push(`    ${campo}: ${valor ?? (campo === 'content' ? '``' : "''")}`);
  }
  return `  {\n${lineas.join(',\n')}\n  }`;
}

/**
 * El archivo entero. Determinista: las mismas canciones en el mismo orden dan
 * exactamente los mismos bytes, porque nada aquí depende del reloj, del azar
 * ni del orden en que un objeto enumera sus claves.
 */
export function serializeCatalog(songs: readonly Song[]): string {
  return `import type { Song } from '../types/song';\n\nexport const MOCK_SONGS: Song[] = [\n${songs
    .map(serializeSong)
    .join(',\n')}\n];\n`;
}

/**
 * Las canciones del remoto en el orden que ya tiene el archivo, y las nuevas
 * al final en el orden estable en que llegaron. Reordenar el cancionero
 * entero convertiría cualquier exportación en un diff ilegible.
 */
export function orderLikeBundled(remote: readonly Song[], bundledIds: readonly string[]): Song[] {
  const porId = new Map(remote.map((song) => [song.id, song]));
  const conocidas = bundledIds.map((id) => porId.get(id)).filter((song): song is Song => Boolean(song));
  const vistas = new Set(conocidas.map((song) => song.id));
  return [...conocidas, ...remote.filter((song) => !vistas.has(song.id))];
}

/** Un campo que no dice lo mismo en los dos sitios. */
export interface CatalogDifference {
  id: string;
  /** Ausente en el remoto, ausente en el incluido, o distinta en algún campo. */
  kind: 'solo-remota' | 'solo-incluida' | 'distinta';
  fields: string[];
  /** La versión publicada, cuando la hay: explica por qué difiere. */
  version?: number;
}

const COMPARABLES = CATALOG_FIELD_ORDER.filter((campo) => campo !== 'id');

/** Qué dice cada catálogo, campo por campo. El orden del resultado es el del archivo. */
export function catalogDifferences(remote: readonly Song[], bundled: readonly Song[]): CatalogDifference[] {
  const enRemoto = new Map(remote.map((song) => [song.id, song]));
  const enIncluido = new Map(bundled.map((song) => [song.id, song]));
  const diferencias: CatalogDifference[] = [];

  for (const song of bundled) {
    const suya = enRemoto.get(song.id);
    if (!suya) {
      diferencias.push({ id: song.id, kind: 'solo-incluida', fields: [] });
      continue;
    }
    const fields = COMPARABLES.filter((campo) => {
      const aqui = song[campo];
      const alli = suya[campo];
      if (Array.isArray(aqui) || Array.isArray(alli)) {
        return JSON.stringify(aqui ?? []) !== JSON.stringify(alli ?? []);
      }
      return (aqui ?? null) !== (alli ?? null);
    });
    if (fields.length) diferencias.push({ id: song.id, kind: 'distinta', fields, version: suya.version });
  }

  for (const song of remote) {
    if (!enIncluido.has(song.id)) {
      diferencias.push({ id: song.id, kind: 'solo-remota', fields: [], version: song.version });
    }
  }

  return diferencias;
}

/**
 * Por qué no se puede exportar. Vacío significa que se puede.
 *
 * La que más importa es la primera: una canción que está en el archivo y no
 * en el remoto. Sólo puede significar dos cosas —que alguien la ocultó en
 * producción, o que se añadió en local sin publicarla— y ninguna se arregla
 * borrándola del respaldo. Ante la duda, no se exporta.
 */
export function backupProblems(remote: readonly Song[], bundled: readonly Song[]): string[] {
  const problemas: string[] = [];

  if (remote.length === 0) {
    problemas.push('El remoto no devolvió ninguna canción: no se exporta un catálogo vacío.');
    return problemas;
  }

  const enRemoto = new Set(remote.map((song) => song.id));
  const perdidas = bundled.filter((song) => !enRemoto.has(song.id)).map((song) => song.id);
  if (perdidas.length) {
    problemas.push(
      `Estas canciones están en el respaldo y no en el remoto publicado: ${perdidas.join(', ')}. ` +
        'Puede que se ocultaran en producción o que nunca se publicaran; exportar las borraría.'
    );
  }

  const auditoria = auditCatalogRows(remote);
  if (auditoria.duplicateIds.length) {
    problemas.push(`El remoto trae ids repetidos: ${auditoria.duplicateIds.join(', ')}.`);
  }

  const invalidas = remote
    .map((song) => ({ id: song.id, resultado: validateSongDraft(songToDraft(song)) }))
    .filter((entrada) => !entrada.resultado.ok);
  if (invalidas.length) {
    problemas.push(
      `Estas canciones del remoto no pasan la validación del editor: ${invalidas
        .map((entrada) => entrada.id)
        .join(', ')}.`
    );
  }

  return problemas;
}

/**
 * La canción con las cadenas vacías convertidas en campos ausentes.
 *
 * La base guarda `''` como nulo y lo devuelve ausente, así que los dos
 * catálogos dirían lo mismo escrito distinto. Sin esto, el informe
 * inventaría diferencias y el archivo bailaría entre exportaciones.
 *
 * Conserva `version`, que el informe usa para explicar por qué una canción
 * difiere: una en versión 3 no está «mal», está más adelantada.
 */
export function forComparison(song: Song): Song {
  const copia: Song = { ...song };
  for (const campo of ['artist', 'originalKey', 'timeSignature', 'rhythmPattern', 'year', 'youtubeId'] as const) {
    if (copia[campo] === '') delete copia[campo];
  }
  return copia;
}

/**
 * La canción tal como la guarda el respaldo.
 *
 * `songFromRow` rellena `version` desde `current_version`, pero el archivo
 * incluido no lo lleva en ninguna de sus canciones: se leen con
 * `songVersionOf()`, que da 1 cuando falta. Guardarlo añadiría un campo nuevo
 * a cada canción y un número que caduca en cuanto alguien edita en
 * producción, sin que el respaldo sirva para nada distinto.
 */
export function forBackup(song: Song): Song {
  const copia = forComparison(song);
  delete copia.version;
  return copia;
}
