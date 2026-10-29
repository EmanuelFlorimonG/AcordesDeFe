import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import {
  RECOVERY_KEY,
  type RecoveryEnv,
  SESSION_FRESH_MS,
  chunkKeyOf,
  currentBuildId,
  isChunkLoadError,
  markRecoveryAttempt,
  planRecovery,
  whatIsBusy,
} from '../src/pwa/chunkRecovery';
import { LazyScreenBoundary } from '../src/components/Layout/LazyScreenBoundary';
import {
  activeSession,
  isSessionActive,
  resetSessionActivity,
  setSessionActive,
  useSessionActivity,
} from '../src/pwa/sessionActivity';
import { runHook } from './hookHarness';

/**
 * Qué pasa cuando una pantalla no se descarga tras un despliegue.
 *
 * El fallo real: la aplicación se quedaba cargando y no abría. Las pantallas
 * pesadas se piden cuando hacen falta, el servidor borra los trozos viejos al
 * desplegar, y una pestaña abierta desde antes pedía un archivo que ya no
 * existía. Sin límite de error, ese rechazo dejaba el `Suspense` puesto para
 * siempre.
 *
 * Lo que se comprueba aquí es que la recuperación no sea peor que el fallo:
 * que no recargue encima de una misa ni de un editor con cosas escritas, que
 * no entre en bucle, y que no esconda errores de verdad detrás de una
 * recarga.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`chunkRecovery.test: ${checks} comprobaciones`));

/** Un almacenamiento de mentira, que puede además negarse. */
function memoria({ falla = false, inicial = {} as Record<string, string> } = {}) {
  const datos = new Map(Object.entries(inicial));
  return {
    datos,
    api: {
      getItem: (k: string) => datos.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (falla) throw new DOMException('QuotaExceededError');
        datos.set(k, v);
      },
      removeItem: (k: string) => void datos.delete(k),
    },
  };
}

const AHORA = Date.UTC(2026, 9, 28, 12);

/** Una sesión de Misa tal como la guarda la aplicación. */
const sesion = (updatedAt: number) =>
  JSON.stringify({ version: 1, setlistId: 's1', itemId: 'i1', updatedAt });

function entorno(opciones: { intentos?: ReturnType<typeof memoria>; datos?: Record<string, string>; buildId?: string; live?: 'misa' | 'ensayo' | null } = {}): RecoveryEnv {
  return {
    attempts: (opciones.intentos ?? memoria()).api,
    data: memoria({ inicial: opciones.datos ?? {} }).api,
    buildId: opciones.buildId ?? 'index-aaa111.js',
    now: () => AHORA,
    // Sin señal por defecto: cada prueba dice si hay pantalla abierta.
    liveSession: () => opciones.live ?? null,
  };
}

const CHUNK = new TypeError('Failed to fetch dynamically imported module: https://x/assets/a.js');

// --- Reconocer el fallo correcto -------------------------------------------

describe('Sólo se recupera de lo que de verdad es un trozo que falta', () => {
  it('reconoce cómo lo dicen los tres navegadores', () => {
    for (const mensaje of [
      'Failed to fetch dynamically imported module: https://x/assets/a.js',
      'error loading dynamically imported module',
      'Importing a module script failed.',
      'Loading chunk 42 failed.',
    ]) {
      eq(isChunkLoadError(new TypeError(mensaje)), true, mensaje);
    }
    const porNombre = new Error('vaya');
    porNombre.name = 'ChunkLoadError';
    eq(isChunkLoadError(porNombre), true, 'también por el nombre');
  });

  it('y no se traga cualquier otro error', () => {
    // Recargar ante un fallo cualquiera escondería errores de verdad detrás
    // de una recarga, y nadie volvería a verlos.
    for (const otro of [
      new TypeError('Cannot read properties of undefined'),
      new Error('Minified React error #310'),
      new RangeError('Maximum call stack size exceeded'),
      null,
      undefined,
      'texto suelto',
    ]) {
      eq(isChunkLoadError(otro), false, String(otro));
    }
  });

  it('un error que no es de descarga se cuenta, no se recarga', () => {
    eq(planRecovery(new TypeError('otra cosa'), entorno()), { action: 'show-error' });
  });
});

// --- No recargar encima del trabajo de nadie --------------------------------

