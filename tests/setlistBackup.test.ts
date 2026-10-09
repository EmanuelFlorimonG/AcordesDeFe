import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Setlist, SetlistItem } from '../src/types/setlist';
import type { Song } from '../src/types/song';
import {
  ADORATION_MOMENTS,
  BACKUP_MOMENT,
  MASS_MOMENTS,
  addSongsToSetlist,
  createSetlist,
  getFirstRunItem,
  getSetlistRunPosition,
  isBackupItem,
  momentsFor,
  moveSetlistItem,
  moveSetlistItemBy,
  sameRun,
  summarizeSetlistDuration,
  updateSetlistItem,
} from '../src/utils/setlists';
import { getMassProgress, listMassStops, resolveMassItemId, runProgressPosition } from '../src/utils/massMode';
import { useMassSession } from '../src/hooks/useMassSession';
import { runHook } from './hookHarness';
import { buildSetlistDocument } from '../src/utils/setlistExport';
import { sharedPlayback } from '../src/utils/sharedSetlistRoutes';
import { canonicalSetlist } from '../src/storage/setlistSync';
import { createLocalSetlistRepository } from '../src/storage/setlistStorage';

/**
 * Las canciones de reserva de una celebración.
 *
 * Un coro no prepara solo lo que va a cantar: prepara también lo que tendrá a
 * mano si la comunión se alarga o si queda un hueco. Eso es «Backup».
 *
 * Y va donde quien prepara lo ponga. Si la reserva de la comunión se apunta
 * justo después de la comunión es porque ahí es donde se va a buscar, con el
 * dedo, en mitad de la misa. Lo que la distingue no es su sitio en la hoja:
 * es que la celebración pasa de largo por ella. Después de la Comunión viene
 * la PostComunión aunque en medio haya una reserva escrita.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`setlistBackup.test: ${checks} comprobaciones`));

const NOW = Date.UTC(2026, 9, 11, 12);
const LATER = NOW + 60_000;

let contador = 0;
const nuevoId = () => `item-${++contador}`;

const CANCIONES: Song[] = [
  'vamos-claretianos',
  'ten-piedad',
  'jesus-amigo',
  'pongo-en-tus-manos',
  'puedo-entrar',
  'la-fuerza-del-espiritu',
  'santo-merengue',
].map((id, i) => ({
  id,
  title: `Canción ${i + 1}`,
  originalKey: 'C',
  categories: ['Claretiana'],
  tags: [],
  content: 'Letra',
  chordsUsed: [],
}) as unknown as Song);

const POR_ID = new Map(CANCIONES.map((song) => [song.id, song]));
const cancion = (id: string) => POR_ID.get(id)!;

/** Un Setlist con las canciones y momentos que se le digan, en ese orden. */
function setlistCon(entradas: Array<[string, string]>, kind?: 'adoracion'): Setlist {
  contador = 0;
  let setlist = createSetlist({ name: 'Prueba', date: '2026-10-11', ...(kind ? { kind } : {}) }, { now: NOW, createId: nuevoId });
  for (const [songId, moment] of entradas) {
    setlist = addSongsToSetlist(setlist, [cancion(songId)], { now: NOW, createId: nuevoId, moment });
  }
  return setlist;
}

/** Lo que se ve de un Setlist: cada entrada con su momento, en orden. */
const orden = (setlist: Setlist) => setlist.items.map((item) => [item.songId, item.moment]);

const siempre = () => true;

/**
 * La misa del ejemplo: una reserva en medio y otra al final, tal cual se pidió.
 *
 *   01 ENTRADA · 02 PIEDAD · 03 COMUNIÓN · R1 BACKUP
 *   04 POSTCOMUNIÓN · 05 SALIDA · R2 BACKUP
 */
const MEZCLADO = (): Setlist =>
  setlistCon([
    ['vamos-claretianos', 'Entrada'],
    ['ten-piedad', 'Piedad'],
    ['jesus-amigo', 'Comunión'],
    ['pongo-en-tus-manos', BACKUP_MOMENT],
    ['puedo-entrar', 'PostComunión'],
    ['la-fuerza-del-espiritu', 'Salida'],
    ['santo-merengue', BACKUP_MOMENT],
  ]);

// --- Dónde se elige ---------------------------------------------------------

