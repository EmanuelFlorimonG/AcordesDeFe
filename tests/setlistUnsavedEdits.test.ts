import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React, { isValidElement } from 'react';
import { SetlistItemEditor } from '../src/components/Setlists/SetlistItemEditor';
import {
  type SetlistDraftStore,
  createSetlistDraftStore,
  draftStatus,
  itemFingerprint,
} from '../src/storage/setlistDraftStorage';
import { createLocalSetlistRepository, GUEST_SETLISTS } from '../src/storage/setlistStorage';
import { addSongsToSetlist, createSetlist, updateSetlistItem } from '../src/utils/setlists';
import { MOCK_SONGS } from '../src/data/mockSongs';
import { runHook } from './hookHarness';
import type { KeyValueStorage } from '../src/storage/localRepository';
import type { SetlistItem } from '../src/types/setlist';

/**
 * Lo que se edita en una canción de un Setlist ya no se pierde al cerrar.
 *
 * Esta prueba nació al revés: documentaba la pérdida. Alguien cambiaba el
 * tono de una canción, cerraba la página y el cambio no estaba. El
 * almacenamiento no tenía la culpa —`useSetlists` guarda en cuanto algo
 * cambia, sin esperas— sino que los siete campos del editor vivían en la
 * memoria de React hasta que se pulsaba Guardar, y cerrar es fácil: la X,
 * Escape, un toque fuera, recargar.
 *
 * Ahora cada cambio escribe un borrador, y las afirmaciones que describían la
 * pérdida están invertidas: dicen que el trabajo sobrevive. Es la misma
 * prueba, contando lo contrario.
 *
 * El Setlist sigue sin tocarse mientras se edita. Guardar y Cancelar siguen
 * decidiendo, que es lo que el ministerio quiso.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`setlistUnsavedEdits.test: ${checks} comprobaciones`));

/** Un localStorage de mentira, que puede además negarse a escribir. */
function memoria({ falla = false } = {}) {
  const datos = new Map<string, string>();
  let escrituras = 0;
  const storage: KeyValueStorage = {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (falla) throw new DOMException('QuotaExceededError');
      escrituras++;
      datos.set(k, v);
    },
  };
  return { storage, datos, get escrituras() { return escrituras; } };
}

const NOW = Date.UTC(2026, 9, 28, 12);
const CANCION = MOCK_SONGS.find((s) => s.id === 'huracan-hakuna')!;

function preparado() {
  const almacen = memoria();
  const repo = createLocalSetlistRepository(almacen.storage, GUEST_SETLISTS);
  const setlist = addSongsToSetlist(createSetlist({ name: 'Domingo' }, { now: NOW }), [{ id: CANCION.id }], { now: NOW });
  repo.save([setlist]);
  return { almacen, repo, setlist, item: setlist.items[0] };
}

// --- El almacén -------------------------------------------------------------

describe('El borrador se guarda aparte, sin tocar el Setlist', () => {
  it('se escribe, se lee y no cambia el Setlist guardado', () => {
    const { almacen, repo, setlist, item } = preparado();
    const store = createSetlistDraftStore(almacen.storage);
    eq(store.write({ setlistId: setlist.id, itemId: item.id, changes: cambios({ notes: 'Entrada suave' }, item), base: itemFingerprint(item), savedAt: NOW }), true);
    eq(store.read(setlist.id, item.id)?.changes.notes, 'Entrada suave');
    eq(repo.load().setlists[0].items[0].notes, item.notes, 'el Setlist no se tocó');
  });

  it('descartar uno no toca los demás', () => {
    const { almacen, setlist, item } = preparado();
    const store = createSetlistDraftStore(almacen.storage);
    const otro: SetlistItem = { ...item, id: 'otro-item' };
    store.write({ setlistId: setlist.id, itemId: item.id, changes: cambios({ notes: 'uno' }, item), base: itemFingerprint(item), savedAt: NOW });
    store.write({ setlistId: setlist.id, itemId: otro.id, changes: cambios({ notes: 'dos' }, otro), base: itemFingerprint(otro), savedAt: NOW });
    eq(store.discard(setlist.id, item.id), true);
    eq(store.read(setlist.id, item.id), null);
    eq(store.read(setlist.id, otro.id)?.changes.notes, 'dos', 'el del otro sigue ahí');
  });

  it('si el navegador no deja escribir, lo dice en vez de fingir', () => {
    const almacen = memoria({ falla: true });
    const store = createSetlistDraftStore(almacen.storage);
    const { setlist, item } = preparado();
    eq(store.write({ setlistId: setlist.id, itemId: item.id, changes: cambios({ notes: 'x' }, item), base: itemFingerprint(item), savedAt: NOW }), false);
  });

  it('un borrador ilegible no rompe nada: se empieza de cero', () => {
    const almacen = memoria();
    almacen.storage.setItem('genesaret_setlist_item_drafts', '{esto no es json');
    eq(createSetlistDraftStore(almacen.storage).all(), []);
  });
});

