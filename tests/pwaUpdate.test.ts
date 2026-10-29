import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createUpdateCoordinator, shouldReloadNow } from '../src/pwa/updatePolicy';
import { hasPendingDrafts } from '../src/pwa/chunkRecovery';
import { isSessionActive, resetSessionActivity, setSessionActive } from '../src/pwa/sessionActivity';

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
  const regla = (requestedHere: boolean, sessionActive = false, draftsPending = false) =>
    shouldReloadNow({ requestedHere, sessionActive, draftsPending });

  it('1. dos pestañas: sólo recarga la que pidió actualizar', () => {
    eq(regla(true), true, 'la que lo pidió');
    eq(regla(false), false, 'la otra no');
  });

  it('2. la segunda pestaña en Modo Misa no se recarga', () => {
    eq(regla(false, true), false);
  });

  it('3. ni en Modo Ensayo', () => {
    eq(regla(false, true), false);
  });

  it('4. y la que pidió actualizar tampoco, si tiene algo en marcha', () => {
    // Alguien puede pulsar Actualizar desde el aviso teniendo una misa
    // abierta en esa misma pestaña. Se le ofrece, no se le impone.
    eq(regla(true, true), false);
  });

  it('5. ni con borradores sin guardar, aunque no haya misa ni ensayo', () => {
    // El hueco que faltaba. Los borradores sobrevivirían a la recarga, pero
    // volver y encontrarse el editor cerrado no es seguir donde estabas.
    eq(regla(true, false, true), false, 'con borradores no');
    eq(regla(true, false, false), true, 'sin ellos sí');
  });

  it('la regla no depende de nada más', () => {
    // Tres entradas, ocho casos, y sólo uno recarga.
    const casos = [true, false].flatMap((r) =>
      [true, false].flatMap((s) => [true, false].map((d) => shouldReloadNow({ requestedHere: r, sessionActive: s, draftsPending: d })))
    );
    eq(casos.filter(Boolean).length, 1, 'uno y sólo uno');
    eq(regla(true), true, 'y es éste');
  });
});

// --- El ciclo entero, ejercitado ------------------------------------------

/** Una pestaña: su coordinación y lo que le pasó. */
function pestana(opciones: { sesion?: boolean; borradores?: boolean } = {}) {
  const recargas: number[] = [];
  const ofrecidas: number[] = [];
  const skips: number[] = [];
  let sesion = opciones.sesion ?? false;
  let borradores = opciones.borradores ?? false;
  const coord = createUpdateCoordinator({
    sessionActive: () => sesion,
    draftsPending: () => borradores,
    reload: () => recargas.push(1),
    offerUpdate: () => ofrecidas.push(1),
    skipWaiting: async () => void skips.push(1),
  });
  return {
    coord, recargas, ofrecidas, skips,
    sale() { sesion = false; borradores = false; },
    entra() { sesion = true; },
  };
}

describe('Dos pestañas, una actualiza', () => {
  it('1. la que pulsa recarga; la otra ni se entera de recargar', async () => {
    const a = pestana();
    const b = pestana();
    await a.coord.request();
    eq(a.skips.length, 1, 'se le dijo al service worker que tomara el mando');
    // `controlling` llega a las dos pestañas a la vez.
    a.coord.tookControl();
    b.coord.tookControl();
    eq(a.recargas.length, 1, 'la que lo pidió, sí');
    eq(b.recargas.length, 0, 'la otra, no');
    eq(b.ofrecidas.length, 1, 'y se le ofrece en su momento');
  });

  it('3. ninguna pestaña hereda el «lo pedí yo» de otra', () => {
    // Las banderas viven dentro del cierre de cada coordinación, así que no
    // hay forma de que una vea la de otra.
    const a = pestana();
    const b = pestana();
    void a.coord.request();
    eq(a.coord.debug.requestedHere, true);
    eq(b.coord.debug.requestedHere, false, 'la otra sigue a lo suyo');
    b.coord.tookControl();
    eq(b.recargas.length, 0);
  });
});

describe('2. Pulsar Actualizar durante una misa o un ensayo', () => {
  it('se bloquea la recarga, pero el service worker sí se activa', async () => {
    const p = pestana({ sesion: true });
    await p.coord.request();
    eq(p.skips.length, 1, 'el SKIP_WAITING se manda igual: nada se queda esperando');
    p.coord.tookControl();
    eq(p.recargas.length, 0, 'y no se recarga encima de la misa');
    eq(p.ofrecidas.length, 1, 'se vuelve a ofrecer');
  });

  it('y al salir del modo NO salta ninguna recarga guardada', () => {
    // El peligro sería dejar algo apuntado para más tarde: alguien termina
    // la misa, cierra la pantalla y la página se le va de golpe.
    const p = pestana({ sesion: true });
    void p.coord.request();
    p.coord.tookControl();
    eq(p.recargas.length, 0);
    p.sale();
    // Sale del modo. Pasa el tiempo. No hay nada que dispare una recarga.
    eq(p.recargas.length, 0, 'sigue sin recargar sola');
  });

  it('pero queda una forma clara de hacerlo: volver a pulsar', async () => {
    const p = pestana({ sesion: true });
    await p.coord.request();
    p.coord.tookControl();
    eq([p.recargas.length, p.ofrecidas.length], [0, 1]);
    p.sale();
    await p.coord.request();
    eq(p.recargas.length, 1, 'ahora sí');
    eq(p.skips.length, 1, 'y sin repetir el SKIP_WAITING: ya no hace falta');
  });

  it('lo mismo con borradores sin guardar', async () => {
    const p = pestana({ borradores: true });
    await p.coord.request();
    p.coord.tookControl();
    eq(p.recargas.length, 0, 'no recarga encima de lo escrito');
    p.sale();
    await p.coord.request();
    eq(p.recargas.length, 1);
  });
});

