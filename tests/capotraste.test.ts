import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SongMetaForm } from '../src/components/SongEditor/SongMetaForm';
import { SongInfoChips } from '../src/components/SongViewer/SongInfoChips';
import type { MetronomeControls } from '../src/hooks/useMetronome';
import { emptySongMeta, contentToEditor, editorToSongDraft, parseEditorDocument, proposedSongDraft } from '../src/editor/songEditorModel';
import { songToDraft, draftToSong } from '../src/catalog/songDraft';
import { songToRow, songFromRow } from '../src/catalog/supabaseSongRepository';
import { buildSubmissionPayload, parseSubmissionPayload, songDraftChanges } from '../src/catalog/submission';
import { createMemorySubmissionRepository } from '../src/catalog/submissionRepository';
import { validateSongDraft } from '../src/catalog/validateSongDraft';
import { describeKey } from '../src/utils/keySettings';

it('new songs default to no capo and the form offers exactly frets 0 through 11', () => {
  const meta = emptySongMeta();
  assert.equal(meta.recommendedCapo, 0);
  for (const fret of [null, 0, 5, 11]) {
    const html = renderToStaticMarkup(createElement(SongMetaForm, { meta: { ...meta, recommendedCapo: fret }, categories: [], onChange: () => {} }));
    assert.match(html, /Capotraste/);
    assert.match(html, new RegExp(`<option value="${fret ?? 0}" selected="">`));
    assert.match(html, /Sin capotraste/);
    assert.match(html, /Traste 11/);
    assert.doesNotMatch(html, /Traste 12/);
  }
});

it('creation, editing, draft reload, submissions and database rows preserve capo without changing chords', async () => {
  for (const fret of [0, 1, 5, 11]) {
    const doc = contentToEditor('[Verso 1]\n[G]Hola', { ...emptySongMeta(), title: 'Prueba', originalKey: 'G', recommendedCapo: fret });
    const draft = editorToSongDraft(doc);
    assert.equal(validateSongDraft(draft).ok, true);
    assert.equal(parseEditorDocument(JSON.parse(JSON.stringify(doc)))?.meta.recommendedCapo, fret);
    const song = draftToSong(draft, 'prueba');
    const row = songToRow(song);
    assert.equal(row.recommended_capo, fret);
    assert.equal(songFromRow(row)?.recommendedCapo, fret);
    const opened = contentToEditor(draft.content, songToDraft(song));
    const changed = { ...opened, meta: { ...opened.meta, recommendedCapo: (fret + 1) % 12 } };
    const edited = proposedSongDraft(draft, opened, changed);
    assert.equal(edited.content, draft.content);
    assert.equal(edited.recommendedCapo, (fret + 1) % 12);
    assert.equal(songDraftChanges(draft, edited), true);
    for (const type of ['create', 'update'] as const) {
      const payload = buildSubmissionPayload(edited, { type, targetSongId: song.id, baseVersion: 1 });
      assert.equal(parseSubmissionPayload(JSON.parse(JSON.stringify(payload)))?.song?.recommendedCapo, edited.recommendedCapo);
      const repository = createMemorySubmissionRepository({ publishedSongs: new Map([[song.id, { version: 1, song: draft }]]) });
      const receipt = await repository.submit(payload);
      assert.equal((await repository.getForEdit(receipt.trackingCode, receipt.editToken))?.song?.recommendedCapo, edited.recommendedCapo);
    }
  }
});

it('guitar displays sounding key and shapes, while piano hides capo', () => {
  const keyInfo = describeKey('G', { transposeSteps: 0, capoFret: 5 }, 5)!;
  assert.equal(keyInfo.sounding, 'C');
  assert.equal(keyInfo.shape, 'G');
  assert.equal(keyInfo.isModified, false);
  const metronome = { songBpm: null, bpm: 80, isSupported: false } as MetronomeControls;
  const guitar = renderToStaticMarkup(createElement(SongInfoChips, { keyInfo, capoFret: 5, metronome }));
  assert.match(guitar, /forma G/);
  assert.match(guitar, />C</);
  assert.match(guitar, /Capo/);
  const piano = renderToStaticMarkup(createElement(SongInfoChips, { keyInfo: { ...keyInfo, shape: null }, capoFret: null, metronome }));
  assert.doesNotMatch(piano, /Capo|forma G/);
});
