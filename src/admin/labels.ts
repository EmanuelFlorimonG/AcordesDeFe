import type { EditorialRole } from '../catalog/reviewContract';
import { SUBMISSION_STATUS_LABELS, type SongSubmissionStatus, type SongSubmissionType } from '../catalog/submission';

/** For the team, "pending" reads as what it asks of them. The public labels stay as they are. */
export const ADMIN_STATUS_LABELS: Record<SongSubmissionStatus, string> = {
  ...SUBMISSION_STATUS_LABELS,
  pending: 'Pendiente',
};

export const TYPE_LABELS: Record<SongSubmissionType, string> = { create: 'Nueva canción', update: 'Corrección' };

export const ROLE_LABELS: Record<EditorialRole, string> = { admin: 'Administrador', reviewer: 'Revisor' };
