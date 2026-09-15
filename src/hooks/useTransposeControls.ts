import { useCallback } from 'react';
import type { ViewSettings } from '../types/song';

const MIN_TRANSPOSE = -11;
const MAX_TRANSPOSE = 11;
const MIN_CAPO = 0;
const MAX_CAPO = 11;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const FONT_SIZES: Array<'sm' | 'base' | 'lg' | 'xl'> = ['sm', 'base', 'lg', 'xl'];

export function useTransposeControls(
  settings: ViewSettings,
  onUpdateSettings: React.Dispatch<React.SetStateAction<ViewSettings>>,
  recommendedCapo: number
) {
  const handleTranspose = useCallback(
    (delta: number) => {
      onUpdateSettings((prev) => ({
        ...prev,
        transposeSteps: clamp(prev.transposeSteps + delta, MIN_TRANSPOSE, MAX_TRANSPOSE),
      }));
    },
    [onUpdateSettings]
  );

  const handleResetTranspose = useCallback(() => {
    onUpdateSettings((prev) => ({
      ...prev,
      transposeSteps: 0,
      capoFret: recommendedCapo,
    }));
  }, [onUpdateSettings, recommendedCapo]);

  const handleCapoChange = useCallback(
    (delta: number) => {
      onUpdateSettings((prev) => {
        const newCapo = clamp(prev.capoFret + delta, MIN_CAPO, MAX_CAPO);
        if (newCapo === prev.capoFret) return prev;
        // Reactive capo: changing capo alters the written shapes inversely
        // so the sounding pitch stays put unless the player also transposes.
        return {
          ...prev,
          capoFret: newCapo,
          transposeSteps: clamp(prev.transposeSteps - delta, MIN_TRANSPOSE, MAX_TRANSPOSE),
        };
      });
    },
    [onUpdateSettings]
  );

  const handleFontSizeChange = useCallback(
    (delta: number) => {
      onUpdateSettings((prev) => {
        const currentIndex = FONT_SIZES.indexOf(prev.fontSize);
        const newIndex = clamp(currentIndex + delta, 0, FONT_SIZES.length - 1);
        return { ...prev, fontSize: FONT_SIZES[newIndex] };
      });
    },
    [onUpdateSettings]
  );

  const toggleAutoScroll = useCallback(() => {
    onUpdateSettings((prev) => ({ ...prev, isAutoScrolling: !prev.isAutoScrolling }));
  }, [onUpdateSettings]);

  const changeScrollSpeed = useCallback(
    (delta: number) => {
      onUpdateSettings((prev) => ({
        ...prev,
        autoScrollSpeed: clamp(prev.autoScrollSpeed + delta, 1, 5),
      }));
    },
    [onUpdateSettings]
  );

  const isModified = settings.transposeSteps !== 0 || settings.capoFret !== recommendedCapo;

  return {
    handleTranspose,
    handleResetTranspose,
    handleCapoChange,
    handleFontSizeChange,
    toggleAutoScroll,
    changeScrollSpeed,
    isModified,
  };
}
