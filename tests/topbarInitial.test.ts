import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Topbar } from '../src/components/Layout/Topbar';
import type { AppSession } from '../src/auth/session';

const session = (displayName: string | null, email = 'emanuel@example.com'): AppSession => ({
  userId: 'test-user', displayName, email, emailConfirmed: true,
});
const render = (user: AppSession | null, searchQuery = '') => renderToStaticMarkup(createElement(Topbar, {
  session: user, searchQuery, onSearchChange() {}, onOpenSidebar() {},
  onGoToCancionero() {}, onGoToAbout() {}, onGoToContact() {},
  activePage: 'app', inputRef: { current: null },
}));

describe('Topbar account initial', () => {
  for (const [name, initial] of [['Juanito', 'J'], ['Emanuel', 'E'], ['  juanito  ', 'J']]) {
    it(`${name} shows ${initial}`, () => {
      assert.match(render(session(name)), new RegExp(`aria-label="Abrir menú de cuenta[^>]*>${initial}</button>`));
    });
  }
  for (const name of [null, '', '   ']) {
    it(`falls back to email for ${JSON.stringify(name)}`, () => {
      assert.match(render(session(name)), /aria-label="Abrir menú de cuenta[^>]*>E<\/button>/);
    });
  }
  it('guest retains A and a meaningful accessible label', () => {
    assert.match(render(null), /aria-label="Abrir menú de cuenta"[^>]*>A<\/button>/);
  });
  it('account label describes the user without changing navigation', () => {
    const html = render(session('Juanito'));
    assert.match(html, /aria-label="Abrir menú de cuenta de Juanito"/);
    assert.match(html, />Acerca de<\/button>/);
  });
  it('uses the existing session and pure helpers without remote queries', () => {
    const topbar = readFileSync('src/components/Layout/Topbar.tsx', 'utf8');
    const app = readFileSync('src/App.tsx', 'utf8');
    assert.match(topbar, /initialOf\(session\)/);
    assert.match(app, /<Topbar\s+session=\{sessionState.state === 'signed-in' \? sessionState.session : null\}/);
    assert.doesNotMatch(topbar, /fetch\(|supabase|AppAuth|useSession|\.select\(|\.rpc\(/i);
  });
});


describe('Topbar responsive search presentation', () => {
  it('shows a decorative short mobile prompt without replacing the accessible search name', () => {
    const html = render(null);
    assert.match(html, /aria-label="Buscar canciones"/);
    assert.match(html, /placeholder="Buscar canciones, artistas, momentos…"/);
    assert.match(html, /<span aria-hidden="true"[^>]*sm:hidden[^>]*>Buscar canciones<\/span>/);
  });
  it('removes the decorative prompt when the user types and retains the query and clear action', () => {
    const html = render(null, 'María');
    assert.match(html, /value="María"/);
    assert.match(html, /aria-label="Borrar la búsqueda"/);
    assert.doesNotMatch(html, /<span aria-hidden="true"[^>]*>Buscar canciones<\/span>/);
  });
});
