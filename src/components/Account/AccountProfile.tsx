import React, { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, Eye, EyeOff, LoaderCircle, LockKeyhole, LogOut, ShieldCheck } from 'lucide-react';
import { AUTH_MESSAGES, checkDisplayName, checkNewPassword, initialOf, nameOf, type AppAuth, type AppSession, type AuthResult } from '../../auth/session';
import type { AvatarService } from '../../auth/avatars';
import { Avatar } from './Avatar';
import { AvatarEditor } from './AvatarEditor';
import { Dialog } from '../Setlists/Dialog';
import { fieldLabel, primaryButton, secondaryButton, textField } from '../Setlists/ui';

type ProfileAuth = Pick<AppAuth, 'updateDisplayName' | 'updatePassword' | 'signOut'>;
interface Props {
  session: AppSession;
  avatarUrl?: string | null;
  avatars?: AvatarService | null;
  auth: ProfileAuth | null;
  editorial: boolean;
  onOpenAdmin: () => void;
  onClose: () => void;
}

/** The signed-in account, using the same Auth and dialog as signing in. */
export function AccountProfile({ session, avatarUrl, avatars = null, auth, editorial, onOpenAdmin, onClose }: Props) {
  const [screen, setScreen] = useState<'profile' | 'password'>('profile');
  const [savedName, setSavedName] = useState(session.displayName);
  const [name, setName] = useState(session.displayName ?? '');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [reveal, setReveal] = useState(false);
  const [authBusy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const busy = authBusy || avatarBusy;
  const pending = useRef(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [problems, setProblems] = useState<{ name?: string; password?: string; repeat?: string }>({});
  const id = useId();
  const nameInput = useRef<HTMLInputElement>(null);
  const newPasswordInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    (screen === 'password' ? newPasswordInput.current : nameInput.current)?.focus();
  }, [screen]);
  const [remoteName, setRemoteName] = useState(session.displayName);
  if (remoteName !== session.displayName) {
    setRemoteName(session.displayName);
    setSavedName(session.displayName);
    setName(session.displayName ?? '');
  }
  const identity = { ...session, displayName: savedName };
  const changed = name.trim() !== (savedName ?? '');
  const move = (next: 'profile' | 'password') => {
    if (pending.current || avatarBusy) return;
    setScreen(next); setPassword(''); setRepeat(''); setReveal(false);
    setError(''); setNote(''); setProblems({});
  };
  const run = async (action: () => Promise<AuthResult>, success: () => void) => {
    if (pending.current || avatarBusy) return;
    if (!auth) { setError('No hay conexión con el servidor.'); return; }
    pending.current = true; setBusy(true); setError(''); setNote('');
    try {
      const result = await action();
      if (result.ok) success();
      else setError(AUTH_MESSAGES[result.reason]);
    } catch {
      setError('No se pudo completar la operación. Inténtalo otra vez.');
    } finally { pending.current = false; setBusy(false); }
  };
  const saveName = async () => {
    if (pending.current || avatarBusy) return;
    const problem = checkDisplayName(name);
    setProblems(problem ? { name: problem } : {});
    if (problem || !changed) return;
    const clean = name.trim();
    await run(() => auth!.updateDisplayName(clean), () => {
      setSavedName(clean); setName(clean); setNote('Nombre actualizado');
    });
  };
  const savePassword = async () => {
    if (pending.current || avatarBusy) return;
    const found = checkNewPassword(password, repeat);
    setProblems(found);
    if (Object.values(found).some(Boolean)) return;
    await run(() => auth!.updatePassword(password), () => {
      setPassword(''); setRepeat(''); setReveal(false); setScreen('profile');
      setProblems({}); setNote('Contraseña actualizada');
    });
  };
  const feedback = <>
    {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}
    {note && <p role="status" className="mt-3 text-sm font-semibold text-emerald-700 dark:text-emerald-400">{note}</p>}
  </>;
  const passwordField = (key: 'password' | 'repeat', label: string, value: string, set: (value: string) => void) => (
    <div>
      <label className={fieldLabel} htmlFor={`${id}-${key}`}>{label}</label>
      <div className="relative">
        <input ref={key === 'password' ? newPasswordInput : undefined} id={`${id}-${key}`} type={reveal ? 'text' : 'password'} autoComplete="new-password" value={value}
          onChange={e => set(e.target.value)} disabled={busy} aria-invalid={Boolean(problems[key])}
          aria-describedby={problems[key] ? `${id}-${key}-error` : undefined} className={`${textField} min-h-11 pr-12`} />
        <button type="button" disabled={busy} onClick={() => setReveal(v => !v)}
          aria-label={`${reveal ? 'Ocultar' : 'Mostrar'} ${key === 'password' ? 'nueva contraseña' : 'confirmación de contraseña'}`}
          className="absolute right-0 top-0 w-11 h-11 flex items-center justify-center rounded-lg text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40">
          {reveal ? <EyeOff aria-hidden="true" className="w-4 h-4" /> : <Eye aria-hidden="true" className="w-4 h-4" />}
        </button>
      </div>
      {problems[key] && <p id={`${id}-${key}-error`} role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{problems[key]}</p>}
    </div>
  );
  const heading = 'text-sm font-bold text-[#10203A] dark:text-white border-b border-slate-100 dark:border-dark-800 pb-2 mb-3';
  return (
    <Dialog title={screen === 'profile' ? 'Mi cuenta' : 'Cambiar contraseña'} size="sm" onClose={onClose}>
      {screen === 'password' ? <>
        <button type="button" disabled={busy} onClick={() => move('profile')} className={`${secondaryButton} min-h-11 mb-4`}>
          <ArrowLeft aria-hidden="true" className="w-4 h-4" />Volver a Mi cuenta
        </button>
        <form onSubmit={e => { e.preventDefault(); void savePassword(); }} className="space-y-4">
          {passwordField('password', 'Nueva contraseña', password, setPassword)}
          {passwordField('repeat', 'Confirmar contraseña', repeat, setRepeat)}
          {feedback}
          <button type="submit" disabled={busy || !auth} className={`${primaryButton} min-h-11 w-full`}>
            {busy && <LoaderCircle aria-hidden="true" className="w-4 h-4 animate-spin motion-reduce:animate-none" />}
            {busy ? 'Actualizando…' : 'Actualizar contraseña'}
          </button>
        </form>
      </> : <>
        <div className="flex flex-col items-center text-center mb-5">
          <AvatarEditor avatar={<span aria-hidden="true" className="w-16 h-16 mx-auto mb-2 rounded-full bg-[#EAF1FF] dark:bg-blue-500/15 text-[#2464ED] dark:text-sky-300 flex items-center justify-center text-2xl font-bold"><Avatar url={avatarUrl} initial={initialOf(identity)} /></span>} key={session.userId} userId={session.userId} hasPhoto={Boolean(session.avatarPath)} service={avatars} disabled={authBusy} onBusy={setAvatarBusy} />
          <p className="max-w-full break-words text-base font-bold text-[#10203A] dark:text-white">{nameOf(identity)}</p>
          {session.email && <p className="max-w-full break-all text-sm text-slate-500 dark:text-slate-400">{session.email}</p>}
        </div>
        {!session.emailConfirmed && <p className="mb-4 text-sm text-amber-700 dark:text-amber-300">Tu correo todavía está sin confirmar. Abre el enlace que te enviamos.</p>}
        <section aria-labelledby={`${id}-profile`}>
          <h2 id={`${id}-profile`} className={heading}>Perfil</h2>
          <form onSubmit={e => { e.preventDefault(); void saveName(); }} className="space-y-3">
            <div>
              <label htmlFor={`${id}-name`} className={fieldLabel}>Nombre</label>
              <input ref={nameInput} id={`${id}-name`} autoComplete="name" value={name} onChange={e => setName(e.target.value)} disabled={busy}
                aria-invalid={Boolean(problems.name)} aria-describedby={problems.name ? `${id}-name-error` : undefined} className={`${textField} min-h-11`} />
              {problems.name && <p id={`${id}-name-error`} role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{problems.name}</p>}
            </div>
            <div>
              <label htmlFor={`${id}-email`} className={fieldLabel}>Correo</label>
              <input id={`${id}-email`} value={session.email ?? ''} readOnly className={`${textField} min-h-11 bg-slate-50 dark:bg-dark-900`} />
            </div>
            <button type="submit" disabled={busy || !auth || !changed} className={`${primaryButton} min-h-11 w-full`}>
              {busy && <LoaderCircle aria-hidden="true" className="w-4 h-4 animate-spin motion-reduce:animate-none" />}
              {busy ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </form>
          {feedback}
        </section>
        <section aria-labelledby={`${id}-security`} className="mt-5">
          <h2 id={`${id}-security`} className={heading}>Seguridad</h2>
          <button type="button" disabled={busy} onClick={() => move('password')} className={`${secondaryButton} min-h-11 w-full justify-between`}>
            <span className="flex items-center gap-2"><LockKeyhole aria-hidden="true" className="w-4 h-4" />Cambiar contraseña</span>
            <ChevronRight aria-hidden="true" className="w-4 h-4" />
          </button>
        </section>
        <section aria-labelledby={`${id}-account`} className="mt-5">
          <h2 id={`${id}-account`} className={heading}>Cuenta</h2>
          {editorial && <button type="button" disabled={busy} onClick={onOpenAdmin} className={`${secondaryButton} min-h-11 w-full mb-2`}><ShieldCheck aria-hidden="true" className="w-4 h-4" />Panel editorial</button>}
          <button type="button" disabled={busy || !auth} onClick={() => void run(async () => { await auth!.signOut(); return { ok: true, value: undefined }; }, onClose)}
            className={`${secondaryButton} min-h-11 w-full !text-red-600 dark:!text-red-400`}><LogOut aria-hidden="true" className="w-4 h-4" />Cerrar sesión</button>
        </section>
      </>}
    </Dialog>
  );
}
