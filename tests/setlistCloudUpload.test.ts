import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { SetlistSyncOutcome } from '../src/storage/setlistSyncPass';
import type { SetlistSyncPlan } from '../src/storage/setlistSync';
import type { SetlistSyncExecutionResult } from '../src/storage/setlistSyncExecutor';
import { describeUpload } from '../src/hooks/useSetlistCloudUpload';

/**
 * What somebody is told after asking for a setlist to go in their account.
 *
 * The rule is that the sentence answers the question they asked — is it in my
 * account? — and says nothing about how any of it works.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`setlistCloudUpload.test: ${checks} comprobaciones`));

const NAME = 'Misa Domingo';
const plan: SetlistSyncPlan = { kind: 'upload-candidate', setlist: { id: 'setlist-1234' } as never };
const result = (kind: SetlistSyncExecutionResult['kind']) =>
  ({ kind, operation: 'create', setlistId: 'setlist-1234' }) as SetlistSyncExecutionResult;

describe('Lo que se le dice a quien pulsa «Guardar en mi cuenta»', () => {
  it('cuando queda guardado', () => {
    for (const local of ['written', 'skipped-stale', 'failed'] as const) {
      const outcome: SetlistSyncOutcome = { kind: 'cloud-success', plan, result: result('success'), local };
      // La fila está allí pase lo que pase con la nota de aquí: para la
      // persona, su setlist está guardado.
      eq(describeUpload(outcome, NAME), { ok: true, message: '«Misa Domingo» guardado en tu cuenta' }, local);
    }
  });

  it('cuando ya estaba', () => {
    const yaEstaba = { ok: true, message: '«Misa Domingo» ya estaba en tu cuenta' };
    eq(describeUpload({ kind: 'noop', plan }, NAME), yaEstaba);
    eq(describeUpload({ kind: 'cloud-conflict', plan }, NAME), yaEstaba, 'la fila resultó existir');
  });

  it('cuando la sesión ya no vale', () => {
    const answer = describeUpload({ kind: 'cloud-auth-error', plan }, NAME);
    eq(answer.ok, false);
    eq(answer.message, 'Tu sesión ha caducado. Vuelve a entrar e inténtalo otra vez.');
  });

  it('cuando no se llegó a la nube', () => {
    const answer = describeUpload(
      { kind: 'cloud-request-error', plan, error: new Error('lo que sea') },
      NAME
    );
    eq(answer, { ok: false, message: 'No se pudo conectar. Inténtalo otra vez.' });
  });

  it('cuando el setlist no cabe en la tabla, se dice qué pasa', () => {
    const rejected = (problem: string): SetlistSyncOutcome => ({
      kind: 'cloud-rejected',
      plan,
      result: { kind: 'rejected', operation: 'create', setlistId: 'setlist-1234', problem } as never,
    });
    eq(describeUpload(rejected('name'), NAME).message, 'El nombre es demasiado largo para guardarlo en tu cuenta.');
    eq(
      describeUpload(rejected('description'), NAME).message,
      'La descripción es demasiado larga para guardarla en tu cuenta.'
    );
    eq(
      describeUpload(rejected('item-count'), NAME).message,
      'Este Setlist tiene demasiadas canciones para guardarlo en tu cuenta.'
    );
    eq(describeUpload(rejected('payload-size'), NAME).ok, false);
    eq(describeUpload(rejected('date'), NAME).message, 'La fecha no es válida.');
  });

  it('y cualquier otra cosa no se cuenta como un éxito', () => {
    const otros: SetlistSyncOutcome[] = [
      { kind: 'pending-user-action', plan },
      { kind: 'ask', plan },
      { kind: 'blocked', plan },
      { kind: 'applied-local', plan },
      { kind: 'skipped-stale', plan, what: 'base' },
      { kind: 'local-error', plan, error: new Error('x') },
      { kind: 'invalid-plan', plan, result: result('invalid-plan') },
      { kind: 'invalid-response', plan, result: result('invalid-response') },
    ];
    for (const outcome of otros) {
      const answer = describeUpload(outcome, NAME);
      eq(answer.ok, false, outcome.kind);
      eq(answer.message, 'No se pudo guardar. Inténtalo otra vez.', outcome.kind);
    }
    // Y si no hubo plan para ese id, tampoco.
    eq(describeUpload(undefined, NAME).ok, false);
  });

  it('nunca se le enseña a nadie cómo funciona esto por dentro', () => {
    const todos: SetlistSyncOutcome[] = [
      { kind: 'cloud-success', plan, result: result('success'), local: 'written' },
      { kind: 'noop', plan },
      { kind: 'cloud-conflict', plan },
      { kind: 'cloud-auth-error', plan },
      { kind: 'cloud-request-error', plan, error: new SyntaxError('Bearer abc.def.ghi') },
      { kind: 'invalid-response', plan, result: result('invalid-response') },
    ];
    for (const outcome of todos) {
      const { message } = describeUpload(outcome, NAME);
      for (const interno of ['revision', 'fingerprint', 'token', 'Bearer', 'payload', 'baseline', 'RLS', 'owner_id']) {
        eq(message.toLowerCase().includes(interno.toLowerCase()), false, `${outcome.kind}: ${interno}`);
      }
    }
  });
});

describe('Subir es siempre una decisión de alguien', () => {
  const hook = readFileSync('src/hooks/useSetlistCloudUpload.ts', 'utf8').replace(/\r\n/g, '\n');
  const code = hook.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
  const app = readFileSync('src/App.tsx', 'utf8').replace(/\r\n/g, '\n');

  it('nada lo dispara solo: ni un efecto, ni un temporizador', () => {
    for (const forbidden of ['useEffect', 'setTimeout', 'setInterval', 'requestIdleCallback']) {
      eq(code.includes(forbidden), false, forbidden);
    }
    // La subida sale de pulsar algo, no de renderizar.
    eq(app.includes('onSaveToAccount={'), true);
    eq(/useEffect\([^)]*cloudUpload\.upload/.test(app), false, 'ningún efecto sube nada');
  });

  it('se autoriza exactamente el setlist que se pidió, y ninguno más', () => {
    eq(code.includes('authorisedUploads: [setlistId]'), true);
    eq(/authorisedUploads:\s*\[[^\]]*,/.test(code), false, 'nunca una lista de varios');
  });

  it('una segunda pulsación mientras sube no hace nada', () => {
    eq(code.includes('if (busy) return null;'), true);
    // Y el menú deshabilita la acción mientras tanto.
    const detail = readFileSync('src/components/Setlists/SetlistDetail.tsx', 'utf8');
    eq(detail.includes('disabled: savingToAccount'), true);
    eq(detail.includes("savingToAccount ? 'Guardando en tu cuenta…'"), true, 'y dice que está en marcha');
  });

  it('a un invitado no se le ofrece nada, y sus setlists no cambian', () => {
    // El scope es el mismo con el que se leen los setlists en pantalla, así
    // que la oferta nunca puede ser de otra cuenta que la que se está viendo.
    eq(code.includes("scope.kind === 'user' ? scope.userId.trim() : ''"), true);
    eq(code.includes('Boolean(userId) && Boolean(services)'), true);
    // Y la capa de sync ya rechaza por su cuenta una identidad en blanco.
    eq(readFileSync('src/storage/setlistSyncSession.ts', 'utf8').includes("return { status: 'not-signed-in' }"), true);
  });

  it('la pasada se hace con la identidad y el token leídos juntos', () => {
    eq(code.includes('services.auth.authenticated()'), true);
    eq(code.includes("capture.session.userId.trim() !== userId"), true, 'y para la cuenta que está en pantalla');
    // No hay una segunda forma de escribir un setlist en la nube.
    eq(code.includes('cloud.create'), false);
    eq(code.includes('createCloudSetlistRepository'), false);
  });
});
