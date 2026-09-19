import { extractUniqueChords, parseSongContent, parseSongSections } from '../utils/chordParser';
import { isChordSymbol, parseKey } from '../utils/chordTransposer';
import { MAX_CAPO, MIN_CAPO } from '../utils/keySettings';
import { isLiturgicalSeasonId } from '../utils/liturgicalSeasons';
import { SONG_DIFFICULTIES, type SongDraft } from './songDraft';

/**
 * Checks a draft before it is sent for review, with the same engines the app
 * reads songs with: the parser decides what is a section and what is a chord,
 * the transposer decides what is a key. Errors block sending; warnings are
 * shown so the author can decide. Nothing is corrected silently.
 */

export const MAX_SONG_TITLE_LENGTH = 120;
export const MAX_SONG_ARTIST_LENGTH = 120;
export const MAX_RHYTHM_PATTERN_LENGTH = 120;
export const MAX_SONG_CONTENT_LENGTH = 20_000;
export const MIN_TEMPO = 30;
export const MAX_TEMPO = 300;

export type SongValidationCode =
  | 'title-required'
  | 'title-too-long'
  | 'artist-too-long'
  | 'rhythm-too-long'
  | 'content-required'
  | 'content-too-long'
  | 'unbalanced-brackets'
  | 'original-key-invalid'
  | 'capo-invalid'
  | 'tempo-invalid'
  | 'time-signature-invalid'
  | 'difficulty-invalid'
  | 'year-invalid'
  | 'youtube-id-invalid'
  | 'season-invalid'
  | 'chord-unrecognized'
  | 'no-chords'
  | 'original-key-missing'
  | 'empty-section'
  | 'category-unknown';

export interface SongValidationIssue {
  code: SongValidationCode;
  severity: 'error' | 'warning';
  /** The draft field it is about */
  field: keyof SongDraft;
  message: string;
  /** 1-based line of `content`, for issues inside the song text */
  line?: number;
}

export interface SongValidationResult {
  /** True when nothing blocks sending (warnings may remain) */
  ok: boolean;
  errors: SongValidationIssue[];
  warnings: SongValidationIssue[];
}

export interface SongValidationOptions {
  /** The catalog's categories; a new one is allowed but pointed out */
  knownCategories?: string[];
}

const TIME_SIGNATURE = /^(\d{1,2})\/(2|4|8|16)$/;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YEAR = /^\d{4}$/;