describe('Backup se ofrece en las dos celebraciones', () => {
  it('en una misa, detrás de sus partes', () => {
    eq(momentsFor('misa'), [...MASS_MOMENTS, BACKUP_MOMENT]);
  });

  it('en una adoración, detrás de las suyas', () => {
    eq(momentsFor('adoracion'), [...ADORATION_MOMENTS, BACKUP_MOMENT]);
  });

  it('y en un Setlist de antes, que es una misa', () => {
    eq(momentsFor(undefined).includes(BACKUP_MOMENT), true);
  });

  it('sin inventar un momento llamado «Adoración»', () => {
    // «Adoración» es una categoría del cancionero, no una parte de nada.
    for (const clase of ['misa', 'adoracion', undefined] as const) {
      eq(momentsFor(clase).includes('Adoración'), false, String(clase));
    }
  });

  it('no es una parte de la misa ni de la adoración: está aparte', () => {
    eq(MASS_MOMENTS.includes(BACKUP_MOMENT), false);
    eq(ADORATION_MOMENTS.includes(BACKUP_MOMENT), false);
  });
});

// --- Donde quiera que se ponga ---------------------------------------------

describe('La reserva se coloca donde haga falta', () => {
  it('al principio del todo', () => {
    const setlist = setlistCon([
      ['pongo-en-tus-manos', BACKUP_MOMENT],
      ['vamos-claretianos', 'Entrada'],
    ]);
    eq(orden(setlist), [
      ['pongo-en-tus-manos', BACKUP_MOMENT],
      ['vamos-claretianos', 'Entrada'],
    ]);
  });

  it('entre dos canciones de la celebración', () => {
    eq(orden(MEZCLADO()), [
      ['vamos-claretianos', 'Entrada'],
      ['ten-piedad', 'Piedad'],
      ['jesus-amigo', 'Comunión'],
      ['pongo-en-tus-manos', BACKUP_MOMENT],
      ['puedo-entrar', 'PostComunión'],
      ['la-fuerza-del-espiritu', 'Salida'],
      ['santo-merengue', BACKUP_MOMENT],
    ]);
  });

  it('justo después de la Comunión, que es donde se busca', () => {
    const setlist = MEZCLADO();
    eq(setlist.items[2].moment, 'Comunión');
    eq(setlist.items[3].moment, BACKUP_MOMENT, 'la reserva, pegada a la comunión');
    eq(setlist.items[4].moment, 'PostComunión');
  });

  it('y después de la PostComunión también', () => {
    const setlist = setlistCon([
      ['jesus-amigo', 'Comunión'],
      ['puedo-entrar', 'PostComunión'],
      ['pongo-en-tus-manos', BACKUP_MOMENT],
      ['la-fuerza-del-espiritu', 'Salida'],
    ]);
    eq(orden(setlist).map(([, moment]) => moment), [
      'Comunión',
      'PostComunión',
      BACKUP_MOMENT,
      'Salida',
    ]);
  });

  it('varias, repartidas por donde se necesiten', () => {
    const setlist = MEZCLADO();
    eq(setlist.items.map(isBackupItem), [false, false, false, true, false, false, true]);
    eq(setlist.items.filter(isBackupItem).length, 2);
  });

  it('añadir una canción después no reordena nada: va al final, como siempre', () => {
    let setlist = MEZCLADO();
    setlist = addSongsToSetlist(setlist, [cancion('ten-piedad')], {
      now: LATER,
      createId: nuevoId,
      moment: 'Gloria',
    });
    eq(orden(setlist)[6], ['santo-merengue', BACKUP_MOMENT], 'la reserva no se mueve sola');
    eq(orden(setlist)[7], ['ten-piedad', 'Gloria']);
  });

  it('marcar una canción como reserva la deja donde está', () => {
    const setlist = MEZCLADO();
    const comunion = setlist.items[2];
    const cambiado = updateSetlistItem(setlist, comunion.id, { moment: BACKUP_MOMENT }, LATER);

    eq(cambiado.items.map((item) => item.songId), setlist.items.map((item) => item.songId), 'el orden es el mismo');
    eq(cambiado.items[2].moment, BACKUP_MOMENT);
  });

  it('y quitarle la reserva tampoco la mueve', () => {
    const setlist = MEZCLADO();
    const reserva = setlist.items[3];
    const cambiado = updateSetlistItem(setlist, reserva.id, { moment: 'Ofertorio' }, LATER);

    eq(cambiado.items.map((item) => item.songId), setlist.items.map((item) => item.songId));
    eq(cambiado.items[3].moment, 'Ofertorio');
  });
});

// --- Mover: sin ataduras ----------------------------------------------------

