const DATE_TIME = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const DATE = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' });

/** "18 sept 2026, 22:06", in the reviewer's own time zone. */
export function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : DATE_TIME.format(date);
}

export function formatDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : DATE.format(date);
}
