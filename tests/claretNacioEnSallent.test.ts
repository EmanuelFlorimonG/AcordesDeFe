import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MOCK_SONGS } from '../src/data/mockSongs';
import { parseSongSections, extractUniqueChords } from '../src/utils/chordParser';
import { songToRow } from '../src/catalog/supabaseSongRepository';
import { buildCatalogImportSql } from '../src/catalog/catalogImport';

const song = MOCK_SONGS.find((entry) => entry.id === 'claret-nacio-en-sallent')!;

it('conserva cinco secciones, cuatro frases por coro y las correcciones editoriales aprobadas', () => {
  assert.ok(song);
  assert.equal(song.title, 'Claret nació en Sallent');
  assert.deepEqual(song.categories, ['Claretiana']);
  assert.deepEqual(song.tags, ['Claret']);
  assert.deepEqual(song.chordsUsed, []);
  assert.deepEqual(extractUniqueChords(song.content), []);
  const sections = parseSongSections(song.content);
  assert.deepEqual(sections.map(({ header }) => [header?.kind, header?.number, header?.note]), [
    ['verso', 1, undefined], ['coro', undefined, undefined],
    ['verso', 2, undefined], ['puente', undefined, undefined], ['coro', undefined, 'final'],
  ]);
  for (const index of [1, 4]) {
    assert.equal(sections[index].header?.repeat, undefined);
    assert.equal(sections[index].repeatOf, undefined);
    assert.deepEqual(sections[index].lines.map((line) => line.raw), Array(4).fill('Claret, Claret, Claret'));
  }
  assert.deepEqual(sections[3].lines.map((line) => line.raw), [
    'Fue perseguido,',
    'Fue calumniado',
    'Y maltratado',
    'Pero su Fe Como Cristiano le dio valor',
    'Y continuó con su misión lleno de amor, para fundar la Inmaculada Congregación',
  ]);
  const row = songToRow(song);
  for (const field of ['artist', 'original_key', 'tempo', 'time_signature', 'recommended_capo', 'difficulty', 'year', 'youtube_id'] as const) {
    assert.equal(row[field], null);
  }
});

it('ambos scripts corresponden exactamente al generador y solo incluyen esta canción', () => {
  const source = 'src/data/mockSongs.ts (1 canciones: claret-nacio-en-sallent)';
  for (const dryRun of [false, true]) {
    const path = `supabase/scripts/import_claret_nacio_en_sallent${dryRun ? '.dry-run' : ''}.sql`;
    assert.equal(readFileSync(path, 'utf8').replace(/\r\n/g, '\n'), buildCatalogImportSql([song], { dryRun, source }));
  }
});
