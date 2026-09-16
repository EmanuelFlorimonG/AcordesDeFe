import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import type { Instrument, Playlist, Song, ViewSettings } from '../../types/song';
import type { SetlistPlayback } from '../../types/setlist';
import { normalizeStep, transposeKey } from '../../utils/chordTransposer';
import { transposeSongContent, extractUniqueChords, stripChords } from '../../utils/chordParser';
import { getCategoryStyle } from '../../utils/categoryStyle';
import { useTransposeControls } from '../../hooks/useTransposeControls';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useMetronome } from '../../hooks/useMetronome';
import { ChordSheet } from './ChordSheet';
import { ChordDetailModal } from './ChordDetailModal';
import { InstrumentChordDiagram } from './InstrumentChordDiagram';
import { InstrumentToggle } from './InstrumentToggle';
import { SongInfoChips, type SongKeyInfo } from './SongInfoChips';
import { TransposeMenu } from './TransposeMenu';
import { SongRowMenu } from '../Dashboard/SongRowMenu';
import { LiturgicalSeasonChips } from '../Liturgy/LiturgicalSeasonChips';
import { RehearsalMode } from '../Rehearsal/RehearsalMode';
import type { RehearsalKeyControls } from '../Rehearsal/RehearsalHeader';
import type { CompactPlayerState } from '../Player/MiniPlayer';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Heart,
  Copy,
  Check,
  Guitar,
  ListOrdered,
  Piano,
  Share2,
  Printer,
  MicVocal,
  StickyNote,
} from 'lucide-react';

type SongTab = 'letra' | 'diagramas' | 'recursos';

interface SongViewerProps {
  song: Song;
  onBack: () => void;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  playlists: Playlist[];
  onToggleInPlaylist: (playlistId: string, songId: string) => void;
  onCreatePlaylist: (name: string, songId: string) => void;
  onShare: (song: Song) => void;
  /** Rehearsal mode is owned by App, so it can survive moving between songs. */
  isRehearsing: boolean;
  onRehearsalChange: (active: boolean) => void;
  /** State of the app's single YouTube player, for rehearsal mode's compact controls */
  player: CompactPlayerState | null;
  /**
   * Set when the song was opened from a setlist. The key, capo, moment and
   * note shown then belong to that occasion, and are saved back to it.
   */
  setlist?: SetlistPlayback | null;
}

// The key a song was left in stays for the rest of the browser session, so
// going back to a song during a rehearsal finds it as it was. Only for this
// tab: next time the song opens in its original key again.
const SESSION_KEY_PREFIX = 'genesaret_song_key:';

interface SessionKey {
  transposeSteps: number;
  capoFret: number;
}

function readSessionKey(songId: string): SessionKey | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY_PREFIX + songId);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SessionKey>;
    const { transposeSteps, capoFret } = value;
    const isValid =
      Number.isInteger(transposeSteps) &&
      Number.isInteger(capoFret) &&
      Math.abs(transposeSteps as number) <= 11 &&
      (capoFret as number) >= 0 &&
      (capoFret as number) <= 11;
    return isValid ? { transposeSteps: transposeSteps as number, capoFret: capoFret as number } : null;
  } catch {
    return null;
  }
}

