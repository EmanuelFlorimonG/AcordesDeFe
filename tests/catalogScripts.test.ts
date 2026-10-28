import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { MOCK_SONGS } from '../src/data/mockSongs';
import { songToRow } from '../src/catalog/supabaseSongRepository';

/**
 * Los scripts de importación tienen que decir lo que dice el cancionero.
 *
 * Un script de `supabase/scripts/` lleva las canciones dentro, copiadas del
 * catálogo empaquetado en el momento de generarlo. Eso significa que puede
 * quedarse atrás sin que nada se entere: basta editar una canción y no
 * regenerar, o regenerar ejecutando un paquete compilado antes de la
 * edición. El archivo cambia de fecha y parece al día, y lleva los datos
 * viejos.
 *
 * No es hipotético. «Nadie que no seas tú» se publicó en Supabase con un
 * acorde en mitad de una palabra porque su script se generó así, y ninguna
 * prueba lo vio: `catalogImport.test.ts` comprueba el SQL que construye en
 * memoria, nunca los archivos del disco.
 *
 * Esta prueba los lee del disco y comprueba que cada fila es exactamente la
 * que `songToRow` produce hoy para esa canción.
 *
 * Los scripts históricos quedan fuera, y cada uno dice por qué. No es una
 * excepción cómoda: son archivos que registran lo que se importó entonces,
 * y el cancionero cambió después por una migración. Reescribirlos borraría
 * ese registro. Un script nuevo nace vigente, y si algún día una migración
 * reclasifica sus canciones, se añade aquí con su motivo.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`catalogScripts.test: ${checks} comprobaciones`));

/** Scripts que guardan historia, no el catálogo de hoy. */
const HISTORICOS: Record<string, string> = {
  import_bundled_catalog:
    'El seed de las 110: cinco de sus canciones ya no están empaquetadas y la clasificación litúrgica cambió después.',
  import_claretian_songs:
    'Las trece claretianas se importaron antes de que la migración de clasificación les cambiara las categorías.',
};

/** El nombre sin «.sql» ni «.dry-run». */
const familiaDe = (archivo: string) => archivo.replace(/\.(dry-run\.)?sql$/, '');

const SCRIPTS = readdirSync('supabase/scripts')
  .filter((archivo) => archivo.startsWith('import_') && archivo.endsWith('.sql'))
  .sort();

/** Las filas que un script lleva dentro, tal como las leerá Postgres. */
const filasDe = (archivo: string): Array<Record<string, unknown>> => {
  const sql = readFileSync(`supabase/scripts/${archivo}`, 'utf8').replace(/\r\n/g, '\n');
  const desde = sql.indexOf('$rows$');
  const hasta = sql.lastIndexOf('$rows$');
  assert.ok(desde > 0 && hasta > desde, `${archivo}: no encontré el bloque de filas`);
  return JSON.parse(sql.slice(desde + 6, hasta));
};

const porId = new Map(MOCK_SONGS.map((song) => [song.id, song]));

describe('Los scripts de importación no se quedan atrás del cancionero', () => {
  it('hay scripts que comprobar, y cada histórico declara su motivo', () => {
    eq(SCRIPTS.length > 0, true);
    for (const nombre of Object.keys(HISTORICOS)) {
      eq(
        SCRIPTS.some((archivo) => familiaDe(archivo) === nombre),
        true,
        `${nombre} está en la lista de históricos pero no existe: sobra la excepción`
      );
      eq(HISTORICOS[nombre].length > 20, true, `${nombre}: el motivo tiene que explicarse`);
    }
  });

  for (const archivo of SCRIPTS) {
    const historico = HISTORICOS[familiaDe(archivo)];

    it(`${archivo}${historico ? ' (histórico: solo se comprueba su forma)' : ''}`, () => {
      const filas = filasDe(archivo);
      eq(filas.length > 0, true, 'alguna fila lleva');

      // Lo que vale para todos, histórico o no: el número que el script
      // comprueba al ejecutarse tiene que ser el de filas que lleva.
      const sql = readFileSync(`supabase/scripts/${archivo}`, 'utf8');
      eq(
        sql.includes(`v_expected constant integer := ${filas.length}`),
        true,
        `v_expected no coincide con las ${filas.length} filas`
      );

      if (historico) return;

      for (const fila of filas) {
        const song = porId.get(fila.id as string);
        assert.ok(song, `${fila.id}: el script la importa y ya no está en el cancionero`);
        checks++;
        assert.deepEqual(fila, JSON.parse(JSON.stringify(songToRow(song))), `${fila.id}: el script no dice lo que dice el cancionero`);
        checks++;
      }
    });
  }

  it('cada script y su ensayo llevan exactamente las mismas filas', () => {
    // El otro modo de quedarse atrás: regenerar uno de los dos y el otro no.
    for (const archivo of SCRIPTS.filter((a) => !a.endsWith('.dry-run.sql'))) {
      const ensayo = archivo.replace(/\.sql$/, '.dry-run.sql');
      eq(SCRIPTS.includes(ensayo), true, `${archivo} no tiene ensayo`);
      assert.deepEqual(filasDe(ensayo), filasDe(archivo), `${ensayo} y ${archivo} no dicen lo mismo`);
      checks++;
    }
  });
});
