import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { connectionNotice, type ConnectionNow } from '../src/components/Layout/connectionNotice';
import { ConnectionStatus } from '../src/components/Layout/ConnectionStatus';
import { runHook } from './hookHarness';

/**
 * Lo que la aplicación cuenta sobre la conexión, y lo que se calla.
 *
 * Aquí se vigila sobre todo que no haya ruido: un aviso a la vez, nada cuando
 * no hay nada que decir, y una versión nueva que espera sin dar la lata. Lo
 * demás es que cada situación diga lo que tiene que decir, en castellano y sin
 * prometer que todo funciona sin internet, porque no es verdad.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`connectionStatus.test: ${checks} comprobaciones`));

const calm: ConnectionNow = {
  online: true,
  sync: 'idle',
  canSync: true,
  update: false,
  reconnected: false,
  offlineReady: false,
  canResolve: true,
};
const now = (changes: Partial<ConnectionNow> = {}): ConnectionNow => ({ ...calm, ...changes });

// --- Qué se dice, y cuándo -------------------------------------------------

describe('Cuando no hay nada que contar, no se cuenta nada', () => {
  it('con conexión y todo al día no aparece ningún aviso', () => {
    eq(connectionNotice(calm), null);
    eq(connectionNotice(now({ canSync: false })), null, 'ni para un invitado');
  });

  it('y lo que sólo le pasa a una cuenta no se le dice a un invitado', () => {
    for (const sync of ['syncing', 'conflict', 'error'] as const) {
      eq(connectionNotice(now({ canSync: false, sync })), null, sync);
    }
  });
});

describe('Sin conexión', () => {
  it('se dice, y se dice lo que sí se puede hacer', () => {
    const notice = connectionNotice(now({ online: false }));
    eq(notice?.kind, 'offline');
    eq(notice?.text, 'Sin conexión. Tus canciones y Setlists siguen disponibles.');
    eq(notice?.fleeting, false, 'se queda mientras siga sin haber red');
  });

  it('no se promete que todo funcione sin internet', () => {
    const texto = connectionNotice(now({ online: false }))?.text ?? '';
    for (const mentira of ['todo', 'completa', 'sin límites']) {
      eq(texto.toLowerCase().includes(mentira), false, mentira);
    }
  });

  it('y manda sobre cualquier otra cosa que pudiera decirse', () => {
    for (const otra of [
      { sync: 'conflict' as const },
      { sync: 'error' as const },
      { sync: 'syncing' as const },
      { update: true },
      { reconnected: true },
      { offlineReady: true },
    ]) {
      eq(connectionNotice(now({ online: false, ...otra }))?.kind, 'offline', JSON.stringify(otra));
    }
  });
});

describe('Cuando vuelve la conexión', () => {
  it('se dice un momento, y se calla solo', () => {
    const notice = connectionNotice(now({ reconnected: true }));
    eq(notice?.kind, 'reconnected');
    eq(notice?.text, 'Conexión restaurada');
    eq(notice?.fleeting, true);
  });

  it('y en cuanto empieza la sincronización, lo que se cuenta es eso', () => {
    // Nada de dos mensajes a la vez diciendo cosas distintas.
    eq(connectionNotice(now({ reconnected: true, sync: 'syncing' }))?.kind, 'syncing');
  });
});

describe('Sincronizando', () => {
  it('se dice en una línea, sin ventanas ni esperas', () => {
    const notice = connectionNotice(now({ sync: 'syncing' }));
    eq(notice?.kind, 'syncing');
    eq(notice?.text, 'Sincronizando Setlists…');
    eq(notice?.action, undefined, 'no hay nada que pulsar mientras tanto');
  });

  it('y cuando termina bien, no queda nada en pantalla', () => {
    eq(connectionNotice(now({ sync: 'idle' })), null, 'no hace falta un «sincronizado» permanente');
  });
});

describe('Un conflicto', () => {
  it('se dice, y lleva a la pantalla de siempre', () => {
    const notice = connectionNotice(now({ sync: 'conflict' }));
    eq(notice?.kind, 'conflict');
    eq(notice?.text, 'Hay un conflicto de sincronización pendiente');
    eq(notice?.action, { name: 'resolve', label: 'Resolver' });
  });

  it('no se va solo: mientras haya dos versiones, hay dos versiones', () => {
    eq(connectionNotice(now({ sync: 'conflict' }))?.fleeting, false);
  });

  it('va antes que un fallo y que una versión nueva', () => {
    eq(connectionNotice(now({ sync: 'conflict', update: true }))?.kind, 'conflict');
  });

  it('si no se sabe cuál es, se dice igual pero sin botón que no lleva a nada', () => {
    eq(connectionNotice(now({ sync: 'conflict', canResolve: false }))?.action, undefined);
  });
});

describe('Un fallo al sincronizar', () => {
  it('se dice sin asustar y se puede reintentar', () => {
    const notice = connectionNotice(now({ sync: 'error' }));
    eq(notice?.kind, 'sync-error');
    eq(notice?.text, 'No pudimos sincronizar tus Setlists');
    eq(notice?.action, { name: 'retry', label: 'Reintentar' });
  });

  it('y en ningún caso se dice que se haya perdido nada', () => {
    const texto = connectionNotice(now({ sync: 'error' }))?.text ?? '';
    for (const palabra of ['perdid', 'borrad', 'elimina']) {
      eq(texto.toLowerCase().includes(palabra), false, palabra);
    }
  });
});

describe('Una versión nueva', () => {
  it('se ofrece, no se aplica', () => {
    const notice = connectionNotice(now({ update: true }));
    eq(notice?.kind, 'update');
    eq(notice?.text, 'Nueva versión disponible');
    eq(notice?.action, { name: 'update', label: 'Actualizar' });
  });

  it('espera debajo de todo lo demás, y vuelve a asomar cuando no hay nada más', () => {
    // Sin red manda lo de la red; cuando vuelve, la versión sigue ahí.
    eq(connectionNotice(now({ update: true, online: false }))?.kind, 'offline');
    eq(connectionNotice(now({ update: true, sync: 'syncing' }))?.kind, 'syncing');
    eq(connectionNotice(now({ update: true }))?.kind, 'update', 'y reaparece');
  });

  it('y se dice antes que las cosas de un momento', () => {
    eq(connectionNotice(now({ update: true, reconnected: true }))?.kind, 'update');
    eq(connectionNotice(now({ update: true, offlineReady: true }))?.kind, 'update');
  });
});

describe('Listo para usarse sin conexión', () => {
  it('se dice una vez y se va', () => {
    const notice = connectionNotice(now({ offlineReady: true }));
    eq(notice?.kind, 'offline-ready');
    eq(notice?.text, 'Acordes de Fe está listo para usarse sin conexión');
    eq(notice?.fleeting, true);
  });
});

describe('Nunca hay dos avisos a la vez', () => {
  it('pase lo que pase, sale uno o ninguno', () => {
    const valores = [false, true];
    const estados = ['idle', 'syncing', 'conflict', 'error'] as const;
    let combinaciones = 0;
    for (const online of valores) {
      for (const sync of estados) {
        for (const canSync of valores) {
          for (const update of valores) {
            for (const reconnected of valores) {
              for (const offlineReady of valores) {
                const notice = connectionNotice({
                  online,
                  sync,
                  canSync,
                  update,
                  reconnected,
                  offlineReady,
                  canResolve: true,
                });
                combinaciones += 1;
                assert.equal(notice === null || typeof notice.kind === 'string', true);
              }
            }
          }
        }
      }
    }
    eq(combinaciones, 2 * 4 * 2 * 2 * 2 * 2, 'todas las situaciones posibles');
    checks += 1;
  });
});

// --- Lo que se ve en pantalla ----------------------------------------------

const paint = (props: Parameters<typeof ConnectionStatus>[0]) =>
  renderToStaticMarkup(createElement(ConnectionStatus, props));

const base = { online: true, sync: 'idle' as const, canSync: true, update: false };

describe('Lo que se dibuja', () => {
  it('con todo en orden, el hueco está vacío', () => {
    const html = paint(base);
    eq(html.includes('Sin conexión'), false);
    eq(html.includes('Sincronizando'), false);
    eq(/<div[^>]*>\s*<\/div>/.test(html), true, 'sólo el contenedor, sin nada dentro');
  });

  it('sin conexión se ve el aviso con su texto', () => {
    const html = paint({ ...base, online: false });
    eq(html.includes('Sin conexión. Tus canciones y Setlists siguen disponibles.'), true);
  });

  it('el botón sólo aparece cuando hay algo que pulsar', () => {
    eq(paint({ ...base, sync: 'error' }).includes('Reintentar'), false, 'sin quien lo atienda, no');
    eq(paint({ ...base, sync: 'error', onRetry: () => {} }).includes('Reintentar'), true);
    eq(paint({ ...base, update: true, onUpdate: () => {} }).includes('Actualizar'), true);
    eq(paint({ ...base, sync: 'conflict', onResolve: () => {} }).includes('Resolver'), true);
  });

  it('en Modo Misa se encoge a dos palabras y sin botones', () => {
    const misa = paint({ ...base, online: false, compact: true });
    eq(misa.includes('Sin conexión'), true);
    eq(misa.includes('Tus canciones y Setlists siguen disponibles'), false, 'no se tapa la letra con una frase');
    const conflicto = paint({ ...base, sync: 'conflict', onResolve: () => {}, compact: true });
    eq(conflicto.includes('<button'), false, 'nada que pulsar encima de lo que se está cantando');
    eq(conflicto.includes('Conflicto pendiente'), true);
  });

  it('en Modo Misa va en una esquina, por encima de la pantalla de la misa', () => {
    const misa = paint({ ...base, online: false, compact: true });
    eq(misa.includes('bottom-4 right-4'), true, 'una esquina, no el centro');
    eq(misa.includes('z-[70]'), true, 'y se ve: Modo Misa está en z-60');
    eq(misa.includes('pointer-events-none'), true, 'no se puede pulsar lo que hay detrás por error');
  });

  it('un aviso sin nada que pulsar no se come el clic de lo que hay detrás', () => {
    // Vive en una esquina, encima de la pantalla: si no hay botón, no estorba.
    eq(paint({ ...base, online: false }).includes('pointer-events-auto'), false);
    eq(paint({ ...base, sync: 'error', onRetry: () => {} }).includes('pointer-events-auto'), true);
    eq(paint({ ...base, online: false, compact: true }).includes('pointer-events-auto'), false, 'en Modo Misa nunca');
  });

  it('y al imprimir no sale', () => {
    eq(paint({ ...base, online: false }).includes('print:hidden'), true);
  });
});

describe('Se puede oír y se puede usar', () => {
  it('es una región de estado que se anuncia con educación', () => {
    const html = paint({ ...base, online: false });
    eq(html.includes('role="status"'), true);
    eq(html.includes('aria-live="polite"'), true);
  });

  it('el contenedor es siempre el mismo, así que no se repite en cada dibujado', () => {
    // El `role="status"` vive fuera del aviso: lo que cambia es su contenido,
    // no la región, que es lo que hace que se lea una vez por cambio.
    const vacio = paint(base);
    eq(vacio.includes('role="status"'), true, 'está ahí aunque no haya nada que decir');
    eq(vacio.indexOf('role="status"'), paint({ ...base, online: false }).indexOf('role="status"'));
  });

  it('el icono no cuenta nada: lo que se lee es el texto', () => {
    const html = paint({ ...base, online: false });
    eq(html.includes('aria-hidden="true"'), true);
  });

  it('lo que se pulsa es un botón de verdad, con foco visible', () => {
    const html = paint({ ...base, update: true, onUpdate: () => {} });
    eq(html.includes('<button type="button"'), true);
    eq(html.includes('focus-visible:ring'), true);
  });

  it('el estado no se cuenta sólo con un color', () => {
    // Cada situación lleva su texto y su icono; el color es el mismo en todas.
    const estados = [
      paint({ ...base, online: false }),
      paint({ ...base, sync: 'conflict' }),
      paint({ ...base, sync: 'error' }),
      paint({ ...base, sync: 'syncing' }),
    ];
    for (const html of estados) {
      eq(html.includes('<svg'), true, 'un icono');
      eq(/>[^<>]*[a-záéíóúñ]{4}/i.test(html), true, 'y palabras');
    }
    eq(new Set(estados).size, 4, 'y cada una dice algo distinto');
  });

  it('lo que da vueltas respeta a quien no quiere movimiento', () => {
    eq(paint({ ...base, sync: 'syncing' }).includes('motion-safe:animate-spin'), true);
    // Y nada más se mueve.
    eq(paint({ ...base, online: false }).includes('animate-'), false);
  });
});

// --- Pulsar de verdad ------------------------------------------------------

/** El botón del aviso, buscado en el árbol que devuelve el componente. */
function buttonOf(node: ReactNode): { onClick?: () => void } | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = buttonOf(child as ReactNode);
      if (found) return found;
    }
    return null;
  }
  const element = node as ReactElement<{ children?: ReactNode; onClick?: () => void }>;
  if (element.type === 'button') return element.props;
  return buttonOf(element.props?.children ?? null);
}