describe('Se mueven todas por igual', () => {
  it('una reserva sube hasta el primer puesto', () => {
    const setlist = MEZCLADO();
    const movido = moveSetlistItem(setlist, setlist.items[3].id, 0, LATER);
    eq(movido.items.map((item) => item.songId), [
      'pongo-en-tus-manos',
      'vamos-claretianos',
      'ten-piedad',
      'jesus-amigo',
      'puedo-entrar',
      'la-fuerza-del-espiritu',
      'santo-merengue',
    ]);
  });

  it('y baja hasta el último', () => {
    const setlist = MEZCLADO();
    const movido = moveSetlistItem(setlist, setlist.items[3].id, 6, LATER);
    eq(movido.items[6].songId, 'pongo-en-tus-manos');
  });

  it('una canción de la celebración cruza una reserva sin tropezar', () => {
    const setlist = MEZCLADO();
    // La PostComunión (índice 4) sube por encima de la reserva (índice 3).
    const movido = moveSetlistItemBy(setlist, setlist.items[4].id, -1, LATER);
    eq(movido.items.map((item) => item.songId).slice(2, 5), [
      'jesus-amigo',
      'puedo-entrar',
      'pongo-en-tus-manos',
    ]);
  });

  it('las flechas funcionan en los dos sentidos, sin topes de grupo', () => {
    const setlist = MEZCLADO();
    const reserva = setlist.items[3].id;
    const arriba = moveSetlistItemBy(setlist, reserva, -1, LATER);
    eq(arriba.items[2].songId, 'pongo-en-tus-manos', 'sube por encima de la Comunión');
    const abajo = moveSetlistItemBy(arriba, reserva, 1, LATER);
    eq(abajo.items.map((item) => item.songId), setlist.items.map((item) => item.songId), 'y vuelve');
  });

  it('los topes siguen siendo los de la lista entera', () => {
    const setlist = MEZCLADO();
    eq(moveSetlistItem(setlist, setlist.items[0].id, -5, LATER).items[0].songId, 'vamos-claretianos');
    eq(moveSetlistItem(setlist, setlist.items[6].id, 99, LATER).items[6].songId, 'santo-merengue');
  });
});

// --- El orden elegido se guarda --------------------------------------------

describe('El orden elegido es el que se guarda', () => {
  it('se escribe y se vuelve a leer tal cual', () => {
    const setlist = MEZCLADO();
    const almacen = new Map<string, string>();
    const storage = {
      getItem: (key: string) => almacen.get(key) ?? null,
      setItem: (key: string, value: string) => void almacen.set(key, value),
      removeItem: (key: string) => void almacen.delete(key),
    };
    createLocalSetlistRepository(storage).save([setlist]);

    const leido = createLocalSetlistRepository(storage).load().setlists[0];
    eq(orden(leido), orden(setlist));
  });

  it('y la huella que viaja a la nube lleva ese orden', () => {
    const setlist = MEZCLADO();
    const movido = moveSetlistItem(setlist, setlist.items[3].id, 0, LATER);
    eq(canonicalSetlist(movido) === canonicalSetlist(setlist), false, 'mover cambia la huella');
    // Y el momento viaja en ella desde siempre: «Backup» no estrena campo.
    eq(canonicalSetlist(setlist).includes(BACKUP_MOMENT), true);
  });

  it('un Setlist de antes escribe exactamente lo que escribía', () => {
    const viejo = setlistCon([
      ['vamos-claretianos', 'Entrada'],
      ['ten-piedad', 'Piedad'],
    ]);
    const comoAntes = JSON.stringify([
      viejo.id,
      viejo.name,
      viejo.date,
      viejo.description,
      viejo.createdAt,
      viejo.items.map((item) => [item.id, item.songId, item.moment, item.transposeSteps, item.capoFret, item.notes, null, null]),
    ]);
    eq(canonicalSetlist(viejo), comoAntes);
  });
});

// --- La canción del cancionero no se toca ----------------------------------

