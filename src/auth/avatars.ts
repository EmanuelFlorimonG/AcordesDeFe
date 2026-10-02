import type { SupabaseClient } from '@supabase/supabase-js';

export const AVATAR_LIMIT = 2 * 1024 * 1024;
export const AVATAR_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
export const AVATAR_TTL = 3600;
export function avatarPathFor(userId: string, value: unknown): string | null {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]+$/.test(userId)) return null;
  return new RegExp(`^${userId}/avatar-[a-f0-9-]{36}\\.webp$`).test(value) ? value : null;
}
export function checkAvatar(file: Pick<File, 'size' | 'type'>): string | null {
  if (!AVATAR_MIMES.includes(file.type)) return 'Selecciona una imagen JPG, PNG o WebP.';
  if (!file.size || file.size > AVATAR_LIMIT) return 'La imagen debe pesar como máximo 2 MiB.';
  return null;
}
/** Decode before upload; no SVG, original filenames or unbounded output. */
export async function prepareAvatar(file: File): Promise<Blob> {
  const problem = checkAvatar(file);
  if (problem) throw new Error(problem);
  const image = await createImageBitmap(file);
  try {
    if (!image.width || !image.height || image.width * image.height > 40_000_000) throw new Error('La imagen tiene dimensiones demasiado grandes.');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo preparar la imagen.');
    const side = Math.min(image.width, image.height);
    ctx.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 512, 512);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.85));
    if (!blob || blob.type !== 'image/webp' || blob.size > AVATAR_LIMIT) throw new Error('No se pudo preparar la imagen.');
    return blob;
  } finally { image.close(); }
}
export interface AvatarService {
  resolve(userId: string, path: string): Promise<string>;
  save(userId: string, image: Blob): Promise<string>;
  remove(userId: string): Promise<void>;
}
/** Protect the SDK request itself: Auth may change while updateUser waits for its lock. */
export function createAvatarMetadataGate(send: typeof fetch) {
  let expectedUser: string | null = null;
  return {
    async run<T>(userId: string, action: () => Promise<T>): Promise<T> {
      if (expectedUser) throw new Error('Ya hay una foto actualizándose.');
      expectedUser = userId;
      try { return await action(); } finally { expectedUser = null; }
    },
    fetch: (async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith('/auth/v1/user') && init?.method?.toUpperCase() === 'PUT' && typeof init.body === 'string') {
        const body = JSON.parse(init.body);
        if (Object.hasOwn(body.data ?? {}, 'avatar_path')) {
          const token = new Headers(init.headers).get('Authorization')?.replace(/^Bearer /i, '');
          let subject: unknown;
          try { subject = JSON.parse(atob(token!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub; } catch { /* Reject an unreadable identity. */ }
          if (!expectedUser || subject !== expectedUser) throw new Error('Tu sesión ha cambiado. Vuelve a abrir Mi cuenta.');
        }
      }
      return send(input, init);
    }) as typeof fetch,
  };
}
export function createAvatarService(js: SupabaseClient, metadataGate?: ReturnType<typeof createAvatarMetadataGate>): AvatarService {
  const bucket = js.storage.from('avatars');
  const current = async (userId: string) => {
    const { data, error } = await js.auth.getSession();
    if (error || data.session?.user.id !== userId) throw new Error('Tu sesión ha cambiado. Vuelve a abrir Mi cuenta.');
    return data.session.user;
  };
  const clean = async (userId: string, path: string) => {
    if (!avatarPathFor(userId, path)) return;
    try {
      await current(userId);
      const { error } = await bucket.remove([path]);
      if (error) throw error;
    } catch { console.warn('No se pudo limpiar una foto de perfil anterior.'); }
  };
  const update = async (userId: string, path: string | null) => {
    await current(userId);
    const action = () => js.auth.updateUser({ data: { avatar_path: path } });
    const { data, error } = await (metadataGate ? metadataGate.run(userId, action) : action());
    if (error || data.user?.id !== userId || (data.user.user_metadata.avatar_path ?? null) !== path) throw new Error('No se pudo actualizar tu foto. Inténtalo otra vez.');
  };
  return {
    async resolve(userId, path) {
      if (!avatarPathFor(userId, path)) throw new Error('Foto no disponible.');
      await current(userId);
      const { data, error } = await bucket.createSignedUrl(path, AVATAR_TTL);
      if (error || !data?.signedUrl) throw new Error('Foto no disponible.');
      await current(userId);
      return data.signedUrl;
    },
    async save(userId, image) {
      if (image.type !== 'image/webp' || !image.size || image.size > AVATAR_LIMIT) throw new Error('La imagen no es válida.');
      const user = await current(userId);
      const old = avatarPathFor(userId, user.user_metadata.avatar_path);
      const path = `${userId}/avatar-${crypto.randomUUID()}.webp`;
      const { error } = await bucket.upload(path, image, { contentType: 'image/webp', upsert: false });
      if (error) throw new Error('No se pudo subir la foto. Inténtalo otra vez.');
      try { await update(userId, path); }
      catch (error) { await clean(userId, path); throw error; }
      if (old) await clean(userId, old);
      return path;
    },
    async remove(userId) {
      const user = await current(userId);
      const old = avatarPathFor(userId, user.user_metadata.avatar_path);
      await update(userId, null);
      if (old) await clean(userId, old);
    },
  };
}
