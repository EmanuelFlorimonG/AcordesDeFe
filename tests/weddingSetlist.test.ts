import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React, { type ReactElement, type ReactNode } from 'react';
import {
  WEDDING_MOMENTS, WEDDING_NO_MASS_MOMENTS, MASS_MOMENTS, ADORATION_MOMENTS, ROSARY_MOMENTS, BACKUP_MOMENT,
  createSetlist, updateSetlistDetails, duplicateSetlist, copySharedSetlist, addSongsToSetlist,
  updateSetlistItem, moveSetlistItem, groupSetlistItems, isBackupItem, sameRun, getFirstRunItem,
  getSetlistRunPosition, summarizeSetlistDuration,
  addSetlistSection, renameSetlistSection, moveSetlistSection, removeSetlistSection, setSetlistSections,
  sectionsOf, countSectionItems, cleanSections, backupMomentOf, MAX_SECTIONS, MAX_MOMENT_LENGTH,
  momentsFor, suggestedMoments, liveModeName, hasSections, isWeddingKind,
} from '../src/utils/setlists';
import { createLocalSetlistRepository, sanitizeSetlist, SETLIST_STORAGE_KEY } from '../src/storage/setlistStorage';
import { cloudToSetlist, setlistToCloud } from '../src/storage/cloudSetlists';
import { portableFingerprint, reconcileSetlist } from '../src/storage/setlistSync';
import { readSharedSetlist } from '../src/storage/setlistShares';
import { createSupabaseClient } from '../src/lib/supabase';
import { buildSetlistDocument } from '../src/utils/setlistExport';
import { listMassStops } from '../src/utils/massMode';
import { SetlistFormDialog } from '../src/components/Setlists/SetlistFormDialog';
import { AddSongsDialog } from '../src/components/Setlists/AddSongsDialog';
import { SetlistSectionsDialog } from '../src/components/Setlists/SetlistSectionsDialog';
import { runHook } from './hookHarness';
import type { Setlist, SetlistDetails, SetlistKind } from '../src/types/setlist';
import type { Song } from '../src/types/song';

const now = Date.UTC(2026, 10, 17, 10);
let nextId = 0;
const options = () => ({ now, createId: () => `boda-${++nextId}` });
const create = (kind: SetlistKind = 'boda') => createSetlist({ name: 'Boda de María y José', kind }, options());
const song: Song = { id: 'song', title: 'Canción', originalKey: 'G', categories: [], tags: [], content: '[Coro]\n[G]Una letra', chordsUsed: ['G'] };
const otra: Song = { ...song, id: 'otra', title: 'Otra canción' };
const add = (s: Setlist, moment: string, which: Song = song) =>
  addSongsToSetlist(s, [which], { ...options(), moment });
const cloud = (s: Setlist) => ({ ...setlistToCloud(s, 2), deleted_at: null, updated_at: new Date(now).toISOString() });

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}