describe('La reserva es de este Setlist, no de la canción', () => {
  it('la ficha de la canción no cambia ni una letra', () => {
    const antes = JSON.stringify(cancion('pongo-en-tus-manos'));
    const setlist = MEZCLADO();
    updateSetlistItem(setlist, setlist.items[3].id, { moment: BACKUP_MOMENT }, LATER);
    eq(JSON.stringify(cancion('pongo-en-tus-manos')), antes);
  });

  it('la misma canción puede ser de reserva aquí y principal allá', () => {
    const misa = setlistCon([['ten-piedad', 'Piedad']]);
    const otra = setlistCon([['ten-piedad', BACKUP_MOMENT]]);
    eq([isBackupItem(misa.items[0]), isBackupItem(otra.items[0])], [false, true]);
  });

  it('el tono y las notas de una reserva son suyos y se conservan', () => {
    const setlist = MEZCLADO();
    const reserva = setlist.items[3].id;
    const afinada = updateSetlistItem(setlist, reserva, { transposeSteps: 2, notes: 'Si se alarga' }, LATER);
    const movida = moveSetlistItem(afinada, reserva, 0, LATER);
    const encontrada = movida.items.find((item) => item.id === reserva)!;

    eq([encontrada.transposeSteps, encontrada.notes, encontrada.moment], [2, 'Si se alarga', BACKUP_MOMENT]);
  });
});

// --- En vivo: la celebración pasa de largo ---------------------------------

describe('El recorrido automático salta las reservas, estén donde estén', () => {
  const setlist = MEZCLADO();
  const [entrada, piedad, comunion, reserva1, postcomunion, salida, reserva2] = setlist.items;
  const posicion = (item: SetlistItem) => getSetlistRunPosition(setlist, item.id, siempre);

  it('de la Comunión se pasa a la PostComunión, aunque en medio haya una reserva', () => {
    eq(posicion(comunion)!.next?.id, postcomunion.id);
    eq(posicion(postcomunion)!.previous?.id, comunion.id, 'y hacia atrás, igual');
  });

  it('el recorrido cuenta cinco canciones, no siete', () => {
    eq(posicion(entrada)!.total, 5);
    eq(posicion(piedad)!.index, 1);
    eq(posicion(salida)!.index, 4);
  });

  it('la última de la celebración es la última: después no hay nada', () => {
    const fin = posicion(salida)!;
    eq(fin.next, null, 'no cae en la reserva que viene detrás');
    eq(fin.isLast, true);
  });

  it('una reserva abierta a mano no lleva a ninguna parte', () => {
    for (const reserva of [reserva1, reserva2]) {
      const sola = posicion(reserva)!;
      eq([sola.previous, sola.next], [null, null], reserva.songId);
      eq([sola.index, sola.total], [0, 1], 'es un recorrido de una sola canción');
    }
  });

  it('ni siquiera a la otra reserva', () => {
    eq(posicion(reserva1)!.next, null);
    eq(setlist.items.filter(sameRun(reserva1, siempre)).map((item) => item.id), [reserva1.id]);
  });

  it('empezar es empezar por la primera que se canta', () => {
    const empiezaConReserva = setlistCon([
      ['pongo-en-tus-manos', BACKUP_MOMENT],
      ['vamos-claretianos', 'Entrada'],
    ]);
    eq(getFirstRunItem(empiezaConReserva, siempre)?.songId, 'vamos-claretianos');
    eq(resolveMassItemId(empiezaConReserva, null, siempre), empiezaConReserva.items[1].id);
  });

  it('pero una reserva pedida a propósito se abre', () => {
    eq(resolveMassItemId(setlist, reserva1.id, siempre), reserva1.id);
  });

  it('un Setlist que es todo reserva se abre igual: algo hay que cantar', () => {
    const todo = setlistCon([
      ['vamos-claretianos', BACKUP_MOMENT],
      ['ten-piedad', BACKUP_MOMENT],
    ]);
    eq(getFirstRunItem(todo, siempre)?.id, todo.items[0].id);
  });

  it('una canción que ya no está en el cancionero se sigue saltando', () => {
    const existe = (item: SetlistItem) => item.songId !== 'puedo-entrar';
    eq(getSetlistRunPosition(setlist, comunion.id, existe)!.next?.id, salida.id);
  });
});

// --- Lo mismo en un Setlist compartido -------------------------------------

describe('Un Setlist compartido se comporta igual', () => {
  const setlist = MEZCLADO();
  const navega = () => {};
  const paso = (itemId: string) => sharedPlayback(setlist, POR_ID, 'abc123', itemId, navega);

  it('salta la reserva que hay entre la Comunión y la PostComunión', () => {
    const comunion = paso(setlist.items[2].id)!;
    eq(comunion.total, 5);
    eq(comunion.next?.title, cancion('puedo-entrar').title);
  });

  it('y una reserva abierta por el enlace no continúa sola', () => {
    const reserva = paso(setlist.items[3].id)!;
    eq([reserva.previous, reserva.next], [null, null]);
    eq([reserva.position, reserva.total], [1, 1]);
  });
});

