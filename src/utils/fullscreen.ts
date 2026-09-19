/**
 * Full screen, when the browser has it.
 *
 * Wrapped like the wake lock: detected, never forced, and never able to break
 * anything. A browser that refuses (or an iPhone, where the API isn't there)
 * simply keeps mass mode as it is.
 */

export interface FullscreenElementLike {
  requestFullscreen?: () => Promise<void>;
}

export interface FullscreenDocumentLike {
  fullscreenElement?: Element | null;
  exitFullscreen?: () => Promise<void>;
  documentElement?: FullscreenElementLike;
}

export function isFullscreenSupported(doc: FullscreenDocumentLike | null | undefined): boolean {
  return Boolean(doc?.documentElement?.requestFullscreen && doc?.exitFullscreen);
}

export function isFullscreen(doc: FullscreenDocumentLike | null | undefined): boolean {
  return Boolean(doc?.fullscreenElement);
}

/** Enters or leaves full screen; returns what actually happened. */
export async function toggleFullscreen(
  doc: FullscreenDocumentLike | null | undefined
): Promise<boolean> {
  if (!doc || !isFullscreenSupported(doc)) return false;
  try {
    if (isFullscreen(doc)) {
      await doc.exitFullscreen?.();
      return false;
    }
    await doc.documentElement?.requestFullscreen?.();
    return true;
  } catch {
    return isFullscreen(doc);
  }
}
