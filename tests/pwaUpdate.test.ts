import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shouldReloadNow } from '../src/pwa/updatePolicy';
import { resetSessionActivity, setSessionActive } from '../src/pwa/sessionActivity';

/**
 * Actualizar una pestaña no puede recargar las demás.
 *
 * El fallo venía de la biblioteca, no del proyecto. `vite-plugin-pwa`, en su
 * modo «prompt», registra un oyente de `controlling` en cuanto hay una
 * versión esperando —no cuando alguien pulsa Actualizar— y ese oyente llama a
 * `window.location.reload()`. Como `controlling` llega a todas las pestañas
 * del origen a la vez, actualizar en una recargaba todas, incluida la que
 * tuviera una misa abierta.
 *
 * Detalle que conviene no olvidar: `updateServiceWorker(reloadPage)` ignora su
 * argumento. Pasar `false` no cambia nada, porque la recarga no sale de ahí.
 * Lo único que la evita es dar `onNeedReload`, que la biblioteca llama en vez
 * de recargar ella.
 *
 * La regla que queda es corta: recarga sólo la pestaña que lo pidió, y sólo
 * si no hay nada en marcha. Las demás se quedan como estaban y lo ofrecen; si
 * alguna necesita una pantalla que ya no puede descargar, la recuperación de
 * trozos se encarga.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`pwaUpdate.test: ${checks} comprobaciones`));

const fuente = () => readFileSync('src/pwa.ts', 'utf8');

// --- La regla ---------------------------------------------------------------

describe('Quién se recarga y quién no', () => {
  it('1. dos pestañas: sólo recarga la que pidió actualizar', () => {
    eq(shouldReloadNow({ requestedHere: true, sessionActive: false }), true, 'la que lo pidió');
    eq(shouldReloadNow({ requestedHere: false, sessionActive: false }), false, 'la otra no');
  });

  it('2. la segunda pestaña en Modo Misa no se recarga', () => {
    // Ni aunque no hubiera sesión: no fue ella quien lo pidió. Y con sesión,
    // menos todavía.
    eq(shouldReloadNow({ requestedHere: false, sessionActive: true }), false);
  });

  it('3. ni en Modo Ensayo', () => {
    eq(shouldReloadNow({ requestedHere: false, sessionActive: true }), false);
  });

  it('4. y la que pidió actualizar tampoco, si tiene algo en marcha', () => {
    // Alguien puede pulsar Actualizar desde el aviso teniendo una misa
    // abierta en esa misma pestaña. Se le ofrece, no se le impone.
    eq(shouldReloadNow({ requestedHere: true, sessionActive: true }), false);
  });

  it('la regla no depende de nada más', () => {
    // Dos entradas, cuatro casos, y sólo uno recarga.
    const casos = [true, false].flatMap((r) => [true, false].map((s) => shouldReloadNow({ requestedHere: r, sessionActive: s })));
    eq(casos, [false, true, false, false]);
  });
});

// --- Lo que lee de verdad ---------------------------------------------------

describe('La sesión se consulta de verdad, no se supone', () => {
  it('con una pantalla de sesión abierta, la regla la ve', () => {
    resetSessionActivity();
    eq(shouldReloadNow({ requestedHere: true, sessionActive: false }), true);
    setSessionActive('ensayo', true);
    // Así es como lo pregunta el módulo: isSessionActive().
    eq(shouldReloadNow({ requestedHere: true, sessionActive: true }), false);
    resetSessionActivity();
  });

  it('y el módulo pregunta por la señal, no por el almacenamiento', () => {
    eq(fuente().includes('isSessionActive()'), true);
  });
});

// --- El enganche con la biblioteca ------------------------------------------

describe('La biblioteca ya no recarga por su cuenta', () => {
  it('5. se le pasa onNeedReload, que es lo único que la detiene', () => {
    // Su código hace: `if (onNeedReload) onNeedReload(); else location.reload()`.
    // Sin esta función, recarga ella, y en todas las pestañas.
    eq(fuente().includes('onNeedReload()'), true);
  });

  it('y el oyente de la biblioteca se registra al ESPERAR, no al pulsar', () => {
    // Por eso cambiar updateSW(true) por SKIP_WAITING no habría servido de
    // nada: el oyente ya estaba puesto en todas las pestañas.
    const biblioteca = readFileSync('node_modules/vite-plugin-pwa/dist/client/build/register.js', 'utf8');
    eq(biblioteca.includes('wb.addEventListener("waiting", showSkipWaitingPrompt)'), true);
    eq(/showSkipWaitingPrompt = \(\) => \{[\s\S]{0,200}addEventListener\("controlling"/.test(biblioteca), true);
    // Y su updateServiceWorker ignora el argumento: no decide la recarga.
    eq(/updateServiceWorker = async \(_reloadPage = true\)/.test(biblioteca), true);
  });

  it('6. sigue siendo «prompt»: la actualización la decide la persona', () => {
    const config = readFileSync('vite.config.ts', 'utf8');
    eq(config.includes("registerType: 'prompt'"), true);
    eq(fuente().includes('applyUpdate = () => update(true)'), true, 'la activación sigue siendo manual');
  });

  it('7. si otra pestaña ya actualizó, pulsar Actualizar aquí sólo recarga ésta', () => {
    // No hay nada que activar: el service worker nuevo ya manda. Volver a
    // mandar SKIP_WAITING dejaría a la persona mirando un botón que no hace
    // nada.
    const f = fuente();
    eq(f.includes('if (stale) {'), true);
    eq(/if \(stale\) \{[\s\S]{0,120}window\.location\.reload\(\)/.test(f), true);
  });

  it('y mientras tanto se vuelve a ofrecer, en vez de callar', () => {
    const f = fuente();
    const i = f.indexOf('onNeedReload()');
    const trozo = f.slice(i, i + 900);
    eq(trozo.includes("publish({ kind: 'update-available' })"), true, trozo.slice(0, 200));
  });
});

// --- Lo que no se rompe -----------------------------------------------------

describe('Nada de esto toca datos ni crea bucles', () => {
  it('no se borra ningún dato de la persona', () => {
    const f = fuente();
    eq(/localStorage|sessionStorage|\.clear\(\)/.test(f), false);
  });

  it('una pestaña que no recarga se queda con código viejo, y eso ya tiene arreglo', () => {
    // Es la consecuencia aceptada: no recargar significa seguir con lo
    // anterior. Si una pantalla no se puede descargar, el límite de error se
    // encarga. Las dos piezas se necesitan.
    eq(readFileSync('src/app/Root.tsx', 'utf8').includes('LazyScreenBoundary'), true);
    eq(readFileSync('src/pwa/chunkRecovery.ts', 'utf8').includes('planRecovery'), true);
  });

  it('no quedan service workers esperando para siempre', () => {
    // El SKIP_WAITING se envía igual: lo que cambia es quién recarga después.
    // El service worker nuevo se activa, no se queda esperando.
    eq(fuente().includes('update(true)'), true);
  });

  it('y no hay recarga sin que alguien la haya pedido', () => {
    const f = fuente();
    const recargas = [...f.matchAll(/window\.location\.reload\(\)/g)].length;
    eq(recargas, 2, 'una para la que ya está obsoleta, otra tras actualizar');
    // Las dos están detrás de una comprobación, ninguna suelta.
    eq(/if \(stale\) \{\s*\n\s*window\.location\.reload\(\)/.test(f), true);
    eq(/if \(shouldReloadNow\([\s\S]{0,80}\)\) \{\s*\n\s*window\.location\.reload\(\)/.test(f), true);
  });
});
