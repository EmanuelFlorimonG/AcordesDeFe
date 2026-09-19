// Writes the SQL that imports the bundled catalog into Supabase (and its dry run).
// Built and run with scripts/generate-catalog-import.config.ts:
//   npx vite build --config scripts/generate-catalog-import.config.ts && node .import-dist/generate-catalog-import.js
import { mkdirSync, writeFileSync } from 'node:fs';
import { MOCK_SONGS } from '../src/data/mockSongs';
import { auditCatalogRows, buildCatalogImportSql } from '../src/catalog/catalogImport';

const audit = auditCatalogRows(MOCK_SONGS);
console.log(`Canciones: ${audit.total} · ids repetidos: ${audit.duplicateIds.length} · filas que no cumplen el esquema: ${audit.invalidRows.length}`);
if (audit.duplicateIds.length || audit.invalidRows.length) {
  console.error(JSON.stringify(audit, null, 2));
  process.exit(1);
}

mkdirSync('supabase/scripts', { recursive: true });
const source = 'src/data/mockSongs.ts';
writeFileSync('supabase/scripts/import_bundled_catalog.dry-run.sql', buildCatalogImportSql(MOCK_SONGS, { dryRun: true, source }));
writeFileSync('supabase/scripts/import_bundled_catalog.sql', buildCatalogImportSql(MOCK_SONGS, { dryRun: false, source }));
console.log('Escritos supabase/scripts/import_bundled_catalog.sql y .dry-run.sql');
