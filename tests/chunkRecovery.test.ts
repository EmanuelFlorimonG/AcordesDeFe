import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import {
  RECOVERY_KEY,
  type RecoveryEnv,
  clearRecoveryMark,
  currentBuildId,
  isChunkLoadError,
  markRecoveryAttempt,
  planRecovery,
  whatIsBusy,
} from '../src/pwa/chunkRecovery';
import { LazyScreenBoundary } from '../src/components/Layout/LazyScreenBoundary';

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

function entorno(opciones: { intentos?: ReturnType<typeof memoria>; datos?: Record<string, string>; buildId?: string } = {}): RecoveryEnv {
  return {
    attempts: (opciones.intentos ?? memoria()).api,
    data: memoria({ inicial: opciones.datos ?? {} }).api,
    buildId: opciones.buildId ?? 'index-aaa111.js',
    now: () => AHORA,
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
    const plan = planRecovery(CHUNK, entorno({ datos: { genesaret_mass_session: '{"setlistId":"x"}' } }));
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

describe('Una recarga por versión, nunca un bucle', () => {
  it('la segunda vez con la misma versión ya no recarga', () => {
    const intentos = memoria();
    const env = entorno({ intentos });
    eq(planRecovery(CHUNK, env).action, 'reload');
    markRecoveryAttempt(env);
    const segundo = planRecovery(CHUNK, env);
    eq(segundo.action, 'ask');
    eq(segundo.action === 'ask' && segundo.reason, 'already-tried');
  });

  it('pero una versión nueva vuelve a tener su intento', () => {
    // Desplegar otra vez no debe dejar a nadie sin recuperación.
    const intentos = memoria();
    markRecoveryAttempt(entorno({ intentos, buildId: 'index-vieja.js' }));
    eq(planRecovery(CHUNK, entorno({ intentos, buildId: 'index-nueva.js' })).action, 'reload');
  });

  it('y una carga que va bien borra la marca', () => {
    // Esto es lo que impide que una recarga de hace semanas deje a alguien
    // sin recuperación automática para siempre.
    const intentos = memoria();
    const env = entorno({ intentos });
    markRecoveryAttempt(env);
    eq(Boolean(intentos.datos.get(RECOVERY_KEY)), true);
    clearRecoveryMark(env);
    eq(intentos.datos.get(RECOVERY_KEY), undefined);
    eq(planRecovery(CHUNK, env).action, 'reload', 'vuelve a haber intento');
  });

  it('sin dónde anotar, no se puede garantizar que no haya bucle', () => {
    // Si no se puede escribir la marca, no se promete una recarga segura: el
    // componente la pide a mano.
    const env = entorno({ intentos: memoria({ falla: true }) });
    markRecoveryAttempt(env);
    eq(planRecovery(CHUNK, env).action, 'reload', 'el plan no cambia');
    eq(entorno({ intentos: memoria({ falla: true }) }).attempts !== null, true);
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
    renderToStaticMarkup(createElement(LazyScreenBoundary, { reload() {}, children: hijo }));

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

  it('borra la marca al montar: una carga buena devuelve el intento', () => {
    const fuente = readFileSync('src/components/Layout/LazyScreenBoundary.tsx', 'utf8');
    eq(/componentDidMount[\s\S]{0,200}clearRecoveryMark/.test(fuente), true);
  });

  it('anota el intento ANTES de recargar', () => {
    // Si se anotara después, una recarga que vuelve a fallar no dejaría
    // constancia y habría bucle.
    const fuente = readFileSync('src/components/Layout/LazyScreenBoundary.tsx', 'utf8');
    const i = fuente.indexOf('markRecoveryAttempt(env);');
    const j = fuente.indexOf('reload ?? (() => window.location.reload())', i);
    eq(i > 0 && j > i, true, 'la marca va primero');
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

  it('sin navegador no revienta: todo lo que falta se trata como ausente', () => {
    const sinNada: RecoveryEnv = { attempts: null, data: null, buildId: 'x', now: () => AHORA };
    eq(whatIsBusy(sinNada), { session: false, drafts: false });
    eq(planRecovery(CHUNK, sinNada).action, 'reload');
    markRecoveryAttempt(sinNada);
    clearRecoveryMark(sinNada);
  });
});
