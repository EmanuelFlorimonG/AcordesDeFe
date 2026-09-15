export interface PlayButtonInput {
  hasVideo: boolean;
  isReady: boolean;
  error: string | null;
  isPlaying: boolean;
}

/**
 * State of the Play button, shared by the full player bar and the compact
 * player in rehearsal mode so both always agree.
 */
export function getPlayButtonState({ hasVideo, isReady, error, isPlaying }: PlayButtonInput): {
  disabled: boolean;
  title: string;
} {
  const disabled = !hasVideo || (!isReady && !error);
  const title = !hasVideo
    ? 'Audio no disponible'
    : disabled
      ? 'Cargando reproductor…'
      : isPlaying
        ? 'Pausar'
        : 'Reproducir';
  return { disabled, title };
}
