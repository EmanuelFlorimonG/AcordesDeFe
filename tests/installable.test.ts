import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Acordes de Fe como aplicación que se instala.
 *
 * Lo que se comprueba aquí es lo que el navegador lee antes de ofrecer
 * instalarla: el manifiesto, los iconos y las cuatro etiquetas que iOS
 * necesita porque no lee manifiestos. Nada de esto se ve en la aplicación,
 * así que sólo se nota cuando falla — y falla en el móvil de otra persona.
 *
 * El icono no se rediseñó: se rasterizó el favicon que ya existía. Por eso
 * varias comprobaciones son sobre el dibujo de siempre.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`installable.test: ${checks} comprobaciones`));

const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
const html = readFileSync('index.html', 'utf8').replace(/\r\n/g, '\n');
/** El azul del propio icono, y el de `accent` en la configuración de Tailwind. */
const BRAND = '#2563eb';

describe('El manifiesto', () => {
  it('dice cómo se llama la aplicación y en qué idioma', () => {
    eq(manifest.name, 'Acordes de Fe');
    eq(manifest.short_name, 'Acordes de Fe');
    eq(manifest.lang, 'es');
    eq(html.includes('<html lang="es">'), true, 'y la página también');
  });

  it('se abre como una aplicación, desde la raíz', () => {
    eq(manifest.display, 'standalone');
    eq(manifest.start_url, '/');
    eq(manifest.scope, '/');
    eq(manifest.orientation, 'any');
    // Las rutas son hash, así que el ámbito de la raíz las cubre todas.
    eq(manifest.scope, '/', 'y con eso entran #/song, #/setlists, #/shared…');
  });

  it('usa los colores que ya tiene la aplicación, no unos nuevos', () => {
    const favicon = readFileSync('public/favicon.svg', 'utf8');
    const tailwind = readFileSync('tailwind.config.js', 'utf8');
    eq(manifest.theme_color, BRAND);
    eq(favicon.includes(BRAND), true, 'es el azul del icono');
    eq(tailwind.includes(`DEFAULT: '${BRAND}'`), true, 'y el `accent` de la aplicación');
    // El fondo de arranque es el mismo que el de la página.
    eq(manifest.background_color, '#ffffff');
    eq(readFileSync('src/index.css', 'utf8').includes('background-color: #ffffff'), true);
  });

  it('lleva los iconos que pide una instalación', () => {
    const porUso = (purpose: string) => manifest.icons.filter((i: { purpose: string }) => i.purpose === purpose);
    eq(
      porUso('any').map((i: { sizes: string }) => i.sizes).sort(),
      ['192x192', '512x512']
    );
    eq(porUso('maskable').map((i: { sizes: string }) => i.sizes), ['512x512']);
    for (const icon of manifest.icons) eq(icon.type, 'image/png', icon.src);
  });

  it('y los archivos existen, con el tamaño que dicen', () => {
    // Un PNG dice su tamaño en la cabecera IHDR: bytes 16-23.
    const sizeOf = (path: string) => {
      const png = readFileSync(path);
      eq(png.subarray(1, 4).toString('latin1'), 'PNG', `${path} es un PNG`);
      return `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
    };
    for (const icon of manifest.icons) {
      eq(sizeOf(`public${icon.src}`), icon.sizes, icon.src);
    }
    eq(sizeOf('public/icons/apple-touch-icon.png'), '180x180');
  });
});

describe('Lo que la página le dice al navegador', () => {
  it('enlaza el manifiesto y el color de la barra', () => {
    eq(html.includes('<link rel="manifest" href="/manifest.webmanifest" />'), true);
    eq(html.includes(`<meta name="theme-color" content="${BRAND}" />`), true);
  });

  it('y lo que iOS necesita, que no lee manifiestos', () => {
    eq(html.includes('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />'), true);
    eq(html.includes('name="apple-mobile-web-app-capable" content="yes"'), true);
    eq(html.includes('name="apple-mobile-web-app-title" content="Acordes de Fe"'), true);
    eq(html.includes('name="apple-mobile-web-app-status-bar-style"'), true);
  });

  it('las fuentes locales siguen donde estaban', () => {
    eq(html.includes('/fonts/inter-latin-400-normal.woff2'), true);
    eq(html.includes('/fonts/jetbrains-mono-latin-700-normal.woff2'), true);
    for (const forbidden of ['fonts.googleapis.com', 'fonts.gstatic.com']) {
      eq(html.includes(forbidden), false, forbidden);
    }
  });

  it('todavía no hay service worker: eso es de la fase siguiente', () => {
    for (const forbidden of ['serviceWorker', 'sw.js', 'workbox', 'registerSW']) {
      eq(html.includes(forbidden), false, forbidden);
    }
    const main = readFileSync('src/main.tsx', 'utf8');
    eq(main.includes('serviceWorker'), false);
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    eq(Object.keys(pkg.devDependencies).includes('vite-plugin-pwa'), false);
  });
});
