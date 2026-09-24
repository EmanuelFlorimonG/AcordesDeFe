import React, { useId, useState } from 'react';
import { Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { SIGN_IN_MESSAGES, checkSignInForm, type AppAuth } from '../../auth/session';
import { fieldLabel, primaryButton, textField } from '../Setlists/ui';
import { AdminCentered } from './AdminCentered';

interface AdminLoginProps {
  auth: AppAuth;
}

/**
 * The only sign-in of GENESARET, for the editorial team. No registration, no
 * "forgot password" flow that would need public mail settings: accounts are
 * created by the project owner in Supabase.
 */
export const AdminLogin: React.FC<AdminLoginProps> = ({ auth }) => {
  const ids = { email: useId(), password: useId(), emailError: useId(), passwordError: useId(), error: useId() };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [problems, setProblems] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const found = checkSignInForm(email, password);
    setProblems(found);
    setError('');
    if (found.email || found.password) return;
    setBusy(true);
    const result = await auth.signIn(email, password);
    setBusy(false);
    // On success the session listener opens the panel; the password leaves this component's state.
    if (result.ok) setPassword('');
    else setError(SIGN_IN_MESSAGES[result.reason]);
  };

  return (
    <AdminCentered>
      <h1 className="text-xl font-extrabold tracking-tight text-[#10203A] dark:text-white">Administración</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Acceso exclusivo para el equipo editorial.</p>
      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        <div>
          <label htmlFor={ids.email} className={fieldLabel}>
            Correo
          </label>
          <input
            id={ids.email}
            type="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy}
            aria-invalid={Boolean(problems.email)}
            aria-describedby={problems.email ? ids.emailError : undefined}
            className={textField}
          />
          {problems.email && (
            <p id={ids.emailError} className="mt-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
              {problems.email}
            </p>
          )}
        </div>
        <div>
          <label htmlFor={ids.password} className={fieldLabel}>
            Contraseña
          </label>
          <div className="relative">
            <input
              id={ids.password}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busy}
              aria-invalid={Boolean(problems.password)}
              aria-describedby={problems.password ? ids.passwordError : undefined}
              className={`${textField} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
            >
              {showPassword ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
            </button>
          </div>
          {problems.password && (
            <p id={ids.passwordError} className="mt-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
              {problems.password}
            </p>
          )}
        </div>
        {error && (
          <p id={ids.error} role="alert" className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className={`${primaryButton} w-full`}>
          {busy && <LoaderCircle aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />}
          {busy ? 'Entrando…' : 'Iniciar sesión'}
        </button>
      </form>
    </AdminCentered>
  );
};