describe('Boda: la plantilla que se pidió', () => {
  it('trae las trece secciones en el orden exacto, con la reserva al final', () => {
    const esperado = [
      'Entrada', 'Piedad', 'Gloria', 'Evangelio', 'Votos', 'Ofertorio', 'Santo', 'Cordero',
      'Comunión', 'Firmadera', 'Ofrecer el ramo a la Virgen', 'Salida', 'Backup',
    ];
    assert.deepEqual(momentsFor('boda'), esperado);
    assert.deepEqual(WEDDING_MOMENTS, esperado.slice(0, -1));
    assert.equal(esperado.at(-1), BACKUP_MOMENT);
    // Y eso es lo que se ve al crearla, con todas las secciones vacías.
    const grupos = groupSetlistItems(create());
    assert.deepEqual(grupos.map((g) => g.moment), esperado);
    assert.ok(grupos.every((g) => g.items.length === 0));
    assert.deepEqual(sectionsOf(create()), esperado);
    assert.deepEqual(suggestedMoments('boda'), esperado);
  });

  it('sin misa quita exactamente las partes eucarísticas, y no inventa ninguna', () => {
    assert.deepEqual(momentsFor('boda-sin-misa'), [
      'Entrada', 'Evangelio', 'Votos', 'Firmadera', 'Ofrecer el ramo a la Virgen', 'Salida', BACKUP_MOMENT,
    ]);
    const quitadas = WEDDING_MOMENTS.filter((name) => !WEDDING_NO_MASS_MOMENTS.includes(name));
    assert.deepEqual(quitadas, ['Piedad', 'Gloria', 'Ofertorio', 'Santo', 'Cordero', 'Comunión']);
    // Nada nuevo: las que quedan son un subconjunto de las de la boda con misa.
    assert.ok(WEDDING_NO_MASS_MOMENTS.every((name) => WEDDING_MOMENTS.includes(name)));
  });

  it('se crea, se edita, se duplica y se llama Modo Boda en vivo', () => {
    for (const kind of ['boda', 'boda-sin-misa'] as const) {
      const s = create(kind);
      assert.equal(s.kind, kind);
      assert.equal(s.moments, undefined, 'sin tocar nada no guarda secciones propias');
      assert.ok(isWeddingKind(kind));
      assert.ok(hasSections(kind));
      assert.equal(liveModeName(kind), 'Modo Boda');
      // El tipo no se edita desde el formulario de nombre y fecha.
      const editada = updateSetlistDetails(s, { name: 'Boda de Ana', date: '2026-12-05', kind: 'misa' }, now + 1);
      assert.equal(editada.kind, kind);
      assert.equal(editada.name, 'Boda de Ana');
      assert.equal(duplicateSetlist(editada, {}, options()).kind, kind);
    }
  });

  it('las canciones se guardan en su sección y se leen en el orden de la celebración', () => {
    let s = add(add(add(create(), 'Salida'), 'Entrada'), 'Comunión', otra);
    assert.deepEqual(s.items.map((i) => i.moment), ['Entrada', 'Comunión', 'Salida']);
    assert.equal(countSectionItems(s, 'Entrada'), 1);
    // Cambiar de sección recoloca, sin tocar la canción del cancionero.
    s = updateSetlistItem(s, s.items[0].id, { moment: 'Votos', transposeSteps: 2, notes: 'Piano solo' }, now + 1);
    assert.deepEqual(s.items.map((i) => i.moment), ['Votos', 'Comunión', 'Salida']);
    assert.equal(s.items[0].transposeSteps, 2);
    assert.equal(s.items[0].notes, 'Piano solo');
    assert.equal(song.categories.length, 0, 'el cancionero no se toca');
    // Y dentro de una sección el orden es el que se elija a mano.
    let dos = add(add(create(), 'Entrada'), 'Entrada', otra);
    const [primera] = dos.items;
    dos = moveSetlistItem(dos, primera.id, 1, now + 2);
    assert.deepEqual(dos.items.map((i) => i.songId), ['otra', 'song']);
  });

  it('la reserva está al final, no se canta sola y no suma a la duración', () => {
    const s = add(add(create(), BACKUP_MOMENT, otra), 'Entrada');
    assert.deepEqual(s.items.map((i) => i.moment), ['Entrada', BACKUP_MOMENT]);
    const reserva = s.items[1];
    assert.ok(isBackupItem(reserva));
    // El recorrido de la celebración no entra en ella…
    assert.equal(getFirstRunItem(s)?.moment, 'Entrada');
    assert.equal(getSetlistRunPosition(s, s.items[0].id)?.total, 1);
    // …y abrirla es un recorrido de una sola canción, que no lleva a ninguna otra.
    const sola = getSetlistRunPosition(s, reserva.id);
    assert.equal(sola?.total, 1);
    assert.equal(sola?.next, null);
    assert.equal(sola?.previous, null);
    assert.ok(sameRun(reserva)(reserva));
    assert.equal(sameRun(reserva)(s.items[0]), false);
    assert.equal(summarizeSetlistDuration(s, { song: 180, otra: 240 }).knownSeconds, 180);
  });
});

