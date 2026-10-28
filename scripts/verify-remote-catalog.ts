// Compara el catálogo publicado de Supabase con el respaldo incluido y dice
// qué cambió. Sólo lee: no escribe ningún archivo y no toca la base.
//
// Se construye con scripts/generate-catalog-import.config.ts y se ejecuta con
// Node, o con `npm run catalog:report`:
//   node .import-dist/verify-remote-catalog.js
//
// Lee como un visitante cualquiera, con la clave pública de .env.local. Eso no
// es una limitación: RLS sólo entrega las canciones publicadas, así que las
// ocultas, los borradores y las propuestas pendientes quedan fuera porque la
// base no los da, no porque este script los filtre.
//
// Sale con código distinto de cero cuando hay deriva, para que sirva igual a
// mano que encadenado a otra cosa.
import { readFileSync } from 'node:fs';
import { createSupabaseSongRepository } from '../src/catalog/supabaseSongRepository';
import { catalogDifferences, forComparison } from '../src/catalog/catalogBackup';
import { MOCK_SONGS } from '../src/data/mockSongs';
import { createSupabaseClient, readSupabaseConfig } from '../src/lib/supabase';

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
const differences = catalogDifferences(remote, bundled);

console.log(`Supabase publicado: ${remote.length} canciones`);
console.log(`Respaldo incluido:  ${bundled.length} canciones`);
console.log('');

if (differences.length === 0) {
  console.log('Los dos catálogos dicen exactamente lo mismo.');
  process.exit(0);
}

const soloRemota = differences.filter((d) => d.kind === 'solo-remota');
const soloIncluida = differences.filter((d) => d.kind === 'solo-incluida');
const distintas = differences.filter((d) => d.kind === 'distinta');

if (soloIncluida.length) {
  console.log(`En el respaldo y no en el remoto publicado (${soloIncluida.length}):`);
  for (const d of soloIncluida) console.log(`  ${d.id}`);
  console.log('  Pueden estar ocultas en producción o no haberse publicado nunca.');
  console.log('  Mientras estén así, la exportación se detiene: borrarlas del respaldo sería perderlas.');
  console.log('');
}

if (soloRemota.length) {
  console.log(`Publicadas y ausentes del respaldo (${soloRemota.length}):`);
  for (const d of soloRemota) console.log(`  ${d.id}${d.version ? `  (v${d.version})` : ''}`);
  console.log('');
}

if (distintas.length) {
  console.log(`Dicen cosas distintas (${distintas.length}):`);
  for (const d of distintas) {
    console.log(`  ${d.id.padEnd(32)} ${d.version ? `v${d.version}` : '  '}  ${d.fields.join(', ')}`);
  }
  console.log('');
  const conVersion = distintas.filter((d) => (d.version ?? 1) > 1).length;
  if (conVersion) {
    console.log(`  ${conVersion} de ellas están en versión 2 o posterior: son ediciones aprobadas en producción`);
    console.log('  que nunca volvieron al respaldo. El remoto manda.');
    console.log('');
  }
}

console.log(`${differences.length} diferencias. El respaldo está desactualizado.`);
process.exit(1);
