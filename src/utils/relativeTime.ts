const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "hace un momento", "hace 5 min", "hace 2 h", "ayer", "hace 3 días", "12 sep" */
export function formatRelativeTime(timestamp: number, now: number): string {
  const elapsed = Math.max(0, now - timestamp);
  if (elapsed < MINUTE) return 'hace un momento';
  if (elapsed < HOUR) return `hace ${Math.floor(elapsed / MINUTE)} min`;

  const then = new Date(timestamp);
  const today = new Date(now);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (timestamp >= startOfToday) return `hace ${Math.floor(elapsed / HOUR)} h`;
  if (timestamp >= startOfToday - DAY) return 'ayer';

  const days = Math.ceil((startOfToday - timestamp) / DAY);
  if (days < 7) return `hace ${days} días`;

  return new Intl.DateTimeFormat('es', {
    day: 'numeric',
    month: 'short',
    ...(then.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
  })
    .format(then)
    .replace('.', '');
}