describe('Si otra pestaña actualizó primero', () => {
  it('pulsar aquí sólo recarga ésta: no hay nada que activar', async () => {
    const p = pestana();
    p.coord.tookControl();          // otra pestaña lo aplicó
    eq([p.recargas.length, p.ofrecidas.length], [0, 1]);
    await p.coord.request();
    eq(p.recargas.length, 1);
    eq(p.skips.length, 0, 'no se reenvía SKIP_WAITING a un SW que ya manda');
  });

  it('y si hay una misa, tampoco entonces', async () => {
    const p = pestana({ sesion: true });
    p.coord.tookControl();
    await p.coord.request();
    // `request` con `stale` recarga directamente: es lo que la persona pidió
    // estando ya avisada de que su código es viejo.
    eq(p.recargas.length, 1, 'lo pidió explícitamente');
  });
});

describe('Los borradores se detectan como los detecta el editor', () => {
  it('el mismo lector, para que los dos caminos digan lo mismo', () => {
    eq(hasPendingDrafts(null), false);
    eq(hasPendingDrafts(JSON.stringify({ version: 1, drafts: {} })), false, 'vacío no cuenta');
    eq(hasPendingDrafts(JSON.stringify({ version: 1, drafts: { 'a::b': {} } })), true);
    eq(hasPendingDrafts('{roto'), true, 'ante la duda, se respeta');
  });
});

// --- Lo que lee de verdad ---------------------------------------------------

describe('La sesión se consulta de verdad, no se supone', () => {
  it('con una pantalla de sesión abierta, la coordinación la ve', () => {
    // Se enchufa la señal de verdad, no un booleano inventado.
    resetSessionActivity();
    const recargas: number[] = [];
    const coord = createUpdateCoordinator({
      sessionActive: isSessionActive,
      draftsPending: () => false,
      reload: () => recargas.push(1),
      offerUpdate() {},
      skipWaiting: async () => {},
    });
    setSessionActive('ensayo', true);
    void coord.request();
    coord.tookControl();
    eq(recargas.length, 0, 'ensayando no se recarga');
    resetSessionActivity();
    void coord.request();
    eq(recargas.length, 1, 'al salir, pulsar otra vez sí');
  });

  it('y la coordinación pregunta cada vez, no una sola al empezar', () => {
    // Si lo preguntara una vez y lo guardara, entrar en una misa después de
    // registrar la aplicación no protegería nada.
    let enMisa = false;
    const recargas: number[] = [];
    const coord = createUpdateCoordinator({
      sessionActive: () => enMisa,
      draftsPending: () => false,
      reload: () => recargas.push(1),
      offerUpdate() {},
      skipWaiting: async () => {},
    });
    void coord.request();
    enMisa = true;              // entra en la misa DESPUÉS de pedir
    coord.tookControl();
    eq(recargas.length, 0, 'lo pregunta en el momento de decidir');
  });

  it('y el cable con el navegador usa la señal de sesión', () => {
    eq(fuente().includes('sessionActive: isSessionActive'), true);
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

  it('7. el aviso se vuelve a ofrecer en vez de callar', () => {
    // Comprobado por comportamiento más arriba; aquí sólo que el cable
    // conecta el ofrecimiento con el estado que mira la pantalla.
    eq(fuente().includes("offerUpdate: () => publish({ kind: 'update-available' })"), true);
  });

});

// --- Lo que no se rompe -----------------------------------------------------

describe('Nada de esto toca datos ni crea bucles', () => {
  it('no se borra ningún dato de la persona', () => {
    const f = fuente();
    // Los borradores se LEEN, para no recargar encima. Nada se escribe ni se
    // borra: ni setItem, ni removeItem, ni clear.
    eq(/localStorage\.(setItem|removeItem|clear)|\.clear\(\)/.test(f), false);
    eq(f.includes('localStorage.getItem'), true, 'sólo lectura');
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

  it('y una coordinación recién creada no recarga nada por su cuenta', () => {
    // Sin que nadie pida ni pase nada, no debe ocurrir ninguna recarga.
    const p = pestana();
    eq([p.recargas.length, p.ofrecidas.length, p.skips.length], [0, 0, 0]);
    eq(p.coord.debug, { requestedHere: false, stale: false });
  });
});