/**
 * El componente de verdad, con sus hooks, sin pantalla: para poder pulsarlo.
 *
 * Escucha la vuelta de la red, así que necesita un `window` que escuchar. Se
 * pone uno de mentira y se devuelve lo que había.
 */
function mounted(props: Parameters<typeof ConnectionStatus>[0]) {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    value: { addEventListener() {}, removeEventListener() {}, setTimeout: () => 0, clearTimeout() {} },
    configurable: true,
    writable: true,
  });
  const run = runHook(() => ConnectionStatus(props) as ReactElement);
  const restore = () => {
    run.unmount();
    if (before) Object.defineProperty(globalThis, 'window', before);
    else delete (globalThis as { window?: unknown }).window;
  };
  return { ...run, current: run.current, restore };
}

describe('Pulsar Actualizar', () => {
  it('aplica la versión que esperaba, una sola vez', () => {
    let veces = 0;
    const run = mounted({ ...base, update: true, onUpdate: () => (veces += 1) });
    const button = buttonOf(run.current);

    eq(button !== null, true, 'hay algo que pulsar');
    button?.onClick?.();
    eq(veces, 1, 'exactamente una');
    run.restore();
  });

  it('y reintentar llama a lo suyo, no a lo de actualizar', () => {
    let reintentos = 0;
    let actualizaciones = 0;
    const run = mounted({
      ...base,
      sync: 'error',
      onRetry: () => (reintentos += 1),
      onUpdate: () => (actualizaciones += 1),
    });
    buttonOf(run.current)?.onClick?.();
    eq([reintentos, actualizaciones], [1, 0]);
    run.restore();
  });

  it('resolver abre la pantalla de siempre', () => {
    let abierto = 0;
    const run = mounted({ ...base, sync: 'conflict', onResolve: () => (abierto += 1) });
    buttonOf(run.current)?.onClick?.();
    eq(abierto, 1);
    run.restore();
  });

  it('con una versión nueva esperando y sin red, no hay nada que pulsar', () => {
    let veces = 0;
    const run = mounted({ ...base, online: false, update: true, onUpdate: () => (veces += 1) });
    eq(buttonOf(run.current), null, 'manda lo de la red');
    eq(veces, 0);
    run.restore();
  });
});