export function validateSongDraft(draft: SongDraft, options: SongValidationOptions = {}): SongValidationResult {
  const issues: SongValidationIssue[] = [];
  const error = (code: SongValidationCode, field: keyof SongDraft, message: string, line?: number) =>
    issues.push({ code, severity: 'error', field, message, ...(line ? { line } : {}) });
  const warning = (code: SongValidationCode, field: keyof SongDraft, message: string, line?: number) =>
    issues.push({ code, severity: 'warning', field, message, ...(line ? { line } : {}) });

  // --- Metadata ---------------------------------------------------------------
  const title = draft.title.trim();
  if (!title) error('title-required', 'title', 'Escribe el título de la canción.');
  else if (title.length > MAX_SONG_TITLE_LENGTH) error('title-too-long', 'title', `El título no puede pasar de ${MAX_SONG_TITLE_LENGTH} caracteres.`);
  if (draft.artist && draft.artist.trim().length > MAX_SONG_ARTIST_LENGTH) {
    error('artist-too-long', 'artist', `El autor no puede pasar de ${MAX_SONG_ARTIST_LENGTH} caracteres.`);
  }
  if (draft.rhythmPattern && draft.rhythmPattern.length > MAX_RHYTHM_PATTERN_LENGTH) {
    error('rhythm-too-long', 'rhythmPattern', `El rasgueo no puede pasar de ${MAX_RHYTHM_PATTERN_LENGTH} caracteres.`);
  }
  if (draft.originalKey !== null && !parseKey(draft.originalKey)) {
    error('original-key-invalid', 'originalKey', `«${draft.originalKey}» no es una tonalidad. Ejemplos: G, Bb, F#m.`);
  }
  if (draft.recommendedCapo !== null && (!Number.isInteger(draft.recommendedCapo) || draft.recommendedCapo < MIN_CAPO || draft.recommendedCapo > MAX_CAPO)) {
    error('capo-invalid', 'recommendedCapo', `La cejilla va del traste ${MIN_CAPO} al ${MAX_CAPO}.`);
  }
  if (draft.tempo !== null && (!Number.isInteger(draft.tempo) || draft.tempo < MIN_TEMPO || draft.tempo > MAX_TEMPO)) {
    error('tempo-invalid', 'tempo', `El tempo va de ${MIN_TEMPO} a ${MAX_TEMPO} BPM.`);
  }
  if (draft.timeSignature !== null && !TIME_SIGNATURE.test(draft.timeSignature)) {
    error('time-signature-invalid', 'timeSignature', 'El compás se escribe así: 4/4, 3/4, 6/8.');
  }
  if (draft.difficulty !== null && !SONG_DIFFICULTIES.includes(draft.difficulty)) {
    error('difficulty-invalid', 'difficulty', 'La dificultad es Fácil, Intermedio o Avanzado.');
  }
  if (draft.year !== null && (!YEAR.test(draft.year) || Number(draft.year) < 1000 || Number(draft.year) > 2100)) {
    error('year-invalid', 'year', 'El año se escribe con cuatro cifras.');
  }
  // An empty id means "no video", as the app already reads it.
  if (draft.youtubeId !== null && draft.youtubeId !== '' && !YOUTUBE_ID.test(draft.youtubeId)) {
    error('youtube-id-invalid', 'youtubeId', 'El identificador de YouTube tiene 11 caracteres (letras, números, - y _).');
  }
  for (const season of draft.liturgicalSeasons ?? []) {
    if (!isLiturgicalSeasonId(season)) error('season-invalid', 'liturgicalSeasons', `«${season}» no es un tiempo litúrgico.`);
  }
  if (options.knownCategories) {
    const known = new Set(options.knownCategories);
    for (const category of draft.categories) {
      if (!known.has(category)) warning('category-unknown', 'categories', `«${category}» es una categoría nueva; se revisará antes de publicar.`);
    }
  }

  // --- Lyrics and chords ------------------------------------------------------
  const content = draft.content.replace(/\r\n?/g, '\n');
  if (!content.trim()) {
    error('content-required', 'content', 'Escribe la letra de la canción.');
  } else if (content.length > MAX_SONG_CONTENT_LENGTH) {
    error('content-too-long', 'content', `La letra no puede pasar de ${MAX_SONG_CONTENT_LENGTH} caracteres.`);
  } else {
    content.split('\n').forEach((line, index) => {
      if ((line.match(/\[/g) ?? []).length !== (line.match(/\]/g) ?? []).length) {
        error('unbalanced-brackets', 'content', 'Hay un corchete sin cerrar: los acordes se escriben así, [G].', index + 1);
      }
    });

    // What the parser read as lyrics but looks like a chord that didn't parse ("[Gx]").
    parseSongContent(content).forEach((parsed, index) => {
      if (parsed.type !== 'chords-lyrics') return;
      for (const segment of parsed.segments ?? []) {
        if (segment.chord) continue;
        for (const match of segment.lyric.matchAll(/\[([A-G][^\]]*)\]/g)) {
          if (!isChordSymbol(match[1])) {
            warning('chord-unrecognized', 'content', `«[${match[1]}]» no se reconoce como acorde y se mostrará como texto.`, index + 1);
          }
        }
      }
    });

    const chords = extractUniqueChords(content);
    if (chords.length === 0) {
      warning('no-chords', 'content', 'La canción no tiene acordes: se mostrará solo la letra.');
    } else if (draft.originalKey === null) {
      warning('original-key-missing', 'originalKey', 'Indica la tonalidad original: ayuda a transponer y a nombrar bien los acordes.');
    }

    // A header with nothing under it that doesn't repeat a known section shows nothing.
    for (const section of parseSongSections(content)) {
      if (section.header && section.lines.length === 0 && !section.repeatOf) {
        warning('empty-section', 'content', `La sección «${section.header.label}» está vacía y no repite ninguna sección anterior.`);
      }
    }
  }

  const errors = issues.filter((issue) => issue.severity === 'error');
  return { ok: errors.length === 0, errors, warnings: issues.filter((issue) => issue.severity === 'warning') };
}
