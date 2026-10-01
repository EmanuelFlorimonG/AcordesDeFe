import { it } from 'node:test';
import assert from 'node:assert/strict';
import React, { type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { PrivacyPolicy } from '../src/components/Legal/PrivacyPolicy';
import { ShareSetlistDialog } from '../src/components/Setlists/ShareSetlistDialog';
import { SupabaseRequestError } from '../src/lib/supabase';
import { runHook } from './hookHarness';

it('privacy distinguishes loading YouTube from starting playback', () => {
  const html = renderToStaticMarkup(React.createElement(PrivacyPolicy, { onBack() {} }));
  assert.ok(!html.includes('no se carga nada de YouTube'));
  for (const text of ['Al abrir una canción con vídeo', 'cargar el reproductor de YouTube', 'preparar el vídeo', 'sólo comienza cuando decides reproducir', 'servicio externo', 'requiere conexión a internet']) assert.ok(html.includes(text), text);
});

function buttons(node: React.ReactNode): ReactElement<{ children?: React.ReactNode; onClick?: () => void }>[] {
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return [];
  return [...(node.type === 'button' ? [node] : []), ...buttons(node.props.children)];
}

async function dialog(error: unknown, online = true) {
  const names = ['window', 'navigator', 'fetch'] as const;
  const before = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  const set = (name: string, value: unknown) => Object.defineProperty(globalThis, name, { value, configurable: true });
  set('navigator', { onLine: online });
  set('window', { location: { origin: 'https://example.org', pathname: '/' }, localStorage: { getItem: () => null }, addEventListener() {}, removeEventListener() {} });
  let reads = 0;
  set('fetch', () => { throw new Error('Unexpected network request'); });
  const repository = { find: async () => { reads++; throw error; } };
  const internals = (React as unknown as { __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: { H: Record<string, unknown> } }).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  // Replace only the repository-acquisition callback in the existing harness.
  // The real dialog, hook, lookup, failure classification and effects still run.
  const acquire = async () => repository;
  const run = runHook(() => {
    const dispatcher = internals.H;
    const original = dispatcher.useCallback as (fn: (...args: never[]) => unknown, deps: unknown[]) => unknown;
    dispatcher.useCallback = (fn: (...args: never[]) => unknown, deps: unknown[]) => original(String(fn).includes('services.auth.authenticated') ? acquire : fn, deps);
    try { return ShareSetlistDialog({ setlistId: 'test-setlist', setlistName: 'Test', onClose() {} }); }
    finally { dispatcher.useCallback = original; }
  });
  await run.settle();
  return {
    run,
    reads: () => reads,
    retry: () => buttons(run.current as React.ReactNode).find(button => button.props.children === 'Reintentar'),
    close() {
      run.unmount();
      names.forEach((name, i) => before[i] ? Object.defineProperty(globalThis, name, before[i]!) : delete (globalThis as Record<string, unknown>)[name]);
    },
  };
}

it('owner dialog retries a recoverable read exactly once per click, never on renders', async () => {
  const test = await dialog(new TypeError('Failed to fetch'));
  try {
    assert.equal(test.reads(), 1);
    assert.ok(test.retry());
    test.run.flush(); await test.run.settle();
    assert.equal(test.reads(), 1);
    test.retry()!.props.onClick!();
    test.run.flush();
    assert.equal(test.retry(), undefined, 'hidden while loading');
    await test.run.settle();
    assert.equal(test.reads(), 2);
    test.run.flush(); await test.run.settle();
    assert.equal(test.reads(), 2, 'failure does not schedule another attempt');
    test.retry()!.props.onClick!(); test.run.flush(); await test.run.settle();
    assert.equal(test.reads(), 3);
  } finally { test.close(); }
});

it('server read errors offer retry; session and permission errors do not', async () => {
  for (const [status, expected] of [[503, true], [401, false], [403, false]] as const) {
    const test = await dialog(new SupabaseRequestError('Test', status, null));
    try { assert.equal(test.reads(), 1); assert.equal(Boolean(test.retry()), expected); }
    finally { test.close(); }
  }
});

it('offline and absent-share states do not offer retry or perform remote reads', async () => {
  const test = await dialog(new TypeError('Offline'), false);
  try { assert.equal(test.reads(), 0); assert.equal(test.retry(), undefined); }
  finally { test.close(); }
});

it('read retry adds no timer or automatic loop', () => {
  const source = readFileSync('src/hooks/useSetlistShare.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(!/setTimeout|setInterval|\bwhile\s*\(|\bfor\s*\(/.test(source));
  assert.ok(source.includes('[setlistId, shares, memory, attempt]'));
});

