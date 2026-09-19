import type { SongSubmissionPayload, SubmissionReceipt } from '../catalog/submission';
import { SubmissionError, type SongSubmissionRepository } from '../catalog/submissionRepository';
import type { SongDraftStore } from './draftStorage';
import type { MySubmissionsStore } from './mySubmissions';

/**
 * Sending a proposal, once.
 *
 * A second click while the first send is on its way gets the same answer
 * instead of a second request. After an error nothing local is touched: the
 * draft stays, with the retry identity it was sent with, so trying again is
 * safe. Only a confirmed send clears the draft, and only after the tracking
 * code has been kept.
 */

export interface Submitter {
  submit(payload: SongSubmissionPayload, humanCheck?: string): Promise<SubmissionReceipt>;
  isBusy(): boolean;
}

export function createSubmitter(repository: SongSubmissionRepository): Submitter {
  let inFlight: Promise<SubmissionReceipt> | null = null;
  return {
    isBusy: () => inFlight !== null,
    submit(payload, humanCheck) {
      if (!inFlight) {
        inFlight = repository.submit(payload, { humanCheck }).finally(() => {
          inFlight = null;
        });
      }
      return inFlight;
    },
  };
}

export type SendOutcome = { ok: true; receipt: SubmissionReceipt } | { ok: false; error: SubmissionError };

export async function sendDraft({
  submitter,
  payload,
  drafts,
  draftKey,
  mine,
  title,
  humanCheck,
  now = () => new Date(),
}: {
  submitter: Submitter;
  payload: SongSubmissionPayload;
  /** The Turnstile token of this attempt */
  humanCheck?: string;
  drafts: SongDraftStore;
  draftKey: string;
  mine: MySubmissionsStore;
  title: string;
  now?: () => Date;
}): Promise<SendOutcome> {
  try {
    const receipt = await submitter.submit(payload, humanCheck);
    mine.add({ trackingCode: receipt.trackingCode, title, submittedAt: now().toISOString(), editToken: receipt.editToken });
    drafts.remove(draftKey);
    return { ok: true, receipt };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof SubmissionError ? error : new SubmissionError('unavailable', 'No se pudo enviar la propuesta. Inténtalo más tarde.'),
    };
  }
}