describe('Boda: las secciones son de cada boda', () => {
  it('renombrar arrastra las canciones de esa sección y deja de seguir la plantilla', () => {
    const conCanciones = add(create(), 'Firmadera');
    const s = renameSetlistSection(conCanciones, 'Firmadera', 'Firma de los novios', now + 1);
    assert.ok(s.moments, 'a partir del primer cambio tiene las suyas');
    assert.equal(s.moments?.includes('Firmadera'), false);
    assert.deepEqual(s.items.map((i) => i.moment), ['Firma de los novios']);
    assert.deepEqual(sectionsOf(s).slice(9, 11), ['Firma de los novios', 'Ofrecer el ramo a la Virgen']);
    assert.equal(s.updatedAt, now + 1);
    // Renombrar a una que ya existe uniría dos secciones sin decirlo: no se hace.
    assert.equal(renameSetlistSection(s, 'Entrada', 'Salida', now + 2), s);
    assert.equal(renameSetlistSection(s, 'No existe', 'Otra', now + 2), s);
    assert.equal(renameSetlistSection(s, 'Entrada', '   ', now + 2), s);
  });

  it('mover, añadir y quitar, con las canciones dentro', () => {
    let s = moveSetlistSection(create(), 'Backup', -1, now + 1);
    assert.deepEqual(sectionsOf(s).slice(-2), [BACKUP_MOMENT, 'Salida']);
    s = moveSetlistSection(s, BACKUP_MOMENT, 1, now + 2);
    assert.deepEqual(sectionsOf(s).at(-1), BACKUP_MOMENT);
    // Fuera de la lista no se mueve nada.
    assert.equal(moveSetlistSection(s, 'Entrada', -1, now + 3), s);
    assert.equal(moveSetlistSection(s, 'No existe', 1, now + 3), s);

    s = addSetlistSection(s, 'Bendición de las arras', now + 4);
    assert.equal(sectionsOf(s).at(-1), 'Bendición de las arras');
    assert.equal(addSetlistSection(s, 'Bendición de las arras', now + 5), s, 'una que ya está no se repite');
    assert.equal(addSetlistSection(s, '  ', now + 5), s);

    // Quitar una sección con canciones conserva las canciones, sin sección.
    const conCancion = add(s, 'Gloria');
    const sinGloria = removeSetlistSection(conCancion, 'Gloria', now + 6);
    assert.equal(sinGloria.moments?.includes('Gloria'), false);
    assert.equal(sinGloria.items.length, 1);
    assert.equal(sinGloria.items[0].moment, '');
    assert.equal(sinGloria.items[0].songId, 'song');
    // Y siguen visibles, agrupadas aparte.
    assert.equal(groupSetlistItems(sinGloria).at(-1)?.moment, '');
    // Una sección vacía se queda vacía sin problema, y la última no se quita.
    const una = setSetlistSections(create(), ['Entrada'], now + 7);
    assert.equal(removeSetlistSection(una, 'Entrada', now + 8), una);
    assert.throws(() => setSetlistSections(create(), ['  '], now + 9));
  });

  it('las secciones se limpian: sin huecos, sin repetidas y con un tope', () => {
    assert.deepEqual(cleanSections(['  Entrada  ', '', 'Entrada', 'Votos', 42, null]), ['Entrada', 'Votos']);
    assert.deepEqual(cleanSections('no es una lista'), []);
    assert.equal(cleanSections(Array.from({ length: 60 }, (_, i) => `S${i}`)).length, MAX_SECTIONS);
    assert.equal(cleanSections(['x'.repeat(200)])[0].length, MAX_MOMENT_LENGTH);
  });

  it('una sección renombrada se ofrece al añadir canciones y al editarlas', () => {
    const s = renameSetlistSection(create(), 'Firmadera', 'Firma de los novios', now + 1);
    const run = runHook(() => AddSongsDialog({ songs: [song], setlist: s, initialMoment: 'Firma de los novios', onAdd() {}, onClose() {} }) as ReactElement);
    const select = elements(run.current).find((e) => e.props.label === 'Momento en la celebración');
    assert.ok(select);
    assert.equal(select.props.value, 'Firma de los novios');
    const values = (select.props.options as Array<{ value: string }>).map((o) => o.value);
    assert.ok(values.includes('Firma de los novios'));
    assert.equal(values.includes('Firmadera'), false);
    run.unmount();
  });
});

