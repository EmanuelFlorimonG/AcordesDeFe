// Reads the catalog back from Supabase as a visitor (public key, the app's own
// repository) and compares it with the bundled songs. Read-only.
// Built with scripts/generate-catalog-import.config.ts (second entry), run with Node:
//   node .import-dist/verify-remote-catalog.js
import { readFileSync } from 'node:fs';
import { deepStrictEqual } from 'node:assert';
import { createSupabaseSongRepository } from '../src/catalog/supabaseSongRepository';
import { MOCK_SONGS } from '../src/data/mockSongs';
import { createSupabaseClient, readSupabaseConfig } from '../src/lib/supabase';
import type { Song } from '../src/types/song';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.includes('='))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()])
);
const status = readSupabaseConfig(env);
if (status.state !== 'configured') throw new Error('Supabase no está configurado en .env.local');

const remote = await createSupabaseSongRepository(createSupabaseClient(status.config)).listSongs();
const byId = new Map(remote.map((song) => [song.id, song]));
const bundledIds = MOCK_SONGS.map((song) => song.id);

const results: Array<[string, boolean, string]> = [];
const check = (name: string, ok: boolean, detail = '') => results.push([name, ok, detail]);

check('97 canciones leídas como visitante', remote.length === 97, String(remote.length));
check('los ids son exactamente los del catálogo incluido', JSON.stringify([...byId.keys()].sort()) === JSON.stringify([...bundledIds].sort()));

let identical = 0;
const differences: string[] = [];
for (const song of MOCK_SONGS) {
  // The only planned difference: youtubeId "" ("no video") is stored as null and comes back absent.
  const expected: Song = { ...song };
  if (expected.youtubeId === '') delete expected.youtubeId;
  try {
    deepStrictEqual(byId.get(song.id), expected);
    identical++;
  } catch {
    differences.push(song.id);
  }
}
check('cada canción se lee idéntica a la incluida (lossless)', identical === 97, differences.length ? differences.join(', ') : `${identical}/97`);
const alfarero = byId.get('alfarero');
check('alfarero: youtubeId vacío llega como ausente (null en la base)', Boolean(alfarero) && !('youtubeId' in (alfarero as Song)));

for (const [name, ok, detail] of results) console.log(`${ok ? 'OK   ' : 'FALLA'} ${name}${detail ? `  [${detail}]` : ''}`);
console.log(`\n${results.filter(([, ok]) => ok).length}/${results.length} comprobaciones correctas`);