describe('No se recarga sola si hay algo en marcha', () => {
  it('con una celebración abierta, pregunta', () => {
    const plan = planRecovery(CHUNK, entorno({ datos: { genesaret_mass_session: sesion(AHORA) } }));
    eq(plan.action, 'ask');
    eq(plan.action === 'ask' && plan.reason, 'busy');
    eq(plan.action === 'ask' && plan.busy.session, true);
  });

  it('con borradores sin guardar, pregunta', () => {
    const borradores = JSON.stringify({ version: 1, drafts: { 'a::b': { itemId: 'b' } } });
    const plan = planRecovery(CHUNK, entorno({ datos: { genesaret_setlist_item_drafts: borradores } }));
    eq(plan.action, 'ask');
    eq(plan.action === 'ask' && plan.busy.drafts, true);
  });

  it('una clave de sesión con basura dentro NO es una sesión activa', () => {
    // Que exista la clave no prueba nada: puede llevar texto ilegible, una
    // versión que ya no se entiende o faltarle la canción.
    for (const basura of ['{roto', '{}', '{"version":99,"setlistId":"s","itemId":"i"}', '{"version":1,"setlistId":"","itemId":""}', 'null']) {
      eq(whatIsBusy(entorno({ datos: { genesaret_mass_session: basura } })).session, false, basura);
    }
  });

  it('y una sesión que nadie tocó en horas tampoco', () => {
    // Se reescribe al pasar de canción, así que una vieja es una olvidada.
    eq(whatIsBusy(entorno({ datos: { genesaret_mass_session: sesion(AHORA - SESSION_FRESH_MS - 1) } })).session, false);
    eq(whatIsBusy(entorno({ datos: { genesaret_mass_session: sesion(AHORA - 60_000) } })).session, true, 'una de hace un minuto sí');
  });

  it('un archivo de borradores vacío no es trabajo pendiente', () => {
    const vacio = JSON.stringify({ version: 1, drafts: {} });
    eq(whatIsBusy(entorno({ datos: { genesaret_setlist_item_drafts: vacio } })).drafts, false);
    eq(planRecovery(CHUNK, entorno({ datos: { genesaret_setlist_item_drafts: vacio } })).action, 'reload');
  });

  it('y si no se puede leer, se peca de prudente', () => {
    // Ante la duda, no se recarga encima de lo que pueda haber.
    eq(whatIsBusy(entorno({ datos: { genesaret_setlist_item_drafts: '{roto' } })).drafts, true);
  });

  it('sin nada en marcha, recarga', () => {
    eq(planRecovery(CHUNK, entorno()).action, 'reload');
  });
});

// --- Un intento, y sólo uno -------------------------------------------------

describe('Un intento por trozo y versión, nunca un bucle', () => {
  it('la segunda vez con el mismo trozo ya no recarga', () => {
    const intentos = memoria();
    const env = entorno({ intentos });
    eq(planRecovery(CHUNK, env).action, 'reload');
    markRecoveryAttempt(env, CHUNK);
    const segundo = planRecovery(CHUNK, env);
    eq(segundo.action, 'ask');
    eq(segundo.action === 'ask' && segundo.reason, 'already-tried');
  });

  it('NO se repite aunque la aplicación haya vuelto a montar entremedias', () => {
    // El fallo que tenía la primera versión: la marca se borraba al montar, y
    // como este límite envuelve la aplicación entera —que monta bien siempre—
    // el intento volvía en cada recarga y el mismo trozo recargaba sin fin.
    const intentos = memoria();
    const env = entorno({ intentos });
    for (let vuelta = 0; vuelta < 5; vuelta++) {
      const plan = planRecovery(CHUNK, env);
      if (plan.action === 'reload') markRecoveryAttempt(env, CHUNK);
      // Aquí la página recarga, la aplicación monta y vuelve a fallar.
      eq(vuelta === 0 ? plan.action : plan.action, vuelta === 0 ? 'reload' : 'ask', `vuelta ${vuelta}`);
    }
  });

  it('el intento de un trozo no gasta el de otro', () => {
    // Que no se descargue el Modo Misa no debe dejar sin recuperación al
    // editor, que puede fallar por otra causa y arreglarse recargando.
    const intentos = memoria();
    const env = entorno({ intentos });
    const misa = new TypeError('Failed to fetch dynamically imported module: https://x/assets/MassMode-AAA.js');
    const editor = new TypeError('Failed to fetch dynamically imported module: https://x/assets/SetlistDetail-BBB.js');
    markRecoveryAttempt(env, misa);
    eq(planRecovery(misa, env).action, 'ask');
    eq(planRecovery(editor, env).action, 'reload', 'el otro conserva el suyo');
  });

  it('pero una versión nueva devuelve todos los intentos', () => {
    // Desplegar otra vez es lo que de verdad da algo nuevo que probar.
    const intentos = memoria();
    markRecoveryAttempt(entorno({ intentos, buildId: 'index-vieja.js' }), CHUNK);
    eq(planRecovery(CHUNK, entorno({ intentos, buildId: 'index-nueva.js' })).action, 'reload');
  });

  it('y los intentos de la versión vieja no se arrastran', () => {
    const intentos = memoria();
    markRecoveryAttempt(entorno({ intentos, buildId: 'vieja.js' }), CHUNK);
    markRecoveryAttempt(entorno({ intentos, buildId: 'nueva.js' }), CHUNK);
    const guardado = JSON.parse(intentos.datos.get(RECOVERY_KEY)!) as { buildId: string; failures: Record<string, number> };
    eq(guardado.buildId, 'nueva.js');
    eq(Object.keys(guardado.failures).length, 1, 'sólo el de la versión actual');
  });

  it('sin dónde anotar no se recarga sola: no habría forma de evitar el bucle', () => {
    const env = entorno({ intentos: memoria({ falla: true }) });
    const plan = planRecovery(CHUNK, env);
    eq(plan.action, 'ask');
    eq(plan.action === 'ask' && plan.reason, 'cannot-remember');
  });

  it('el trozo se identifica por su nombre de archivo', () => {
    eq(chunkKeyOf(CHUNK), 'a.js');
    eq(chunkKeyOf(new TypeError('Loading chunk 42 failed.')), '42');
    eq(chunkKeyOf(new TypeError('vaya')), 'desconocido');
  });
});