// --- Las reglas de la casa -------------------------------------------------

describe('Cómo se escribe aquí', () => {
  const sources = [
    'src/components/Layout/connectionNotice.ts',
    'src/components/Layout/ConnectionStatus.tsx',
    'src/hooks/usePwa.ts',
  ].map((file) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));

  it('sin emojis y sin rayas largas', () => {
    for (const source of sources) {
      eq(/\p{Extended_Pictographic}/u.test(source), false, 'emoji');
    }
    // El copy de los avisos, que es lo que lee la persona.
    for (const kind of [
      { online: false },
      { sync: 'conflict' as const },
      { sync: 'error' as const },
      { sync: 'syncing' as const },
      { update: true },
      { reconnected: true },
      { offlineReady: true },
    ]) {
      const texto = connectionNotice(now(kind))?.text ?? '';
      eq(texto.includes('—'), false, texto);
      eq(/\p{Extended_Pictographic}/u.test(texto), false, texto);
      eq(texto.length < 70, true, `corto: ${texto}`);
    }
  });

  it('no parece una consola: ni códigos, ni nombres internos', () => {
    for (const kind of [{ sync: 'error' as const }, { sync: 'conflict' as const }]) {
      const texto = connectionNotice(now(kind))?.text ?? '';
      for (const interno of ['revision', 'token', 'supabase', 'fingerprint', 'payload', 'HTTP', 'null']) {
        eq(texto.toLowerCase().includes(interno.toLowerCase()), false, interno);
      }
    }
  });
});