// --- El navegador las enseña, que es como se llega -------------------------

describe('Al navegador salen todas, cada una con su cuenta', () => {
  it('las de la celebración de una en una, y las reservas como R1 y R2', () => {
    const paradas = listMassStops(MEZCLADO(), siempre);
    eq(paradas.map((parada) => [parada.position, parada.isBackup]), [
      [1, false],
      [2, false],
      [3, false],
      [1, true],
      [4, false],
      [5, false],
      [2, true],
    ]);
  });

  it('y están en el orden en que se escribieron, sin agruparse', () => {
    const paradas = listMassStops(MEZCLADO(), siempre);
    eq(paradas.map((parada) => parada.item.songId), MEZCLADO().items.map((item) => item.songId));
  });

  it('una canción que ya no está sigue listada, sin número', () => {
    const existe = (item: SetlistItem) => item.songId !== 'ten-piedad';
    const paradas = listMassStops(MEZCLADO(), existe);
    eq(paradas.map((parada) => parada.position), [1, null, 2, 1, 3, 4, 2]);
  });
});

// --- El papel respeta lo que se eligió -------------------------------------

describe('La hoja impresa respeta el orden elegido', () => {
  it('cada reserva sale en su sitio, no todas al final', () => {
    const doc = buildSetlistDocument(MEZCLADO(), POR_ID);
    eq(doc.moments.map((momento) => momento.moment), [
      'ENTRADA',
      'PIEDAD',
      'COMUNIÓN',
      'BACKUP',
      'POSTCOMUNIÓN',
      'SALIDA',
      'BACKUP',
    ]);
  });

  it('y cada entrada va en el orden del Setlist', () => {
    const doc = buildSetlistDocument(MEZCLADO(), POR_ID);
    // En la hoja los momentos van en mayúsculas, como el ministerio los reparte.
    eq(doc.entries.map((entrada) => entrada.moment), [
      'ENTRADA',
      'PIEDAD',
      'COMUNIÓN',
      'BACKUP',
      'POSTCOMUNIÓN',
      'SALIDA',
      'BACKUP',
    ]);
  });
});

// --- Lo que dura la celebración --------------------------------------------

describe('La reserva no alarga la celebración en el papel', () => {
  const DURACIONES = {
    'vamos-claretianos': 180,
    'ten-piedad': 120,
    'jesus-amigo': 240,
    'pongo-en-tus-manos': 300,
    'puedo-entrar': 150,
    'la-fuerza-del-espiritu': 210,
    'santo-merengue': 600,
  };

  it('solo se suma lo que se va a cantar', () => {
    eq(summarizeSetlistDuration(MEZCLADO(), DURACIONES), {
      songCount: 5,
      knownSeconds: 900,
      unknownCount: 0,
    });
  });

  it('da igual dónde estén escritas las reservas', () => {
    const alFinal = setlistCon([
      ['vamos-claretianos', 'Entrada'],
      ['ten-piedad', 'Piedad'],
      ['jesus-amigo', 'Comunión'],
      ['puedo-entrar', 'PostComunión'],
      ['la-fuerza-del-espiritu', 'Salida'],
      ['pongo-en-tus-manos', BACKUP_MOMENT],
      ['santo-merengue', BACKUP_MOMENT],
    ]);
    eq(summarizeSetlistDuration(alFinal, DURACIONES), summarizeSetlistDuration(MEZCLADO(), DURACIONES));
  });

  it('y una reserva sin duración conocida tampoco se echa en falta', () => {
    const { unknownCount } = summarizeSetlistDuration(MEZCLADO(), {
      'vamos-claretianos': 180,
      'ten-piedad': 120,
      'jesus-amigo': 240,
      'puedo-entrar': 150,
      'la-fuerza-del-espiritu': 210,
    });
    eq(unknownCount, 0, 'las que faltan son las de reserva, y ésas no cuentan');
  });
});

// --- La barra de avance -----------------------------------------------------

