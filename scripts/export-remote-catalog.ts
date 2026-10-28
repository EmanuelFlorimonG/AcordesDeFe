// Escribe un candidato a respaldo con lo que Supabase tiene publicado.
//
// Se construye con scripts/generate-catalog-import.config.ts y se ejecuta con
// Node, o con `npm run catalog:export`:
//   node .import-dist/export-remote-catalog.js
//
// Nunca toca src/data/mockSongs.ts. Escribe .catalog-export/mockSongs.ts, fuera
// de la ruta de compilación para que un candidato a medias no rompa el build de
// nadie, y ahí se queda: sustituir el respaldo es una decisión de una persona, que se
// toma mirando el diff, no un efecto secundario de ejecutar un script. Un
// exportador que pisa el archivo de verdad es un exportador que algún día lo
// pisa mal.
//
// Antes de escribir nada comprueba lo que llegó, y se niega si no cuadra: un
// remoto vacío, una canción del respaldo que ya no esté publicada, ids
// repetidos o filas que no pasen la validación del editor. Ante la duda, no
// escribe.
//
// Lee con la clave pública de .env.local, como un visitante. RLS no entrega
// las canciones ocultas, los borradores ni las propuestas pendientes, así que
// no hace falta filtrarlos: no llegan.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createSupabaseSongRepository } from '../src/catalog/supabaseSongRepository';
import { backupProblems, catalogDifferences, forBackup, forComparison, orderLikeBundled, serializeCatalog } from '../src/catalog/catalogBackup';
import { MOCK_SONGS } from '../src/data/mockSongs';
import { createSupabaseClient, readSupabaseConfig } from '../src/lib/supabase';

const DESTINO = '.catalog-export/mockSongs.ts';
const RESPALDO = 'src/data/mockSongs.ts';

/** Lee .env.local sin imprimir nada de lo que hay dentro. */
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.includes('=') && !line.trimStart().startsWith('#'))
    .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()])
);
const status = readSupabaseConfig(env);
if (status.state !== 'configured') {
  console.error(`Supabase no está configurado en .env.local (${status.state === 'invalid' ? status.reason : 'faltan datos'}).`);
  process.exit(2);
}

const remote = (await createSupabaseSongRepository(createSupabaseClient(status.config)).listSongs()).map(forComparison);
const bundled = MOCK_SONGS.map(forComparison);

console.log(`Supabase publicado: ${remote.length} canciones`);
console.log(`Respaldo incluido:  ${bundled.length} canciones`);

const problemas = backupProblems(remote, bundled);
if (problemas.length) {
  console.error('\nNo se exporta:');
  for (const problema of problemas) console.error(`  ${problema}`);
  process.exit(1);
}

const differences = catalogDifferences(remote, bundled);
if (differences.length === 0) {
  console.log('\nLos dos catálogos ya dicen lo mismo. No hay nada que exportar.');
  process.exit(0);
}

const ordenadas = orderLikeBundled(remote, bundled.map((song) => song.id));
if (ordenadas.length !== remote.length) {
  console.error(`\nEl orden perdió canciones: ${remote.length} llegaron y quedaron ${ordenadas.length}.`);
  process.exit(1);
}

// La version no se guarda en el respaldo: se compara con ella y se escribe sin ella.
const texto = serializeCatalog(ordenadas.map(forBackup));
// El mismo final de línea que el archivo al que sustituiría, o git marcaría
// cada línea como cambiada.
const crlf = readFileSync(RESPALDO, 'utf8').includes('\r\n');
mkdirSync(DESTINO.slice(0, DESTINO.lastIndexOf('/')), { recursive: true });
writeFileSync(DESTINO, crlf ? texto.replace(/\n/g, '\r\n') : texto, 'utf8');

const distintas = differences.filter((d) => d.kind === 'distinta');
const nuevas = differences.filter((d) => d.kind === 'solo-remota');
console.log(`\n${differences.length} diferencias: ${distintas.length} canciones cambiadas, ${nuevas.length} nuevas.`);
for (const d of distintas) console.log(`  ${d.id.padEnd(32)} ${d.version ? `v${d.version}` : '  '}  ${d.fields.join(', ')}`);
for (const d of nuevas) console.log(`  ${d.id.padEnd(32)} nueva`);

console.log(`\nEscrito ${DESTINO} con ${ordenadas.length} canciones.`);
console.log(`${RESPALDO} no se ha tocado. Para ver qué cambiaría:`);
console.log(`  git diff --no-index ${RESPALDO} ${DESTINO}`);
