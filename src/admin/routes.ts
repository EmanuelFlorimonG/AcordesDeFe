import type { SongSubmissionStatus } from '../catalog/submission';

/**
 * The panel's routes, all under #/admin. The public app never links here
 * visibly; the team opens the address directly.
 */

export type AdminRoute =
  | { page: 'overview' }
  | { page: 'submissions'; status: SongSubmissionStatus | null }
  | { page: 'submission'; id: string }
  | { page: 'songs' }
  | { page: 'song'; id: string }
  | { page: 'not-found' };

export const ADMIN_HASH = '#/admin';

const STATUS_SLUGS: Record<string, SongSubmissionStatus> = {
  pendientes: 'pending',
  'cambios-solicitados': 'changes_requested',
  aprobadas: 'approved',
  rechazadas: 'rejected',
};

export const STATUS_SLUG: Record<SongSubmissionStatus, string> = {
  pending: 'pendientes',
  changes_requested: 'cambios-solicitados',
  approved: 'aprobadas',
  rejected: 'rechazadas',
};

export function isAdminHash(hash: string): boolean {
  return hash === ADMIN_HASH || hash.startsWith(`${ADMIN_HASH}/`);
}

export function parseAdminRoute(hash: string): AdminRoute {
  const path = hash.slice(ADMIN_HASH.length).replace(/\/+$/, '');
  if (path === '') return { page: 'overview' };
  const parts = path.split('/').slice(1).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
  if (parts[0] === 'propuestas' && parts.length <= 2) {
    if (parts.length === 1) return { page: 'submissions', status: null };
    const status = STATUS_SLUGS[parts[1]];
    return status ? { page: 'submissions', status } : { page: 'not-found' };
  }
  if (parts[0] === 'propuesta' && parts.length === 2 && parts[1]) return { page: 'submission', id: parts[1] };
  if (parts[0] === 'canciones' && parts.length === 1) return { page: 'songs' };
  if (parts[0] === 'cancion' && parts.length === 2 && parts[1]) return { page: 'song', id: parts[1] };
  return { page: 'not-found' };
}

export const adminHash = {
  overview: () => ADMIN_HASH,
  submissions: (status: SongSubmissionStatus | null = null) =>
    status ? `${ADMIN_HASH}/propuestas/${STATUS_SLUG[status]}` : `${ADMIN_HASH}/propuestas`,
  submission: (id: string) => `${ADMIN_HASH}/propuesta/${encodeURIComponent(id)}`,
  songs: () => `${ADMIN_HASH}/canciones`,
  song: (id: string) => `${ADMIN_HASH}/cancion/${encodeURIComponent(id)}`,
};

export type AdminSection = 'overview' | 'submissions' | 'songs';

/** Which item of the panel's navigation a route belongs to. */
export function sectionOf(route: AdminRoute): AdminSection | null {
  if (route.page === 'overview') return 'overview';
  if (route.page === 'submissions' || route.page === 'submission') return 'submissions';
  if (route.page === 'songs' || route.page === 'song') return 'songs';
  return null;
}
