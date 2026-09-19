/**
 * The video id of a song, from whatever someone pastes: the id itself or a
 * YouTube link. Nothing is searched and nothing is played: an id is only read
 * out of a link from a known YouTube address, or null.
 */

const ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtube-nocookie.com', 'youtube-nocookie.com']);

export function parseYouTubeId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (ID.test(value)) return value;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (!HOSTS.has(url.hostname.toLowerCase())) return null;

  const candidate =
    url.hostname.toLowerCase() === 'youtu.be'
      ? url.pathname.split('/')[1]
      : url.pathname === '/watch'
        ? url.searchParams.get('v')
        : url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/)?.[1];
  return candidate && ID.test(candidate) ? candidate : null;
}
