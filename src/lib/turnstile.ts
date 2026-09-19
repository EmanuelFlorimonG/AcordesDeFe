/// <reference types="vite/client" />

/**
 * Cloudflare Turnstile: the human check before a proposal is sent.
 *
 * The site key is public (it identifies the widget, like the Supabase
 * publishable key). The secret key lives only in Supabase, where the Edge
 * Function `submit-song` checks every token with Cloudflare; nothing here can
 * decide that a visitor passed.
 *
 * Cloudflare's script is loaded only when the send dialog opens, never with
 * the app: visitors who only read songs never download it.
 */

export interface TurnstileRenderOptions {
  sitekey: string;
  action?: string;
  theme?: 'light' | 'dark' | 'auto';
  language?: string;
  size?: 'normal' | 'flexible' | 'compact';
  appearance?: 'always' | 'execute' | 'interaction-only';
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  'timeout-callback'?: () => void;
  'error-callback'?: (code: string) => boolean | void;
}

export interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string | undefined;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** The site key of this build, or null when Turnstile isn't configured (sending is then unavailable). */
export function readTurnstileSiteKey(value: string | undefined): string | null {
  const key = (value ?? '').trim();
  return /^[0-9]x[0-9A-Za-z_-]{10,}$/.test(key) ? key : null;
}

export function getTurnstileSiteKey(): string | null {
  return readTurnstileSiteKey(import.meta.env.VITE_TURNSTILE_SITE_KEY);
}

let loading: Promise<TurnstileApi> | null = null;

/** Loads Cloudflare's script once; later calls share the same promise. A failed load can be retried. */
export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')));
    script.onerror = () => {
      script.remove();
      reject(new Error('turnstile'));
    };
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}
