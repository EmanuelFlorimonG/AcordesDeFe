import { useEffect } from 'react';
import type { SetlistArrangement } from '../types/setlist';
import { withReviewNeeded, type ArrangementBinding } from '../utils/arrangement';

/**
 * Writes down that a block of an arrangement needs someone to look at it, from
 * wherever the app first notices: the setlist, the song page, rehearsal, Mass.
 *
 * Only that. It adds the mark and never removes it (choosing a section is what
 * does that), it leaves the rest of the stored entry alone, and once the mark
 * is stored there is nothing left to write, so it settles after one write.
 */
export function useArrangementReview(
  binding: ArrangementBinding,
  stored: SetlistArrangement | undefined,
  remember: ((arrangement: SetlistArrangement) => void) | undefined
): void {
  useEffect(() => {
    if (!remember) return;
    const hardened = withReviewNeeded(stored, binding);
    if (hardened) remember(hardened);
  }, [binding, stored, remember]);
}
