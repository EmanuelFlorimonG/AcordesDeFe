import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SetlistsView } from '../src/components/Setlists/SetlistsView';
import type { Setlist } from '../src/types/setlist';
import type { SetlistRepository } from '../src/storage/setlistStorage';
import {
  describeGuestImport,
  importGuestSetlists,
  pendingGuestSetlists,
} from '../src/storage/guestSetlistImport';

/**
 * Llevar a la cuenta lo que alguien hizo antes de tener una.
 *
 * Lo que se comprueba aquí es sobre todo lo que NO pasa: no se borra nada del
 * lado del invitado, no se pisa nada del lado de la cuenta, y un dispositivo
 * que se queda sin sitio a mitad de camino no deja a nadie sin lo que ya
 * había entrado.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`guestSetlistImport.test: ${checks} comprobaciones`));

const NOW = Date.UTC(2026, 8, 15, 12);

const setlistOf = (id: string, overrides: Partial<Setlist> = {}): Setlist => ({
  id,
  name: `Setlist ${id}`,
  date: '2026-10-04',
  description: '',
  participantIds: [],
  items: [],
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const quotaExceeded = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError');

/** Un almacén en memoria que puede negarse a escribir, como uno lleno. */
function memory(initial: Setlist[] = []): SetlistRepository & { current(): Setlist[]; breakWrites(error: unknown | null): void } {
  let stored = [...initial];
  let broken: unknown | null = null;
  return {
    key: 'memoria',
    load: () => ({ setlists: [...stored], recoveredFromUnreadableData: false }),
    save: (setlists) => {
      if (broken === null) stored = [...setlists];
    },
    saveOrThrow: (setlists) => {
      if (broken !== null) throw broken;
      stored = [...setlists];
    },
    current: () => stored,
    breakWrites: (error) => {
      broken = error;
    },
  };
}

describe('Lo que falta por llevar a la cuenta', () => {
  it('son los del invitado que la cuenta todavía no tiene', () => {
    const guest = memory([setlistOf('a'), setlistOf('b')]);
    eq(pendingGuestSetlists(guest, memory()).map((setlist) => setlist.id), ['a', 'b']);
    eq(pendingGuestSetlists(guest, memory([setlistOf('a')])).map((setlist) => setlist.id), ['b']);
    eq(pendingGuestSetlists(guest, memory([setlistOf('a'), setlistOf('b')])), [], 'ya está todo');
  });

  it('sin Setlists de invitado no hay nada que ofrecer', () => {
    eq(pendingGuestSetlists(memory(), memory([setlistOf('a')])), []);
  });
});

describe('Llevar los Setlists de invitado a la cuenta', () => {
  it('los copia enteros, y no borra ni uno del lado del invitado', () => {
    const conTodo = setlistOf('a', {
      name: 'Misa Domingo',
      description: 'Con todo dentro',
      participantIds: ['miembro-ana'],
      items: [
        {
          id: 'item-1',
          songId: 'huracan',
          moment: 'Entrada',
          transposeSteps: 2,
          capoFret: 3,
          notes: 'Último coro x2',
          arrangement: {
            songVersion: 2,
            sections: [
              {
                id: 'bloque-1',
                sourceSectionId: 'section-1',
                label: 'Coro',
                repeatCount: 2,
                voices: ['women'],
                assignedMemberIds: ['miembro-ana'],
                instruction: 'Entrar suave',
                transition: { type: 'continue' },
              },
            ],
          },
          transitionToNext: { type: 'direct', instruction: 'Sin respirar' },
        },
      ],
    });
    const guest = memory([conTodo]);
    const account = memory();

    eq(importGuestSetlists(guest, account), { imported: 1, alreadyThere: 0, failed: 0 });
    eq(account.current(), [conTodo], 'llega tal cual, con arreglos, tonos y notas');
    eq(guest.current(), [conTodo], 'y el original sigue donde estaba');
  });

  it('no pisa nada de lo que la cuenta ya tiene', () => {
    // El mismo id en los dos sitios: ya se importó antes, o ya existía. Lo de
    // la cuenta es lo que la persona ha estado usando dentro de ella.
    const mio = setlistOf('a', { name: 'Lo que hay en la cuenta' });
    const suyo = setlistOf('a', { name: 'Lo que hay de invitado' });
    const account = memory([mio]);

    eq(importGuestSetlists(memory([suyo]), account), { imported: 0, alreadyThere: 1, failed: 0 });
    eq(account.current(), [mio], 'intacto');
  });

  it('importar dos veces no duplica nada', () => {
    const guest = memory([setlistOf('a'), setlistOf('b')]);
    const account = memory();

    eq(importGuestSetlists(guest, account), { imported: 2, alreadyThere: 0, failed: 0 });
    eq(importGuestSetlists(guest, account), { imported: 0, alreadyThere: 2, failed: 0 }, 'la segunda no hace nada');
    eq(account.current().map((setlist) => setlist.id), ['a', 'b']);
    // Y deja de ofrecerse, que es lo que hace que el aviso no sea eterno.
    eq(pendingGuestSetlists(guest, account), []);
  });

  it('deja donde está lo que ya tenía la cuenta, y añade lo demás', () => {
    const suyoDeAntes = setlistOf('propio', { name: 'Hecho dentro de la cuenta' });
    const account = memory([suyoDeAntes]);

    eq(importGuestSetlists(memory([setlistOf('a')]), account), { imported: 1, alreadyThere: 0, failed: 0 });
    eq(account.current().map((setlist) => setlist.id), ['propio', 'a']);
  });

  it('si el dispositivo se llena a mitad, lo que entró se queda', () => {
    const guest = memory([setlistOf('a'), setlistOf('b'), setlistOf('c')]);
    const account = memory();
    let escrituras = 0;
    const original = account.saveOrThrow;
    account.saveOrThrow = (setlists) => {
      escrituras += 1;
      if (escrituras > 1) throw quotaExceeded();
      original(setlists);
    };

    const result = importGuestSetlists(guest, account);
    eq(result, { imported: 1, alreadyThere: 0, failed: 2 });
    eq(account.current().map((setlist) => setlist.id), ['a'], 'el primero entró');
    eq(guest.current().length, 3, 'y no se ha perdido ninguno del invitado');
  });

  it('un dispositivo que no acepta nada no deja a nadie sin sus Setlists', () => {
    const guest = memory([setlistOf('a'), setlistOf('b')]);
    const account = memory();
    account.breakWrites(quotaExceeded());

    eq(importGuestSetlists(guest, account), { imported: 0, alreadyThere: 0, failed: 2 });
    eq(account.current(), []);
    eq(guest.current().length, 2, 'siguen estando todos');
  });
});