// --- De dónde sale la versión -----------------------------------------------

describe('La versión cargada se reconoce por el archivo principal', () => {
  const doc = (src: string | null) => ({
    querySelector: () => (src === null ? null : ({ src } as unknown as Element)),
  });

  it('el nombre con hash del script del módulo', () => {
    eq(currentBuildId(doc('https://x/assets/index-ABC123.js')), 'index-ABC123.js');
  });

  it('y sin él, una constante: un intento por pestaña sigue evitando el bucle', () => {
    eq(currentBuildId(doc(null)), 'desconocida');
    eq(currentBuildId(null), 'desconocida');
  });
});

// --- El componente ----------------------------------------------------------

describe('El límite de error pinta algo con lo que se puede seguir', () => {
  const pinta = (hijo: React.ReactNode) =>
    renderToStaticMarkup(createElement(LazyScreenBoundary, { reload() {} }, hijo));

  it('mientras nada falla, no estorba', () => {
    eq(pinta(createElement('p', null, 'la pantalla')).includes('la pantalla'), true);
  });

  it('y ofrece recargar, con un botón de verdad', () => {
    // En servidor no se puede provocar el fallo, así que se comprueba que el
    // texto y el botón existan en el componente.
    const fuente = readFileSync('src/components/Layout/LazyScreenBoundary.tsx', 'utf8');
    eq(fuente.includes('role="alert"'), true);
    eq(fuente.includes('>\n          Recargar\n        </button>'), true, 'hay un botón de recargar');
    eq(fuente.includes('getDerivedStateFromError'), true);
    eq(fuente.includes('componentDidCatch'), true);
  });

  it('dice lo correcto en cada caso, sin prometer de más', () => {
    const fuente = readFileSync('src/components/Layout/LazyScreenBoundary.tsx', 'utf8');
    eq(fuente.includes('No se recarga sola para no cortarla'), true, 'durante una celebración');
    eq(fuente.includes('Tus borradores no se pierden al recargar'), true, 'con borradores');
    eq(fuente.includes('Ya se intentó recargar por esta versión'), true, 'tras el primer intento');
  });

  it('NO borra la marca al montar, que era el bucle', () => {
    // Este límite envuelve la aplicación entera, que monta bien siempre. Si
    // borrara la marca al arrancar, cada recarga devolvería el intento y el
    // mismo trozo podría recargar sin fin.
    const fuente = readFileSync('src/components/Layout/LazyScreenBoundary.tsx', 'utf8');
    eq(fuente.includes('componentDidMount'), false);
    eq(fuente.includes('clearRecoveryMark'), false);
    eq(fuente.includes('Lo que devuelve'), true, 'y explica qué sí la devuelve');
  });

  it('anota el intento ANTES de recargar', () => {
    // Si se anotara después, una recarga que vuelve a fallar no dejaría
    // constancia y habría bucle.
    const fuente = readFileSync('src/components/Layout/LazyScreenBoundary.tsx', 'utf8');
    const i = fuente.indexOf('markRecoveryAttempt(env, error);');
    const j = fuente.indexOf('reload ?? (() => window.location.reload())', i);
    eq(i > 0 && j > i, true, 'la marca va primero');
  });
});

