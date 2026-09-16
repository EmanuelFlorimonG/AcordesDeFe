import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { PLAYER_STATE, getYouTubePlayer, subscribeYouTubePlayer } from '../../utils/youtubePlayerEngine';

export interface YouTubeAudioPlayerHandle {
  seekTo: (seconds: number) => void;
}

interface YouTubeAudioPlayerProps {
  videoId?: string;
  isPlaying: boolean;
  volume: number; // 0-100
  onReady?: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  /**
   * The real length of a video, reported only once the player confirms it is
   * the one loaded. Nothing else in the app knows how long a song lasts.
   */
  onDurationKnown?: (videoId: string, seconds: number) => void;
  onEnded?: () => void;
  onError?: (message: string) => void;
}

function describeYouTubeError(_code: number): string {
  // Every failure mode the API reports (bad id, removed, private, embedding
  // disabled) reduces to the same thing from the listener's point of view.
  return 'Esta canción no está disponible para reproducción.';
}

/**
 * Invisible controller: wires the app's own PlayerBar UI to a single, hidden
 * YouTube IFrame player. Renders nothing — playback state reaches the app via
 * the callback props, and it's driven by the props below (declarative), with
 * seeking exposed imperatively via ref since "jump to this time" is a one-off
 * command rather than a value that stays true.
 *
 * `isPlaying` is treated as the app's intent, not mirrored back from the
 * player's transient state — loading a new video briefly reports "playing"
 * before our own pause call lands, and syncing that blip into app state would
 * fight the user's actual choice.
 */
export const YouTubeAudioPlayer = forwardRef<YouTubeAudioPlayerHandle, YouTubeAudioPlayerProps>(
  ({ videoId, isPlaying, volume, onReady, onTimeUpdate, onDurationKnown, onEnded, onError }, ref) => {
    const loadedVideoIdRef = useRef<string | undefined>(undefined);
    const pollRef = useRef<number | null>(null);

    // Latest onTimeUpdate callback, read from inside the polling interval so
    // the effect doesn't need to restart just because the callback identity
    // changed on a parent re-render.
    const onTimeUpdateRef = useRef(onTimeUpdate);
    onTimeUpdateRef.current = onTimeUpdate;
    const onDurationKnownRef = useRef(onDurationKnown);
    onDurationKnownRef.current = onDurationKnown;

    useImperativeHandle(ref, () => ({
      seekTo(seconds: number) {
        getYouTubePlayer().then((player) => player.seekTo(seconds, true));
      },
    }));

    // Poll playback progress while the app intends to be playing.
    useEffect(() => {
      if (!isPlaying) return;

      pollRef.current = window.setInterval(() => {
        getYouTubePlayer().then((player) => {
          const duration = player.getDuration();
          const currentTime = player.getCurrentTime();
          if (Number.isFinite(duration) && Number.isFinite(currentTime)) {
            onTimeUpdateRef.current?.(currentTime, duration);
          }
          // Just after switching songs the player can still report the
          // previous video's length, so the duration counts only when the
          // player itself says which video it is playing.
          const loadedVideoId = player.getVideoData?.()?.video_id;
          if (loadedVideoId && loadedVideoId === loadedVideoIdRef.current && duration > 0) {
            onDurationKnownRef.current?.(loadedVideoId, duration);
          }
        });
      }, 500);

      return () => {
        if (pollRef.current !== null) {
          window.clearInterval(pollRef.current);
          pollRef.current = null;
        }
      };
    }, [isPlaying]);

    // Mount once: initialize the (singleton) player and subscribe to it.
    useEffect(() => {
      let cancelled = false;

      getYouTubePlayer().then((player) => {
        if (cancelled) return;
        onReady?.();
        // Loading the initial video (if any) is handled by the videoId
        // effect below, which also runs on mount.
        void player;
      });

      const unsubscribe = subscribeYouTubePlayer({
        onStateChange: (state) => {
          if (state === PLAYER_STATE.ENDED) {
            onEnded?.();
          }
        },
        onError: (code) => {
          onError?.(describeYouTubeError(code));
        },
      });

      return () => {
        cancelled = true;
        unsubscribe();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // React to the song changing. cueVideoById prepares the video — buffers
    // it, makes duration/thumbnail available — without ever starting
    // playback. This is what actually eliminates the old "plays for an
    // instant before our pause lands" blip: nothing is ever told to play
    // here. The effect below (driven by `isPlaying`) is the only thing that
    // ever calls playVideo(), and it re-runs right after this one on the
    // same render, in declaration order.
    useEffect(() => {
      if (!videoId || loadedVideoIdRef.current === videoId) return;
      loadedVideoIdRef.current = videoId;

      getYouTubePlayer().then((player) => {
        player.cueVideoById(videoId);
      });
    }, [videoId]);

    // React to play/pause intent — the only place playVideo() is ever
    // called. Also re-runs when videoId changes (right after the cue above),
    // so pressing Play mid-playback-of-song-A and then skipping to song B
    // correctly starts B, while a plain song switch stays paused.
    useEffect(() => {
      if (!videoId) return;
      getYouTubePlayer().then((player) => {
        if (isPlaying) {
          player.playVideo();
        } else {
          player.pauseVideo();
        }
      });
    }, [isPlaying, videoId]);

    // React to volume changes.
    useEffect(() => {
      getYouTubePlayer().then((player) => player.setVolume(volume));
    }, [volume]);

    return null;
  }
);

YouTubeAudioPlayer.displayName = 'YouTubeAudioPlayer';