describe('Boda: lo que se guarda y lo que viaja', () => {
  it('sobrevive al almacenamiento local, a la nube y a un enlace compartido', async () => {
    const s = renameSetlistSection(add(create(), 'Votos'), 'Votos', 'Consentimiento', now + 1);
    const leido = sanitizeSetlist(s);
    assert.equal(leido?.kind, 'boda');
    assert.deepEqual(leido?.moments, s.moments);
    assert.deepEqual(leido?.items.map((i) => i.moment), ['Consentimiento']);

    const fila = setlistToCloud(s, 1);
    assert.equal(fila.kind, 'boda');
    assert.deepEqual(fila.moments, s.moments);
    const vuelta = cloudToSetlist(cloud(s));
    assert.equal(vuelta.state, 'setlist');
    if (vuelta.state !== 'setlist') throw Error('Fila ilegible');
    assert.deepEqual(vuelta.setlist, s);

    const client = createSupabaseClient({ url: 'https://example.supabase.co', anonKey: 'public-test-key' }, async () =>
      new Response(JSON.stringify([{ ...cloud(s), shared_at: new Date(now).toISOString() }]), { status: 200 })
    );
    const enlace = await readSharedSetlist(client, 'a'.repeat(32));
    assert.equal(enlace.state, 'setlist');
    if (enlace.state !== 'setlist') throw Error('Enlace ilegible');
    assert.equal(enlace.setlist.kind, 'boda');
    const copia = copySharedSetlist(enlace.setlist, options());
    assert.deepEqual(copia.moments, s.moments);
    assert.deepEqual(copia.items.map((i) => i.moment), ['Consentimiento']);
    assert.equal(liveModeName(copia.kind), 'Modo Boda');

    // Y la hoja para imprimir sale con las secciones de esta boda.
    const doc = buildSetlistDocument(enlace.setlist, new Map([[song.id, song]]));
    assert.deepEqual(doc.moments.map((g) => g.moment), ['CONSENTIMIENTO']);
  });

  it('cambiar una sección cuenta como un cambio que hay que subir', () => {
    const s = add(create(), 'Entrada');
    const base = { setlistId: s.id, cloudRevision: 2, fingerprint: portableFingerprint(s) };
    const remote = cloudToSetlist(cloud(s));
    assert.equal(reconcileSetlist({ local: s, remote, base }).kind, 'noop');
    const movida = moveSetlistSection(s, 'Gloria', -1, now + 1);
    assert.notEqual(portableFingerprint(movida), portableFingerprint(s));
    assert.equal(reconcileSetlist({ local: movida, remote, base }).kind, 'upload-changes');
  });

  it('lee secciones guardadas a mano y descarta lo que no son secciones', () => {
    const s = create();
    const leido = sanitizeSetlist({ ...s, moments: ['  Entrada ', 'Entrada', '', 7, 'Salida'] });
    assert.deepEqual(leido?.moments, ['Entrada', 'Salida']);
    assert.equal(sanitizeSetlist({ ...s, moments: 'no es una lista' })?.moments, undefined);
    assert.equal(sanitizeSetlist({ ...s, moments: [] })?.moments, undefined);
    assert.equal(sanitizeSetlist({ ...s, kind: 'boda-sin-misa' })?.kind, 'boda-sin-misa');
    assert.equal(sanitizeSetlist({ ...s, kind: 'boda-con-cena' })?.kind, undefined);
  });
});

