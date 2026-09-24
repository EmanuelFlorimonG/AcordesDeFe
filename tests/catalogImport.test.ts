import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { auditCatalogRows, buildCatalogImportSql, rowProblems } from '../src/catalog/catalogImport';
import { songToRow } from '../src/catalog/supabaseSongRepository';
import { MOCK_SONGS } from '../src/data/mockSongs';

let checks = 0;
const eq = (actual: unknown, expected: unknown) => {
  assert.deepEqual(actual, expected);
  checks++;
};
after(() => console.log(`catalogImport: ${checks} comprobaciones`));

describe('Auditoría de las canciones incluidas antes de importarlas', () => {
  it('110 canciones, ningún id repetido, todas cumplen las restricciones de la tabla', () => {
    eq(auditCatalogRows(MOCK_SONGS), { total: 110, duplicateIds: [], invalidRows: [] });
  });

  it('la auditoría detecta lo que la base de datos rechazaría', () => {
    const base = songToRow(MOCK_SONGS[0]);
    eq(rowProblems({ ...base, id: 'Con Mayúsculas' }), ['id']);
    eq(rowProblems({ ...base, title: '  ' }), ['title']);
    eq(rowProblems({ ...base, original_key: 'DEMASIADO-LARGA' }), ['original_key']);
    eq(rowProblems({ ...base, tempo: 400, year: '26' }), ['tempo', 'year']);
    eq(rowProblems({ ...base, youtube_id: 'corto' }), ['youtube_id']);
    eq(rowProblems({ ...base, difficulty: 'Imposible' }), ['difficulty']);
    const repeated = auditCatalogRows([MOCK_SONGS[0], MOCK_SONGS[0]]);
    eq(repeated.duplicateIds, [MOCK_SONGS[0].id]);
  });
});

describe('SQL de importación', () => {
  const sql = buildCatalogImportSql(MOCK_SONGS, { dryRun: false, source: 'test' });
  const dry = buildCatalogImportSql(MOCK_SONGS, { dryRun: true, source: 'test' });

  it('lleva los 110 ids exactamente como están, y comprueba cada columna al leerla', () => {
    const rows = JSON.parse(sql.slice(sql.indexOf('$rows$') + 6, sql.lastIndexOf('$rows$')));
    eq(rows.length, 110);
    eq(rows.map((row: { id: string }) => row.id), MOCK_SONGS.map((song) => song.id));
    eq(rows[0], songToRow(MOCK_SONGS[0]));
    eq(sql.includes('v_expected constant integer := 110'), true);
    eq(sql.includes('s.content is not distinct from x.content'), true);
    eq(sql.includes('GENESARET:import:ids_taken'), true);
  });

  it('la versión 1 no inventa historia: sin propuesta ni revisor', () => {
    eq(sql.includes("select s.id, 1, to_jsonb(s), null, null"), true);
  });

  it('el dry-run hace lo mismo y siempre termina revirtiendo', () => {
    eq(dry.includes("raise exception 'DRY-RUN OK"), true);
    eq(sql.includes('DRY-RUN OK'), false);
  });

  it('no genera nada si alguna canción no pasa la auditoría', () => {
    assert.throws(() => buildCatalogImportSql([MOCK_SONGS[0], MOCK_SONGS[0]], { dryRun: true, source: 'test' }));
    checks++;
  });
});
