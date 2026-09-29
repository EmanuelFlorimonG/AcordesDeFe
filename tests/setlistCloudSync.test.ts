import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { SetlistSyncOutcome } from '../src/storage/setlistSyncPass';
import type { SetlistSyncPlan } from '../src/storage/setlistSync';
import type { SetlistSyncExecutionResult } from '../src/storage/setlistSyncExecutor';
import { describePass, describeSync, tally } from '../src/hooks/useSetlistCloudSync';

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
    eq(code.includes('if (busy || busyAll) return null;'), true);
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
    // Y la pantalla sólo ofrece algo en dos de las cuatro situaciones.
    eq(app.includes("=== 'new' || openSetlistCloudState === 'changed' ? openSetlistCloudState : null"), true);
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
