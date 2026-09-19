import { draftToSong } from '../catalog/songDraft';
import type { Song } from '../types/song';
import { transposeSongContent } from '../utils/chordParser';
import { transposeKey } from '../utils/chordTransposer';
import { editorToSongDraft, type EditorDocument } from './songEditorModel';

/** The id a song has while it is only a preview; never saved or sent. */
export const PREVIEW_SONG_ID = 'vista-previa';

export interface EditorPreview {
  /** The song exactly as the catalog would hold it once approved */
  song: Song;
  /** What the chord sheet receives: the same transposition SongViewer applies */
  content: string;
  /** The key heard at this transposition, when the song has one */
  key: string | null;
}

/**
 * The preview goes through the same path as a published song: the draft
 * becomes a Song, its content is transposed by transposeSongContent (as the
 * song viewer does), and ChordSheet renders it. There is no second renderer.
 */
export function buildEditorPreview(doc: EditorDocument, transposeSteps = 0): EditorPreview {
  return buildSongPreview(draftToSong(editorToSongDraft(doc), PREVIEW_SONG_ID), transposeSteps);
}

/** The same path for any Song: a proposal under review, or a published version. */
export function buildSongPreview(song: Song, transposeSteps = 0): EditorPreview {
  return {
    song,
    content: transposeSongContent(song.content, transposeSteps, song.originalKey),
    key: song.originalKey ? transposeKey(song.originalKey, transposeSteps) : null,
  };
}
