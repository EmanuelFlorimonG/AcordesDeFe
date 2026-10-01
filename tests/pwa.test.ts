import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

/**
 * El service worker guarda la aplicación, y sólo la aplicación.
 *
 * Aquí se vigilan dos cosas que no se ven y que, si se rompen, se rompen en
 * silencio. La primera es el alcance: el cancionero ya tiene su copia local y
 * los Setlists la suya, así que meter Supabase en el service worker sería
 * tener dos verdades sobre los mismos datos y no saber cuál manda. La
 * segunda es la actualización: una versión nueva no puede tomar el control y
 * recargar sola, porque el peor momento posible para eso es la mitad de una
 * misa.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`pwa.test: ${checks} comprobaciones`));

/** Sin comentarios: lo que se comprueba es lo que hace, no lo que cuenta. */
const sinComentarios = (text: string) =>
  text
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

const config = sinComentarios(readFileSync('vite.config.ts', 'utf8'));
const pwa = sinComentarios(readFileSync('src/pwa.ts', 'utf8'));
const main = sinComentarios(readFileSync('src/main.tsx', 'utf8'));

describe('Lo que el service worker guarda', () => {
  it('todo lo que produce el build, incluidos los trozos que se piden aparte', () => {
    // Sin los `import()` diferidos, abrir Modo Misa sin conexión fallaría al
    // pedir su trozo. Por eso se guardan por extensión y no por lista: los
    // nombres llevan un hash que cambia en cada build.
    eq(config.includes("globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest,ico}']"), true);
    eq(/globPatterns[\s\S]{0,200}assets\/[A-Za-z]+-[A-Za-z0-9_-]{8}/.test(config), false, 'ninguna lista de hashes a mano');
  });

  it('las tipografías locales entran por el mismo camino', () => {
    eq(config.includes('woff2'), true);
    const css = sinComentarios(readFileSync('src/index.css', 'utf8'));
    eq(css.includes('/fonts/inter-latin-400-normal.woff2'), true, 'y siguen siendo las de siempre');
    eq(css.includes('/fonts/jetbrains-mono-latin-700-normal.woff2'), true);
  });

  it('una recarga sirve la aplicación: las rutas son hash', () => {
    eq(config.includes("navigateFallback: 'index.html'"), true);
  });

  it('el manifiesto es el escrito a mano, no uno generado', () => {
    eq(config.includes('manifest: false'), true);
    eq(existsSync('public/manifest.webmanifest'), true);
  });
});

describe('Lo que el service worker NO guarda', () => {
  it('nada de Supabase: el catálogo y los Setlists ya tienen su copia', () => {
    eq(config.includes('runtimeCaching'), false, 'ni una regla de caché en vuelo');
    for (const forbidden of ['supabase', 'rest/v1', 'NetworkFirst', 'StaleWhileRevalidate', 'CacheFirst']) {
      eq(config.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
    }
  });

  it('nada de YouTube: reproducir necesita internet y punto', () => {
    for (const forbidden of ['youtube', 'googlevideo', 'ytimg', 'nocookie']) {
      eq(config.toLowerCase().includes(forbidden), false, forbidden);
    }
    // Y el motor del reproductor sigue sin guardar nada por su cuenta.
    const engine = sinComentarios(readFileSync('src/utils/youtubePlayerEngine.ts', 'utf8'));
    for (const forbidden of ['caches', 'localStorage', 'indexedDB']) {
      eq(engine.includes(forbidden), false, `motor: ${forbidden}`);
    }
  });

  it('tampoco se guarda nada en desarrollo, que esconde los cambios', () => {
    eq(/devOptions:[\s\S]{0,120}enabled: false/.test(config), true);
  });
});

describe('Una versión nueva no toma el control sola', () => {
  it('la estrategia es avisar, nunca aplicar', () => {
    eq(config.includes("registerType: 'prompt'"), true);
    eq(config.includes('autoUpdate'), false, 'jamás');
  });

  it('lo que aplica la actualización se guarda, no se llama', () => {
    eq(pwa.includes('applyUpdate = () => update(true)'), true, 'se guarda');
    // La única llamada está detrás de una función que nadie invoca todavía.
    eq((pwa.match(/applyUpdate\?\.\(\)/g) ?? []).length, 1);
    eq(pwa.includes('export async function applyPendingUpdate'), true);
    // Y nada la llama desde la aplicación.
    eq(main.includes('applyPendingUpdate'), false);
  });

  it('no hay recargas automáticas por ninguna parte', () => {
    for (const forbidden of ['location.reload', 'window.location.href =', 'skipWaiting()']) {
      eq(pwa.includes(forbidden), false, forbidden);
    }
  });

  it('se puede distinguir listo, actualización y error', () => {
    for (const kind of ["'ready'", "'update-available'", "'error'", "'idle'"]) {
      eq(pwa.includes(kind), true, kind);
    }
    eq(pwa.includes('onOfflineReady()'), true);
    eq(pwa.includes('onNeedRefresh()'), true);
    eq(pwa.includes('onRegisterError('), true);
    // Y leerlo desde fuera, para cuando haya una pantalla que lo muestre.
    eq(pwa.includes('export function subscribeToPwa'), true);
    eq(pwa.includes('export function getPwaState'), true);
  });

  it('la pantalla la ofrece, y nadie la aplica por su cuenta', () => {
    const app = sinComentarios(readFileSync('src/App.tsx', 'utf8'));
    // La aplicación mira el estado por el puente de React, no por dentro.
    eq(app.includes('usePwaState()'), true);
    eq(app.includes("update={pwa.kind === 'update-available'}"), true);
    for (const forbidden of ['getPwaState(', 'subscribeToPwa(']) {
      eq(app.includes(forbidden), false, forbidden);
    }
    // Y lo que aplica la versión nueva sólo se llama desde una pulsación.
    eq(app.includes('void applyPendingUpdate();'), true);
    for (const forbidden of ['location.reload', 'skipWaiting']) {
      eq(app.includes(forbidden), false, forbidden);
    }
  });

  it('un navegador sin service worker no rompe nada', () => {
    eq(pwa.includes("!('serviceWorker' in navigator)"), true);
    eq(pwa.includes('.catch('), true, 'y un fallo de registro se recoge');
  });
});

describe('El registro', () => {
  it('se hace una vez, al arrancar, y en diferido', () => {
    eq(main.includes('registerPwa()'), true);
    eq(config.includes('injectRegister: null'), true, 'no lo inyecta el plugin');
    eq(pwa.includes("await import('virtual:pwa-register')") || pwa.includes("import('virtual:pwa-register')"), true);
  });
});
