import React, { useId, useState } from 'react';
import { Eye, EyeOff, LoaderCircle, LogOut, MailCheck, ShieldCheck } from 'lucide-react';
import {
  AUTH_MESSAGES,
  checkEmailOnly,
  checkSignInForm,
  checkSignUpForm,
  initialOf,
  nameOf,
  type AppSession,
} from '../../auth/session';
import { useAuthServices } from '../../auth/useSession';
import { Dialog } from '../Setlists/Dialog';
import { fieldLabel, primaryButton, secondaryButton, textField } from '../Setlists/ui';

interface AccountDialogProps {
  /** The session there is, or null while nobody is signed in */
  session: AppSession | null;
  /** Whether the database granted this identity an editorial role */
  editorial: boolean;
  onOpenAdmin: () => void;
  onClose: () => void;
}

type Step = 'sign-in' | 'sign-up' | 'confirm' | 'forgot' | 'sent';

/**
 * The account of Acordes de Fe, in one window.
 *
 * An account is optional and adds nothing to what the songbook already does;
 * it will be what lets setlists travel between devices. So this is small on
 * purpose: a name, an address, a password, and a way back in. Nothing here
 * decides what anyone may do — the editorial panel appears only because the
 * database said this identity has a role.
 */
export const AccountDialog: React.FC<AccountDialogProps> = ({ session, editorial, onOpenAdmin, onClose }) => {
  const { services, absent } = useAuthServices(true);
  const [step, setStep] = useState<Step>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [reveal, setReveal] = useState(false);
  const [problems, setProblems] = useState<Partial<Record<'name' | 'email' | 'password' | 'repeat', string>>>({});
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const ids = { name: useId(), email: useId(), password: useId(), repeat: useId(), error: useId() };

  const forget = () => {
    setPassword('');
    setRepeat('');
  };

  const run = async (action: () => Promise<{ ok: true } | { ok: false; reason: keyof typeof AUTH_MESSAGES }>) => {
    if (!services) {
      setError('No hay conexión con el servidor.');
      return null;
    }
    setBusy(true);
    setError('');
    setNote('');
    const result = await action();
    setBusy(false);
    if (!result.ok) setError(AUTH_MESSAGES[result.reason]);
    return result;
  };

  const submit = async () => {
    if (busy || !services) return;
    if (step === 'sign-in') {
      const found = checkSignInForm(email, password);
      setProblems(found);
      if (found.email || found.password) return;
      const result = await run(() => services.auth.signIn(email, password));
      // The session listener closes this window; the password leaves memory either way.
      if (result?.ok) {
        forget();
        onClose();
      }
      return;
    }
    if (step === 'sign-up') {
      const found = checkSignUpForm(name, email, password, repeat);
      setProblems({ ...found });
      if (Object.values(found).some(Boolean)) return;
      const result = await run(() => services.auth.signUp(name, email, password));
      if (result?.ok) {
        forget();
        // With confirmation on, there is no session yet: the mail has to be opened.
        setStep('confirm');
      }
      return;
    }
    if (step === 'forgot') {
      const found = checkEmailOnly(email);
      setProblems(found);
      if (found.email) return;
      const result = await run(() => services.auth.sendPasswordReset(email));
      if (result?.ok) setStep('sent');
    }
  };

  const goTo = (next: Step) => {
    setStep(next);
    setProblems({});
    setError('');
    setNote('');
  };

  const field = (
    key: 'name' | 'email' | 'password' | 'repeat',
    label: string,
    input: React.ReactNode
  ) => (
    <div>
      <label htmlFor={ids[key]} className={fieldLabel}>
        {label}
      </label>
      {input}
      {problems[key] && (
        <p id={`${ids[key]}-error`} role="alert" className="mt-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
          {problems[key]}
        </p>
      )}
    </div>
  );

  const textInput = (key: 'name' | 'email' | 'password' | 'repeat', props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      id={ids[key]}
      disabled={busy}
      aria-invalid={Boolean(problems[key])}
      aria-describedby={problems[key] ? `${ids[key]}-error` : undefined}
      className={textField}
      {...props}
    />
  );

  const passwordInput = (key: 'password' | 'repeat', value: string, onChange: (value: string) => void, autoComplete: string) => (
    <div className="relative">
      {textInput(key, {
        type: reveal ? 'text' : 'password',
        value,
        autoComplete,
        onChange: (event) => onChange(event.target.value),
        className: `${textField} pr-12`,
      })}
      <button
        type="button"
        onClick={() => setReveal((value) => !value)}
        aria-label={reveal ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
        className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
      >
        {reveal ? <EyeOff aria-hidden="true" className="h-[18px] w-[18px]" /> : <Eye aria-hidden="true" className="h-[18px] w-[18px]" />}
      </button>
    </div>
  );

  const message = error && (
    <p id={ids.error} role="alert" className="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-700 dark:text-red-300">
      {error}
    </p>
  );
  const kindly = note && (
    <p role="status" className="rounded-lg bg-[#EAF1FF] dark:bg-blue-500/10 px-3 py-2 text-sm font-semibold text-[#1D56D6] dark:text-sky-300">
      {note}
    </p>
  );

  // --- Signed in: the account itself ------------------------------------------------
  if (session) {
    return (
      <Dialog title="Tu cuenta" size="sm" onClose={onClose}>
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#EAF1FF] dark:bg-blue-500/15 text-lg font-bold text-[#1D56D6] dark:text-sky-300"
          >
            {initialOf(session)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-[#10203A] dark:text-white">{nameOf(session)}</p>
            {session.email && <p className="truncate text-sm text-slate-500 dark:text-slate-400">{session.email}</p>}
          </div>
        </div>

        {!session.emailConfirmed && (
          <p className="mt-4 rounded-lg bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            Tu correo todavía está sin confirmar. Abre el enlace que te enviamos.
          </p>
        )}

        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          Tu cuenta servirá para llevar tus setlists de un dispositivo a otro. Todavía no está activo: por ahora se guardan en este
          dispositivo, como siempre.
        </p>

        <div className="mt-5 space-y-2">
          {editorial && (
            <button type="button" onClick={onOpenAdmin} className={`${secondaryButton} w-full`}>
              <ShieldCheck aria-hidden="true" className="h-4 w-4" />
              Panel editorial
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await services?.auth.signOut();
              setBusy(false);
              onClose();
            }}
            className={`${secondaryButton} w-full`}
          >
            <LogOut aria-hidden="true" className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </Dialog>
    );
  }

  // --- After signing up, or after asking for a new password -------------------------
  if (step === 'confirm' || step === 'sent') {
    const isNew = step === 'confirm';
    return (
      <Dialog title={isNew ? 'Revisa tu correo' : 'Te enviamos un enlace'} size="sm" onClose={onClose}>
        <MailCheck aria-hidden="true" className="h-8 w-8 text-[#2464ED] dark:text-sky-400" />
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          {isNew
            ? 'Te enviamos un mensaje a '
            : 'Si hay una cuenta con ese correo, recibirás un enlace para poner una contraseña nueva en '}
          <span className="font-semibold text-[#10203A] dark:text-white">{email}</span>
          {isNew ? '. Abre el enlace para confirmar tu cuenta y ya podrás entrar.' : '.'}
        </p>
        {kindly}
        {message}
        <div className="mt-5 space-y-2">
          {isNew && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const result = await run(() => services!.auth.resendConfirmation(email));
                if (result?.ok) setNote('Te lo enviamos otra vez.');
              }}
              className={`${secondaryButton} w-full`}
            >
              {busy ? <LoaderCircle aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" /> : null}
              Reenviar correo
            </button>
          )}
          <button type="button" onClick={() => goTo('sign-in')} className={`${primaryButton} w-full`}>
            Volver a iniciar sesión
          </button>
        </div>
      </Dialog>
    );
  }

  // --- Signed out: the forms --------------------------------------------------------
  const titles: Record<Step, string> = {
    'sign-in': 'Entrar en tu cuenta',
    'sign-up': 'Crear tu cuenta',
    forgot: '¿Olvidaste tu contraseña?',
    confirm: '',
    sent: '',
  };

  return (
    <Dialog
      title={titles[step]}
      description={
        step === 'sign-up'
          ? 'Tu cuenta de Acordes de Fe. Sirve para llevarte tus setlists; el cancionero funciona igual sin ella.'
          : step === 'forgot'
            ? 'Escribe tu correo y te enviamos un enlace para poner una contraseña nueva.'
            : undefined
      }
      size="sm"
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancelar
          </button>
          <button type="submit" disabled={busy || absent} className={primaryButton}>
            {busy && <LoaderCircle aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />}
            {step === 'sign-in' ? 'Entrar' : step === 'sign-up' ? 'Crear cuenta' : 'Enviar enlace'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {absent && (
          <p role="alert" className="rounded-lg bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            Esta versión de la aplicación no está conectada al servidor, así que todavía no admite cuentas.
          </p>
        )}

        {step === 'sign-up' &&
          field(
            'name',
            'Tu nombre',
            textInput('name', {
              type: 'text',
              value: name,
              autoComplete: 'name',
              maxLength: 60,
              placeholder: 'Juan',
              onChange: (event) => setName(event.target.value),
            })
          )}

        {field(
          'email',
          'Correo',
          textInput('email', {
            type: 'email',
            value: email,
            autoComplete: 'username',
            inputMode: 'email',
            autoCapitalize: 'none',
            spellCheck: false,
            onChange: (event) => setEmail(event.target.value),
          })
        )}

        {step !== 'forgot' &&
          field(
            'password',
            'Contraseña',
            passwordInput('password', password, setPassword, step === 'sign-up' ? 'new-password' : 'current-password')
          )}

        {step === 'sign-up' && field('repeat', 'Repite la contraseña', passwordInput('repeat', repeat, setRepeat, 'new-password'))}

        {message}

        <div className="flex flex-wrap items-center justify-between gap-1 text-sm">
          {step === 'sign-in' ? (
            <>
              <button type="button" onClick={() => goTo('sign-up')} className={accountLink}>
                Crear una cuenta
              </button>
              <button type="button" onClick={() => goTo('forgot')} className={`${accountLink} text-slate-500 dark:text-slate-400`}>
                ¿Olvidaste tu contraseña?
              </button>
            </>
          ) : (
            <button type="button" onClick={() => goTo('sign-in')} className={accountLink}>
              Ya tengo cuenta
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
};

/** A link inside the window, with room enough for a thumb. */
const accountLink =
  'inline-flex min-h-[44px] items-center rounded-lg px-1 font-semibold text-[#2464ED] dark:text-sky-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40';