// --- El borrador no se retira sin confirmar la escritura --------------------

describe('Guardar sólo retira el borrador si de verdad quedó escrito', () => {
  // Lo que estaba mal en la primera versión: se retiraba el borrador cuando
  // el Setlist ya tenía el cambio en memoria, y `repo.save` se tragaba los
  // fallos de localStorage. Con la cuota llena se perdía el trabajo igual,
  // que es justo lo que esto venía a evitar.
  it('el repositorio dice que sí cuando escribe', () => {
    const { almacen, setlist } = preparado();
    eq(createLocalSetlistRepository(almacen.storage, GUEST_SETLISTS).save([setlist]), true);
  });

  it('y dice que no cuando el navegador se niega', () => {
    const roto = memoria({ falla: true });
    const { setlist } = preparado();
    eq(createLocalSetlistRepository(roto.storage, GUEST_SETLISTS).save([setlist]), false);
  });

  it('sin almacenamiento dice que no, que es la verdad', () => {
    // En modo privado no se escribió nada, y el borrador tampoco podría
    // guardarse. Decir que sí haría que se retirara un borrador que no
    // existe, y el trabajo se perdería igual.
    const { setlist } = preparado();
    eq(createLocalSetlistRepository(null, GUEST_SETLISTS).save([setlist]), false);
  });

  it('la decisión de retirar el borrador cuelga de esa respuesta', () => {
    // La pantalla hace exactamente esto: `if (onUpdateItem(...)) discard(...)`.
    const { almacen, setlist, item } = preparado();
    const store = createSetlistDraftStore(almacen.storage);
    const borrador = { setlistId: setlist.id, itemId: item.id, changes: cambios({ notes: 'mío' }, item), base: itemFingerprint(item), savedAt: NOW };
    store.write(borrador);

    const roto = createLocalSetlistRepository(memoria({ falla: true }).storage, GUEST_SETLISTS);
    if (roto.save([setlist])) store.discard(setlist.id, item.id);
    eq(store.read(setlist.id, item.id)?.changes.notes, 'mío', 'la escritura falló: el borrador sigue');

    const bueno = createLocalSetlistRepository(almacen.storage, GUEST_SETLISTS);
    if (bueno.save([setlist])) store.discard(setlist.id, item.id);
    eq(store.read(setlist.id, item.id), null, 'la escritura funcionó: ya no hace falta');
  });
});

// --- Contra escrituras viejas ----------------------------------------------

describe('Un borrador no pisa lo que otro cambió mientras tanto', () => {
  // SetlistItem no guarda su propia fecha —sólo el Setlist entero tiene
  // updatedAt, que se mueve por cualquier canción—, así que se compara el
  // contenido: más fiable que un reloj, y sin tocar el modelo.
  it('si el ítem sigue igual, el borrador es recuperable', () => {
    const { item } = preparado();
    const draft = { setlistId: 's', itemId: item.id, changes: cambios({ notes: 'mío' }, item), base: itemFingerprint(item), savedAt: NOW };
    eq(draftStatus(draft, item), 'recuperable');
  });

  it('si alguien lo cambió por otro camino, queda en conflicto', () => {
    const { setlist, item } = preparado();
    const draft = { setlistId: setlist.id, itemId: item.id, changes: cambios({ notes: 'mío' }, item), base: itemFingerprint(item), savedAt: NOW };
    const cambiadoFuera = updateSetlistItem(setlist, item.id, { transposeSteps: 5 }, NOW + 1000).items[0];
    eq(draftStatus(draft, cambiadoFuera), 'en-conflicto');
  });

  it('un borrador que ya no cambia nada no es un cambio pendiente', () => {
    const { item } = preparado();
    const draft = { setlistId: 's', itemId: item.id, changes: cambios({}, item), base: itemFingerprint(item), savedAt: NOW };
    eq(draftStatus(draft, item), 'ninguno');
  });
});

