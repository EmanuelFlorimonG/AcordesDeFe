import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrivacyPolicy } from '../src/components/Legal/PrivacyPolicy';
import { About } from '../src/components/Pages/About';
import { SongUnavailableScreen } from '../src/components/Layout/CatalogStatus';

/**
 * Lo que la aplicación le cuenta a quien llega por primera vez.
 *
 * Casi todo lo de aquí es texto, y por eso importa: una política que dice que
 * no hay cuentas cuando las hay, o un «añade aquí tu ministerio» olvidado,
 * convierten un producto terminado en una plantilla a medio hacer. Lo que se
 * comprueba es que lo escrito sea verdad y que no quede ni un resto.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`releasePolish.test: ${checks} comprobaciones`));

/** El código sin sus comentarios: lo que hace, no lo que cuenta. */
const sinComentarios = (ruta: string) =>
  readFileSync(ruta, 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

const EM_DASH = String.fromCharCode(8212);

// --- Lo que se dice sobre los datos ---------------------------------------

describe('La política de privacidad dice lo que la aplicación hace', () => {
  const html = renderToStaticMarkup(createElement(PrivacyPolicy, { onBack: () => {} }));

  it('ya no dice que no haya cuentas ni servidores', () => {
    for (const mentira of [
      'No recopilamos datos personales',
      'no solicitamos registro de cuentas',
      'no enviamos información a servidores externos',
      'nunca son transmitidos',
      'funciona completamente en tu navegador',
    ]) {
      eq(html.includes(mentira), false, mentira);
    }
  });

  it('ni que las tipografías vengan de Google', () => {
    eq(/Google Fonts/i.test(html), false);
    eq(html.includes('policies.google.com'), false);
    eq(html.includes('vienen dentro de la propia aplicación'), true, 'van autoalojadas, y se dice');
  });

  it('cuenta lo que sí pasa: cuenta opcional, Supabase y sincronización', () => {
    eq(html.includes('se puede usar sin cuenta'), true);
    eq(html.includes('Crear una cuenta es opcional'), true);
    eq(html.includes('Supabase'), true);
    eq(/sincroniz/i.test(html), true);
  });

  it('cuenta que algo se queda en el dispositivo y funciona sin conexión', () => {
    eq(/almacenamiento del navegador/i.test(html), true);
    eq(/sin internet|sin conexión|sin cobertura/i.test(html), true);
  });

  it('explica el enlace público de un Setlist', () => {
    eq(html.includes('enlace público'), true);
    eq(/sin registrarse/i.test(html), true);
    eq(/deja de funcionar en cuanto lo desactivas/i.test(html), true);
  });

  it('dice que reproducir pasa por YouTube y necesita internet', () => {
    eq(html.includes('YouTube'), true);
    eq(/Hace falta internet/i.test(html), true);
  });

  it('y no inventa nada que el código no haga', () => {
    eq(/No hay analítica/i.test(html), true);
    for (const inventado of ['Google Analytics', 'píxel', 'remarketing', 'Meta', 'Facebook']) {
      eq(html.includes(inventado), false, inventado);
    }
    // Lo que sí hay, aunque sea incómodo, también se dice.
    eq(html.includes('Turnstile'), true, 'la comprobación de los envíos');
  });

  it('está escrita como el resto de la aplicación', () => {
    eq(html.includes(EM_DASH), false, 'sin raya larga');
    eq(/\p{Extended_Pictographic}/u.test(html), false, 'sin emojis');
  });
});

describe('Acerca de ya no es una plantilla', () => {
  const html = renderToStaticMarkup(createElement(About, { onBack: () => {} }));

  it('sin instrucciones para quien lo programó', () => {
    for (const resto of ['Esta sección se puede ampliar', 'antes de publicar', 'tu ministerio']) {
      eq(html.includes(resto), false, resto);
    }
  });

  it('y sin afirmar que no hay cuentas', () => {
    eq(html.includes('sin cuentas ni datos personales'), false);
    eq(html.includes('Se usa sin cuenta'), true, 'lo correcto: opcional');
    eq(/Crear una es opcional/i.test(html), true);
  });

  it('sin inventar la historia de nadie', () => {
    for (const inventado of ['fundado', 'desde 19', 'desde 20', 'parroquia de']) {
      eq(html.toLowerCase().includes(inventado.toLowerCase()), false, inventado);
    }
  });
});

describe('La cuenta cuenta lo que hace hoy', () => {
  const codigo = sinComentarios('src/components/Account/AccountDialog.tsx');

  it('ya no dice que la sincronización esté por llegar', () => {
    for (const viejo of ['Todavía no está activo', 'servirá para llevar']) {
      eq(codigo.includes(viejo), false, viejo);
    }
  });

  it('y dice lo que hay: opcional, offline, sincronización y conflictos', () => {
    eq(codigo.includes('lleva tus Setlists de un dispositivo a otro'), true);
    eq(codigo.includes('siguen estando en este dispositivo'), true);
    eq(/sin conexión se preparan igual/i.test(codigo), true);
    eq(/se te\s+pregunta cuál conservar/i.test(codigo.replace(/\s+/g, ' ')), true, 'los conflictos los decide una persona');
  });
});

// --- El menú de móvil ------------------------------------------------------

describe('El menú de móvil se puede usar con el teclado', () => {
  const sidebar = sinComentarios('src/components/Layout/Sidebar.tsx');
  const topbar = sinComentarios('src/components/Layout/Topbar.tsx');

  it('los dos botones tienen nombre', () => {
    eq(topbar.includes('aria-label="Abrir el menú"'), true);
    eq(sidebar.includes('aria-label="Cerrar el menú"'), true);
    eq(topbar.includes('aria-expanded={isSidebarOpen}'), true, 'y el de abrir dice si está abierto');
  });

  it('el cajón se anuncia como lo que es', () => {
    eq(sidebar.includes('role="dialog"'), true);
    eq(sidebar.includes('aria-modal="true"'), true);
    eq(sidebar.includes('aria-label="Menú de navegación"'), true);
  });

  it('Escape lo cierra', () => {
    eq(/if \(event\.key === 'Escape'\)[\s\S]{0,80}onClose\(\)/.test(sidebar), true);
  });

  it('al abrirse el foco entra, y al cerrarse vuelve a quien lo abrió', () => {
    eq(sidebar.includes('opener.current = document.activeElement;'), true);
    eq(sidebar.includes('drawer.current?.focus({ preventScroll: true })'), true);
    eq(/volver instanceof HTMLElement[\s\S]{0,60}volver\.focus/.test(sidebar), true);
  });

  it('y mientras está abierto el tabulador no se escapa', () => {
    eq(sidebar.includes("if (event.key !== 'Tab') return;"), true);
    eq(sidebar.includes('event.preventDefault();'), true);
    eq(/ultimo\.focus\(\)/.test(sidebar) && /primero\.focus\(\)/.test(sidebar), true, 'da la vuelta por los dos lados');
    // Sin añadir una librería para esto.
    const paquete = JSON.parse(readFileSync('package.json', 'utf8'));
    const dependencias = Object.keys({ ...paquete.dependencies, ...paquete.devDependencies });
    eq(dependencias.filter((d) => /focus-trap|focus-lock|a11y-dialog|react-modal/.test(d)), []);
  });
});

// --- Listas y Setlists -----------------------------------------------------

describe('Listas y Setlists se distinguen', () => {
  const listas = sinComentarios('src/components/Dashboard/PlaylistsView.tsx');
  const setlists = sinComentarios('src/components/Setlists/SetlistsView.tsx');

  it('una lista guarda canciones; un Setlist prepara una celebración', () => {
    eq(listas.includes('Tus colecciones de canciones'), true);
    eq(listas.includes('para preparar una celebración concreta') || listas.includes('Para preparar una celebración concreta'), true);
    eq(setlists.includes('Una celebración preparada'), true);
    eq(setlists.includes('Para guardar canciones sin más están las Listas'), true);
  });

  it('cada una nombra a la otra, para que nadie dude', () => {
    eq(/Setlists/.test(listas), true);
    eq(/Listas/.test(setlists), true);
  });

  it('y ninguna cambió de nombre', () => {
    eq(listas.includes('Listas'), true);
    eq(setlists.includes('Setlists'), true);
  });
});

// --- Lo que está en Opciones ----------------------------------------------

describe('Las acciones del Setlist se encuentran', () => {
  const detalle = sinComentarios('src/components/Setlists/SetlistDetail.tsx');
  const app = sinComentarios('src/App.tsx');

  it('se dice una vez dónde están', () => {
    eq(detalle.includes('En Opciones tienes guardar en tu cuenta, compartir y las hojas para imprimir.'), true);
  });

  it('y compartir no desaparece sin explicación', () => {
    eq(detalle.includes('shareBlockedReason'), true);
    eq(/disabled: true,[\s\S]{0,60}note: shareBlockedReason/.test(detalle), true, 'se ve apagado, con su motivo');
    eq(app.includes('Necesitas una cuenta: el enlace enseña lo que hay guardado en ella'), true);
    eq(app.includes('Guárdalo antes en tu cuenta'), true);
  });

  it('sin tocar cuándo se puede compartir de verdad', () => {
    eq(app.includes("openSetlistCloudState === 'synced' || openSetlistCloudState === 'changed'"), true);
  });
});

// --- Favoritas -------------------------------------------------------------

describe('Una instalación nueva empieza sin favoritas', () => {
  const app = sinComentarios('src/App.tsx');

  it('ninguna viene marcada de fábrica', () => {
    eq(app.includes("useLocalStorage<string[]>('genesaret_favorites', [])"), true);
    for (const puesta of ['huracan-hakuna', 'nadie-te-ama-como-yo', 'contigo-maria']) {
      eq(app.includes(`'${puesta}'`), false, puesta);
    }
  });

  it('y lo que ya estaba guardado no se toca', () => {
    // El valor inicial sólo se usa cuando no hay nada escrito: no hay ninguna
    // migración que borre, ni nada que escriba sobre las favoritas al arrancar.
    eq(app.includes('genesaret_favorites'), true);
    eq((app.match(/genesaret_favorites/g) ?? []).length, 1, 'se nombra en un solo sitio');
    eq(/removeItem\(['"]genesaret_favorites/.test(app), false);
  });
});

// --- Una canción que no se puede abrir ------------------------------------

describe('Una canción que no existe se dice', () => {
  const falta = renderToStaticMarkup(
    createElement(SongUnavailableScreen, { reason: 'missing', onRetry: async () => {}, onBack: () => {} })
  );
  const offline = renderToStaticMarkup(
    createElement(SongUnavailableScreen, { onRetry: async () => {}, onBack: () => {} })
  );

  it('con su nombre y una salida útil', () => {
    eq(falta.includes('No encontramos esta canción'), true);
    eq(falta.includes('Buscar en el cancionero'), true);
    eq(falta.includes('Reintentar'), false, 'no hay nada que reintentar: el catálogo ya contestó');
  });

  it('sin confundirla con estar sin conexión', () => {
    eq(offline.includes('No disponible sin conexión'), true);
    eq(offline.includes('Reintentar'), true, 'eso sí se puede reintentar');
    eq(offline.includes('No encontramos esta canción'), false);
  });

  it('y en ninguno de los dos casos se enseña el id interno', () => {
    for (const html of [falta, offline]) {
      eq(html.includes('font-mono'), false, 'el id salía en monoespaciado');
    }
    const estado = sinComentarios('src/components/Layout/CatalogStatus.tsx');
    eq(estado.includes('{songId}'), false);
    eq(estado.includes('songId'), false, 'ya ni se recibe');
  });

  it('y la ruta lleva ahí en vez de al cancionero sin más', () => {
    const app = sinComentarios('src/App.tsx');
    eq(app.includes("if (availability !== 'available')"), true);
    eq(app.includes("setMissingSong(availability === 'missing')"), true);
  });
});

// --- Un enlace que no se pudo abrir ---------------------------------------

describe('Abrir un enlace compartido que falla', () => {
  const pantalla = sinComentarios('src/components/Setlists/SharedSetlistScreen.tsx');

  it('se puede reintentar, y es la misma lectura de siempre', () => {
    eq(pantalla.includes('Reintentar'), true);
    eq(pantalla.includes('setAttempt((veces) => veces + 1)'), true);
    eq(pantalla.includes('}, [token, load, attempt]);'), true, 'vuelve a llamar a load');
  });

  it('pero no se reintenta solo', () => {
    for (const bucle of ['setInterval', 'setTimeout']) {
      eq(pantalla.includes(bucle), false, bucle);
    }
  });

  it('y un enlace desactivado no ofrece insistir', () => {
    eq(pantalla.includes('{!gone && ('), true);
  });

  it('la vista pública dice que es de sólo lectura', () => {
    eq(pantalla.includes('sólo lectura'), true);
    eq(pantalla.includes('aquí no se puede cambiar nada'), true);
    eq(pantalla.includes('Los cambios que hagas aquí'), false);
  });
});

// --- Lo que es de este dispositivo ----------------------------------------

describe('El calendario y los miembros dicen de quién son', () => {
  it('se anotan en este dispositivo, y se dice', () => {
    eq(sinComentarios('src/components/Calendar/CalendarView.tsx').includes('anotados en este dispositivo'), true);
    eq(sinComentarios('src/components/Members/MembersView.tsx').includes('anotado en este dispositivo'), true);
  });
});

// --- Una sola identidad ----------------------------------------------------

describe('El menú lleva la misma nota que el icono instalado', () => {
  const favicon = readFileSync('public/favicon.svg', 'utf8');
  const sidebar = readFileSync('src/components/Layout/Sidebar.tsx', 'utf8');
  const trazo = favicon.match(/<path d="([^"]+)"/)?.[1] ?? '';

  it('es el mismo trazo, carácter por carácter', () => {
    eq(trazo.length > 0, true, 'el icono tiene su nota');
    eq(sidebar.includes(trazo), true, 'y el menú dibuja exactamente esa');
  });

  it('ya no hay una cruz representando a la aplicación', () => {
    eq(sinComentarios('src/components/Layout/Sidebar.tsx').includes('<Cross'), false);
    eq(sidebar.includes("Cross,"), false, 'ni se importa');
  });

  it('sin tocar el icono, el manifiesto ni los colores', () => {
    // El cuadrado azul del menú sigue siendo el de siempre, y la nota va dentro.
    eq(sidebar.includes('rounded-xl bg-[#2464ED]'), true);
    eq(favicon.includes('#2563eb'), true, 'el favicon no se tocó');
    eq(JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')).theme_color, '#2563eb');
  });

  it('y la nota no le dice nada a quien no la ve', () => {
    eq(/<svg viewBox="0 0 32 32" aria-hidden="true"/.test(sidebar), true);
  });
});

// --- La regla de la casa ---------------------------------------------------

describe('Nada de lo que se toca rompe las reglas de escritura', () => {
  const tocados = [
    'src/components/Legal/PrivacyPolicy.tsx',
    'src/components/Pages/About.tsx',
    'src/components/Layout/Sidebar.tsx',
    'src/components/Layout/Topbar.tsx',
    'src/components/Layout/CatalogStatus.tsx',
    'src/components/Dashboard/PlaylistsView.tsx',
    'src/components/Setlists/SetlistsView.tsx',
    'src/components/Setlists/SetlistDetail.tsx',
    'src/components/Setlists/SharedSetlistScreen.tsx',
    'src/components/Calendar/CalendarView.tsx',
    'src/components/Members/MembersView.tsx',
    'src/utils/setlistVersions.ts',
  ];

  it('sin emojis', () => {
    for (const ruta of tocados) {
      eq(/\p{Extended_Pictographic}/u.test(readFileSync(ruta, 'utf8')), false, ruta);
    }
  });

  it('y sin raya larga en lo que se lee', () => {
    for (const ruta of tocados) {
      const codigo = sinComentarios(ruta);
      // Queda como glifo de «nada» en un hueco numérico, que no es prosa.
      const prosa = codigo.replace(/'—'/g, '');
      eq(prosa.includes(EM_DASH), false, ruta);
    }
  });

  it('y sin rastros de plantilla en ninguna pantalla pública', () => {
    for (const ruta of tocados) {
      const texto = readFileSync(ruta, 'utf8');
      for (const resto of ['Añade aquí', 'Reemplaza el', 'TODO:', 'FIXME']) {
        eq(texto.includes(resto), false, `${ruta}: ${resto}`);
      }
    }
  });
});