describe('Boda: lo que ya existía sigue igual', () => {
  it('misa, adoración y rosario conservan momentos, orden manual, huella y carga', () => {
    assert.deepEqual(momentsFor(undefined), [...MASS_MOMENTS, BACKUP_MOMENT]);
    assert.deepEqual(momentsFor('adoracion'), [...ADORATION_MOMENTS, BACKUP_MOMENT]);
    assert.deepEqual(momentsFor('rosario-aurora'), ROSARY_MOMENTS);
    assert.equal(hasSections('misa'), false);
    assert.equal(hasSections('adoracion'), false);
    assert.ok(hasSections('rosario-aurora'));

    for (const kind of [undefined, 'misa', 'adoracion'] as const) {
      let s = createSetlist({ name: 'Anterior', kind }, options());
      s = add(add(s, 'Salida'), 'Entrada');
      // Una misa no reordena: el orden es el que alguien puso.
      assert.deepEqual(s.items.map((i) => i.moment), ['Salida', 'Entrada']);
      assert.equal(s.moments, undefined);
      const fila = setlistToCloud(s, 1);
      assert.equal(fila.kind, kind === 'adoracion' ? kind : null);
      assert.equal(fila.moments, null, 'no manda nada nuevo a la nube');
      assert.equal(sanitizeSetlist(s)?.moments, undefined);
    }
  });

  it('la huella de un Setlist sin secciones propias es la de siempre', () => {
    const anterior = createSetlist({ name: 'Misa del domingo' }, options());
    const conCancion = add(anterior, 'Entrada');
    // Lo que se escribe no cambia por existir las secciones: sólo las añade
    // quien las tiene. Si esto cambiara, cada Setlist ya guardado aparecería
    // como modificado sin que nadie lo tocara.
    const { moments: _sin, ...resto } = { ...conCancion, moments: undefined };
    assert.equal(portableFingerprint(conCancion), portableFingerprint(resto as Setlist));
    assert.notEqual(
      portableFingerprint(conCancion),
      portableFingerprint({ ...conCancion, moments: ['Entrada'] })
    );
    // Y el tipo y las secciones no se confunden entre sí.
    assert.notEqual(
      portableFingerprint({ ...conCancion, kind: 'adoracion' }),
      portableFingerprint({ ...conCancion, moments: ['adoracion'] })
    );
  });
});

describe('Boda en los diálogos', () => {
  it('el formulario ofrece cuatro celebraciones y las dos modalidades de boda', () => {
    let submitted: SetlistDetails | undefined;
    const run = runHook(() => SetlistFormDialog({ mode: 'create', initialDetails: { name: 'Boda de María y José' }, onSubmit: (d) => { submitted = d; }, onClose() {} }) as ReactElement);
    let radios = elements(run.current).filter((e) => e.props.role === 'radio');
    assert.equal(radios.length, 4, 'misa, adoración, rosario y boda');
    // Sin elegir boda no hay modalidades que elegir.
    assert.equal(radios.filter((r) => r.props['aria-checked'] === true).length, 1);

    (radios[3].props.onClick as () => void)();
    run.flush();
    radios = elements(run.current).filter((e) => e.props.role === 'radio');
    assert.equal(radios.length, 6, 'las cuatro tarjetas y las dos modalidades');
    assert.equal(radios[3].props['aria-checked'], true, 'la tarjeta de Boda queda elegida');
    assert.equal(radios[4].props['aria-checked'], true, 'con misa, de entrada');
    assert.equal(radios[5].props['aria-checked'], false);

    (run.current.props as { onSubmit: () => void }).onSubmit();
    assert.equal(submitted?.kind, 'boda');

    // Y la otra modalidad se elige sin perder la tarjeta.
    (radios[5].props.onClick as () => void)();
    run.flush();
    radios = elements(run.current).filter((e) => e.props.role === 'radio');
    assert.equal(radios[3].props['aria-checked'], true);
    assert.equal(radios[5].props['aria-checked'], true);
    (run.current.props as { onSubmit: () => void }).onSubmit();
    assert.equal(submitted?.kind, 'boda-sin-misa');
    run.unmount();
  });

  it('la ventana de secciones enseña las trece, su contenido y la reserva', () => {
    const s = add(create(), 'Comunión');
    const hecho: string[] = [];
    const run = runHook(() => SetlistSectionsDialog({
      setlist: s,
      onAdd: (name) => hecho.push(`add:${name}`),
      onRename: (from, to) => hecho.push(`rename:${from}>${to}`),
      onMove: (name, delta) => hecho.push(`move:${name}:${delta}`),
      onRemove: (name) => hecho.push(`remove:${name}`),
      onClose() {},
    }) as ReactElement);

    const inputs = elements(run.current).filter((e) => typeof e.props['aria-label'] === 'string' && String(e.props['aria-label']).startsWith('Nombre de la sección'));
    assert.equal(inputs.length, 13);
    assert.deepEqual(inputs.map((e) => e.props.value), momentsFor('boda'));

    const subir = elements(run.current).filter((e) => String(e.props['aria-label'] ?? '').startsWith('Subir'));
    assert.equal(subir[0].props.disabled, true, 'la primera no sube');
    const bajar = elements(run.current).filter((e) => String(e.props['aria-label'] ?? '').startsWith('Bajar'));
    assert.equal(bajar.at(-1)?.props.disabled, true, 'la última no baja');

    (bajar[0].props.onClick as () => void)();
    assert.deepEqual(hecho, ['move:Entrada:1']);

    // Quitar pide confirmación y dice qué pasa con las canciones de dentro.
    const quitar = elements(run.current).filter((e) => String(e.props['aria-label'] ?? '').startsWith('Quitar'));
    assert.equal(quitar.length, 13);
    (quitar[8].props.onClick as () => void)();
    run.flush();
    const texto = JSON.stringify(elements(run.current).map((e) => e.props.children));
    assert.ok(texto.includes('¿Quitar «'), 'pregunta antes de quitar');
    assert.ok(texto.includes('sin sección'), 'dice dónde quedan las canciones');
    assert.equal(hecho.length, 1, 'y todavía no ha quitado nada');
    run.unmount();
  });
});