// --- El editor de verdad ----------------------------------------------------

type Props = Record<string, unknown>;
const nodos = (node: React.ReactNode): React.ReactElement<Props>[] => {
  if (!isValidElement<Props>(node)) return [];
  // El contenido de un Dialog no está sólo en children: el pie, el título y la
  // descripción son props con elementos dentro, y ahí viven los botones.
  const dentro = ['children', 'footer', 'title', 'description'].flatMap((clave) =>
    React.Children.toArray(node.props[clave] as React.ReactNode).flatMap(nodos)
  );
  return [node, ...dentro];
};

/** Monta el editor de verdad y devuelve con qué trastear. */
function editor(opciones: { store?: SetlistDraftStore; item?: SetlistItem; savedDraft?: ReturnType<SetlistDraftStore['read']>; mismo?: { setlist: ReturnType<typeof preparado>['setlist']; almacen: ReturnType<typeof memoria> } } = {}) {
  const { setlist, item: original, almacen } = opciones.mismo
    ? { setlist: opciones.mismo.setlist, item: opciones.mismo.setlist.items[0], almacen: opciones.mismo.almacen }
    : preparado();
  const item = opciones.item ?? original;
  const store = opciones.store ?? createSetlistDraftStore(almacen.storage);
  const cerrado: string[] = [];
  const guardado: unknown[] = [];
  const run = runHook(() => {
    // El arnés no trae contexto ni ids estables: se los damos, como hacen las
    // otras pruebas de componentes de este proyecto.
    const internals = (React as unknown as {
      __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: { H: Record<string, unknown> };
    }).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    internals.H.useId = () => 'editor-test';
    internals.H.useContext = () => ({ membersById: new Map(), keyPreferences: [], members: [], loading: false });
    return SetlistItemEditor({
      song: CANCION,
      item,
      nextSongTitle: null,
      setlistId: setlist.id,
      draftStore: store,
      savedDraft: opciones.savedDraft ?? store.read(setlist.id, item.id),
      now: () => NOW,
      onSave: (c) => guardado.push(c),
      onClose: () => cerrado.push('cerrado'),
    }) as React.ReactElement;
  });
  const porId = (sufijo: string) => nodos(run.current).find((e) => typeof e.props.id === 'string' && (e.props.id as string).endsWith(sufijo));
  const boton = (texto: string) => nodos(run.current).find((e) => e.type === 'button' && e.props.children === texto);
  /** El estado que muestra el indicador, o null si no se muestra. */
  const indicador = () => {
    const n = nodos(run.current).find((e) => typeof e.props.state === 'string' && 'persistente' in e.props);
    return n ? { estado: n.props.state as string, persistente: n.props.persistente as boolean } : null;
  };
  const textos = () =>
    nodos(run.current).flatMap((e) =>
      ['children', 'description'].flatMap((clave) => (typeof e.props[clave] === 'string' ? [e.props[clave] as string] : []))
    );
  /** El diálogo del editor: el primero, el de confirmación es el segundo. */
  const dialogo = (cual = 0) => nodos(run.current).filter((e) => typeof e.props.onClose === 'function')[cual];
  const cerrar = () => {
    (dialogo()!.props.onClose as () => void)();
    run.flush();
  };
  return { run, store, setlist, item, cerrado, guardado, porId, boton, textos, indicador, dialogo, cerrar, almacen };
}

