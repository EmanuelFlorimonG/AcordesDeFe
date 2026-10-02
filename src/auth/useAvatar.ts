import { useEffect, useState } from 'react';
import type { AppSession } from './session';
import { useAuthServices } from './useSession';
import { useOnline } from '../hooks/useOnline';
import type { AvatarService } from './avatars';

/** One resolver in App, shared by every account surface. URLs stay in memory. */
export function useAvatar(session: AppSession | null, service: AvatarService | null) {
  const online = useOnline();
  const id = session?.userId;
  const path = session?.avatarPath;
  const [held, setHeld] = useState<{ id: string; path: string; url: string } | null>(null);
  useEffect(() => {
    if (!id || !path || !service || !online) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const url = await service.resolve(id, path);
        if (!cancelled) {
          setHeld({ id, path, url });
          timer = setTimeout(() => { void load(); }, 50 * 60 * 1000);
        }
      } catch { if (!cancelled) setHeld(null); }
    };
    void load();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [id, path, service, online]);
  return online && held?.id === id && held?.path === path ? held?.url ?? null : null;
}
export function useAccountAvatar(session: AppSession | null) {
  const { services } = useAuthServices();
  return useAvatar(session, services?.avatars ?? null);
}
