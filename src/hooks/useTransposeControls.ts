import { useCallback } from 'react';
import type { ViewSettings } from '../types/song';
import { moveCapoBy, transposeBy } from '../utils/keySettings';

const FONT_SIZES: Array<'sm' | 'base' | 'lg' | 'xl'> = ['sm', 'base', 'lg', 'xl'];

export function useTransposeControls(
  settings: ViewSettings,
  onUpdateSettings: React.Dispatch<React.SetStateAction<ViewSettings>>,
  recommendedCapo: number
) {
  const handleTranspose = useCallback(
    (delta: number) => {
      onUpdateSettings((prev) => {
        const next = transposeBy(prev, delta);
        return next === prev ? prev : { ...prev, ...next };
      });
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
      // Reactive capo: see moveCapoBy.
      onUpdateSettings((prev) => {
        const next = moveCapoBy(prev, delta);
        return next === prev ? prev : { ...prev, ...next };
      });
    },
    [onUpdateSettings]
  );

  const handleFontSizeChange = useCallback(
    (delta: number) => {
      onUpdateSettings((prev) => {
        const currentIndex = FONT_SIZES.indexOf(prev.fontSize);
        const newIndex = Math.max(0, Math.min(FONT_SIZES.length - 1, currentIndex + delta));
        return { ...prev, fontSize: FONT_SIZES[newIndex] };
      });
    },
    [onUpdateSettings]
  );

  const isModified = settings.transposeSteps !== 0 || settings.capoFret !== recommendedCapo;

  return {
    handleTranspose,
    handleResetTranspose,
    handleCapoChange,
    handleFontSizeChange,
    isModified,
  };
}