describe('Editar protege el trabajo en el acto', () => {
  it('escribir una nota deja el borrador guardado, sin esperas', () => {
    const e = editor();
    eq(e.store.read(e.setlist.id, e.item.id), null, 'al abrir no hay nada');
    const notas = e.porId('notes') ?? nodos(e.run.current).find((n) => n.type === 'textarea');
    assert.ok(notas, 'encontré el campo de notas');
    checks++;
    (notas.props.onChange as (ev: unknown) => void)({ target: { value: 'Entrada suave' } });
    e.run.flush();
    eq(e.store.read(e.setlist.id, e.item.id)?.changes.notes, 'Entrada suave', 'ya está guardado');
  });

  it('cambios rápidos seguidos: se conserva el último', () => {
    const e = editor();
    const notas = nodos(e.run.current).find((n) => n.type === 'textarea')!;
    for (const valor of ['a', 'ab', 'abc']) {
      (notas.props.onChange as (ev: unknown) => void)({ target: { value: valor } });
      e.run.flush();
    }
    eq(e.store.read(e.setlist.id, e.item.id)?.changes.notes, 'abc');
  });

  it('deshacer a mano lo que se escribió deja de haber borrador', () => {
    const e = editor();
    const notas = nodos(e.run.current).find((n) => n.type === 'textarea')!;
    const escribir = (v: string) => { (notas.props.onChange as (ev: unknown) => void)({ target: { value: v } }); e.run.flush(); };
    escribir('algo');
    eq(Boolean(e.store.read(e.setlist.id, e.item.id)), true);
    escribir(e.item.notes);
    eq(e.store.read(e.setlist.id, e.item.id), null, 'volver atrás no deja nada pendiente');
  });

  it('el indicador dice «Borrador protegido», no «Guardado»', () => {
    // Mientras el diálogo está abierto el Setlist no ha cambiado: decir
    // «Guardado» sería mentira.
    const e = editor();
    eq(e.indicador()?.estado, 'limpio', 'sin cambios no dice nada');
    const notas = nodos(e.run.current).find((n) => n.type === 'textarea')!;
    (notas.props.onChange as (ev: unknown) => void)({ target: { value: 'algo' } });
    e.run.flush();
    eq(e.indicador(), { estado: 'protegido', persistente: true });
  });

  it('si el almacenamiento falla, lo dice y no promete recuperación', () => {
    const almacen = memoria({ falla: true });
    const e = editor({ store: createSetlistDraftStore(almacen.storage) });
    const notas = nodos(e.run.current).find((n) => n.type === 'textarea')!;
    (notas.props.onChange as (ev: unknown) => void)({ target: { value: 'algo' } });
    e.run.flush();
    eq(e.indicador(), { estado: 'error', persistente: false }, 'el indicador avisa del fallo');
  });
});

describe('Ningún cierre descarta en silencio', () => {
  it('sin cambios, cerrar cierra: no se avisa por nada', () => {
    const e = editor();
    e.cerrar();
    eq(e.cerrado, ['cerrado']);
    eq(e.textos().includes('Tienes cambios sin guardar'), false);
  });

  it('con cambios, la X, Escape y el toque fuera preguntan', () => {
    // Las tres vías pasan por el mismo onClose del Dialog, así que proteger
    // ése las cubre todas.
    const e = editor();
    const notas = nodos(e.run.current).find((n) => n.type === 'textarea')!;
    (notas.props.onChange as (ev: unknown) => void)({ target: { value: 'algo' } });
    e.run.flush();
    e.cerrar();
    eq(e.cerrado, [], 'no cerró');
    eq(nodos(e.run.current).some((n) => n.props.title === 'Tienes cambios sin guardar'), true);
  });

  it('y ofrece Guardar, Seguir editando y Descartar', () => {
    const e = editor();
    const notas = nodos(e.run.current).find((n) => n.type === 'textarea')!;
    (notas.props.onChange as (ev: unknown) => void)({ target: { value: 'algo' } });
    e.run.flush();
    e.cerrar();
    for (const etiqueta of ['Guardar', 'Seguir editando', 'Descartar']) {
      eq(Boolean(e.boton(etiqueta)), true, etiqueta);
    }
  });

  it('Seguir editando no cierra ni toca el borrador', () => {
    const e = editor();
    const notas = nodos(e.run.current).find((n) => n.type === 'textarea')!;
    (notas.props.onChange as (ev: unknown) => void)({ target: { value: 'algo' } });
    e.run.flush();
    e.cerrar();
    (e.boton('Seguir editando')!.props.onClick as () => void)();
    e.run.flush();
    eq(e.cerrado, []);
    eq(e.store.read(e.setlist.id, e.item.id)?.changes.notes, 'algo');
  });

  it('Descartar es la única forma de perder el borrador, y es explícita', () => {
    const e = editor();
    const notas = nodos(e.run.current).find((n) => n.type === 'textarea')!;
    (notas.props.onChange as (ev: unknown) => void)({ target: { value: 'algo' } });
    e.run.flush();
    e.cerrar();
    (e.boton('Descartar')!.props.onClick as () => void)();
    e.run.flush();
    eq(e.store.read(e.setlist.id, e.item.id), null, 'borrado');
    eq(e.cerrado, ['cerrado']);
  });

  it('Cancelar con cambios no borra nada por su cuenta: pregunta', () => {
    // Lo que más fácil sería estropear: que Cancelar se llevara por delante
    // un borrador recuperable sin que nadie lo decidiera.
    const e = editor();
    const notas = nodos(e.run.current).find((n) => n.type === 'textarea')!;
    (notas.props.onChange as (ev: unknown) => void)({ target: { value: 'algo' } });
    e.run.flush();
    const cancelar = e.boton('Cancelar')!;
    (cancelar.props.onClick as () => void)();
    e.run.flush();
    eq(e.cerrado, [], 'no cerró');
    eq(e.store.read(e.setlist.id, e.item.id)?.changes.notes, 'algo', 'el borrador sigue');
  });
});

