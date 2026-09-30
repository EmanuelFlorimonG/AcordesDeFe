import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PLAYBACK_NEEDS_INTERNET, getPlayButtonState } from '../src/utils/playerStatus';
import { YouTubeUnavailableError, getYouTubePlayer } from '../src/utils/youtubePlayerEngine';
import { isOnline } from '../src/hooks/useOnline';

/**
 * Reproducir necesita internet, y eso hay que decirlo.
 *
 * El fallo que se arregla aquí no se veía: el `<script>` de YouTube se
 * inyectaba y, si no llegaba nunca —sin conexión, bloqueado, un portal
 * cautivo—, la promesa se quedaba esperando para siempre y el botón con ella,
 * en «Cargando reproductor…», hasta recargar la página.
 *
 * Lo que se comprueba es que ahora todo termina: que sin red ni se intenta,
 * que un fallo de carga rompe la promesa, y —tan importante como lo demás—
 * que un intento fallido no se recuerda, para que volver a pulsar con
 * internet lo intente de verdad.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`playerOffline.test: ${checks} comprobaciones`));

// --- Un navegador de mentira ------------------------------------------------

interface FakeScript {
  src: string;
  attributes: Record<string, string>;
  setAttribute(name: string, value: string): void;
  addEventListener(type: string, listener: () => void, options?: unknown): void;
  removeEventListener?: () => void;
  remove(): void;
  fail(): void;
  removed: boolean;
}

interface Browser {
  scripts: FakeScript[];
  timers: Map<number, () => void>;
  /** Hace saltar el temporizador que espera a que aparezca la API. */
  fireTimeout(): void;
  restore(): void;
}

const describe_ = (target: object, name: string) => Object.getOwnPropertyDescriptor(target, name);

