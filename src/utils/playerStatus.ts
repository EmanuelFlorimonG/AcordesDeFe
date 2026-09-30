export interface PlayButtonInput {
  hasVideo: boolean;
  isReady: boolean;
  error: string | null;
  isPlaying: boolean;
  /**
   * Si el navegador dice que hay conexión. La reproducción viene de YouTube,
   * así que sin red no hay nada que esperar: más vale decirlo que dejar el
   * botón girando.
   */
  online?: boolean;
}

/** Lo que se dice cuando no hay red y la canción tiene audio. */
export const PLAYBACK_NEEDS_INTERNET = 'La reproducción necesita conexión a internet.';

/**
 * State of the Play button, shared by the full player bar and the compact
 * player in rehearsal mode so both always agree.
 */
export function getPlayButtonState({ hasVideo, isReady, error, isPlaying, online = true }: PlayButtonInput): {
  disabled: boolean;
  title: string;
} {
  // Sin conexión no se espera a nada: el reproductor no va a llegar, y
  // decirlo es más útil que un «Cargando…» que no termina nunca.
  if (hasVideo && !online) return { disabled: true, title: PLAYBACK_NEEDS_INTERNET };
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
