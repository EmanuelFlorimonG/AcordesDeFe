import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AUTH_MESSAGES,
  MIN_PASSWORD_LENGTH,
  checkEmailOnly,
  checkNewPassword,
  checkSignInForm,
  checkSignUpForm,
  hasStoredSession,
  initialOf,
  nameOf,
  type AppSession,
  type AuthFailure,
} from '../src/auth/session';
import { NEW_PASSWORD_HASH, captureRecovery, clearRecovery, readRecoveryFragment, recoveryLink, recoveryProblem } from '../src/auth/recovery';
import { canOpenAdminPanel } from '../src/admin/useEditorialRole';
import { resolveAccess } from '../src/admin/auth';
import { Sidebar } from '../src/components/Layout/Sidebar';

let checks = 0;
const eq = (actual: unknown, expected: unknown, message?: string) => {
  assert.deepEqual(actual, expected, message);
  checks++;
};
after(() => console.log(`account: ${checks} comprobaciones`));

const signedIn = (extra: Partial<AppSession> = {}): AppSession => ({
  userId: '6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f',
  email: 'juan@example.com',
  displayName: 'Juan',
  emailConfirmed: true,
  ...extra,
});

// --- What the forms ask for ---------------------------------------------------------

describe('Crear cuenta: lo mínimo, y bien escrito', () => {
  it('nombre, correo y contraseña; nada más', () => {
    eq(checkSignUpForm('Juan', 'juan@example.com', 'secreta', 'secreta'), {}, 'lo válido pasa sin preguntas');
    eq(checkSignUpForm('  Juan  ', 'juan@example.com', 'secreta', 'secreta'), {}, 'los espacios de alrededor no cuentan');
  });

  it('el nombre es obligatorio y corto', () => {
    eq(checkSignUpForm('', 'juan@example.com', 'secreta', 'secreta').name, 'Escribe tu nombre.');
    eq(checkSignUpForm('   ', 'juan@example.com', 'secreta', 'secreta').name, 'Escribe tu nombre.');
    eq(checkSignUpForm('J'.repeat(61), 'juan@example.com', 'secreta', 'secreta').name, 'Como mucho 60 caracteres.');
    eq(checkSignUpForm('J'.repeat(60), 'juan@example.com', 'secreta', 'secreta').name, undefined, 'sesenta sí caben');
  });

  it('el correo tiene que parecer un correo', () => {
    for (const email of ['', 'juan', 'juan@', 'juan@example', '@example.com', 'juan example@com']) {
      eq(checkSignUpForm('Juan', email, 'secreta', 'secreta').email, 'Escribe un correo válido.', email);
    }
    eq(checkEmailOnly('juan@example.com'), {});
    eq(checkEmailOnly('nada').email, 'Escribe un correo válido.');
  });

  it('la contraseña: sólo lo que Supabase pide, y escrita dos veces igual', () => {
    eq(checkSignUpForm('Juan', 'juan@example.com', 'corta', 'corta').password, `Al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    eq(checkSignUpForm('Juan', 'juan@example.com', 'secreta', 'otra').repeat, 'Las dos contraseñas no son iguales.');
    eq(checkSignUpForm('Juan', 'juan@example.com', '123456', '123456'), {}, 'sin reglas inventadas: seis caracteres bastan');
    eq(checkNewPassword('secreta', 'secreta'), {});
    eq(checkNewPassword('abc', 'abc').password, `Al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    eq(checkNewPassword('secreta', 'secretA').repeat, 'Las dos contraseñas no son iguales.');
  });

  it('entrar sólo comprueba que haya correo y contraseña', () => {
    eq(checkSignInForm('juan@example.com', 'x'), {}, 'la contraseña la juzga el servidor, no este formulario');
    eq(checkSignInForm('juan@example.com', '').password, 'Escribe tu contraseña.');
    eq(checkSignInForm('nada', 'secreta').email, 'Escribe un correo válido.');
  });
});

// --- How someone is called ----------------------------------------------------------

describe('El nombre visible', () => {
  it('es el que la persona escribió', () => {
    eq(nameOf(signedIn()), 'Juan');
    eq(initialOf(signedIn()), 'J');
    eq(initialOf(signedIn({ displayName: 'ángela' })), 'Á', 'y su inicial se ve como se escribe');
  });

  it('si no hay nombre, la parte del correo antes de la arroba', () => {
    eq(nameOf(signedIn({ displayName: null })), 'juan');
    eq(nameOf(signedIn({ displayName: '   ' })), 'juan');
    eq(nameOf(signedIn({ displayName: null, email: null })), 'Mi cuenta', 'y si tampoco hay correo, algo neutro');
  });
});

// --- What people read when algo falla -----------------------------------------------

describe('Los errores se explican en español', () => {
  it('cada fallo tiene su mensaje, y ninguno es el de Supabase', () => {
    const failures: AuthFailure[] = [
      'invalid-credentials',
      'email-not-confirmed',
      'email-taken',
      'weak-password',
      'invalid-email',
      'expired-link',
      'rate-limited',
      'network',
      'unavailable',
    ];
    for (const failure of failures) {
      const message = AUTH_MESSAGES[failure];
      eq(typeof message === 'string' && message.length > 10, true, failure);
      eq(/error|invalid|failed|supabase|auth/i.test(message), false, `${failure}: nada de jerga`);
      eq(message.endsWith('.'), true, `${failure}: una frase entera`);
    }
    eq(Object.keys(AUTH_MESSAGES).length, failures.length, 'ni de más ni de menos');
  });
});

// --- The link from the recovery mail ------------------------------------------------

describe('El enlace para recuperar la contraseña', () => {
  const fragment = (params: Record<string, string>) => `#${new URLSearchParams(params).toString()}`;

  it('se reconoce sólo lo que manda Supabase, nunca una ruta nuestra', () => {
    const tokens = { access_token: 'ey.acceso', refresh_token: 'refresco', type: 'recovery', token_type: 'bearer' };
    eq(readRecoveryFragment(fragment(tokens)), { kind: 'link', link: { accessToken: 'ey.acceso', refreshToken: 'refresco' } });
    eq(readRecoveryFragment('#/song/huracan-hakuna'), null, 'una canción es una canción');
    eq(readRecoveryFragment('#/admin'), null);
    eq(readRecoveryFragment(''), null);
    eq(readRecoveryFragment('#'), null);
    eq(readRecoveryFragment(fragment({ access_token: 'x', refresh_token: 'y', type: 'signup' })), null, 'otra cosa no es recuperar');
  });

  it('un enlace caducado se dice, no se rompe', () => {
    eq(readRecoveryFragment('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid'), {
      kind: 'problem',
      reason: 'expired-link',
    });
    eq(readRecoveryFragment('#error=server_error'), { kind: 'problem', reason: 'unavailable' });
    eq(readRecoveryFragment(fragment({ type: 'recovery', access_token: 'suelto' })), { kind: 'problem', reason: 'unavailable' });
  });

  it('el token sale de la barra de direcciones en el primer instante', () => {
    clearRecovery();
    let href = '';
    const target = {
      location: {
        hash: '#access_token=ey.acceso&refresh_token=refresco&type=recovery',
        pathname: '/AcordesDeFe/',
        search: '',
      } as Location,
      history: {
        replaceState: (_state: unknown, _title: string, url: string) => {
          href = url;
        },
      } as unknown as History,
    };
    const found = captureRecovery(target);
    eq(found?.kind, 'link');
    eq(href, `/AcordesDeFe/${NEW_PASSWORD_HASH}`, 'la dirección pasa a ser una ruta nuestra, sin token');
    eq(href.includes('access_token'), false);
    eq(recoveryLink(), { accessToken: 'ey.acceso', refreshToken: 'refresco' }, 'y queda en memoria, no en el almacenamiento');
    eq(recoveryLink() !== null, true, 'mirarlo no lo gasta: React monta dos veces mientras se desarrolla');
    clearRecovery();
    eq(recoveryLink(), null, 'usado, se olvida');
    eq(recoveryProblem(), null);
  });

  it('una ruta normal no se toca', () => {
    clearRecovery();
    let touched = false;
    const target = {
      location: { hash: '#/setlist/abc', pathname: '/', search: '' } as Location,
      history: {
        replaceState: () => {
          touched = true;
        },
      } as unknown as History,
    };
    eq(captureRecovery(target), null);
    eq(touched, false, 'la aplicación sigue donde estaba');
    eq(recoveryLink(), null);
  });

  it('nada del enlace se guarda en el navegador', () => {
    clearRecovery();
    const stored: Record<string, string> = {};
    captureRecovery({
      location: { hash: '#access_token=ey.acceso&refresh_token=refresco&type=recovery', pathname: '/', search: '' } as Location,
      history: { replaceState: () => {} } as unknown as History,
    });
    eq(Object.keys(stored), [], 'ni una clave escrita');
    eq(hasStoredSession({ getItem: () => null, setItem: () => {} }), false);
    clearRecovery();
  });
});

// --- Authentication is not authorization --------------------------------------------

describe('Tener cuenta no es ser del equipo editorial', () => {
  it('una sesión normal no abre el panel; sólo lo abre un rol de la base de datos', async () => {
    const session = signedIn();
    eq(canOpenAdminPanel(await resolveAccess(session, async () => null)), false, 'registrarse no concede nada');
    eq(canOpenAdminPanel(await resolveAccess(session, async () => 'editor')), false, 'ni un rol inventado');
    eq(canOpenAdminPanel(await resolveAccess(session, async () => 'reviewer')), true);
    eq(canOpenAdminPanel(await resolveAccess(session, async () => 'admin')), true);
    eq(canOpenAdminPanel(await resolveAccess(null, async () => 'admin')), false, 'sin sesión, nada');
  });

  it('el nombre que alguien se pone no decide nada', async () => {
    const pretender = signedIn({ displayName: 'admin' });
    eq(canOpenAdminPanel(await resolveAccess(pretender, async () => null)), false);
    eq(nameOf(pretender), 'admin', 'se muestra tal cual, y no vale para más');
  });
});

// --- What the songbook shows ---------------------------------------------------------

describe('La cuenta en la barra lateral', () => {
  const sidebar = (props: Partial<Parameters<typeof Sidebar>[0]> = {}) =>
    renderToStaticMarkup(
      createElement(Sidebar, {
        activeSection: 'cancionero',
        onNavigate: () => {},
        isDarkMode: false,
        onToggleDarkMode: () => {},
        isOpen: false,
        onClose: () => {},
        ...props,
      })
    );

  it('un visitante ve una invitación discreta, y nada más', () => {
    const markup = sidebar({ onOpenAccount: () => {} });
    eq(markup.includes('Iniciar sesión'), true);
    eq(markup.includes('Panel editorial'), false, 'el panel sigue dependiendo del rol');
  });

  it('quien entró ve su nombre y su inicial', () => {
    const markup = sidebar({ onOpenAccount: () => {}, session: signedIn() });
    eq(markup.includes('Juan'), true);
    eq(markup.includes('Iniciar sesión'), false);
    eq(markup.includes('juan@example.com'), false, 'el correo no se enseña por ahí');
  });

  it('mientras se restaura la sesión no se dice lo que no es', () => {
    const markup = sidebar({ onOpenAccount: () => {}, isSessionLoading: true });
    eq(markup.includes('Iniciar sesión'), false, 'nada de parpadeos');
    eq(markup.includes('Comprobando tu sesión'), true);
  });

  it('sin cuenta posible, la barra lateral es la de siempre', () => {
    const markup = sidebar();
    eq(markup.includes('Iniciar sesión'), false);
    eq(markup.includes('Cancionero'), true, 'y el cancionero sigue ahí');
  });
});