describe('Ir a buscar una reserva no mueve la celebración', () => {
  const setlist = MEZCLADO();
  const [entrada, , comunion, reserva1, postcomunion, salida, reserva2] = setlist.items;
  const posicion = (item: SetlistItem) => getSetlistRunPosition(setlist, item.id, siempre);
  /** El avance que enseñaría la barra estando en `abierta`, recordando `ultima`. */
  const avance = (abierta: SetlistItem, ultima: SetlistItem | null) =>
    getMassProgress(runProgressPosition(setlist, posicion(abierta), ultima?.id ?? null, siempre));

  it('en una canción del recorrido, el avance es el suyo', () => {
    eq(avance(comunion, comunion), 3 / 5);
    eq(avance(salida, salida), 1, 'la última llena la barra');
  });

  it('abrir una reserva desde la Comunión deja la barra en la Comunión', () => {
    eq(avance(reserva1, comunion), 3 / 5, 'ni 100 % ni 0 %: la misa sigue por la comunión');
    eq(avance(reserva2, comunion), 3 / 5, 'la otra reserva, igual');
  });

  it('volver a la Comunión o seguir a la PostComunión es coherente', () => {
    eq(avance(comunion, comunion), 3 / 5, 'se vuelve donde se estaba');
    eq(avance(postcomunion, postcomunion), 4 / 5, 'y se sigue adelante');
  });

  it('una reserva abierta sin haber empezado no enseña avance', () => {
    eq(avance(reserva1, null), 0, 'estado neutral, no el 100 % de «1 de 1»');
    eq(runProgressPosition(setlist, posicion(reserva1), null, siempre), null);
  });

  it('la posición que enseña la barra nunca es la de una reserva', () => {
    const enReserva = runProgressPosition(setlist, posicion(reserva1), comunion.id, siempre);
    eq(enReserva?.item.id, comunion.id);
    eq([enReserva?.index, enReserva?.total], [2, 5]);
  });

  it('y en el recorrido es la de la canción abierta, sin mirar el recuerdo', () => {
    const enRecorrido = runProgressPosition(setlist, posicion(postcomunion), entrada.id, siempre);
    eq(enRecorrido?.item.id, postcomunion.id);
  });

  it('un recuerdo que es una reserva no vale: la barra se queda vacía', () => {
    // Recargar la página en mitad de una reserva retoma la sesión en ella.
    eq(runProgressPosition(setlist, posicion(reserva1), reserva2.id, siempre), null);
    eq(avance(reserva1, reserva2), 0);
  });

  it('la navegación de la reserva no cambia: sigue sola', () => {
    const sola = posicion(reserva1)!;
    eq([sola.previous, sola.next, sola.total], [null, null, 1]);
  });
});

describe('La celebración recuerda por dónde iba, mientras dura', () => {
  /** Un almacén de sesión de mentira: la pantalla, sin navegador. */
  const sesionDePrueba = () => {
    let guardado: { setlistId: string; itemId: string; updatedAt: number } | null = null;
    return {
      read: () => guardado,
      write: (valor: { setlistId: string; itemId: string }) =>
        void (guardado = { ...valor, updatedAt: NOW }),
      clear: () => void (guardado = null),
    };
  };

  it('el avance se queda en la Comunión mientras se mira una reserva', () => {
    const setlist = MEZCLADO();
    const [, , comunion, reserva1, postcomunion] = setlist.items;
    const run = runHook(() => useMassSession({ setlist, isPlayable: siempre, repository: sesionDePrueba() }));

    run.current.goTo(comunion.id);
    run.flush();
    eq(getMassProgress(run.current.runPosition), 3 / 5);

    run.current.goTo(reserva1.id);
    run.flush();
    eq(run.current.currentItemId, reserva1.id, 'la reserva sí se abre');
    eq(run.current.position?.total, 1, 'y sigue siendo un recorrido de una');
    eq(getMassProgress(run.current.runPosition), 3 / 5, 'pero la barra no se mueve');

    run.current.goTo(postcomunion.id);
    run.flush();
    eq(getMassProgress(run.current.runPosition), 4 / 5, 'y al seguir, avanza');
    run.unmount();
  });

  it('empezando por una reserva, la barra está vacía hasta que se canta algo', () => {
    const setlist = MEZCLADO();
    const [entrada, , , reserva1] = setlist.items;
    const run = runHook(() => useMassSession({ setlist, isPlayable: siempre, repository: sesionDePrueba() }));

    run.current.goTo(reserva1.id);
    run.flush();
    eq(run.current.runPosition, null);
    eq(getMassProgress(run.current.runPosition), 0);

    run.current.goTo(entrada.id);
    run.flush();
    eq(getMassProgress(run.current.runPosition), 1 / 5);
    run.unmount();
  });
});
