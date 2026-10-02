import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import React, { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AVATAR_LIMIT, AVATAR_TTL, avatarPathFor, checkAvatar, prepareAvatar, createAvatarService, createAvatarMetadataGate } from '../src/auth/avatars';
import { createSupabaseAuth } from '../src/auth/supabaseSession';
import { useAvatar } from '../src/auth/useAvatar';
import { Avatar } from '../src/components/Account/Avatar';
import { AvatarEditor } from '../src/components/Account/AvatarEditor';
import { Topbar } from '../src/components/Layout/Topbar';
import { runHook } from './hookHarness';
import { readFileSync } from 'node:fs';
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
before(() => Object.defineProperty(globalThis, 'window', { configurable: true, value: { addEventListener() {}, removeEventListener() {} } }));
after(() => { if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else Reflect.deleteProperty(globalThis, 'window'); });
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const path = `${id}/avatar-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp`;
const blob = new Blob(['image'], { type: 'image/webp' });
const session = { userId: id, displayName: 'Emanuel', email: 'e@example.com', emailConfirmed: true, avatarPath: path };
function fixture(options: { uploadError?: boolean; metadataError?: boolean; cleanupError?: boolean; signError?: boolean } = {}) {
  const calls: string[] = [];
  let user = { id, email: session.email, email_confirmed_at: 'yes', user_metadata: { display_name: 'Emanuel', other: 'keep', avatar_path: path as string | null } };
  let listener: (event: string, session: unknown) => void = () => {};
  const bucket = {
    async upload(p: string, _image: Blob, options: unknown) { calls.push(`upload:${p}`); assert.deepEqual(options, { contentType: 'image/webp', upsert: false }); return { error: optionsUploadError() }; },
    async remove(paths: string[]) { calls.push(`delete:${paths[0]}`); return { error: options.cleanupError ? new Error('cleanup') : null }; },
    async createSignedUrl(p: string, ttl: number) { calls.push(`sign:${p}`); assert.equal(ttl, AVATAR_TTL); return { error: options.signError ? new Error('sign') : null, data: { signedUrl: 'https://example.com/signed' } }; },
  };
  const optionsUploadError = () => options.uploadError ? new Error('upload') : null;
  const js = { storage: { from(name: string) { assert.equal(name, 'avatars'); return bucket; } }, auth: {
    async getSession() { return { data: { session: { user } }, error: null }; },
    async updateUser(attributes: { data: { avatar_path: string | null } }) {
      calls.push(`metadata:${attributes.data.avatar_path}`);
      if (options.metadataError) return { error: new Error('metadata'), data: { user: null } };
      user = { ...user, user_metadata: { ...user.user_metadata, ...attributes.data } };
      listener('USER_UPDATED', { user }); return { error: null, data: { user } };
    },
    onAuthStateChange(fn: typeof listener) { listener = fn; return { data: { subscription: { unsubscribe() {} } } }; },
  } } as unknown as SupabaseClient;
  return { calls, js, service: createAvatarService(js), user: () => user, changeUser() { user = { ...user, id: 'another' }; } };
}
describe('private avatar boundary and Auth', () => {
  it('guards the actual Auth request if the SDK session changes before metadata is sent', async () => {
    let requests = 0;
    const gate = createAvatarMetadataGate((async () => { requests++; return new Response('{}'); }) as typeof fetch);
    const token = (sub: string) => `header.${btoa(JSON.stringify({ sub }))}.signature`;
    const request = (sub: string, value: string | null) => gate.fetch('https://example.com/auth/v1/user', {
      method: 'PUT', headers: { Authorization: `Bearer ${token(sub)}` }, body: JSON.stringify({ data: { avatar_path: value } }),
    });
    for (const value of [path, null]) await assert.rejects(gate.run(id, () => request('another', value)));
    assert.equal(requests, 0);
    await gate.run(id, () => request(id, path)); assert.equal(requests, 1);
    await gate.run(id, () => request(id, null)); assert.equal(requests, 2);
    await gate.fetch('https://example.com/auth/v1/user', { method: 'PUT', body: JSON.stringify({ data: { display_name: 'Manuel' } }) });
    assert.equal(requests, 3);
  });
  it('accepts only an owned safe path, never URLs or traversal', () => {
    assert.equal(avatarPathFor(id, path), path);
    for (const bad of [null, 'https://example.com/a', '../a.webp', path.replace(id, 'other'), `${id}/original.png`, `${id}/../${path}`]) assert.equal(avatarPathFor(id, bad), null);
  });
  it('validates accepted MIME and 2 MiB boundary', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) assert.equal(checkAvatar({ type, size: AVATAR_LIMIT }), null);
    for (const type of ['image/svg+xml', 'image/gif', 'text/plain']) assert(checkAvatar({ type, size: 1 }));
    assert(checkAvatar({ type: 'image/png', size: AVATAR_LIMIT + 1 })); assert(checkAvatar({ type: 'image/png', size: 0 }));
  });
  it('maps no avatar and ignores another user metadata path', async () => {
    const f = fixture(); f.user().user_metadata.avatar_path = null;
    assert.equal((await createSupabaseAuth(f.js).currentSession())?.avatarPath, undefined);
    f.user().user_metadata.avatar_path = path.replace(id, 'other');
    assert.equal((await createSupabaseAuth(f.js).currentSession())?.avatarPath, undefined);
  });
  it('maps owned avatar and USER_UPDATED, preserving other metadata', async () => {
    const f = fixture(); const auth = createSupabaseAuth(f.js); let received: unknown;
    const unsubscribe = auth.subscribe(s => { received = s; });
    const next = await f.service.save(id, blob); await new Promise(r => setTimeout(r, 0));
    assert.equal((received as typeof session).avatarPath, next); assert.equal(f.user().user_metadata.other, 'keep'); unsubscribe();
  });
  it('uploads new randomized path before metadata, then cleans old object', async () => {
    const f = fixture(); const next = await f.service.save(id, blob);
    assert.notEqual(next, path); assert.equal(avatarPathFor(id, next), next);
    assert.deepEqual(f.calls, [`upload:${next}`, `metadata:${next}`, `delete:${path}`]);
  });
  it('upload failure preserves old metadata without deleting it', async () => {
    const f = fixture({ uploadError: true }); await assert.rejects(f.service.save(id, blob));
    assert.equal(f.user().user_metadata.avatar_path, path); assert.equal(f.calls.length, 1);
  });
  it('metadata failure cleans newly uploaded orphan, not previous photo', async () => {
    const f = fixture({ metadataError: true }); await assert.rejects(f.service.save(id, blob));
    const next = f.calls[0].slice(7); assert.equal(f.calls[2], `delete:${next}`); assert.equal(f.user().user_metadata.avatar_path, path);
  });
  it('cleanup failure does not undo successful replacement', async () => {
    const f = fixture({ cleanupError: true }); const next = await f.service.save(id, blob);
    assert.equal(f.user().user_metadata.avatar_path, next);
  });
  it('removal clears metadata before cleanup, never reactivates after cleanup failure', async () => {
    const f = fixture({ cleanupError: true }); await f.service.remove(id);
    assert.equal(f.user().user_metadata.avatar_path, null); assert.deepEqual(f.calls, ['metadata:null', `delete:${path}`]);
  });
  it('failed removal preserves metadata and does not delete photo', async () => {
    const f = fixture({ metadataError: true }); await assert.rejects(f.service.remove(id));
    assert.deepEqual(f.calls, ['metadata:null']); assert.equal(f.user().user_metadata.avatar_path, path);
  });
  it('account change during upload prevents metadata update and old-account cleanup', async () => {
    const f = fixture(); const original = f.js.storage.from('avatars').upload;
    f.js.storage.from('avatars').upload = (async (...args: Parameters<typeof original>) => {
      const result = await original(...args); f.changeUser(); return result;
    }) as typeof original;
    await assert.rejects(f.service.save(id, blob));
    assert.equal(f.calls.filter(c => c.startsWith('metadata:') || c.startsWith('delete:')).length, 0);
  });
  it('signed URL is temporary, owner-scoped and not persisted', async () => {
    const f = fixture(); assert.equal(await f.service.resolve(id, path), 'https://example.com/signed');
    assert.deepEqual(f.calls, [`sign:${path}`]); assert.equal(f.user().user_metadata.avatar_path, path);
    await assert.rejects(f.service.resolve('another', path));
  });
  it('signed URL failure rejects for resolver fallback', async () => {
    await assert.rejects(fixture({ signError: true }).service.resolve(id, path));
  });
  it('changed user cannot upload, delete or resolve another account', async () => {
    const f = fixture(); f.changeUser();
    await assert.rejects(f.service.save(id, blob)); await assert.rejects(f.service.remove(id)); await assert.rejects(f.service.resolve(id, path)); assert.equal(f.calls.length, 0);
  });
});
function nativeImages() {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const bitmap = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
  let closed = 0; let revoked = 0;
  const oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL;
  URL.createObjectURL = () => 'blob:preview'; URL.revokeObjectURL = () => { revoked++; };
  Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: async () => ({ width: 1000, height: 800, close() { closed++; } }) });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement() { return { width: 0, height: 0, getContext() { return { drawImage() {} }; }, toBlob(done: (b: Blob) => void, mime: string) { assert.equal(mime, 'image/webp'); done(blob); } }; } } });
  return { revoked: () => revoked, closed: () => closed, restore() {
    URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke;
    if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document');
    if (bitmap) Object.defineProperty(globalThis, 'createImageBitmap', bitmap); else Reflect.deleteProperty(globalThis, 'createImageBitmap');
  } };
}
type Props = Record<string, unknown>;
function nodes(node: React.ReactNode): React.ReactElement<Props>[] {
  if (!isValidElement<Props>(node)) return [];
  return [node, ...React.Children.toArray(node.props.children as React.ReactNode).flatMap(nodes)];
}
function editorFixture() {
  const f = fixture(); let disabled = false;
  const run = runHook(() => AvatarEditor({ userId: id, hasPhoto: true, service: f.service, disabled, onBusy() {} }));
  const button = (text: string) => nodes(run.current).find(n => n.type === 'button' && React.Children.toArray(n.props.children as React.ReactNode).includes(text))!;
  return { ...f, run, button, setDisabled() { disabled = true; run.flush(); }, select(file: File) { const input = nodes(run.current).find(n => n.type === 'input')!; (input.props.onChange as Function)({ target: { files: [file], value: 'photo.png' } }); } };
}
describe('selection and preview use native image APIs', () => {
  it('produces WebP and closes the decoded bitmap', async () => {
    const env = nativeImages(); try { assert.equal(await prepareAvatar(new File(['x'], 'a.png', { type: 'image/png' })), blob); assert.equal(env.closed(), 1); } finally { env.restore(); }
  });
  it('preview exists before any upload; cancel releases URL and uploads nothing', async () => {
    const env = nativeImages(); try {
      const f = editorFixture(); f.select(new File(['x'], 'photo.png', { type: 'image/png' })); await f.run.settle();
      assert(nodes(f.run.current).some(n => n.type === 'img' && n.props.src === 'blob:preview')); assert.equal(f.calls.length, 0);
      (f.button('Cancelar').props.onClick as Function)(); f.run.flush(); assert.equal(env.revoked(), 1); assert.equal(f.calls.length, 0); f.run.unmount();
    } finally { env.restore(); }
  });
  it('invalid selection shows readable error without any upload', async () => {
    const f = editorFixture(); f.select(new File(['x'], 'photo.svg', { type: 'image/svg+xml' })); await f.run.settle();
    assert.match(renderToStaticMarkup(f.run.current), /JPG, PNG o WebP/); assert.equal(f.calls.length, 0); f.run.unmount();
  });
  it('save is explicit and duplicate submissions are blocked', async () => {
    const env = nativeImages(); try {
      const f = editorFixture(); f.select(new File(['x'], 'photo.png', { type: 'image/png' })); await f.run.settle();
      const click = f.button('Guardar foto').props.onClick as Function; click(); click(); await f.run.settle();
      assert.equal(f.calls.filter(c => c.startsWith('upload:')).length, 1); assert.match(renderToStaticMarkup(f.run.current), /Foto actualizada/); assert.equal(env.revoked(), 1); f.run.unmount();
    } finally { env.restore(); }
  });
  it('unmount during image preparation never creates a preview or uploads', async () => {
    const env = nativeImages(); try {
      let decode!: (v: ImageBitmap) => void;
      Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: () => new Promise<ImageBitmap>(r => { decode = r; }) });
      const f = editorFixture(); f.select(new File(['x'], 'photo.png', { type: 'image/png' })); f.run.unmount();
      decode({ width: 100, height: 100, close() {} } as ImageBitmap); await f.run.settle();
      assert.equal(f.calls.length, 0); assert(!nodes(f.run.current).some(n => n.type === 'img'));
    } finally { env.restore(); }
  });
  it('delete requires inline confirmation, cancellation makes no request', () => {
    const f = editorFixture(); (f.button('Eliminar foto').props.onClick as Function)(); f.run.flush(); assert.match(renderToStaticMarkup(f.run.current), /¿Eliminar/);
    (f.button('Cancelar').props.onClick as Function)(); f.run.flush(); assert.equal(f.calls.length, 0); f.run.unmount();
  });
});
describe('memory resolver, image fallback and Topbar', () => {
  it('image error falls back; changed URL resets fallback', () => {
    let url = 'one'; const run = runHook(() => Avatar({ url, initial: 'E' }));
    (run.current.props.onError as Function)(); run.flush(); assert.equal(renderToStaticMarkup(run.current), 'E');
    url = 'two'; run.flush(); assert.equal(run.current.props.src, 'two'); run.unmount();
  });
  it('no photo retains the initial', () => { assert.equal(renderToStaticMarkup(React.createElement(Avatar, { initial: 'E' })), 'E'); });
  it('Topbar and dropdown share same image, button stays 36px and accessible', () => {
    const html = renderToStaticMarkup(React.createElement(Topbar, { session, avatarUrl: 'https://example.com/photo', searchQuery: '', onSearchChange() {}, onOpenSidebar() {}, onGoToCancionero() {}, onGoToAbout() {}, onGoToContact() {}, activePage: 'app', inputRef: { current: null } }));
    assert.equal((html.match(/<img /g) ?? []).length, 2); assert.match(html, /w-9 h-9 rounded-full/); assert.match(html, /Abrir menú de cuenta de Emanuel/); assert.match(html, /alt=""/);
  });
  it('late resolution from previous user cannot appear on next account', async () => {
    let who = session; let resolve!: (url: string) => void;
    const service = { ...fixture().service, resolve: () => new Promise<string>(r => { resolve = r; }) };
    const run = runHook(() => useAvatar(who, service)); who = { ...session, userId: 'other', avatarPath: null! }; run.flush(); resolve('old-user-url'); await run.settle();
    assert.equal(run.current, null); run.unmount();
  });
  it('resolver failure returns initial fallback without hanging', async () => {
    const run = runHook(() => useAvatar(session, { ...fixture().service, async resolve() { throw new Error('network'); } })); await run.settle(); assert.equal(run.current, null); run.unmount();
  });
  it('offline makes no request and signed URL stays out of all persistence', async () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
    // useOnline installs listeners on window in browser; provide only that surface.
    const win = Object.getOwnPropertyDescriptor(globalThis, 'window'); Object.defineProperty(globalThis, 'window', { configurable: true, value: { addEventListener() {}, removeEventListener() {} } });
    try { const f = fixture(); const run = runHook(() => useAvatar(session, f.service)); await run.settle(); assert.equal(run.current, null); assert.equal(f.calls.length, 0); run.unmount(); }
    finally { if (previous) Object.defineProperty(globalThis, 'navigator', previous); else Reflect.deleteProperty(globalThis, 'navigator'); if (win) Object.defineProperty(globalThis, 'window', win); else Reflect.deleteProperty(globalThis, 'window'); }
    assert.doesNotMatch(readFileSync('src/auth/useAvatar.ts', 'utf8'), /localStorage|indexedDB|setItem/);
  });
  it('migration is private and owner-scoped, no public or update policy', () => {
    const sql = readFileSync('supabase/migrations/20261002130000_private_avatars.sql', 'utf8');
    assert.match(sql, /false, 2097152/); assert.equal((sql.match(/auth.uid\(\)/g) ?? []).length, 3); assert.match(sql, /for select to authenticated/); assert.match(sql, /for insert to authenticated/); assert.match(sql, /for delete to authenticated/); assert.doesNotMatch(sql, /for update|to anon|true,/);
  });
});