export const SongViewer: React.FC<SongViewerProps> = ({
  song,
  onBack,
  isFavorite,
  onToggleFavorite,
  playlists,
  onToggleInPlaylist,
  onCreatePlaylist,
  onShare,
  isRehearsing,
  onRehearsalChange,
  player,
  setlist,
}) => {
  const [localSettings, setLocalSettings] = useState<ViewSettings>(() => {
    // Opened from a setlist, the song starts in that setlist's key, not in
    // whatever key it was last left in elsewhere.
    const sessionKey = setlist ? null : readSessionKey(song.id);
    return {
      fontSize: 'base',
      showChords: true,
      twoColumns: false,
      transposeSteps: setlist ? setlist.item.transposeSteps : sessionKey?.transposeSteps ?? 0,
      capoFret: setlist ? setlist.item.capoFret : sessionKey?.capoFret ?? (song.recommendedCapo || 0),
    };
  });

  // In a setlist the key and capo belong to the setlist, so they are read from
  // it and written back to it: leaving the song and returning finds them, and
  // the song itself is never modified.
  const settings: ViewSettings = setlist
    ? { ...localSettings, transposeSteps: setlist.item.transposeSteps, capoFret: setlist.item.capoFret }
    : localSettings;

  const settingsRef = useRef(settings);
  const saveSetlistKeyRef = useRef(setlist?.onKeySettingsChange);
  useLayoutEffect(() => {
    settingsRef.current = settings;
    saveSetlistKeyRef.current = setlist?.onKeySettingsChange;
  });

  const setSettings = useCallback<React.Dispatch<React.SetStateAction<ViewSettings>>>((action) => {
    const saveSetlistKey = saveSetlistKeyRef.current;
    if (!saveSetlistKey) {
      setLocalSettings(action);
      return;
    }
    const previous = settingsRef.current;
    const next = typeof action === 'function' ? action(previous) : action;
    if (next === previous) return;
    setLocalSettings((current) => ({ ...current, ...next }));
    if (next.transposeSteps !== previous.transposeSteps || next.capoFret !== previous.capoFret) {
      saveSetlistKey({ transposeSteps: next.transposeSteps, capoFret: next.capoFret });
    }
  }, []);

  const [copied, setCopied] = useState(false);
  const [copiedLyricsOnly, setCopiedLyricsOnly] = useState(false);
  const [selectedChordModal, setSelectedChordModal] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SongTab>('letra');
  // Remembered across songs and sessions: whoever plays piano shouldn't have
  // to switch away from guitar on every song they open.
  const [instrument, setInstrument] = useLocalStorage<Instrument>(
    'genesaret_instrument',
    'guitarra'
  );

  const isInSetlist = Boolean(setlist);
  useEffect(() => {
    // A setlist keeps its own key, and must not overwrite the one the song has
    // when it is opened normally from the songbook.
    if (isInSetlist) return;
    try {
      sessionStorage.setItem(
        SESSION_KEY_PREFIX + song.id,
        JSON.stringify({ transposeSteps: settings.transposeSteps, capoFret: settings.capoFret })
      );
    } catch {
      // storage unavailable (private mode): the key simply isn't remembered
    }
  }, [song.id, settings.transposeSteps, settings.capoFret, isInSetlist]);

  const controls = useTransposeControls(settings, setSettings, song.recommendedCapo || 0);
  // Independent of the YouTube player: neither one starts or stops the other.
  const metronome = useMetronome(song.tempo, song.timeSignature);

  const hasKey = Boolean(song.originalKey);
  const hasChords = song.chordsUsed.length > 0;
  const isPiano = instrument === 'piano';
  const InstrumentIcon = isPiano ? Piano : Guitar;

  const currentKey = useMemo(() => {
    return transposeKey(song.originalKey ?? '', settings.transposeSteps);
  }, [song.originalKey, settings.transposeSteps]);

  // A capo makes the guitar sound higher than the chords written on the page.
  // A pianist has no capo, so to play alongside the guitars they need those
  // written chords moved up by the capo fret — otherwise piano and guitar
  // would be in different keys.
  const pianoCapoOffset = isPiano ? settings.capoFret : 0;

  const transposedContent = useMemo(() => {
    return transposeSongContent(
      song.content,
      settings.transposeSteps + pianoCapoOffset,
      song.originalKey
    );
  }, [song.content, song.originalKey, settings.transposeSteps, pianoCapoOffset]);

  const currentChords = useMemo(() => {
    return extractUniqueChords(transposedContent);
  }, [transposedContent]);

  // Computed from the original key in one step (not from currentKey), so the
  // name matches exactly what the transposed chords are spelled in.
  const soundingKeyWithCapo = useMemo(() => {
    if (settings.capoFret === 0) return null;
    return transposeKey(song.originalKey ?? '', settings.transposeSteps + settings.capoFret);
  }, [song.originalKey, settings.transposeSteps, settings.capoFret]);

  /** The key the chords on screen are written in, for whichever instrument. */
  const displayedKey = isPiano ? soundingKeyWithCapo ?? currentKey : currentKey;

  const categoryStyle = getCategoryStyle(song.categories[0]);

  const handleCopyContent = () => {
    navigator.clipboard.writeText(transposedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLyricsOnly = () => {
    navigator.clipboard.writeText(stripChords(transposedContent));
    setCopiedLyricsOnly(true);
    setTimeout(() => setCopiedLyricsOnly(false), 2000);
  };

  const recommendedCapo = song.recommendedCapo || 0;

  const keyInfo = useMemo<SongKeyInfo | null>(() => {
    if (!song.originalKey) return null;
    // How far the sound has moved from the song as written, capo included.
    // The reactive capo changes transposeSteps and capoFret in opposite
    // directions, so moving the capo alone keeps this at zero.
    const pitchShift = normalizeStep(settings.transposeSteps + settings.capoFret - recommendedCapo);
    return {
      sounding: soundingKeyWithCapo ?? currentKey,
      // On piano the chords are already written at sounding pitch, so there is
      // no "shape vs. sound" distinction to explain.
      shape: !isPiano && settings.capoFret > 0 ? currentKey : null,
      original: pitchShift !== 0 ? transposeKey(song.originalKey, recommendedCapo) : null,
    };
  }, [
    song.originalKey,
    soundingKeyWithCapo,
    currentKey,
    settings.transposeSteps,
    settings.capoFret,
    recommendedCapo,
    isPiano,
  ]);

  const rehearsalKeyControls: RehearsalKeyControls | null = hasKey
    ? {
        displayedKey,
        soundingKey: !isPiano ? soundingKeyWithCapo : null,
        isModified: controls.isModified,
        onTranspose: controls.handleTranspose,
        onReset: controls.handleResetTranspose,
      }
    : null;

  const closeChordModal = useCallback(() => setSelectedChordModal(null), []);

  const chordModal = selectedChordModal && (
    <ChordDetailModal
      key={`${selectedChordModal}-${instrument}`}
      chord={selectedChordModal}
      instrument={instrument}
      onClose={closeChordModal}
    />
  );

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 pb-10">
      {/* Top navigation */}
      <div className="flex items-center justify-between gap-4 mb-5 print:hidden">
        <button
          onClick={setlist ? setlist.onBackToSetlist : onBack}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-medium">{setlist ? 'Volver al Setlist' : 'Volver al cancionero'}</span>
        </button>
      </div>

      {/* Opened from a setlist: say so, and say with which settings. */}
      {setlist && (
        <div className="mb-5 rounded-xl border border-[#D6E4FF] dark:border-blue-500/20 bg-[#F5F8FF] dark:bg-blue-500/5 px-4 py-3 print:hidden">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
            <ListOrdered className="w-4 h-4 shrink-0 text-[#2464ED]" />
            <p className="min-w-0 truncate text-sm font-bold text-[#10203A] dark:text-white">
              {setlist.setlistName}
            </p>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-500 dark:text-slate-400">
              {setlist.position} / {setlist.total}
            </span>
            {setlist.item.moment && (
              <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-white dark:bg-blue-500/10 text-[10px] font-bold uppercase tracking-[0.1em] text-[#2464ED] dark:text-sky-400">
                {setlist.item.moment}
              </span>
            )}

            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setlist.previous?.onSelect()}
                disabled={!setlist.previous}
                title={setlist.previous ? `Anterior: ${setlist.previous.title}` : 'Es la primera del Setlist'}
                aria-label={setlist.previous ? `Anterior: ${setlist.previous.title}` : 'Es la primera del Setlist'}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-dark-800 hover:text-[#2464ED] transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setlist.next?.onSelect()}
                disabled={!setlist.next}
                title={setlist.next ? `Siguiente: ${setlist.next.title}` : 'Es la última del Setlist'}
                aria-label={setlist.next ? `Siguiente: ${setlist.next.title}` : 'Es la última del Setlist'}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-dark-800 hover:text-[#2464ED] transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span>
              Configuración de este Setlist
              {hasKey && (
                <>
                  : tono <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">{displayedKey}</span>
                  {!isPiano && settings.capoFret > 0 && ` · cejilla ${settings.capoFret}`}
                  {controls.isModified && ` · el original es ${song.originalKey}`}
                </>
              )}
            </span>
            <button
              type="button"
              onClick={setlist.onViewOriginal}
              className="font-semibold text-[#2464ED] dark:text-sky-400 hover:underline"
            >
              Ver la canción original
            </button>
          </div>

          {setlist.item.notes && (
            <p className="mt-2 flex items-start gap-2 text-sm leading-relaxed whitespace-pre-line text-slate-600 dark:text-slate-300">
              <StickyNote className="w-4 h-4 mt-0.5 shrink-0 text-slate-400 dark:text-slate-500" />
              {setlist.item.notes}
            </p>
          )}
        </div>
      )}

      {/* Header banner */}
      <div
        className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${categoryStyle.from} ${categoryStyle.to} px-6 sm:px-8 py-7 sm:py-9 mb-5 print:hidden`}
      >
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="inline-block px-2.5 py-1 rounded-md text-xs font-bold bg-white/15 text-white">
            {song.categories[0]}
          </span>
          <LiturgicalSeasonChips song={song} size="md" variant="onColor" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">{song.title}</h1>
        {(song.artist || song.year) && (
          <p className="text-base sm:text-lg font-medium text-white/80 mt-1">
            {song.artist}
            {song.year && <span className="text-white/50 ml-2">({song.year})</span>}
          </p>
        )}

        <div className="mt-5">
          <SongInfoChips
            keyInfo={keyInfo}
            // The capo is a guitar-only device: it has no meaning on a keyboard.
            capoFret={isPiano ? null : settings.capoFret}
            timeSignature={song.timeSignature}
            rhythmPattern={song.rhythmPattern}
            metronome={metronome}
          />
        </div>
      </div>

      {/* Metadata + Actions row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onRehearsalChange(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold bg-blue-600 border border-blue-600 text-white hover:bg-blue-700 hover:border-blue-700 transition-colors"
            title="Letra grande, auto-scroll y controles para tocar"
          >
            <MicVocal className="w-4 h-4" />
            <span>Modo ensayo</span>
          </button>

          <button
            onClick={() => onToggleFavorite(song.id)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold border transition-colors ${
              isFavorite
                ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-400'
                : 'bg-white dark:bg-dark-900 border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-800'
            }`}
          >
            <Heart className={`w-4 h-4 ${isFavorite ? 'fill-blue-600 dark:fill-blue-400' : ''}`} />
            <span>{isFavorite ? 'En favoritas' : 'Añadir a favoritas'}</span>
          </button>

          <button
            onClick={() => onShare(song)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-800 transition-colors"
          >
            <Share2 className="w-4 h-4" />
            <span>Compartir</span>
          </button>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-800 transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir</span>
          </button>

          <SongRowMenu
            song={song}
            playlists={playlists}
            onToggleInPlaylist={onToggleInPlaylist}
            onCreatePlaylist={onCreatePlaylist}
            onShare={onShare}
          />
        </div>

        {!hasChords && (
          <p className="text-xs text-slate-400 dark:text-slate-500 italic">
            Aún no se han agregado los acordes de esta canción.
          </p>
        )}
      </div>

      {/* Tabs + Transpose toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5 print:hidden">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-dark-900 rounded-lg border border-slate-200 dark:border-dark-700">
          {([
            { id: 'letra', label: hasChords ? 'Acordes y letra' : 'Letra' },
            ...(hasChords ? [{ id: 'diagramas', label: 'Acordes en diagramas' }] : []),
            { id: 'recursos', label: 'Recursos' },
          ] as Array<{ id: SongTab; label: string }>).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-1.5 rounded-md text-xs sm:text-sm font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-dark-800 text-[#2464ED] shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasChords && <InstrumentToggle value={instrument} onChange={setInstrument} />}

          {hasChords && (
            <button
              onClick={() =>
                setSettings((prev) => ({ ...prev, showChords: !prev.showChords }))
              }
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                settings.showChords
                  ? 'bg-white dark:bg-dark-900 border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-800'
                  : 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-400'
              }`}
              title={settings.showChords ? 'Ver solo la letra, sin acordes' : 'Mostrar los acordes de nuevo'}
            >
              <InstrumentIcon className="w-4 h-4" />
              <span className="hidden sm:inline">{settings.showChords ? 'Ocultar acordes' : 'Solo letra'}</span>
            </button>
          )}

          {hasKey && (
            <TransposeMenu
              currentKey={displayedKey}
              showCapo={!isPiano}
              soundingKeyWithCapo={soundingKeyWithCapo}
              capoFret={settings.capoFret}
              isModified={controls.isModified}
              onTranspose={controls.handleTranspose}
              onCapoChange={controls.handleCapoChange}
              onReset={controls.handleResetTranspose}
            />
          )}

          <div className="hidden sm:flex items-center bg-white dark:bg-dark-900 p-1 rounded-lg border border-slate-200 dark:border-dark-700">
            <button
              onClick={() => controls.handleFontSizeChange(-1)}
              disabled={settings.fontSize === 'sm'}
              className="w-8 h-8 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30"
              title="Reducir tamaño de letra"
            >
              <span className="text-xs font-bold">A-</span>
            </button>
            <span className="text-sm font-bold text-slate-300 dark:text-dark-700 px-1">A</span>
            <button
              onClick={() => controls.handleFontSizeChange(1)}
              disabled={settings.fontSize === 'xl'}
              className="w-8 h-8 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30"
              title="Aumentar tamaño de letra"
            >
              <span className="text-sm font-bold">A+</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content: main + sidebar */}
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-grow min-w-0 bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-lg p-4 sm:p-8 min-h-[500px] shadow-sm print:shadow-none print:border-0 print:p-0">
          {activeTab === 'letra' && (
            <ChordSheet
              content={transposedContent}
              fontSize={settings.fontSize}
              twoColumns={settings.twoColumns}
              showChords={settings.showChords}
              onChordClick={(chord) => setSelectedChordModal(chord)}
            />
          )}

          {activeTab === 'diagramas' && (
            <div>
              {isPiano && soundingKeyWithCapo && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  Acordes en tono real ({soundingKeyWithCapo}), ya ajustados a la cejilla
                  en el traste {settings.capoFret} que usa la guitarra.
                </p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 justify-items-center">
                {currentChords.map((chord) => (
                  <InstrumentChordDiagram
                    key={chord}
                    chord={chord}
                    instrument={instrument}
                    size="md"
                  />
                ))}
              </div>
            </div>
          )}

          {activeTab === 'recursos' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Herramientas</h3>
                <div className="flex flex-wrap gap-2">
                  {hasChords ? (
                    <>
                      <button
                        onClick={handleCopyContent}
                        className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-dark-700 transition-colors"
                      >
                        {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                        <span>{copied ? 'Copiado' : 'Copiar letra con acordes'}</span>
                      </button>
                      <button
                        onClick={handleCopyLyricsOnly}
                        className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-dark-700 transition-colors"
                      >
                        {copiedLyricsOnly ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                        <span>{copiedLyricsOnly ? 'Copiado' : 'Copiar letra sin acordes'}</span>
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleCopyLyricsOnly}
                      className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-dark-700 transition-colors"
                    >
                      {copiedLyricsOnly ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedLyricsOnly ? 'Copiado' : 'Copiar letra'}</span>
                    </button>
                  )}
                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-dark-700 transition-colors"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Imprimir letra</span>
                  </button>
                </div>
              </div>

              {song.tags.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Etiquetas</h3>
                  <div className="flex flex-wrap gap-2">
                    {song.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 dark:bg-dark-800 text-slate-600 dark:text-slate-300"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="w-full lg:w-72 flex-shrink-0 space-y-5 print:hidden">
          {hasChords && (
            <div className="bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-lg p-4">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3">
                <InstrumentIcon className="w-3.5 h-3.5" />
                {isPiano ? 'Acordes en piano' : 'Acordes principales'}
              </h3>
              <div className="grid grid-cols-2 gap-3 justify-items-center">
                {currentChords.slice(0, 4).map((chord) => (
                  <InstrumentChordDiagram
                    key={chord}
                    chord={chord}
                    instrument={instrument}
                    size="sm"
                  />
                ))}
              </div>
              {currentChords.length > 4 && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-3">
                  {currentChords.length - 4} acorde
                  {currentChords.length - 4 === 1 ? '' : 's'} más en la pestaña de diagramas.
                </p>
              )}
            </div>
          )}

          {song.tags.length > 0 && (
            <div className="bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-lg p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3">
                Etiquetas
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {song.tags.map((tag) => (
                  <span
                    key={tag}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                      tag === song.categories[0]
                        ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400'
                        : 'bg-slate-100 dark:bg-dark-800 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {isRehearsing ? (
        <RehearsalMode
          song={song}
          content={transposedContent}
          showChords={settings.showChords}
          keyControls={rehearsalKeyControls}
          capoFret={isPiano ? null : settings.capoFret}
          instrument={hasChords ? instrument : null}
          onInstrumentChange={setInstrument}
          metronome={metronome}
          player={player}
          onChordClick={setSelectedChordModal}
          isChordModalOpen={Boolean(selectedChordModal)}
          // Rendered inside the rehearsal layer, which sits above this page.
          chordModal={chordModal}
          onExit={() => onRehearsalChange(false)}
          setlist={setlist}
        />
      ) : (
        /* Chord detail: positions (guitar) or inversions (piano) */
        chordModal
      )}
    </div>
  );
};
