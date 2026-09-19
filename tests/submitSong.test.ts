import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GenesaretError,
  MAX_BODY_BYTES,
  TURNSTILE_ACTION,
  clientIpOf,
  handleSubmitSong,
  parseAllowedOrigins,
  type SubmitSongDeps,
  type TurnstileOutcome,
} from '../supabase/functions/submit-song/handler';
import { readTurnstileSiteKey } from '../src/lib/turnstile';

let checks = 0;
const eq = (actual: unknown, expected: unknown) => {
  assert.deepEqual(actual, expected);
  checks++;
};
after(() => console.log(`submit-song: ${checks} comprobaciones`));

const ORIGIN = 'http://localhost:5173';
const payload = { schemaVersion: 1, type: 'create', requestId: '0f8fad5b-d9cb-469f-a165-70867728950e', editToken: 'a'.repeat(64) };
const passed: TurnstileOutcome = { success: true, action: TURNSTILE_ACTION, hostname: 'localhost' };

function setup(overrides: Partial<SubmitSongDeps> & { outcome?: TurnstileOutcome } = {}) {
  const verified: Parameters<SubmitSongDeps['verifyTurnstile']>[0][] = [];
  const stored: { payload: unknown; clientIp: string | null }[] = [];
  const resubmitted: { input: unknown; clientIp: string | null }[] = [];
  const deps: SubmitSongDeps = {
    allowedOrigins: [ORIGIN],
    verifyTurnstile: async (input) => {
      verified.push(input);
      return overrides.outcome ?? passed;
    },
    submit: async (body, clientIp) => {
      stored.push({ payload: body, clientIp });
      return { trackingCode: 'GS-2345-6789', editToken: 'a'.repeat(64) };
    },
    resubmit: async (input, clientIp) => {
      resubmitted.push({ input, clientIp });
      return { trackingCode: input.trackingCode, status: 'pending' };
    },
    ...overrides,
  };
  return { deps, verified, stored, resubmitted };
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://x.supabase.co/functions/v1/submit-song', {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7, 10.0.0.1', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const messageOf = async (response: Response) => ((await response.json()) as { message?: string }).message;

describe('submit-song: Turnstile antes que la base de datos', () => {
  it('con un token válido guarda la propuesta con la IP del visitante', async () => {
    const { deps, verified, stored } = setup();
    const response = await handleSubmitSong(post({ payload, turnstileToken: 'tok' }), deps);
    eq(response.status, 200);
    eq(await response.json(), { trackingCode: 'GS-2345-6789', editToken: 'a'.repeat(64) });
    eq(response.headers.get('access-control-allow-origin'), ORIGIN);
    eq(response.headers.get('cache-control'), 'no-store');
    eq(verified, [{ token: 'tok', remoteIp: '203.0.113.7' }]);
    eq(stored, [{ payload, clientIp: '203.0.113.7' }]);
  });

  it('sin token, o con uno que Cloudflare no aprueba, no llega a la base de datos', async () => {
    for (const [body, outcome] of [
      [{ payload }, passed],
      [{ payload, turnstileToken: '' }, passed],
      [{ payload, turnstileToken: 'tok' }, { success: false, 'error-codes': ['invalid-input-response'] }],
      [{ payload, turnstileToken: 'tok' }, { success: false, 'error-codes': ['timeout-or-duplicate'] }],
      // Solved for another action or on another site: refused too.
      [{ payload, turnstileToken: 'tok' }, { ...passed, action: 'login' }],
      [{ payload, turnstileToken: 'tok' }, { ...passed, hostname: 'otro-sitio.com' }],
      [{ payload, turnstileToken: 'tok' }, { success: true }],
    ] as const) {
      const { deps, stored } = setup({ outcome });
      const response = await handleSubmitSong(post(body), deps);
      eq([response.status, await messageOf(response), stored.length], [403, 'GENESARET:captcha', 0]);
    }
  });

  it('si Cloudflare no responde, no se envía y se puede reintentar', async () => {
    const { deps, stored } = setup({
      verifyTurnstile: async () => {
        throw new Error('timeout');
      },
    });
    const response = await handleSubmitSong(post({ payload, turnstileToken: 'tok' }), deps);
    eq([response.status, await messageOf(response), stored.length], [503, 'GENESARET:unavailable', 0]);
  });

  it('otro origen, otro método, JSON roto o cuerpo enorme: rechazados sin consultar a nadie', async () => {
    const { deps, verified, stored } = setup();
    const foreign = await handleSubmitSong(post({ payload, turnstileToken: 'tok' }, { origin: 'https://otro-sitio.com' }), deps);
    eq([foreign.status, foreign.headers.get('access-control-allow-origin')], [403, null]);
    const get = await handleSubmitSong(new Request('https://x/submit-song', { headers: { origin: ORIGIN } }), deps);
    eq(get.status, 405);
    eq((await handleSubmitSong(post('{no es json'), deps)).status, 400);
    eq((await handleSubmitSong(post({ turnstileToken: 'tok' }), deps)).status, 400);
    eq((await handleSubmitSong(post({ payload, turnstileToken: 'x'.repeat(MAX_BODY_BYTES) }), deps)).status, 413);
    eq([verified.length, stored.length], [0, 0]);
  });

  it('responde al preflight CORS solo para los orígenes permitidos', async () => {
    const { deps } = setup();
    const preflight = await handleSubmitSong(new Request('https://x/submit-song', { method: 'OPTIONS', headers: { origin: ORIGIN } }), deps);
    eq([preflight.status, preflight.headers.get('access-control-allow-origin')], [204, ORIGIN]);
    eq(preflight.headers.get('access-control-allow-headers')?.includes('apikey'), true);
  });

  it('traduce las negativas de la base de datos a códigos estables, sin detalles internos', async () => {
    for (const [thrown, status, message] of [
      [new GenesaretError('GENESARET:rate_limited'), 429, 'GENESARET:rate_limited'],
      [new GenesaretError('GENESARET:invalid:song'), 400, 'GENESARET:invalid'],
      [new GenesaretError('GENESARET:unavailable'), 503, 'GENESARET:unavailable'],
      [new Error('connection refused at 10.0.0.5'), 503, 'GENESARET:unavailable'],
    ] as const) {
      const { deps } = setup({
        submit: async () => {
          throw thrown;
        },
      });
      const response = await handleSubmitSong(post({ payload, turnstileToken: 'tok' }), deps);
      eq([response.status, await messageOf(response)], [status, message]);
    }
  });
});

describe('submit-song: configuración', () => {
  it('orígenes permitidos: exactos, sin barra final, descartando lo que no es un origen', () => {
    eq(parseAllowedOrigins(' https://genesaret.example/ ,http://localhost:5173, nada, https://a.com/ruta'), [
      'https://genesaret.example',
      'http://localhost:5173',
    ]);
    eq(parseAllowedOrigins(undefined), []);
  });

  it('la IP del visitante es la primera de X-Forwarded-For', () => {
    eq(clientIpOf(new Request('https://x', { headers: { 'x-forwarded-for': ' 198.51.100.4 , 10.0.0.1' } })), '198.51.100.4');
    eq(clientIpOf(new Request('https://x', { headers: { 'x-real-ip': '198.51.100.9' } })), '198.51.100.9');
    eq(clientIpOf(new Request('https://x')), null);
  });

  it('la site key de Turnstile: se acepta con su formato, si falta el envío no está disponible', () => {
    eq(readTurnstileSiteKey(' 0x4AAAAAAAabcdefGHIJ_-12 '), '0x4AAAAAAAabcdefGHIJ_-12');
    eq(readTurnstileSiteKey('1x00000000000000000000AA'), '1x00000000000000000000AA');
    eq(readTurnstileSiteKey(''), null);
    eq(readTurnstileSiteKey(undefined), null);
    eq(readTurnstileSiteKey('tu-site-key'), null);
  });
});

describe('submit-song: reenvío corregido por su autor', () => {
  const song = { schemaVersion: 1, title: 'Corregida', content: '[G]Hola [D]mundo' };
  const resubmit = { action: 'resubmit', trackingCode: ' gs-2345-6789 ', editToken: 'b'.repeat(64), song };

  it('con Turnstile válido, código y token: vuelve a revisión', async () => {
    const { deps, verified, stored, resubmitted } = setup();
    const response = await handleSubmitSong(post({ ...resubmit, turnstileToken: 'tok' }), deps);
    eq(response.status, 200);
    eq(await response.json(), { trackingCode: 'GS-2345-6789', status: 'pending' });
    eq(verified.length, 1);
    eq(resubmitted, [{ input: { trackingCode: 'GS-2345-6789', editToken: 'b'.repeat(64), song }, clientIp: '203.0.113.7' }]);
    eq(stored.length, 0);
  });

  it('también exige Turnstile: sin token o con uno rechazado no llega a la base de datos', async () => {
    for (const [body, outcome] of [
      [{ ...resubmit }, passed],
      [{ ...resubmit, turnstileToken: 'tok' }, { success: false }],
      [{ ...resubmit, turnstileToken: 'tok' }, { ...passed, hostname: 'otro-sitio.com' }],
    ] as const) {
      const { deps, resubmitted } = setup({ outcome });
      const response = await handleSubmitSong(post(body), deps);
      eq([response.status, await messageOf(response), resubmitted.length], [403, 'GENESARET:captcha', 0]);
    }
  });

  it('código, token o canción mal formados se rechazan antes de preguntar a Cloudflare', async () => {
    for (const body of [
      { ...resubmit, trackingCode: 'no-es-codigo' },
      { ...resubmit, editToken: 'corto' },
      { ...resubmit, editToken: 'B'.repeat(64) },
      { ...resubmit, song: null },
      { ...resubmit, song: [] },
      { ...resubmit, action: 'borrar' },
    ]) {
      const { deps, verified, resubmitted } = setup();
      const response = await handleSubmitSong(post({ ...body, turnstileToken: 'tok' }), deps);
      eq([response.status, verified.length, resubmitted.length], [400, 0, 0]);
    }
  });

  it('las negativas de la base de datos: ya no editable, token incorrecto, límite', async () => {
    for (const [thrown, status, message] of [
      [new GenesaretError('GENESARET:not_editable'), 409, 'GENESARET:not_editable'],
      [new GenesaretError('GENESARET:invalid:token'), 400, 'GENESARET:invalid'],
      [new GenesaretError('GENESARET:rate_limited'), 429, 'GENESARET:rate_limited'],
    ] as const) {
      const { deps } = setup({
        resubmit: async () => {
          throw thrown;
        },
      });
      const response = await handleSubmitSong(post({ ...resubmit, turnstileToken: 'tok' }), deps);
      eq([response.status, await messageOf(response)], [status, message]);
    }
  });

  it('sin "action" sigue siendo un envío nuevo, como en 6B', async () => {
    const { deps, stored, resubmitted } = setup();
    const response = await handleSubmitSong(post({ payload, turnstileToken: 'tok' }), deps);
    eq([response.status, stored.length, resubmitted.length], [200, 1, 0]);
  });
});
