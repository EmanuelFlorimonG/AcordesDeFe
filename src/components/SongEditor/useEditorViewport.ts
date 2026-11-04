import { useEffect, useState } from 'react';

export interface EditorViewport { mobile: boolean; bottom: number; height: number }
export function editorViewportMetrics(layoutHeight: number, height = layoutHeight, offsetTop = 0) {
  return { bottom: Math.max(0, layoutHeight - height - offsetTop), height: Math.max(0, height) };
}

/** The visible viewport shrinks above an iOS keyboard; do not guess keyboard heights. */
export function useEditorViewport(): EditorViewport {
  const [viewport, setViewport] = useState<EditorViewport>({ mobile: false, bottom: 0, height: 0 });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(max-width: 767px), (pointer: coarse) and (max-height: 500px)');
    const visible = window.visualViewport;
    const update = () => setViewport({ mobile: media.matches, ...editorViewportMetrics(window.innerHeight, visible?.height, visible?.offsetTop) });
    update();
    media.addEventListener('change', update);
    window.addEventListener('resize', update);
    visible?.addEventListener('resize', update);
    visible?.addEventListener('scroll', update);
    return () => {
      media.removeEventListener('change', update);
      window.removeEventListener('resize', update);
      visible?.removeEventListener('resize', update);
      visible?.removeEventListener('scroll', update);
    };
  }, []);
  return viewport;
}
