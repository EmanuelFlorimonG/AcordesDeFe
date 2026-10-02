import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React, { createElement, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { Topbar } from '../src/components/Layout/Topbar';
import { runHook } from './hookHarness';

const base = {
  searchQuery: '', onSearchChange() {}, onOpenSidebar() {}, onGoToCancionero() {},
  onGoToAbout() {}, onGoToContact() {}, activePage: 'app' as const, inputRef: { current: null },
};
const user = { userId: 'test', displayName: 'Emanuel', email: 'emanuel@example.com', emailConfirmed: true };
type Props = Record<string, unknown>;
function elements(node: React.ReactNode): React.ReactElement<Props>[] {
  if (!isValidElement<Props>(node)) return [];
  return [node, ...React.Children.toArray(node.props.children as React.ReactNode).flatMap(elements)];
}
function component(actions: { onOpenAccount?: () => void; onSignOut?: () => Promise<void> } = {}, session: typeof user | null = user) {
  const windowBefore = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { addEventListener() {}, removeEventListener() {} } });
  const run = runHook(() => {
    const internals = (React as unknown as { __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: { H: Record<string, unknown> } }).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    internals.H.useId = () => 'account-test';
    return Topbar({ ...base, session, ...actions }) as React.ReactElement;
  });
  const find = (label: string) => elements(run.current).find((e) => e.props['aria-label'] === label)!;
  const menu = find('Cuenta');
  const action = (label: string) => elements(menu).find((e) => e.type === 'button' && e.props.children === label)!;
  return { run, menu, action, restore() { run.unmount(); if (windowBefore) Object.defineProperty(globalThis, 'window', windowBefore); else Reflect.deleteProperty(globalThis, 'window'); } };
}

describe('Topbar account dropdown', () => {
  it('guest retains A and only the existing sign-in entry', () => {
    const html = renderToStaticMarkup(createElement(Topbar, base));
    assert.match(html, />A<\/button>/);
    assert.match(html, />Iniciar sesión<\/button>/);
    assert.doesNotMatch(html, /Cerrar sesión|Ver mi cuenta/);
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /popover="auto"/);
  });
  it('signed-in user sees available identity and account actions', () => {
    const html = renderToStaticMarkup(createElement(Topbar, { ...base, session: user }));
    for (const text of ['Emanuel', 'emanuel@example.com', 'Ver mi cuenta', 'Cerrar sesión']) assert(html.includes(text));
    assert.doesNotMatch(html, /Iniciar sesión/);
    assert.match(html, />E<\/button>/);
  });
  it('does not fabricate missing name/email', () => {
    const html = renderToStaticMarkup(createElement(Topbar, { ...base, session: { ...user, displayName: null, email: null } }));
    assert.doesNotMatch(html, /emanuel@example.com|>Emanuel</);
    assert(html.includes('Cerrar sesión'));
  });
  it('account action closes and invokes the supplied existing flow exactly once', () => {
    let closed = 0, opened = 0;
    const c = component({ onOpenAccount() { opened++; } });
    (c.menu.props.ref as React.RefObject<unknown>).current = { hidePopover() { closed++; } };
    try { (c.action('Ver mi cuenta').props.onClick as () => void)(); assert.equal(opened, 1); assert.equal(closed, 1); }
    finally { c.restore(); }
  });
  it('guest sign-in closes and invokes the existing account flow once', () => {
    let calls = 0, closed = 0;
    const c = component({ onOpenAccount() { calls++; } }, null);
    (c.menu.props.ref as React.RefObject<unknown>).current = { hidePopover() { closed++; } };
    try { (c.action('Iniciar sesión').props.onClick as () => void)(); assert.equal(calls, 1); assert.equal(closed, 1); }
    finally { c.restore(); }
  });
  it('logout closes and invokes the existing action once even for rapid duplicate clicks', async () => {
    let calls = 0, closed = 0;
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const c = component({ onSignOut() { calls++; return pending; } });
    (c.menu.props.ref as React.RefObject<unknown>).current = { hidePopover() { closed++; } };
    try {
      const click = c.action('Cerrar sesión').props.onClick as () => void;
      click(); click(); assert.equal(calls, 1); assert.equal(closed, 1);
      finish(); await c.run.settle();
      assert.equal(c.action('Cerrar sesión').props.disabled, false);
    } finally { c.restore(); }
  });
  it('toggle updates aria-expanded and puts focus on the first action', () => {
    const c = component(); let focuses = 0;
    try {
      (c.menu.props.onToggle as (e: unknown) => void)({ newState: 'open', currentTarget: { querySelector() { return { focus() { focuses++; } }; } } });
      c.run.flush();
      assert.equal(elements(c.run.current).find((e) => e.props['aria-controls'] === 'account-test')!.props['aria-expanded'], true);
      assert.equal(focuses, 1);
    } finally { c.restore(); }
  });
  it('native popover supplies outside/Escape dismissal, keyboard buttons and viewport bounds', () => {
    const html = renderToStaticMarkup(createElement(Topbar, { ...base, session: user }));
    assert.match(html, /popoverTarget="[^"]+"/i);
    assert.match(html, /aria-haspopup="dialog"/);
    assert.match(html, /popover="auto"/);
    assert(html.includes('max-w-[calc(100vw-2rem)]'));
    assert(html.includes('min-h-11'));
    const source = readFileSync('src/components/Layout/Topbar.tsx', 'utf8');
    assert(source.includes('Math.max(16, document.documentElement.clientWidth - rect.right)'));
    assert(source.includes('accountButton.current?.focus()'));
  });
  it('App reuses AccountDialog and the existing auth action without a new form/client', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    assert(app.includes('onOpenAccount={() => setIsAccountOpen(true)}'));
    assert(app.includes('await services.auth.signOut()'));
    assert(app.includes('<AccountDialog'));
    const source = readFileSync('src/components/Layout/Topbar.tsx', 'utf8');
    assert.doesNotMatch(source, /fetch\(|createClient|supabase|signIn\(/i);
  });
});