// --- El componente, con un fallo de verdad ---------------------------------

describe('Ante un React.lazy rechazado de verdad, el límite reacciona', () => {
  /** Monta el límite a mano y le pasa el error, como hace React. */
  function conFallo(error: unknown, opciones: { datos?: Record<string, string>; intentos?: ReturnType<typeof memoria> } = {}) {
    const recargas: number[] = [];
    const env = entorno(opciones);
    const instancia = new LazyScreenBoundary({ env, reload: () => recargas.push(1) });
    instancia.state = LazyScreenBoundary.getDerivedStateFromError(error) as never;
    // setState no existe fuera de React: se sustituye por lo que hace.
    (instancia as unknown as { setState: (s: object) => void }).setState = (s) => {
      instancia.state = { ...instancia.state, ...s } as never;
    };
    instancia.componentDidCatch(error);
    return { instancia, recargas, env, html: () => renderToStaticMarkup(instancia.render() as React.ReactElement) };
  }

  it('el mensaje usado es el que produjo el navegador de verdad', () => {
    // Capturado ejecutando `import()` de un trozo borrado en producción:
    //   TypeError: Failed to fetch dynamically imported module: https://…/a.js
    // No está inventado, y es el que React entrega al límite.
    eq(isChunkLoadError(CHUNK), true);
    eq(CHUNK instanceof TypeError, true);
  });

  it('y un import que falla en Node no se confunde con uno del navegador', async () => {
    // Node dice ERR_MODULE_NOT_FOUND, que no es un trozo que falta tras un
    // despliegue. Que NO se reconozca es la prueba de que el detector mira
    // lo que tiene que mirar.
    let real: unknown = null;
    try {
      await import('./no-existe-este-modulo-' + Date.now() + '.js');
    } catch (e) {
      real = e;
    }
    eq(Boolean(real), true, 'el import falló de verdad');
    eq(isChunkLoadError(real), false, 'y no se trata como trozo del navegador');
  });

  it('con un fallo de trozo y nada en marcha, recarga una vez', () => {
    const { recargas } = conFallo(CHUNK);
    eq(recargas.length, 1);
  });

  it('y la segunda vez ya no recarga: pinta el botón', () => {
    const intentos = memoria();
    eq(conFallo(CHUNK, { intentos }).recargas.length, 1);
    const otra = conFallo(CHUNK, { intentos });
    eq(otra.recargas.length, 0, 'no recargó');
    const html = otra.html();
    eq(html.includes('role="alert"'), true);
    eq(html.includes('Recargar'), true);
    eq(html.includes('Ya se intentó recargar por esta versión'), true);
  });

  it('durante una celebración no recarga: lo cuenta y espera', () => {
    const { recargas, html } = conFallo(CHUNK, { datos: { genesaret_mass_session: sesion(AHORA) } });
    eq(recargas.length, 0);
    eq(html().includes('No se recarga sola para no cortarla'), true);
  });

  it('con un borrador sin guardar tampoco, y promete que no se pierde', () => {
    const borradores = JSON.stringify({ version: 1, drafts: { 'a::b': { itemId: 'b' } } });
    const { recargas, html } = conFallo(CHUNK, { datos: { genesaret_setlist_item_drafts: borradores } });
    eq(recargas.length, 0);
    eq(html().includes('Tus borradores no se pierden al recargar'), true);
  });

  it('el borrador sigue intacto después de todo esto', () => {
    // La recuperación sólo lee los datos; no borra ni uno.
    const borradores = JSON.stringify({ version: 1, drafts: { 'a::b': { itemId: 'b', changes: { notes: 'mío' } } } });
    const datos = memoria({ inicial: { genesaret_setlist_item_drafts: borradores } });
    const env: RecoveryEnv = { attempts: memoria().api, data: datos.api, buildId: 'x', now: () => AHORA };
    const instancia = new LazyScreenBoundary({ env, reload() {} });
    (instancia as unknown as { setState: (s: object) => void }).setState = () => {};
    instancia.componentDidCatch(CHUNK);
    eq(datos.datos.get('genesaret_setlist_item_drafts'), borradores, 'ni una letra cambiada');
  });
});

