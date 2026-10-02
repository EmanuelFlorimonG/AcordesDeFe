import React, { useEffect, useRef, useState } from 'react';
import { checkAvatar, prepareAvatar, type AvatarService } from '../../auth/avatars';
import { primaryButton, secondaryButton } from '../Setlists/ui';
interface Props {
  userId: string;
  avatar?: React.ReactNode;
  hasPhoto: boolean;
  service: AvatarService | null;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
}
export function AvatarEditor({ userId, avatar, hasPhoto, service, disabled, onBusy }: Props) {
  const [preview, setPreview] = useState<{ url: string; image: Blob } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [working, setWorking] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    const counter = generation;
    return () => { counter.current++; };
  }, [userId]);
  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview.url); };
  }, [preview]);
  const select = async (file?: File) => {
    if (!file || pending.current || disabled) return;
    setPreview(null); setError(''); setNote(''); setConfirm(false);
    const problem = checkAvatar(file);
    if (problem) { setError(problem); return; }
    const ticket = ++generation.current;
    pending.current = true; setWorking(true); onBusy(true);
    try {
      const image = await prepareAvatar(file);
      if (generation.current === ticket) setPreview({ image, url: URL.createObjectURL(image) });
    } catch { if (generation.current === ticket) setError('No se pudo preparar la imagen. Selecciona un JPG, PNG o WebP válido.'); }
    finally {
      if (generation.current === ticket) { pending.current = false; setWorking(false); onBusy(false); }
    }
  };
  const act = async (remove: boolean) => {
    if (pending.current || disabled || !service) return;
    const ticket = ++generation.current;
    pending.current = true; setWorking(true); onBusy(true); setError(''); setNote('');
    try {
      if (remove) await service.remove(userId);
      else if (preview) await service.save(userId, preview.image);
      else return;
      if (generation.current === ticket) {
        setPreview(null); setConfirm(false);
        setNote(remove ? 'Foto eliminada' : 'Foto actualizada');
      }
    } catch { if (generation.current === ticket) setError('No se pudo actualizar tu foto. Revisa tu conexión e inténtalo otra vez.'); }
    finally {
      if (generation.current === ticket) { pending.current = false; setWorking(false); onBusy(false); }
    }
  };
  const blocked = working || disabled;
  return <div className="w-full mt-1 mb-2 text-sm" aria-busy={working}>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Seleccionar foto de perfil" className="sr-only" tabIndex={-1} disabled={blocked}
      onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void select(file); }} />
    {!preview && avatar}
    {preview ? <>
      <img src={preview.url} alt="Vista previa de tu nueva foto" className="w-20 h-20 mx-auto mb-2 rounded-full object-cover" />
      <div className="flex justify-center gap-2">
        <button type="button" disabled={blocked || !service} onClick={() => void act(false)} className={`${primaryButton} min-h-11`}>Guardar foto</button>
        <button type="button" disabled={blocked} onClick={() => { generation.current++; setPreview(null); setError(''); }} className={`${secondaryButton} min-h-11`}>Cancelar</button>
      </div>
    </> : confirm ? <>
      <p>¿Eliminar tu foto de perfil?</p>
      <div className="flex justify-center gap-2 mt-2">
        <button type="button" disabled={blocked} onClick={() => void act(true)} className={`${secondaryButton} min-h-11 !text-red-600`}>Eliminar foto</button>
        <button type="button" disabled={blocked} onClick={() => setConfirm(false)} className={`${secondaryButton} min-h-11`}>Cancelar</button>
      </div>
    </> : <div className="flex flex-wrap justify-center gap-x-3">
      <button type="button" disabled={blocked || !service} onClick={() => { setNote(''); input.current?.click(); }} className="min-h-11 px-2 font-semibold text-[#2464ED] focus-visible:ring-2 rounded-lg">Cambiar foto</button>
      {hasPhoto && <button type="button" disabled={blocked || !service} onClick={() => { setConfirm(true); setNote(''); }} className="min-h-11 px-2 text-red-600 focus-visible:ring-2 rounded-lg">Eliminar foto</button>}
    </div>}
    {working && <p role="status" className="mt-1 text-slate-500">Preparando o guardando foto…</p>}
    {error && <p role="alert" className="mt-1 text-red-600 dark:text-red-400">{error}</p>}
    {note && <p role="status" className="mt-1 text-emerald-700 dark:text-emerald-400">{note}</p>}
  </div>;
}
