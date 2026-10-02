import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React, { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AccountProfile } from '../src/components/Account/AccountProfile';
import { Topbar } from '../src/components/Layout/Topbar';
import { checkDisplayName, type AppSession, type AuthResult } from '../src/auth/session';
import { createSupabaseAuth } from '../src/auth/supabaseSession';
import { runHook } from './hookHarness';

type Props = Record<string, unknown>;
function nodes(node: React.ReactNode): React.ReactElement<Props>[] {
  if (!isValidElement<Props>(node)) return [];
  return [node, ...React.Children.toArray(node.props.children as React.ReactNode).flatMap(nodes)];
}
const user: AppSession = { userId: 'test', displayName: 'Emanuel', email: 'emanuel@example.com', emailConfirmed: true };
const ok: AuthResult = { ok: true, value: undefined };
function fixture(options: { result?: AuthResult; deferred?: Promise<AuthResult> } = {}) {
  let session = user;
  const calls: string[] = [];
  let closed = 0;
  const auth = {
    async updateDisplayName(name: string) { calls.push(`name:${name}`); return options.deferred ?? options.result ?? ok; },
    async updatePassword(password: string) { calls.push(`password:${password}`); return options.deferred ?? options.result ?? ok; },
    async signOut() { calls.push('logout'); },
  };
  const run = runHook(() => AccountProfile({ session, auth, editorial: false, onOpenAdmin() {}, onClose() { closed++; } }));
  const all = () => nodes(run.current);
  const button = (label: string) => all().find(e => e.type === 'button' && nodes(e).some(n => React.Children.toArray(n.props.children as React.ReactNode).includes(label)))!;
  const input = (key: string) => all().find(e => e.type === 'input' && String(e.props.id).endsWith(`-${key}`))!;
  const change = (key: string, value: string) => { (input(key).props.onChange as Function)({ target: { value } }); run.flush(); };
  const submit = (index = 0) => (all().filter(e => e.type === 'form')[index].props.onSubmit as Function)({ preventDefault() {} });
  const click = (label: string) => (button(label).props.onClick as Function)();
  const html = () => renderToStaticMarkup(run.current.props.children);
  return { run, calls, button, input, change, submit, click, html, closed: () => closed, update(next: AppSession) { session = next; run.flush(); } };
}

