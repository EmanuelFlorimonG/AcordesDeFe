// Writes the SQL that imports the bundled catalog into Supabase (and its dry run).
// Built and run with scripts/generate-catalog-import.config.ts:
//   npx vite build --config scripts/generate-catalog-import.config.ts && node .import-dist/generate-catalog-import.js
//
// A project that already holds part of the catalog takes only what it is
// missing, because the import refuses ids that are taken:
//   node .import-dist/generate-catalog-import.js --only=himno-a-claret,el-padre-claret --out=import_claretian_songs
import { mkdirSync, writeFileSync } from 'node:fs';
import { MOCK_SONGS } from '../src/data/mockSongs';
import { auditCatalogRows, buildCatalogImportSql } from '../src/catalog/catalogImport';

const flag = (name: string) => process.argv.find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1);
const only = (flag('--only') ?? '').split(',').filter(Boolean);
const name = flag('--out') ?? 'import_bundled_catalog';
if (!/^[a-z0-9_]+$/.test(name)) {
  console.error(`--out=${name}: solo letras minúsculas, números y guiones bajos.`);
  process.exit(1);
}

const songs = only.length ? MOCK_SONGS.filter((song) => only.includes(song.id)) : MOCK_SONGS;
const missing = only.filter((id) => !MOCK_SONGS.some((song) => song.id === id));
if (missing.length) {
  console.error(`Estas canciones no están en el cancionero incluido: ${missing.join(', ')}`);
  process.exit(1);
}

const audit = auditCatalogRows(songs);
console.log(`Canciones: ${audit.total} · ids repetidos: ${audit.duplicateIds.length} · filas que no cumplen el esquema: ${audit.invalidRows.length}`);
if (audit.duplicateIds.length || audit.invalidRows.length) {
  console.error(JSON.stringify(audit, null, 2));
  process.exit(1);
}

mkdirSync('supabase/scripts', { recursive: true });
const source = only.length ? `src/data/mockSongs.ts (${songs.length} canciones: ${songs.map((song) => song.id).join(', ')})` : 'src/data/mockSongs.ts';
writeFileSync(`supabase/scripts/${name}.dry-run.sql`, buildCatalogImportSql(songs, { dryRun: true, source }));
writeFileSync(`supabase/scripts/${name}.sql`, buildCatalogImportSql(songs, { dryRun: false, source }));
console.log(`Escritos supabase/scripts/${name}.sql y .dry-run.sql`);