describe('Lo que se le dice a la persona', () => {
  it('cuántos se guardaron, en singular y en plural', () => {
    eq(describeGuestImport({ imported: 1, alreadyThere: 0, failed: 0 }), {
      ok: true,
      message: '1 Setlist guardado en tu cuenta',
    });
    eq(describeGuestImport({ imported: 3, alreadyThere: 0, failed: 0 }), {
      ok: true,
      message: '3 Setlists guardados en tu cuenta',
    });
  });

  it('cuando ya estaban, se dice eso y no un falso guardado', () => {
    const yaEstaban = describeGuestImport({ imported: 0, alreadyThere: 2, failed: 0 });
    eq(yaEstaban.ok, true);
    eq(yaEstaban.message, 'Esos Setlists ya estaban en tu cuenta');
  });

  it('si alguno no pudo, se dice cuántos sí y cuántos no', () => {
    const aMedias = describeGuestImport({ imported: 2, alreadyThere: 0, failed: 1 });
    eq(aMedias.ok, false);
    eq(aMedias.message, '2 Setlists guardados en tu cuenta. 1 no se pudo guardar: sigue donde estaba. Inténtalo otra vez.');

    const ninguno = describeGuestImport({ imported: 0, alreadyThere: 0, failed: 2 });
    eq(ninguno.ok, false);
    eq(ninguno.message, '2 no se pudieron guardar: siguen donde estaban. Inténtalo otra vez.');
  });

  it('no se le ensena a nadie como funciona esto por dentro', () => {
    const todas = [
      describeGuestImport({ imported: 2, alreadyThere: 1, failed: 0 }),
      describeGuestImport({ imported: 0, alreadyThere: 0, failed: 1 }),
      describeGuestImport({ imported: 0, alreadyThere: 3, failed: 0 }),
    ];
    for (const { message } of todas) {
      for (const interno of ['scope', 'guest', 'localStorage', 'revision', 'fingerprint', 'payload', 'token']) {
        eq(message.toLowerCase().includes(interno.toLowerCase()), false, `${interno}: ${message}`);
      }
    }
  });
});

