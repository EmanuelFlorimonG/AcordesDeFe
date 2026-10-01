import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Contact } from '../src/components/Pages/Contact';

/**
 * A quién se escribe.
 *
 * Lo que más importa aquí es que no haya nada inventado. Una dirección que no
 * existe o un canal que nadie lee son peores que no poner nada: alguien
 * escribe, espera, y no contesta nadie. Así que se comprueba lo que hay y se
 * comprueba que no hay nada más.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`contact.test: ${checks} comprobaciones`));

const html = renderToStaticMarkup(createElement(Contact, { onBack: () => {} }));

describe('La comunidad', () => {
  it('lleva al perfil de Instagram, limpio', () => {
    eq(html.includes('href="https://www.instagram.com/comgenesaret_claret/"'), true);
    eq(html.includes('@comgenesaret_claret'), true);
    eq(html.includes('Ver en Instagram'), true, 'y se dice que es Instagram');
    // Sin lo que Instagram cuelga de los enlaces cuando se comparten.
    for (const basura of ['utm_source', 'stkn', 'igsh', '?']) {
      eq(html.includes(`instagram.com/comgenesaret_claret/${basura}`), false, basura);
    }
  });

  it('se abre fuera sin dejar la puerta abierta', () => {
    eq(html.includes('rel="noopener noreferrer"'), true);
    eq(html.includes('target="_blank"'), true);
  });
});

describe('Quien programa', () => {
  it('tiene nombre y correo, y el correo abre el cliente', () => {
    eq(html.includes('Emanuel Florimon'), true);
    eq(html.includes('href="mailto:eflorimon5@gmail.com"'), true);
    eq(html.includes('eflorimon5@gmail.com'), true);
  });

  it('y se distingue de la comunidad', () => {
    eq(html.includes('Comunidad Genesaret'), true);
    eq(html.includes('Contacto del programador'), true);
    eq(html.indexOf('Comunidad Genesaret') < html.indexOf('Contacto del programador'), true);
    eq((html.match(/<section/g) ?? []).length, 2, 'dos apartados, no uno');
  });
});

describe('Nada de relleno', () => {
  it('no queda ni una instrucción para quien lo programó', () => {
    for (const resto of [
      'Añade aquí',
      'Reemplaza',
      'antes de publicar',
      'tu ministerio',
      'acordesdefe.org',
      'WhatsApp',
      'border-dashed',
    ]) {
      eq(html.includes(resto), false, resto);
    }
  });

  it('ni ningún canal que no exista', () => {
    // Sólo hay dos enlaces: el perfil y el correo. Ni teléfono, ni dirección.
    const enlaces = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    eq(enlaces.sort(), ['https://www.instagram.com/comgenesaret_claret/', 'mailto:eflorimon5@gmail.com']);
    for (const inventado of ['tel:', 'wa.me', 'whatsapp', 'maps.google', 'facebook', 'twitter', 'x.com']) {
      eq(html.toLowerCase().includes(inventado), false, inventado);
    }
  });

  it('y se escribe como en el resto de la aplicación', () => {
    eq(/\p{Extended_Pictographic}/u.test(html), false, 'sin emojis');
    eq(html.includes('—'), false, 'sin raya larga');
  });
});

describe('Se puede usar', () => {
  it('lo que se pulsa es un enlace de verdad, con su foco visible', () => {
    eq((html.match(/<a /g) ?? []).length, 2);
    eq((html.match(/focus-visible:ring-2/g) ?? []).length, 2, 'los dos');
  });

  it('los iconos no cuentan nada por su cuenta', () => {
    const iconos = (html.match(/<svg/g) ?? []).length;
    eq(iconos > 0, true);
    eq((html.match(/aria-hidden="true"/g) ?? []).length, iconos, 'todos ocultos al lector');
  });

  it('un correo largo no rompe la tarjeta', () => {
    eq((html.match(/truncate/g) ?? []).length >= 2, true);
    eq(html.includes('min-w-0'), true);
  });
});
