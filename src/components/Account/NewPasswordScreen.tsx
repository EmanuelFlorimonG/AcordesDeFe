import React, { useEffect, useId, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { AUTH_MESSAGES, checkNewPassword, type AuthFailure } from '../../auth/session';
import { clearRecovery, recoveryLink, recoveryProblem } from '../../auth/recovery';
import { useAuthServices } from '../../auth/useSession';
import { fieldLabel, primaryButton, secondaryButton, textField } from '../Setlists/ui';

interface NewPasswordScreenProps {
  onDone: () => void;
}

type State = 'opening' | 'ready' | 'saved' | { failed: AuthFailure };

/**
 * Setting a new password, after the link from the mail.
 *
 * The link arrives with Supabase's own answer in the fragment, which
 * src/auth/recovery.ts read and cleared before anything else; what it found
 * is handed to Supabase here, through setSession, and the address bar has
 * been showing a route of ours since the first instant.
 */
export const NewPasswordScreen: React.FC<NewPasswordScreenProps> = ({ onDone }) => {
  const { services, absent } = useAuthServices(true);
  const [state, setState] = useState<State>('opening');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [reveal, setReveal] = useState(false);
  const [problems, setProblems] = useState<{ password?: string; repeat?: string }>({});
  const [busy, setBusy] = useState(false);
  const ids = { password: useId(), repeat: useId() };

  // The link is used as soon as there is something to use it with, and only
  // then is it dropped: nothing of it is stored, and nothing is decided
  // during the render.
  useEffect(() => {
    if (state !== 'opening') return;
    let cancelled = false;
    const decide = async (): Promise<State> => {
      const problem = recoveryProblem();
      if (problem) return { failed: problem };
      if (absent) return { failed: 'unavailable' };
      if (!services) return 'opening';
      const link = recoveryLink();
      // Already used, or the tab was reloaded: ask for another mail.
      if (!link) return { failed: 'expired-link' };
      const result = await services.auth.useRecoveryLink(link);
      if (result.ok) clearRecovery();
      return result.ok ? 'ready' : { failed: result.reason };
    };
    void decide().then((next) => {
      if (!cancelled && next !== 'opening') setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [services, absent, state]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !services) return;
    const found = checkNewPassword(password, repeat);
    setProblems(found);
    if (found.password || found.repeat) return;
    setBusy(true);
    const result = await services.auth.updatePassword(password);
    setBusy(false);
    setPassword('');
    setRepeat('');
    setState(result.ok ? 'saved' : { failed: result.reason });
  };

  const passwordField = (key: 'password' | 'repeat', label: string, value: string, onChange: (value: string) => void) => (
    <div>
      <label htmlFor={ids[key]} className={fieldLabel}>
        {label}
      </label>
      <div className="relative">
        <input
          id={ids[key]}
          type={reveal ? 'text' : 'password'}
          value={value}
          autoComplete="new-password"
          disabled={busy}
          aria-invalid={Boolean(problems[key])}
          aria-describedby={problems[key] ? `${ids[key]}-error` : undefined}
          onChange={(event) => onChange(event.target.value)}
          className={`${textField} pr-12`}
        />
        <button
          type="button"
          onClick={() => setReveal((value) => !value)}
          aria-label={reveal ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
          className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          {reveal ? <EyeOff aria-hidden="true" className="h-[18px] w-[18px]" /> : <Eye aria-hidden="true" className="h-[18px] w-[18px]" />}
        </button>
      </div>
      {problems[key] && (
        <p id={`${ids[key]}-error`} role="alert" className="mt-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
          {problems[key]}
        </p>
      )}
    </div>
  );

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 p-6 shadow-sm">
        {state === 'opening' && (
          <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <LoaderCircle aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />
            Abriendo el enlace…
          </p>
        )}

        {state === 'saved' && (
          <>
            <h1 className="text-xl font-extrabold tracking-tight text-[#10203A] dark:text-white">Contraseña actualizada</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Ya puedes seguir usando tu cuenta con la contraseña nueva.</p>
            <button type="button" onClick={onDone} className={`${primaryButton} mt-5 w-full`}>
              Ir al cancionero
            </button>
          </>
        )}

        {typeof state === 'object' && (
          <>
            <h1 className="text-xl font-extrabold tracking-tight text-[#10203A] dark:text-white">No se pudo abrir el enlace</h1>
            <p role="alert" className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {AUTH_MESSAGES[state.failed]}
            </p>
            <button type="button" onClick={onDone} className={`${secondaryButton} mt-5 w-full`}>
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              Volver al cancionero
            </button>
          </>
        )}

        {state === 'ready' && (
          <form onSubmit={save} noValidate className="space-y-4">
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-[#10203A] dark:text-white">Nueva contraseña</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Escríbela dos veces y la guardamos.</p>
            </div>
            {passwordField('password', 'Nueva contraseña', password, setPassword)}
            {passwordField('repeat', 'Repite la contraseña', repeat, setRepeat)}
            <button type="submit" disabled={busy} className={`${primaryButton} w-full`}>
              {busy && <LoaderCircle aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />}
              Guardar contraseña
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
