import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { loadTurnstile, type TurnstileApi } from '../../lib/turnstile';

interface HumanCheckProps {
  siteKey: string;
  /** Must match what the Edge Function expects */
  action: string;
  /** A fresh token, or null while there is none (not solved yet, expired, or used) */
  onToken: (token: string | null) => void;
  /** Changing it asks Cloudflare for a new token: each token works for one attempt only */
  resetSignal: number;
}

type CheckState = 'loading' | 'waiting' | 'done' | 'failed';

const MESSAGES: Record<CheckState, string> = {
  loading: 'Cargando la verificación de seguridad…',
  waiting: 'Comprobando que eres una persona. Si aparece una casilla, márcala.',
  done: 'Verificación completada.',
  failed: 'No se pudo cargar la verificación de seguridad. Revisa tu conexión y vuelve a intentarlo.',
};

/**
 * Cloudflare Turnstile, rendered explicitly inside the send dialog. It only
 * produces a token; whether it is valid is decided by the Edge Function with
 * Cloudflare, never here.
 */
export const HumanCheck: React.FC<HumanCheckProps> = ({ siteKey, action, onToken, resetSignal }) => {
  const container = useRef<HTMLDivElement | null>(null);
  const widget = useRef<{ api: TurnstileApi; id: string } | null>(null);
  const onTokenRef = useRef(onToken);
  const [state, setState] = useState<CheckState>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let cancelled = false;
    loadTurnstile().then(
      (api) => {
        if (cancelled || !container.current) return;
        const fail = () => {
          onTokenRef.current(null);
          setState('failed');
        };
        const id = api.render(container.current, {
          sitekey: siteKey,
          action,
          language: 'es',
          size: 'flexible',
          theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
          callback: (token) => {
            onTokenRef.current(token);
            setState('done');
          },
          'expired-callback': () => {
            onTokenRef.current(null);
            setState('waiting');
          },
          'timeout-callback': () => {
            onTokenRef.current(null);
            setState('waiting');
          },
          'error-callback': () => {
            fail();
            return true;
          },
        });
        if (id === undefined) return fail();
        widget.current = { api, id };
        setState('waiting');
      },
      () => {
        if (!cancelled) setState('failed');
      }
    );
    return () => {
      cancelled = true;
      if (widget.current) {
        widget.current.api.remove(widget.current.id);
        widget.current = null;
      }
    };
  }, [siteKey, action, attempt]);

  // After each attempt the used token is dropped and Cloudflare issues a new one.
  const firstSignal = useRef(resetSignal);
  useEffect(() => {
    if (resetSignal === firstSignal.current || !widget.current) return;
    firstSignal.current = resetSignal;
    onTokenRef.current(null);
    widget.current.api.reset(widget.current.id);
  }, [resetSignal]);

  return (
    <div>
      <div ref={container} className="min-h-[65px]" />
      <div className="mt-1.5 flex items-start justify-between gap-3">
        <p
          aria-live="polite"
          className={`text-xs ${state === 'failed' ? 'font-semibold text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}
        >
          {MESSAGES[state]}
        </p>
        {state === 'failed' && (
          <button
            type="button"
            onClick={() => {
              setState('loading');
              setAttempt((value) => value + 1);
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[#2464ED] dark:text-sky-400 hover:bg-[#EAF1FF] dark:hover:bg-blue-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
          >
            <RotateCcw aria-hidden="true" className="w-3.5 h-3.5" />
            Reintentar
          </button>
        )}
      </div>
    </div>
  );
};