describe('Boda: la reserva es lo que es, se llame como se llame', () => {
  const conReserva = () => add(add(add(create(), 'Entrada'), 'Comunión', otra), BACKUP_MOMENT, otra);

  it('cada canción lleva escrito que es de reserva, no su sección', () => {
    const s = conReserva();
    const reserva = s.items.at(-1)!;
    assert.equal(reserva.backup, true);
    assert.equal(s.items[0].backup, undefined, 'y las demás no dicen nada');
    assert.equal(backupMomentOf(s), BACKUP_MOMENT);
  });

  it('renombrar la sección de reserva no mete sus canciones en la celebración', () => {
    const s = renameSetlistSection(conReserva(), BACKUP_MOMENT, 'Reserva del coro', now + 1);
    assert.equal(backupMomentOf(s), 'Reserva del coro');
    assert.equal(s.backupMoment, 'Reserva del coro');
    const reserva = s.items.find((i) => i.moment === 'Reserva del coro')!;
    assert.equal(reserva.backup, true);
    assert.ok(isBackupItem(reserva), 'sigue siendo reserva con otro nombre');
    // Recorrido, duración y numeración: las tres la dejan fuera.
    assert.equal(getSetlistRunPosition(s, s.items[0].id)?.total, 2);
    assert.equal(getSetlistRunPosition(s, reserva.id)?.total, 1);
    assert.equal(summarizeSetlistDuration(s, { song: 100, otra: 200 }).songCount, 2);
const paradas = listMassStops(s, () => true);
    assert.equal(paradas.find((p) => p.item.id === reserva.id)?.isBackup, true);
    assert.deepEqual(paradas.filter((p) => !p.isBackup).map((p) => p.position), [1, 2]);
    assert.deepEqual(paradas.filter((p) => p.isBackup).map((p) => p.position), [1], 'la reserva numera aparte');
    // Y lo que se añada a esa sección entra como reserva, aunque ya no se llame Backup.
    const conOtra = add(s, 'Reserva del coro');
    assert.equal(conOtra.items.filter((i) => i.backup === true).length, 2);
  });

  it('moverla tampoco, esté donde esté escrita', () => {
    const movida = moveSetlistSection(conReserva(), BACKUP_MOMENT, -6, now + 1);
    assert.equal(sectionsOf(movida).indexOf(BACKUP_MOMENT), 6);
    const reserva = movida.items.find((i) => isBackupItem(i))!;
    assert.equal(getFirstRunItem(movida)?.id, movida.items[0].id);
    assert.equal(getSetlistRunPosition(movida, reserva.id)?.total, 1);
    assert.equal(summarizeSetlistDuration(movida, {}).songCount, 2);
    // Renombrada Y movida, lo mismo.
    const ambas = moveSetlistSection(renameSetlistSection(conReserva(), BACKUP_MOMENT, 'Por si acaso', now + 1), 'Por si acaso', -3, now + 2);
    assert.equal(ambas.items.filter(isBackupItem).length, 1);
    assert.equal(summarizeSetlistDuration(ambas, {}).songCount, 2);
  });

  it('quitar la sección de reserva deja sus canciones, y siguen siendo reservas', () => {
    const s = removeSetlistSection(conReserva(), BACKUP_MOMENT, now + 1);
    const reserva = s.items.find((i) => i.backup === true);
    assert.ok(reserva, 'la canción sigue en el Setlist');
    assert.equal(reserva.moment, '', 'sin sección, y se ve agrupada aparte');
    assert.ok(isBackupItem(reserva));
    assert.equal(summarizeSetlistDuration(s, {}).songCount, 2, 'y sigue sin contar');
  });

  it('cambiar una canción de sección es lo único que la saca o la mete', () => {
    const s = conReserva();
    const reserva = s.items.at(-1)!;
    const alRecorrido = updateSetlistItem(s, reserva.id, { moment: 'Salida' }, now + 1);
    const ahora = alRecorrido.items.find((i) => i.id === reserva.id)!;
    assert.equal(ahora.backup, undefined);
    assert.equal(isBackupItem(ahora), false);
    assert.equal(summarizeSetlistDuration(alRecorrido, {}).songCount, 3);
    // Y al revés.
    const deVuelta = updateSetlistItem(alRecorrido, reserva.id, { moment: BACKUP_MOMENT }, now + 2);
    assert.equal(deVuelta.items.find((i) => i.id === reserva.id)?.backup, true);
  });

  it('lo guardado antes, sin marca, se sigue reconociendo por su sección', () => {
    const antiguo = sanitizeSetlist({
      id: 'antiguo', name: 'Misa de siempre', date: '', description: '', createdAt: now, updatedAt: now,
      items: [
        { id: 'a', songId: 'song', moment: 'Entrada', transposeSteps: 0, capoFret: 0, notes: '' },
        { id: 'b', songId: 'otra', moment: 'Backup', transposeSteps: 0, capoFret: 0, notes: '' },
      ],
    })!;
    assert.equal(antiguo.items[1].backup, undefined, 'no se le inventa una marca');
    assert.ok(isBackupItem(antiguo.items[1]));
    assert.equal(summarizeSetlistDuration(antiguo, {}).songCount, 1);
  });

  it('la reserva viaja: duplicado, copia de un enlace, nube, exportación', async () => {
    const s = renameSetlistSection(conReserva(), BACKUP_MOMENT, 'Reserva', now + 1);
    const copia = duplicateSetlist(s, {}, options());
    assert.equal(copia.backupMoment, 'Reserva');
    assert.equal(copia.items.filter(isBackupItem).length, 1);
    assert.equal(summarizeSetlistDuration(copia, {}).songCount, 2);

    const fila = setlistToCloud(s, 1);
    assert.equal(fila.backup_moment, 'Reserva');
    assert.equal(fila.items.filter((i) => i.backup === true).length, 1);
    const vuelta = cloudToSetlist(cloud(s));
    if (vuelta.state !== 'setlist') throw Error('Fila ilegible');
    assert.deepEqual(vuelta.setlist, s);

    const client = createSupabaseClient({ url: 'https://example.supabase.co', anonKey: 'public-test-key' }, async () =>
      new Response(JSON.stringify([{ ...cloud(s), shared_at: new Date(now).toISOString() }]), { status: 200 })
    );
    const enlace = await readSharedSetlist(client, 'a'.repeat(32));
    if (enlace.state !== 'setlist') throw Error('Enlace ilegible');
    assert.equal(enlace.setlist.backupMoment, 'Reserva');
    const deEnlace = copySharedSetlist(enlace.setlist, options());
    assert.equal(deEnlace.items.filter(isBackupItem).length, 1);
    assert.equal(summarizeSetlistDuration(deEnlace, {}).songCount, 2);

    const doc = buildSetlistDocument(s, new Map([[song.id, song], [otra.id, otra]]));
    assert.equal(doc.moments.some((g) => g.moment === 'RESERVA'), true);
    assert.equal(doc.entries.length, 3, 'la hoja las lleva todas, la reserva incluida');
  });
});