describe('Mi cuenta', () => {
  it('shows identity, read-only email, useful sections and the avatar entry', () => {
    const f = fixture(); assert.equal(f.run.current.props.title, 'Mi cuenta');
    assert.match(f.html(), /Emanuel/); assert.match(f.html(), /emanuel@example.com/);
    assert.equal(f.input('email').props.readOnly, true);
    for (const label of ['Perfil', 'Seguridad', 'Cuenta']) assert(f.html().includes(label));
    assert.match(f.html(), /Cambiar foto/); f.run.unmount();
  });
  it('does not send an unchanged name', async () => {
    const f = fixture(); f.submit(); await f.run.settle(); assert.deepEqual(f.calls, []); f.run.unmount();
  });
  for (const invalid of ['', '   ', 'a'.repeat(61)]) it(`rejects invalid name length ${invalid.length}`, async () => {
    const f = fixture(); f.change('name', invalid); f.submit(); await f.run.settle();
    assert.deepEqual(f.calls, []); assert.match(f.html(), /role="alert"/); f.run.unmount();
  });
  it('trims and saves, shows new identity immediately and keeps the dialog open', async () => {
    const f = fixture(); f.change('name', ' Manuel '); f.submit(); await f.run.settle();
    assert.deepEqual(f.calls, ['name:Manuel']); assert.match(f.html(), /Nombre actualizado/);
    assert.match(f.html(), /Manuel/); assert.equal(f.input('name').props.value, 'Manuel'); assert.equal(f.closed(), 0);
    f.submit(); await f.run.settle(); assert.equal(f.calls.length, 1); f.run.unmount();
  });
  it('session updates refresh the account identity', () => {
    const f = fixture(); f.update({ ...user, displayName: 'Manuel' }); assert.equal(f.input('name').props.value, 'Manuel'); f.run.unmount();
  });
  it('password lives in a subview of the same dialog and back clears fields', () => {
    const f = fixture(); f.click('Cambiar contraseña'); f.run.flush(); assert.equal(f.run.current.props.title, 'Cambiar contraseña');
    f.change('password', 'abcdef'); f.click('Volver a Mi cuenta'); f.run.flush(); f.click('Cambiar contraseña'); f.run.flush();
    assert.equal(f.input('password').props.value, ''); f.run.unmount();
  });
  for (const [password, repeat] of [['abcdef', 'different'], ['abc', 'abc']]) it('uses existing password validation', async () => {
    const f = fixture(); f.click('Cambiar contraseña'); f.run.flush(); f.change('password', password); f.change('repeat', repeat);
    f.submit(); await f.run.settle(); assert.deepEqual(f.calls, []); assert.match(f.html(), /role="alert"/); f.run.unmount();
  });
  it('updates password once, clears both fields and returns with success without logout', async () => {
    const f = fixture(); f.click('Cambiar contraseña'); f.run.flush(); f.change('password', 'abcdef'); f.change('repeat', 'abcdef');
    f.submit(); f.submit(); await f.run.settle(); assert.deepEqual(f.calls, ['password:abcdef']);
    assert.equal(f.run.current.props.title, 'Mi cuenta'); assert.match(f.html(), /Contraseña actualizada/);
    f.click('Cambiar contraseña'); f.run.flush(); assert.equal(f.input('password').props.value, ''); assert.equal(f.input('repeat').props.value, ''); f.run.unmount();
  });
  it('blocks duplicate name requests and unlocks after completion', async () => {
    let resolve!: (r: AuthResult) => void; const deferred = new Promise<AuthResult>(r => { resolve = r; });
    const f = fixture({ deferred }); f.change('name', 'Manuel'); f.submit(); f.submit(); f.run.flush();
    assert.equal(f.calls.length, 1); assert.equal(f.input('name').props.disabled, true); resolve(ok); await f.run.settle();
    assert.equal(f.input('name').props.disabled, false); f.run.unmount();
  });
  it('shows readable errors and preserves the draft', async () => {
    const f = fixture({ result: { ok: false, reason: 'network' } }); f.change('name', 'Manuel'); f.submit(); await f.run.settle();
    assert.match(f.html(), /No hay conexión con el servidor/); assert.equal(f.input('name').props.value, 'Manuel'); f.run.unmount();
  });
  it('password errors remain readable and do not report success or sign out', async () => {
    const f = fixture({ result: { ok: false, reason: 'weak-password' } });
    f.click('Cambiar contraseña'); f.run.flush(); f.change('password', 'abcdef'); f.change('repeat', 'abcdef');
    f.submit(); await f.run.settle();
    assert.equal(f.run.current.props.title, 'Cambiar contraseña');
    assert.match(f.html(), /La contraseña es demasiado corta/);
    assert.doesNotMatch(f.html(), /Contraseña actualizada/);
    assert.equal(f.closed(), 0); f.run.unmount();
  });
  it('password visibility has descriptive accessible controls', () => {
    const f = fixture(); f.click('Cambiar contraseña'); f.run.flush();
    const toggle = nodes(f.run.current).find(e => e.props['aria-label'] === 'Mostrar nueva contraseña')!;
    (toggle.props.onClick as () => void)(); f.run.flush();
    assert.equal(f.input('password').props.type, 'text');
    assert(nodes(f.run.current).some(e => e.props['aria-label'] === 'Ocultar nueva contraseña')); f.run.unmount();
  });
  it('uses existing signOut exactly once', async () => {
    const f = fixture(); f.click('Cerrar sesión'); f.click('Cerrar sesión'); await f.run.settle();
    assert.deepEqual(f.calls, ['logout']); assert.equal(f.closed(), 1); f.run.unmount();
  });
  it('validates display names consistently', () => {
    assert.equal(checkDisplayName(' Manuel '), null); assert.equal(checkDisplayName('a'.repeat(60)), null);
  });
});

describe('Auth name update and existing session subscription', () => {
  it('merges only display_name, propagates USER_UPDATED and changes Topbar initial', async () => {
    let listener!: (event: string, session: unknown) => void;
    let stored = { user: { id: 'test', email: user.email, email_confirmed_at: 'yes', user_metadata: { display_name: 'Emanuel', untouched: 'keep' } } };
    const calls: unknown[] = [];
    const js = { auth: {
      onAuthStateChange(fn: typeof listener) { listener = fn; return { data: { subscription: { unsubscribe() {} } } }; },
      async getSession() { return { data: { session: stored }, error: null }; },
      async updateUser(attributes: { data: Record<string, string> }) {
        calls.push(attributes); stored = { user: { ...stored.user, user_metadata: { ...stored.user.user_metadata, ...attributes.data } } };
        listener('USER_UPDATED', stored); return { error: null };
      },
    } } as unknown as SupabaseClient;
    const auth = createSupabaseAuth(js); let received: AppSession | null = null;
    const unsubscribe = auth.subscribe(s => { received = s; });
    assert.equal((await auth.updateDisplayName(' Manuel ')).ok, true);
    await new Promise(r => setTimeout(r, 0));
    assert.deepEqual(calls, [{ data: { display_name: 'Manuel' } }]);
    assert.equal(stored.user.user_metadata.untouched, 'keep');
    assert.equal((received as AppSession | null)?.displayName, 'Manuel');
    const html = renderToStaticMarkup(React.createElement(Topbar, { session: received, searchQuery: '', onSearchChange() {}, onOpenSidebar() {}, onGoToCancionero() {}, onGoToAbout() {}, onGoToContact() {}, activePage: 'app', inputRef: { current: null } }));
    assert.match(html, /aria-label="Abrir menú de cuenta de Manuel"[^>]*>M<\/button>/); unsubscribe();
  });
});