describe('Un error normal de React no provoca ninguna recarga', () => {
  function conFallo(error: unknown) {
    const recargas: number[] = [];
    const instancia = new LazyScreenBoundary({ children: null, env: entorno(), reload: () => recargas.push(1) });
    instancia.state = LazyScreenBoundary.getDerivedStateFromError(error) as never;
    (instancia as unknown as { setState: (s: object) => void }).setState = (s) => {
      instancia.state = { ...instancia.state, ...s } as never;
    };
    instancia.componentDidCatch(error);
    return { recargas, html: () => renderToStaticMarkup(instancia.render() as React.ReactElement) };
  }

  it('ni con un TypeError, ni con un error minificado, ni con un desbordamiento', () => {
    for (const error of [
      new TypeError('Cannot read properties of undefined (reading x)'),
      new Error('Minified React error #310'),
      new RangeError('Maximum call stack size exceeded'),
    ]) {
      const { recargas, html } = conFallo(error);
      eq(recargas.length, 0, String(error));
      eq(html().includes('Esta pantalla no se pudo abrir'), true, 'lo cuenta en vez de recargar');
    }
  });
});

// --- La señal de sesión en memoria -----------------------------------------

describe('La señal sigue el ciclo de vida de las pantallas', () => {
  it('entrar la enciende y salir la apaga', () => {
    resetSessionActivity();
    eq(isSessionActive(), false);
    setSessionActive('ensayo', true);
    eq([isSessionActive(), activeSession()], [true, 'ensayo']);
    setSessionActive('ensayo', false);
    eq([isSessionActive(), activeSession()], [false, null]);
  });

  it('con las dos abiertas manda la Misa, y apagar una no apaga la otra', () => {
    resetSessionActivity();
    setSessionActive('ensayo', true);
    setSessionActive('misa', true);
    eq(activeSession(), 'misa');
    setSessionActive('misa', false);
    eq(activeSession(), 'ensayo', 'el ensayo sigue');
    resetSessionActivity();
  });

  it('el hook la enciende al montar y la apaga al desmontar', () => {
    resetSessionActivity();
    const run = runHook(() => useSessionActivity('ensayo', true));
    eq(isSessionActive(), true, 'montado');
    run.unmount();
    eq(isSessionActive(), false, 'desmontado');
  });

  it('y la apaga al cambiar de ruta, sin desmontar', () => {
    // Salir de la canción deja `active` en falso: la limpieza del efecto
    // corre igual, que es lo que hace que no haya falsos positivos.
    resetSessionActivity();
    let activo = true;
    const run = runHook(() => useSessionActivity('ensayo', activo));
    eq(isSessionActive(), true);
    activo = false;
    run.flush();
    eq(isSessionActive(), false, 'al dejar de estar activa');
    run.unmount();
  });

  it('no deja rastro: no se guarda en ningún sitio', () => {
    const fuente = readFileSync('src/pwa/sessionActivity.ts', 'utf8');
    eq(/localStorage|sessionStorage|indexedDB|fetch\(/.test(fuente), false);
  });
});

describe('Un fallo de carga durante una sesión no recarga nada', () => {
  it('con el Ensayo abierto, pregunta y lo dice por su nombre', () => {
    const plan = planRecovery(CHUNK, entorno({ live: 'ensayo' }));
    eq(plan.action, 'ask');
    eq(plan.action === 'ask' && plan.reason, 'busy');
    eq(plan.action === 'ask' && plan.busy.live, 'ensayo');
  });

  it('con el Modo Misa abierto, igual', () => {
    const plan = planRecovery(CHUNK, entorno({ live: 'misa' }));
    eq(plan.action, 'ask');
    eq(plan.action === 'ask' && plan.busy.live, 'misa');
  });

  it('la pantalla abierta manda aunque no haya sesión guardada', () => {
    // El Ensayo no se guarda en ninguna parte: sin la señal no se vería.
    eq(whatIsBusy(entorno({ live: 'ensayo' })), { session: true, live: 'ensayo', drafts: false });
  });

  it('y el límite de error no recarga: ofrece el botón con el texto del Ensayo', () => {
    const recargas: number[] = [];
    const env = entorno({ live: 'ensayo' });
    const instancia = new LazyScreenBoundary({ env, reload: () => recargas.push(1) });
    instancia.state = LazyScreenBoundary.getDerivedStateFromError(CHUNK) as never;
    (instancia as unknown as { setState: (s: object) => void }).setState = (s) => {
      instancia.state = { ...instancia.state, ...s } as never;
    };
    instancia.componentDidCatch(CHUNK);
    eq(recargas.length, 0, 'no recargó');
    const html = renderToStaticMarkup(instancia.render() as React.ReactElement);
    eq(html.includes('mientras estabas ensayando'), true, html.slice(0, 200));
    eq(html.includes('Recargar'), true);
  });
});

describe('Al salir de los modos se puede volver a recuperar', () => {
  it('sin falsos positivos: apagada la señal, recarga como siempre', () => {
    // El riesgo de una señal en memoria es que se quede encendida y deje a
    // alguien sin recuperación para el resto de la visita.
    resetSessionActivity();
    const run = runHook(() => useSessionActivity('ensayo', true));
    eq(planRecovery(CHUNK, { ...entorno(), liveSession: activeSession }).action, 'ask');
    run.unmount();
    eq(planRecovery(CHUNK, { ...entorno(), liveSession: activeSession }).action, 'reload', 'ya se puede');
  });

  it('y una sesión guardada que caducó tampoco estorba', () => {
    resetSessionActivity();
    const vieja = { genesaret_mass_session: sesion(AHORA - SESSION_FRESH_MS - 1) };
    eq(planRecovery(CHUNK, entorno({ datos: vieja })).action, 'reload');
  });
});

// --- Lo que no se rompe -----------------------------------------------------

describe('Nada de esto toca los datos ni el enrutado', () => {
  it('no se borra ni un dato de la persona', () => {
    const fuentes = [
      readFileSync('src/pwa/chunkRecovery.ts', 'utf8'),
      readFileSync('src/components/Layout/LazyScreenBoundary.tsx', 'utf8'),
    ].join('\n');
    // Sólo se borra la marca de recuperación, y vive en sessionStorage.
    eq(/localStorage\.(removeItem|clear)/.test(fuentes), false);
    eq(fuentes.includes('.clear()'), false);
    for (const clave of ['genesaret_setlists', 'genesaret_ministry_members', 'genesaret_favorites']) {
      eq(fuentes.includes(`removeItem('${clave}')`), false, clave);
    }
  });

  it('los datos sólo se leen, nunca se escriben', () => {
    const fuente = readFileSync('src/pwa/chunkRecovery.ts', 'utf8');
    // `data` es de sólo lectura por su propio tipo.
    eq(fuente.includes("data: Pick<Storage, 'getItem'> | null"), true);
  });

  it('la lista de exclusión no toca las rutas de la aplicación, que son hash', () => {
    const config = readFileSync('vite.config.ts', 'utf8');
    eq(config.includes('navigateFallbackDenylist'), true);
    const denylist = /navigateFallbackDenylist: \[(.+?)\]/.exec(config)?.[1] ?? '';
    const regex = new RegExp(denylist.replace(/^\/|\/$/g, ''));
    // Una ruta de la aplicación nunca empieza por /assets/: van tras el #.
    for (const ruta of ['/', '/index.html', '/#/setlists', '/#/song/huracan-hakuna']) {
      eq(regex.test(ruta), false, ruta);
    }
    eq(regex.test('/assets/index-ABC.js'), true, 'un trozo sí queda fuera');
  });

  it('sigue siendo «prompt»: nada se actualiza solo', () => {
    const config = readFileSync('vite.config.ts', 'utf8');
    eq(config.includes("registerType: 'prompt'"), true);
    eq(config.includes("registerType: 'autoUpdate'"), false);
    eq(config.includes('cleanupOutdatedCaches: true'), true, 'se mantiene, como se pidió');
  });

  it('sin navegador no revienta, y no se recarga a ciegas', () => {
    // Sin almacenamiento no hay forma de anotar el intento, así que tampoco
    // de garantizar que no haya bucle: se ofrece el botón.
    const sinNada: RecoveryEnv = { attempts: null, data: null, buildId: 'x', now: () => AHORA };
    eq(whatIsBusy({ ...sinNada, liveSession: () => null }), { session: false, live: null, drafts: false });
    const plan = planRecovery(CHUNK, sinNada);
    eq(plan.action, 'ask');
    eq(plan.action === 'ask' && plan.reason, 'cannot-remember');
    markRecoveryAttempt(sinNada, CHUNK);
  });
});