describe('Lo que esta pantalla no toca', () => {
  /** Sin comentarios: lo que se comprueba es lo que hace, no lo que cuenta. */
  const sinComentarios = (path: string) =>
    readFileSync(path, 'utf8')
      .replace(/\r\n/g, '\n')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '');

  it('la actualización se aplica con lo que ya existía, y sólo si alguien lo pide', () => {
    const app = sinComentarios('src/App.tsx');
    eq(app.includes('void applyPendingUpdate();'), true);
    eq((app.match(/applyPendingUpdate/g) ?? []).length, 2, 'se importa y se llama en un sitio');
    // Nada recarga por su cuenta.
    for (const forbidden of ['location.reload', 'skipWaiting']) {
      eq(app.includes(forbidden), false, forbidden);
    }
  });

  it('la estrategia del service worker sigue siendo avisar, nunca aplicar', () => {
    const config = sinComentarios('vite.config.ts');
    eq(config.includes("registerType: 'prompt'"), true);
    eq(config.includes('autoUpdate'), false);
    eq(config.includes('runtimeCaching'), false);
    const pwa = sinComentarios('src/pwa.ts');
    eq(pwa.includes('applyUpdate = () => update(true)'), true, 'el mecanismo de siempre');
  });

  it('reintentar es la misma pasada de siempre, no otra', () => {
    const app = sinComentarios('src/App.tsx');
    eq(app.includes('onRetry={() => {'), true);
    const desde = app.indexOf('onRetry={() => {');
    const retry = app.slice(desde, app.indexOf('onUpdate={', desde));
    eq(retry.includes('cloudSync.syncAll()'), true);
    eq(/setInterval|setTimeout/.test(retry), false, 'ni un reintento automático');
  });

  it('resolver un conflicto abre la pantalla de siempre', () => {
    const app = sinComentarios('src/App.tsx');
    eq(app.includes('onResolve={conflictedSetlist ? () => openConflict(conflictedSetlist) : undefined}'), true);
    // Y el aviso no sabe nada de versiones ni de resolver: sólo avisa.
    const status = sinComentarios('src/components/Layout/ConnectionStatus.tsx');
    for (const forbidden of ['seenRevision', 'resolve(', 'SetlistVersions', 'keep']) {
      eq(status.includes(forbidden), false, forbidden);
    }
  });

  it('el aviso no sincroniza por su cuenta', () => {
    const status = sinComentarios('src/components/Layout/ConnectionStatus.tsx');
    for (const forbidden of ['syncAll', 'runPass', 'supabase', 'fetch(']) {
      eq(status.includes(forbidden), false, forbidden);
    }
    // Lo único que escucha es la vuelta de la red, y sólo para contarlo.
    eq(status.includes('useReconnect(() => setReconnected(true), 0)'), true);
  });
});