describe('Al volver, el trabajo está donde se dejó', () => {
  it('recargar y reabrir la misma canción ofrece lo editado', () => {
    // La prueba que antes decía lo contrario.
    const base = preparado();
    const primera = editor({ mismo: { setlist: base.setlist, almacen: base.almacen }, store: createSetlistDraftStore(base.almacen.storage) });
    const notas = nodos(primera.run.current).find((n) => n.type === 'textarea')!;
    (notas.props.onChange as (ev: unknown) => void)({ target: { value: 'Entrada suave' } });
    primera.run.flush();
    primera.run.unmount(); // se cerró la pestaña

    // Otra visita, otro almacén en memoria sobre el mismo localStorage.
    const segunda = editor({ mismo: { setlist: base.setlist, almacen: base.almacen }, store: createSetlistDraftStore(base.almacen.storage) });
    const notasAhora = nodos(segunda.run.current).find((n) => n.type === 'textarea')!;
    eq(notasAhora.props.value, 'Entrada suave', 'el campo arranca con lo que se escribió');
    eq(segunda.indicador()?.estado, 'protegido');
  });

  it('un borrador en conflicto no se aplica solo', () => {
    const { setlist, item, almacen } = preparado();
    const store = createSetlistDraftStore(almacen.storage);
    // Se editó partiendo de otro estado del ítem.
    store.write({ setlistId: setlist.id, itemId: item.id, changes: cambios({ notes: 'mío' }, item), base: 'otra-huella-cualquiera', savedAt: NOW });
    const e = editor({ store, item });
    const notas = nodos(e.run.current).find((n) => n.type === 'textarea')!;
    eq(notas.props.value, item.notes, 'arranca de lo guardado, no del borrador');
  });

  it('un Setlist de siempre, sin borradores, se abre igual que antes', () => {
    const e = editor();
    const notas = nodos(e.run.current).find((n) => n.type === 'textarea')!;
    eq(notas.props.value, e.item.notes);
    eq(e.indicador()?.estado, 'limpio');
  });
});

/** Los cambios tal como los guarda el borrador, partiendo del ítem. */
function cambios(parche: Partial<{ moment: string; notes: string; transposeSteps: number; capoFret: number }>, item: SetlistItem) {
  return {
    moment: parche.moment ?? item.moment,
    notes: parche.notes ?? item.notes,
    transposeSteps: parche.transposeSteps ?? item.transposeSteps,
    capoFret: parche.capoFret ?? item.capoFret,
    arrangement: item.arrangement ?? null,
    transitionToNext: item.transitionToNext,
    newParticipantIds: [],
  };
}