describe('Nada de esto pasa solo', () => {
  const source = readFileSync('src/storage/guestSetlistImport.ts', 'utf8').replace(/\r\n/g, '\n');
  // Sin comentarios: lo que se comprueba es lo que hace, no lo que cuenta.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
  const hook = readFileSync('src/hooks/useGuestSetlistImport.ts', 'utf8').replace(/\r\n/g, '\n');
  const app = readFileSync('src/App.tsx', 'utf8').replace(/\r\n/g, '\n');
  const view = readFileSync('src/components/Setlists/SetlistsView.tsx', 'utf8').replace(/\r\n/g, '\n');

  it('no hay migración automática: hace falta pulsar', () => {
    eq(app.includes('onImportGuestSetlists={() => {'), true, 'sale de pulsar algo');
    eq(/useEffect\([^)]*importAll/.test(app), false, 'ningún efecto importa nada');
    eq(hook.includes('useEffect'), false, 'ni un efecto en el hook');
    eq(view.includes('Llevar a mi cuenta'), true);
    eq(view.includes('Ahora no'), true);
  });

  it('no se borra nada del lado del invitado, en ninguna parte de este camino', () => {
    // Ni borrar, ni mover, ni vaciar: sólo leer de un lado y escribir en otro.
    for (const forbidden of ['remove', 'clear', 'delete']) {
      eq(code.includes(forbidden), false, forbidden);
    }
    eq(code.includes('guest.load()'), true, 'del invitado sólo se lee');
    eq(/guest\.save/.test(code), false, 'y nunca se le escribe');
    eq(/guest\.save/.test(hook), false);
    // La única escritura de todo el camino es la de la cuenta.
    eq((code.match(/saveOrThrow/g) ?? []).length, 1, 'un solo sitio donde se escribe');
    eq(code.includes('account.saveOrThrow'), true);
  });

  it('nunca se sobrescribe un Setlist que la cuenta ya tiene', () => {
    eq(code.includes("now.some((entry) => entry.id === setlist.id)"), true);
    eq(code.includes('account.saveOrThrow([...now, setlist])'), true, 'se añade, nunca se reemplaza');
  });

  it('un invitado no ve nada de esto', () => {
    eq(hook.includes("scope.kind === 'user' ? scope.userId.trim() : ''"), true);
    eq(hook.includes('if (!userId) return 0;'), true);
    eq(hook.includes('if (!userId) return null;'), true);
    eq(view.includes('guestSetlists > 0 && onImportGuestSetlists'), true, 'sin cuenta, sin aviso');
  });

  it('"ahora no" no mueve nada, y vale sólo para esa cuenta', () => {
    eq(hook.includes('dismissed: dismissedFor === scopeName'), true);
    eq(hook.includes('setDismissedFor(scopeName)'), true);
    // Es lo único que hace: no toca ningún almacén.
    eq(/dismiss[\s\S]{0,200}saveOrThrow/.test(hook), false);
  });

  it('esto no sabe nada de la nube ni de la sincronización', () => {
    for (const forbidden of ['cloud', 'supabase', 'runSetlistSync', 'fetch', 'portableFingerprint']) {
      eq(code.includes(forbidden), false, forbidden);
      eq(hook.includes(forbidden), false, `hook: ${forbidden}`);
    }
  });
});

// --- Lo que ve la persona --------------------------------------------------------------------

describe('El aviso en la pantalla de Setlists', () => {
  const view = (props: Partial<Parameters<typeof SetlistsView>[0]> = {}) =>
    renderToStaticMarkup(
      createElement(SetlistsView, {
        setlists: [],
        durations: {},
        recoveredFromUnreadableData: false,
        onOpen: () => {},
        onCreate: () => {},
        ...props,
      })
    );

  it('dice cuántos hay y qué va a pasar con ellos', () => {
    const html = view({ guestSetlists: 3, onImportGuestSetlists: () => {}, onDismissGuestSetlists: () => {} });
    eq(html.includes('Tienes 3 Setlists creados antes de iniciar sesión.'), true);
    eq(html.includes('¿Quieres guardarlos en tu cuenta?'), true);
    eq(html.includes('no se borra nada de lo que ya tenías'), true, 'y que no se pierde nada');
    eq(html.includes('Llevar a mi cuenta'), true);
    eq(html.includes('Ahora no'), true);
  });

  it('en singular cuando hay uno solo', () => {
    const html = view({ guestSetlists: 1, onImportGuestSetlists: () => {} });
    eq(html.includes('Tienes 1 Setlist creado antes de iniciar sesión.'), true);
    eq(html.includes('Setlists creados'), false);
  });

  it('un invitado, o quien no tenga ninguno, no ve nada de esto', () => {
    // Sin cuenta no llega la acción; sin Setlists de invitado no hay cuenta que contar.
    eq(view({ guestSetlists: 3 }).includes('Llevar a mi cuenta'), false, 'invitado');
    eq(view({ guestSetlists: 0, onImportGuestSetlists: () => {} }).includes('Llevar a mi cuenta'), false, 'ninguno');
    eq(view({ onImportGuestSetlists: () => {} }).includes('antes de iniciar sesión'), false, 'por defecto, nada');
  });

  it('no se le ensena a nadie como se guarda esto', () => {
    const html = view({ guestSetlists: 2, onImportGuestSetlists: () => {}, onDismissGuestSetlists: () => {} });
    for (const interno of ['scope', 'guest', 'localStorage', 'GUEST_SETLISTS', 'importar', 'migrar']) {
      eq(html.toLowerCase().includes(interno.toLowerCase()), false, interno);
    }
  });
});