/** Pone un global de mentira, exista ya o no y sea de sólo lectura o no. */
function set(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

function restoreOne(name: string, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else delete (globalThis as Record<string, unknown>)[name];
}

function fakeBrowser(options: { online: boolean }): Browser {
  const scripts: FakeScript[] = [];
  const timers = new Map<number, () => void>();
  let nextTimer = 1;

  const makeScript = (): FakeScript => {
    const handlers = new Map<string, Array<() => void>>();
    const script: FakeScript = {
      src: '',
      attributes: {},
      removed: false,
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      addEventListener(type, listener) {
        handlers.set(type, [...(handlers.get(type) ?? []), listener]);
      },
      remove() {
        this.removed = true;
      },
      fail() {
        for (const listener of handlers.get('error') ?? []) listener();
      },
    };
    return script;
  };

  const before = {
    window: describe_(globalThis, 'window'),
    document: describe_(globalThis, 'document'),
    navigator: describe_(globalThis, 'navigator'),
  };

  // En Node `navigator` existe y es de sólo lectura, así que se define en vez
  // de asignarse, y se devuelve tal cual estaba al terminar.
  set('navigator', { onLine: options.online });
  set('window', {
    YT: undefined,
    onYouTubeIframeAPIReady: undefined,
    setTimeout(fn: () => void) {
      const id = nextTimer++;
      timers.set(id, fn);
      return id;
    },
    clearTimeout(id: number) {
      timers.delete(id);
    },
  });
  set('document', {
    querySelector: () => null,
    createElement: () => {
      const script = makeScript();
      return script;
    },
    head: {
      appendChild(node: FakeScript) {
        scripts.push(node);
      },
    },
  });

  return {
    scripts,
    timers,
    fireTimeout() {
      for (const [id, fn] of [...timers]) {
        timers.delete(id);
        fn();
      }
    },
    restore() {
      restoreOne('window', before.window);
      restoreOne('document', before.document);
      restoreOne('navigator', before.navigator);
    },
  };
}

// --- El botón ---------------------------------------------------------------

describe('El botón de reproducir', () => {
  const base = { hasVideo: true, isReady: false, error: null, isPlaying: false };

  it('sin conexión dice que hace falta internet, en vez de cargar para siempre', () => {
    const offline = getPlayButtonState({ ...base, online: false });
    eq(offline.disabled, true);
    eq(offline.title, PLAYBACK_NEEDS_INTERNET);
    eq(offline.title.includes('Cargando'), false, 'nada de esperar a lo que no va a llegar');
  });

  it('y lo dice aunque el reproductor ya estuviera listo antes de perderla', () => {
    eq(getPlayButtonState({ ...base, isReady: true, online: false }).title, PLAYBACK_NEEDS_INTERNET);
  });

  it('con conexión se comporta como siempre', () => {
    eq(getPlayButtonState({ ...base, online: true }).title, 'Cargando reproductor…');
    eq(getPlayButtonState({ ...base, isReady: true, online: true }), { disabled: false, title: 'Reproducir' });
    eq(getPlayButtonState({ ...base, isReady: true, isPlaying: true, online: true }).title, 'Pausar');
  });

  it('una canción sin audio no habla de internet: no lo necesita', () => {
    eq(getPlayButtonState({ ...base, hasVideo: false, online: false }).title, 'Audio no disponible');
  });

  it('sin decir nada de la conexión, se asume que la hay', () => {
    // El estado de la red es opcional: quien no lo pase sigue viendo lo de antes.
    eq(getPlayButtonState(base).title, 'Cargando reproductor…');
  });
});

// --- El motor ---------------------------------------------------------------

describe('Cuando no se puede llegar a YouTube', () => {
  it('sin conexión no se pide nada, y se dice por qué', async () => {
    const browser = fakeBrowser({ online: false });
    try {
      await assert.rejects(() => getYouTubePlayer(), YouTubeUnavailableError);
      checks += 1;
      eq(browser.scripts.length, 0, 'ni un <script> colgado esperando');
    } finally {
      browser.restore();
    }
  });

  it('si el script no carga, la promesa se rompe en vez de esperar para siempre', async () => {
    const browser = fakeBrowser({ online: true });
    try {
      const attempt = getYouTubePlayer();
      // El navegador avisa de que no pudo traerlo.
      eq(browser.scripts.length, 1, 'se pidió una vez');
      eq(browser.scripts[0].src, 'https://www.youtube.com/iframe_api');
      browser.scripts[0].fail();
      await assert.rejects(() => attempt, YouTubeUnavailableError);
      checks += 1;
      eq(browser.scripts[0].removed, true, 'y se retira, para poder volver a pedirlo');
    } finally {
      browser.restore();
    }
  });

  it('si el script carga pero la API no aparece, tampoco se espera eternamente', async () => {
    const browser = fakeBrowser({ online: true });
    try {
      const attempt = getYouTubePlayer();
      eq(browser.timers.size, 1, 'hay un plazo');
      browser.fireTimeout();
      await assert.rejects(() => attempt, YouTubeUnavailableError);
      checks += 1;
    } finally {
      browser.restore();
    }
  });

  it('un intento fallido no se recuerda: con internet se vuelve a intentar', async () => {
    const primero = fakeBrowser({ online: false });
    try {
      await assert.rejects(() => getYouTubePlayer(), YouTubeUnavailableError);
      checks += 1;
    } finally {
      primero.restore();
    }

    // Vuelve la conexión: esta vez sí se pide.
    const segundo = fakeBrowser({ online: true });
    try {
      const attempt = getYouTubePlayer();
      eq(segundo.scripts.length, 1, 'se intenta de nuevo de verdad');
      segundo.scripts[0].fail();
      await assert.rejects(() => attempt, YouTubeUnavailableError);
      checks += 1;
    } finally {
      segundo.restore();
    }
  });

  it('no se descarga ni se guarda nada de YouTube', () => {
    const code = readFileSync('src/utils/youtubePlayerEngine.ts', 'utf8').replace(/\r\n/g, '\n');
    for (const forbidden of ['fetch(', 'caches', 'localStorage', 'indexedDB', 'Blob', 'download']) {
      eq(code.includes(forbidden), false, forbidden);
    }
    // Lo único que se pide a YouTube es su reproductor.
    eq((code.match(/https:\/\/www\.youtube\.com/g) ?? []).length, 1);
  });
});

// --- El estado de la conexión ------------------------------------------------

describe('Si hay conexión', () => {
  it('sólo se cree lo negativo: `false` es "no hay", lo demás es "inténtalo"', () => {
    const before = describe_(globalThis, 'navigator');
    try {
      set('navigator', { onLine: false });
      eq(isOnline(), false);
      set('navigator', { onLine: true });
      eq(isOnline(), true);
      // Un navegador que no opina (o no existe) no es motivo para no intentarlo.
      set('navigator', { onLine: undefined });
      eq(isOnline(), true);
    } finally {
      restoreOne('navigator', before);
    }
  });

  it('vive en un solo sitio, y no en cada pantalla', () => {
    const viewer = readFileSync('src/components/SongViewer/SongViewer.tsx', 'utf8').replace(/\r\n/g, '\n');
    eq(viewer.includes("from '../../hooks/useOnline'"), true, 'el visor lo toma de ahí');
    eq(viewer.includes('function useOnline'), false, 'y ya no tiene el suyo');

    const hook = readFileSync('src/hooks/useOnline.ts', 'utf8').replace(/\r\n/g, '\n');
    eq(hook.includes("addEventListener('online'"), true);
    eq(hook.includes("addEventListener('offline'"), true);
  });

  it('todavía no es un aviso en la pantalla: eso es de otra fase', () => {
    const app = readFileSync('src/App.tsx', 'utf8').replace(/\r\n/g, '\n');
    eq(app.includes('useOnline()'), true, 'se conoce el estado');
    for (const forbidden of ['Sin conexión', 'Modo sin conexión', 'offline-banner']) {
      eq(app.includes(forbidden), false, forbidden);
    }
  });
});

// --- Las tipografías ---------------------------------------------------------

describe('Las tipografías van dentro de la aplicación', () => {
  const css = readFileSync('src/index.css', 'utf8').replace(/\r\n/g, '\n');
  const html = readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');

  it('no se le piden a Google, ni a nadie de fuera', () => {
    for (const source of [html, css]) {
      for (const forbidden of ['fonts.googleapis.com', 'fonts.gstatic.com', 'preconnect']) {
        eq(source.includes(forbidden), false, forbidden);
      }
    }
  });

  it('están declaradas las siete caras que la aplicación usa de verdad', () => {
    // Inter en los cinco pesos que aparecen en el código, y la monoespaciada
    // en los dos que llevan las anotaciones y los acordes.
    for (const weight of [400, 500, 600, 700, 800]) {
      eq(css.includes(`/fonts/inter-latin-${weight}-normal.woff2`), true, `Inter ${weight}`);
    }
    for (const weight of [600, 700]) {
      eq(css.includes(`/fonts/jetbrains-mono-latin-${weight}-normal.woff2`), true, `Mono ${weight}`);
    }
    eq((css.match(/@font-face/g) ?? []).length, 7, 'siete y ni una más');
  });

  it('siguen siendo Inter y JetBrains Mono: no se ha sustituido nada', () => {
    const tailwind = readFileSync('tailwind.config.js', 'utf8').replace(/\r\n/g, '\n');
    eq(tailwind.includes("sans: ['Inter'"), true);
    eq(tailwind.includes("mono: ['JetBrains Mono'"), true);
    eq(css.includes("font-family: 'Inter'"), true);
    eq(css.includes("font-family: 'JetBrains Mono'"), true);
    // Y la clase que alinea los acordes sigue pidiendo la misma familia.
    eq(css.includes("font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace"), true);
  });

  it('los archivos están donde el CSS los busca', () => {
    for (const file of [
      'inter-latin-400-normal.woff2',
      'inter-latin-500-normal.woff2',
      'inter-latin-600-normal.woff2',
      'inter-latin-700-normal.woff2',
      'inter-latin-800-normal.woff2',
      'jetbrains-mono-latin-600-normal.woff2',
      'jetbrains-mono-latin-700-normal.woff2',
    ]) {
      const bytes = readFileSync(`public/fonts/${file}`);
      eq(bytes.subarray(0, 4).toString('latin1'), 'wOF2', `${file} es un woff2`);
      eq(bytes.length > 5_000 && bytes.length < 60_000, true, `${file} pesa lo que debe`);
    }
  });
});
