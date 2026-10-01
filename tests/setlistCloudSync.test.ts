import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { SetlistSyncOutcome } from '../src/storage/setlistSyncPass';
import type { SetlistSyncPlan } from '../src/storage/setlistSync';
import type { SetlistSyncExecutionResult } from '../src/storage/setlistSyncExecutor';
import { describePass, describeResolution, describeSync, tally } from '../src/hooks/useSetlistCloudSync';

/**
 * What somebody is told after asking to keep a setlist in step with their
 * account.
 *
 * The rule is that the sentence answers the question they asked — is my
 * setlist in my account, as it is here? — and says nothing about how any of
 * it works.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`setlistCloudSync.test: ${checks} comprobaciones`));

const NAME = 'Misa Domingo';
const plan: SetlistSyncPlan = { kind: 'upload-candidate', setlist: { id: 'setlist-1234' } as never };
const result = (kind: SetlistSyncExecutionResult['kind']) =>
  ({ kind, operation: 'create', setlistId: 'setlist-1234' }) as SetlistSyncExecutionResult;

const CHANGED_ELSEWHERE =
  '«Misa Domingo» también cambió en otro dispositivo. No se ha guardado nada para no perder ninguna de las dos versiones.';

describe('Lo que se le dice a quien pide guardar en su cuenta', () => {
  it('cuando queda guardado, según lo que pidió', () => {
    for (const local of ['written', 'skipped-stale', 'failed'] as const) {
      const outcome: SetlistSyncOutcome = { kind: 'cloud-success', plan, result: result('success'), local };
      // La fila es la correcta pase lo que pase con la nota de aquí.
      eq(describeSync(outcome, NAME, 'new').message, '«Misa Domingo» guardado en tu cuenta', local);
      eq(describeSync(outcome, NAME, 'changed').message, 'Cambios de «Misa Domingo» guardados en tu cuenta', local);
      eq(describeSync(outcome, NAME, 'new').ok, true);
    }
  });

  it('cuando ya estaba al día', () => {
    eq(describeSync({ kind: 'noop', plan }, NAME, 'changed'), {
      ok: true,
      message: '«Misa Domingo» ya estaba al día en tu cuenta',
    });
  });

  it('cuando alguien más lo cambió, no se pisa nada y se dice', () => {
    // Guardar cambios y encontrarse la fila movida: no se sobrescribe.
    eq(describeSync({ kind: 'cloud-conflict', plan }, NAME, 'changed'), { ok: false, message: CHANGED_ELSEWHERE });
    // Y cuando el reconciliador ya vio que cambiaron los dos lados.
    eq(describeSync({ kind: 'ask', plan }, NAME, 'changed'), { ok: false, message: CHANGED_ELSEWHERE });
    eq(describeSync({ kind: 'ask', plan }, NAME, 'new'), { ok: false, message: CHANGED_ELSEWHERE });
    // Una primera subida que se encuentra la fila puesta es otra cosa: el
    // final es el que se pedía.
    eq(describeSync({ kind: 'cloud-conflict', plan }, NAME, 'new'), {
      ok: true,
      message: '«Misa Domingo» ya estaba en tu cuenta',
    });
  });

  it('cuando la fila viene de una versión más nueva de la aplicación', () => {
    const answer = describeSync({ kind: 'blocked', plan }, NAME, 'changed');
    eq(answer.ok, false);
    eq(
      answer.message,
      'Este Setlist se guardó desde una versión más reciente de la aplicación. Actualízala para seguir.'
    );
  });

  it('cuando la sesión ya no vale o no se llegó a la nube', () => {
    eq(describeSync({ kind: 'cloud-auth-error', plan }, NAME, 'changed').message,
      'Tu sesión ha caducado. Vuelve a entrar e inténtalo otra vez.');
    eq(describeSync({ kind: 'cloud-request-error', plan, error: new Error('x') }, NAME, 'changed'), {
      ok: false,
      message: 'No se pudo conectar. Inténtalo otra vez.',
    });
  });

  it('cuando el setlist no cabe en la tabla, se dice qué parte', () => {
    const rejected = (problem: string): SetlistSyncOutcome => ({
      kind: 'cloud-rejected',
      plan,
      result: { kind: 'rejected', operation: 'update', setlistId: 'setlist-1234', problem } as never,
    });
    eq(describeSync(rejected('name'), NAME, 'changed').message, 'El nombre es demasiado largo para guardarlo en tu cuenta.');
    eq(
      describeSync(rejected('item-count'), NAME, 'changed').message,
      'Este Setlist tiene demasiadas canciones para guardarlo en tu cuenta.'
    );
    eq(describeSync(rejected('payload-size'), NAME, 'changed').ok, false);
  });

  it('y cualquier otra cosa no se cuenta como un éxito', () => {
    const otros: SetlistSyncOutcome[] = [
      { kind: 'pending-user-action', plan },
      { kind: 'applied-local', plan },
      { kind: 'skipped-stale', plan, what: 'base' },
      { kind: 'local-error', plan, error: new Error('x') },
      { kind: 'invalid-plan', plan, result: result('invalid-plan') },
      { kind: 'invalid-response', plan, result: result('invalid-response') },
    ];
    for (const outcome of otros) {
      for (const intent of ['new', 'changed'] as const) {
        const answer = describeSync(outcome, NAME, intent);
        eq(answer.ok, false, `${outcome.kind}/${intent}`);
        eq(answer.message, 'No se pudo guardar. Inténtalo otra vez.', `${outcome.kind}/${intent}`);
      }
    }
    eq(describeSync(undefined, NAME, 'changed').ok, false, 'sin plan para ese id');
  });

  it('nunca se le enseña a nadie cómo funciona esto por dentro', () => {
    const todos: SetlistSyncOutcome[] = [
      { kind: 'cloud-success', plan, result: result('success'), local: 'written' },
      { kind: 'noop', plan },
      { kind: 'cloud-conflict', plan },
      { kind: 'ask', plan },
      { kind: 'blocked', plan },
      { kind: 'cloud-auth-error', plan },
      { kind: 'cloud-request-error', plan, error: new SyntaxError('Bearer abc.def.ghi') },
      { kind: 'invalid-response', plan, result: result('invalid-response') },
    ];
    for (const outcome of todos) {
      for (const intent of ['new', 'changed'] as const) {
        const { message } = describeSync(outcome, NAME, intent);
        for (const interno of ['revision', 'fingerprint', 'huella', 'token', 'Bearer', 'payload', 'owner_id', 'RLS']) {
          eq(message.toLowerCase().includes(interno.toLowerCase()), false, `${outcome.kind}: ${interno}`);
        }
      }
    }
  });
});

describe('Lo que se dice de una sincronizacion entera', () => {
  const plans = {
    bajado: { kind: 'apply-remote', setlist: { id: 'a' }, base: {} } as unknown as SetlistSyncPlan,
    borrado: { kind: 'delete-local', setlistId: 'a', cloudRevision: 2 } as SetlistSyncPlan,
    acuerdo: { kind: 'adopt-baseline', base: {} } as unknown as SetlistSyncPlan,
    olvido: { kind: 'forget-baseline', setlistId: 'a' } as SetlistSyncPlan,
  };
  const applied = (plan: SetlistSyncPlan): SetlistSyncOutcome => ({ kind: 'applied-local', plan });

  it('cuenta lo que le importa a una persona, no las tareas internas', () => {
    const counts = tally([
      applied(plans.bajado),
      applied(plans.bajado),
      applied(plans.acuerdo),
      applied(plans.olvido),
      { kind: 'cloud-success', plan, result: result('success'), local: 'written' },
      { kind: 'ask', plan },
      { kind: 'cloud-conflict', plan },
      { kind: 'pending-user-action', plan },
      { kind: 'blocked', plan },
      { kind: 'cloud-request-error', plan, error: new Error('x') },
      { kind: 'noop', plan },
      { kind: 'skipped-stale', plan, what: 'base' },
    ]);
    // Apuntar un acuerdo u olvidar una referencia no es nada que contar.
    eq(counts, { recovered: 2, saved: 1, conflicts: 2, pending: 1, blocked: 1, failed: 1 });
    eq(tally([applied(plans.borrado)]).recovered, 1, 'un borrado que llega tambien se nota');
  });

  it('recuperar setlists se dice en singular y en plural', () => {
    eq(describePass(tally([applied(plans.bajado)])), { ok: true, message: '1 Setlist recuperado' });
    eq(describePass(tally([applied(plans.bajado), applied(plans.bajado), applied(plans.bajado)])), {
      ok: true,
      message: '3 Setlists recuperados',
    });
  });

  it('cuando no hay nada que hacer, lo dice sin ruido', () => {
    eq(describePass(tally([{ kind: 'noop', plan }])), { ok: true, message: 'Tus Setlists están al día' });
    eq(describePass(tally([])), { ok: true, message: 'Tus Setlists están al día' });
  });

  it('y recuerda los que siguen sin guardar, sin insistir', () => {
    eq(describePass(tally([{ kind: 'pending-user-action', plan }, { kind: 'noop', plan }])), {
      ok: true,
      message: 'Todo al día. 1 Setlist sigue sin guardar en tu cuenta.',
    });
    const conAmbos = describePass(tally([applied(plans.bajado), { kind: 'pending-user-action', plan }]));
    eq(conAmbos, { ok: true, message: '1 Setlist recuperado. 1 Setlist sigue sin guardar en tu cuenta' });
  });

  it('un conflicto manda sobre las buenas noticias, porque necesita a alguien', () => {
    const answer = describePass(tally([applied(plans.bajado), { kind: 'ask', plan }]));
    eq(answer.ok, false);
    eq(
      answer.message,
      '1 Setlist recuperado. 1 Setlist cambió aquí y en otro dispositivo: no se ha guardado nada de ésos para no perder ninguna de las dos versiones.'
    );
    // Y en plural.
    eq(describePass(tally([{ kind: 'ask', plan }, { kind: 'cloud-conflict', plan }])).message.startsWith('2 Setlists cambiaron'), true);
  });

  it('un fallo y una fila incompatible tambien se dicen', () => {
    eq(describePass(tally([{ kind: 'cloud-request-error', plan, error: new Error('x') }])).ok, false);
    const bloqueado = describePass(tally([{ kind: 'blocked', plan }]));
    eq(bloqueado.ok, false);
    eq(bloqueado.message.includes('versión más reciente'), true);
  });

  it('nunca se le ensena a nadie como funciona esto por dentro', () => {
    const todas: SetlistSyncOutcome[][] = [
      [applied(plans.bajado), { kind: 'ask', plan }],
      [{ kind: 'blocked', plan }],
      [{ kind: 'cloud-success', plan, result: result('success'), local: 'failed' }],
      [{ kind: 'pending-user-action', plan }],
      [{ kind: 'local-error', plan, error: new Error('Bearer abc') }],
    ];
    for (const outcomes of todas) {
      const { message } = describePass(tally(outcomes));
      for (const interno of ['revision', 'fingerprint', 'huella', 'token', 'Bearer', 'owner_id', 'apply-remote', 'upload', 'noop', 'ask']) {
        eq(message.toLowerCase().includes(interno.toLowerCase()), false, `${interno}: ${message}`);
      }
    }
  });
});

describe('Guardar en la cuenta es siempre una decisión de alguien', () => {
  const hook = readFileSync('src/hooks/useSetlistCloudSync.ts', 'utf8').replace(/\r\n/g, '\n');
  const code = hook.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
  const app = readFileSync('src/App.tsx', 'utf8').replace(/\r\n/g, '\n');
  const detail = readFileSync('src/components/Setlists/SetlistDetail.tsx', 'utf8').replace(/\r\n/g, '\n');

  it('nada lo dispara solo: ni un efecto, ni un temporizador', () => {
    for (const forbidden of ['useEffect', 'setTimeout', 'setInterval', 'requestIdleCallback']) {
      eq(code.includes(forbidden), false, forbidden);
    }
    eq(app.includes('onSyncToAccount={'), true, 'sale de pulsar algo');
    eq(/useEffect\([^)]*cloudSync\.sync/.test(app), false, 'ningún efecto sincroniza nada');
  });

  it('se nombra exactamente el setlist que se pidió, y ninguno más', () => {
    eq(code.includes('runPass([setlist.id])'), true);
    eq(/authorisedUploads:\s*\[[^\]]*,/.test(code), false, 'nunca una lista de varios');
  });

  it('una segunda pulsación mientras sincroniza no hace nada', () => {
    eq(code.includes('if (inFlight.current || busy || busyAll) return null;'), true);
    // `busy` y `busyAll` son estado de React y no se ven hasta el siguiente
    // render; el ref se lee en el momento, que es lo que hace falta cuando
    // una pulsación y una reconexión coinciden en el mismo tick.
    eq(detail.includes('disabled: syncingToAccount'), true, 'y el menú la deshabilita');
    eq(detail.includes("'Guardando los cambios…'"), true, 'diciendo que está en marcha');
  });

  it('se distinguen las tres situaciones de un setlist', () => {
    // Nuevo, con cambios, y al día: cada una con su oferta, o sin ninguna.
    eq(code.includes("return 'new'"), true);
    eq(code.includes("? 'synced' : 'changed'"), true);
    eq(code.includes("return 'guest'"), true);
    // Lo que decide si hay cambios es sólo lo que viaja: cambiar quién canta
    // no pide que se guarde nada.
    eq(code.includes('portableFingerprint(setlist) === agreedFingerprint'), true);
    // Y la pantalla sólo ofrece algo en dos de las cuatro situaciones, más la
    // quinta: dos versiones distintas, que no se ofrece guardar sino elegir.
    eq(
      app.includes("openSetlistCloudState === 'new' || openSetlistCloudState === 'changed'"),
      true,
      'sólo nuevo o con cambios'
    );
    eq(app.includes("? 'conflict'"), true, 'y un conflicto manda sobre las dos');
  });

  it('a un invitado no se le ofrece nada, y sus setlists no cambian', () => {
    eq(code.includes("scope.kind === 'user' ? scope.userId.trim() : ''"), true);
    eq(code.includes("if (!userId || !services) return 'guest';"), true);
  });

  it('todo pasa por el camino que ya existía, y en diferido', () => {
    eq(code.includes("await import('../storage/setlistSyncSession')"), true, 'la maquinaria no infla el bundle');
    eq(code.includes('services.auth.authenticated()'), true);
    eq(code.includes('capture.session.userId.trim() !== userId'), true, 'y para la cuenta en pantalla');
    // No hay una segunda forma de escribir un setlist en la nube.
    for (const forbidden of ['cloud.create', 'cloud.update', 'createCloudSetlistRepository', 'reconcileSetlists']) {
      eq(code.includes(forbidden), false, forbidden);
    }
  });
});

// --- Elegir entre dos versiones ------------------------------------------------------------------

describe('Cuando hay dos versiones y alguien tiene que elegir', () => {
  const plan = { kind: 'ask', setlistId: 'x', question: 'both-changed' } as unknown as SetlistSyncPlan;
  const subida = { kind: 'upload-changes' } as unknown as SetlistSyncPlan;

  it('conservar la de aquí sólo se celebra cuando algo llegó a la nube', () => {
    const guardado = describeResolution(
      { kind: 'cloud-success', plan: subida, result: result('success'), local: 'written' },
      'Misa',
      'local'
    );
    eq(guardado.ok, true);
    eq(guardado.message, '«Misa» de este dispositivo es ahora la versión de tu cuenta');
  });

  it('usar la de la cuenta se celebra cuando se aplicó aquí, sin hablar de subir nada', () => {
    const traido = describeResolution({ kind: 'applied-local', plan }, 'Misa', 'remote');
    eq(traido.ok, true);
    eq(traido.message, '«Misa» es ahora la versión de tu cuenta');
  });

  it('si la versión de la cuenta volvió a cambiar, se dice que no se guardó nada', () => {
    for (const keep of ['local', 'remote'] as const) {
      const movida = describeResolution({ kind: 'ask', plan }, 'Misa', keep);
      eq(movida.ok, false, keep);
      eq(movida.message.includes('No se ha guardado nada'), true, keep);
      eq(movida.message.includes('vuelve a compararlas'), true, keep);
    }
    // Y lo mismo cuando la fila se movió entre la lectura y la petición.
    const rechazada = describeResolution({ kind: 'cloud-conflict', plan: subida }, 'Misa', 'local');
    eq(rechazada.ok, false);
    eq(rechazada.message.includes('No se ha guardado nada'), true);
  });

  it('un dispositivo que no acepta la escritura no se cuenta como éxito', () => {
    const fallo = describeResolution({ kind: 'local-error', plan, error: new Error('quota') }, 'Misa', 'remote');
    eq(fallo.ok, false);
    eq(fallo.message.includes('este dispositivo'), true);
  });

  it('y si ya no hay dos versiones, se dice eso y no un falso guardado', () => {
    for (const keep of ['local', 'remote'] as const) {
      const yaNo = describeResolution({ kind: 'noop', plan }, 'Misa', keep);
      eq(yaNo.ok, true, keep);
      eq(yaNo.message, 'Ya no hay dos versiones distintas de este Setlist.', keep);
    }
  });

  it('una sesión caducada o un fallo de red se dicen como siempre', () => {
    eq(describeResolution({ kind: 'cloud-auth-error', plan: subida }, 'Misa', 'local').ok, false);
    eq(
      describeResolution({ kind: 'cloud-request-error', plan: subida, error: new Error('x') }, 'Misa', 'local').message,
      'No se pudo conectar. Inténtalo otra vez.'
    );
    eq(describeResolution(undefined, 'Misa', 'remote').ok, false, 'sin respuesta no hay buenas noticias');
  });

  it('nunca se le ensena a nadie como funciona esto por dentro', () => {
    const todas = [
      describeResolution({ kind: 'applied-local', plan }, 'Misa', 'remote'),
      describeResolution({ kind: 'cloud-success', plan: subida, result: result('success'), local: 'written' }, 'Misa', 'local'),
      describeResolution({ kind: 'ask', plan }, 'Misa', 'local'),
      describeResolution({ kind: 'local-error', plan, error: new Error('Bearer abc') }, 'Misa', 'remote'),
    ];
    for (const { message } of todas) {
      for (const interno of ['revision', 'fingerprint', 'huella', 'token', 'Bearer', 'owner_id', 'payload', 'upload', 'ask', 'noop']) {
        eq(message.toLowerCase().includes(interno.toLowerCase()), false, `${interno}: ${message}`);
      }
    }
  });
});

describe('Resolver un conflicto es siempre una decisión de alguien', () => {
  const hook = readFileSync('src/hooks/useSetlistCloudSync.ts', 'utf8').replace(/\r\n/g, '\n');
  const code = hook.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
  const app = readFileSync('src/App.tsx', 'utf8').replace(/\r\n/g, '\n');
  const dialog = readFileSync('src/components/Setlists/SetlistConflictDialog.tsx', 'utf8').replace(/\r\n/g, '\n');

  it('nada se resuelve solo: hace falta pulsar, y en la aplicación no hay efecto que lo haga', () => {
    eq(app.includes('openConflict(setlist)'), true, 'sale de pulsar algo');
    eq(/useEffect\([^)]*cloudSync\.resolve/.test(app), false);
    eq(code.includes('useEffect'), false, 'ni un efecto en el hook');
    // La decisión sale del diálogo, y el diálogo sólo la pasa hacia arriba.
    eq(dialog.includes('onResolve(confirming)'), true);
    for (const forbidden of ['runSetlistSyncPass', 'cloud.update', 'localStorage', 'fetch(']) {
      eq(dialog.includes(forbidden), false, forbidden);
    }
  });

  it('la decisión viaja con la versión que se comparó, y sólo para ese setlist', () => {
    // Una sola llamada, que nombra este setlist con la revisión que se vio, y
    // cuya lista de subidas autorizadas está vacía.
    eq(code.includes('runPass([], [[setlist.id, { keep, seenRevision }]])'), true);
    // El diálogo recibe la versión que se leyó, no la busca él.
    eq(app.includes('versions.seenRevision'), true);
  });

  it('mirar un conflicto no lo resuelve: sólo se usa el camino de sólo lectura', () => {
    eq(code.includes("await import('../storage/setlistSyncPreflight')"), true);
    eq(code.includes('runSetlistSyncPreflight(capture)'), true);
    // Y desde el hook no se escribe en la nube por ninguna otra vía.
    for (const forbidden of ['cloud.create', 'cloud.update', 'cloud.remove', 'createCloudSetlistRepository']) {
      eq(code.includes(forbidden), false, forbidden);
    }
  });

  it('sólo "cambió en los dos sitios" se ofrece como elección entre dos versiones', () => {
    eq(code.includes("plan?.kind !== 'ask' || plan.question !== 'both-changed'"), true);
    eq(code.includes("row?.state !== 'setlist'"), true, 'y hace falta una versión legible allí');
  });

  it('una segunda pulsación mientras se resuelve no hace nada', () => {
    eq(code.includes('if (inFlight.current || busy || busyAll) return null;'), true);
    // `busy` y `busyAll` son estado de React y no se ven hasta el siguiente
    // render; el ref se lee en el momento, que es lo que hace falta cuando
    // una pulsación y una reconexión coinciden en el mismo tick.
    eq(dialog.includes('disabled={busy}'), true);
    eq(dialog.includes("'Guardando…'"), true);
  });

  it('el diálogo nombra las dos versiones igual en todas partes', () => {
    eq(dialog.includes("const MINE = 'Esta versión';"), true);
    eq(dialog.includes("const THEIRS = 'Versión de mi cuenta';"), true);
    eq(dialog.includes('Conservar esta versión'), true);
    eq(dialog.includes('Usar la versión de mi cuenta'), true);
    // Y antes de decidir dice qué sustituye a qué, con esas palabras.
    eq(dialog.includes('sustituirá a la que hay allí'), true);
    eq(dialog.includes('sustituirá a la de este dispositivo'), true);
    eq(dialog.includes('se perderá'), true);
  });

  it('a un invitado no se le ofrece este camino', () => {
    // El hook entero vive detrás de haber iniciado sesión, y `conflicted` sale
    // de una pasada, que un invitado nunca ejecuta.
    eq(code.includes("if (!services || !userId) return { kind: 'error', message: SESSION_LOST };"), true);
    eq(app.includes('cloudSync.conflicted(openSetlist)'), true);
  });

  it('no se le ensena al diálogo nada de cómo se guarda esto', () => {
    for (const interno of ['revision', 'fingerprint', 'owner_id', 'payload', 'accessToken', 'upload-changes', 'apply-remote']) {
      eq(dialog.toLowerCase().includes(interno.toLowerCase()), false, interno);
    }
  });
});