describe('Boda: lo preparado sobrevive', () => {
  it('secciones vacías, nombres, orden y canciones aguantan una recarga', () => {
    let s = add(renameSetlistSection(create(), 'Firmadera', 'Firma de los novios', now + 1), 'Firma de los novios');
    s = addSetlistSection(s, 'Bendición de las arras', now + 2);
    s = moveSetlistSection(s, 'Bendición de las arras', -8, now + 3);
    s = add(s, BACKUP_MOMENT, otra);

    const disco = new Map<string, string>();
    const almacen = { getItem: (k: string) => disco.get(k) ?? null, setItem: (k: string, v: string) => { disco.set(k, v); } };
    const repo = createLocalSetlistRepository(almacen);
    assert.equal(repo.save([s]), true);
    assert.ok(disco.get(SETLIST_STORAGE_KEY));

    const [leido] = createLocalSetlistRepository(almacen).load().setlists;
    assert.deepEqual(leido, s, 'vuelve exactamente lo que se guardó');
    assert.deepEqual(sectionsOf(leido), sectionsOf(s));
    assert.equal(sectionsOf(leido).indexOf('Bendición de las arras'), 5);
    assert.equal(countSectionItems(leido, 'Firma de los novios'), 1);
    assert.equal(countSectionItems(leido, 'Piedad'), 0, 'una sección vacía sigue ahí');
    assert.equal(leido.items.filter(isBackupItem).length, 1);

    // Y duplicar conserva lo mismo, con ids propios.
    const copia = duplicateSetlist(leido, { name: 'Boda de Ana' }, options());
    assert.deepEqual(sectionsOf(copia), sectionsOf(s));
    assert.deepEqual(copia.items.map((i) => i.moment), leido.items.map((i) => i.moment));
    assert.notEqual(copia.items[0].id, leido.items[0].id);
  });

  it('la huella de un Setlist anterior no se mueve ni un bit', () => {
    // Escrita a mano a propósito: si cambia, todos los Setlists ya guardados
    // aparecerían como modificados sin que nadie los tocara.
    const legado: Setlist = {
      id: 'misa-de-siempre',
      name: 'Misa del domingo',
      date: '2026-10-04',
      description: 'Coro juvenil',
      participantIds: ['m1'],
      items: [
        { id: 'i1', songId: 'entrada', moment: 'Entrada', transposeSteps: 0, capoFret: 0, notes: '' },
        { id: 'i2', songId: 'reserva', moment: 'Backup', transposeSteps: 2, capoFret: 1, notes: 'Por si acaso' },
      ],
      createdAt: 1759536000000,
      updatedAt: 1759536000000,
    };
    assert.equal(portableFingerprint(legado), '8096dd247fa55bb3');
    // Ni la marca de reserva ni la sección de reserva entran en la huella:
    // lo que cambia con ellas es `moments` y el momento de cada canción.
    assert.equal(
      portableFingerprint({ ...legado, items: legado.items.map((i) => (i.moment === 'Backup' ? { ...i, backup: true as const } : i)) }),
      portableFingerprint(legado)
    );
    assert.equal(portableFingerprint({ ...legado, backupMoment: 'Reserva' }), portableFingerprint(legado));
    assert.notEqual(portableFingerprint({ ...legado, moments: ['Entrada', 'Backup'] }), portableFingerprint(legado));
  });
});
