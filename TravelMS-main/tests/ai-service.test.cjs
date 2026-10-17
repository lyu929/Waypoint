const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAiService, createAiLimiter } = require('../backend/ai-service');

const env = { OPENAI_API_KEY: 'test-secret', OPENAI_MODEL: 'test-model' };
const complete = (value) => ({
  status: 'completed',
  output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }],
});
const provider =
  (body, status = 200) =>
  async () =>
    new Response(JSON.stringify(body), { status });

test('unconfigured AI fails locally without calling a provider', async () => {
  let called = false;
  const ai = createAiService({
    env: {},
    fetchImpl: async () => {
      called = true;
    },
  });
  assert.deepEqual(ai.status(), { available: false, provider: 'OpenAI' });
  await assert.rejects(ai.generate('itinerary', {}), { status: 503 });
  assert.equal(called, false);
  assert.equal(
    createAiService({ env: { OPENAI_API_KEY: 'your_key_here' } }).status().available,
    false,
  );
});

test('provider requests use server credentials, strict schemas, no storage and private inline attachments', async () => {
  const requests = [];
  const ai = createAiService({
    env,
    fetchImpl: async (url, options) => {
      requests.push({ url, ...options, body: JSON.parse(options.body) });
      return new Response(JSON.stringify(complete({ summary: 'Test' })));
    },
  });
  await ai.generate('itinerary', { destination: 'Test' });
  await ai.generate('receipt', {}, { media_type: 'image/png', content: Buffer.from('test') });
  await ai.generate('receipt', {}, { media_type: 'application/pdf', content: Buffer.from('test') });
  for (const request of requests) {
    assert.equal(request.url, 'https://api.openai.com/v1/responses');
    assert.equal(request.headers.Authorization, 'Bearer test-secret');
    assert.equal(request.body.model, 'test-model');
    assert.equal(request.body.store, false);
    assert.equal(request.body.text.format.strict, true);
    assert.equal(request.body.text.format.schema.additionalProperties, false);
    assert.equal(request.body.tools, undefined);
    assert.ok(request.signal instanceof AbortSignal);
  }
  assert.equal(requests[1].body.input[0].content[1].image_url, 'data:image/png;base64,dGVzdA==');
  assert.equal(requests[2].body.input[0].content[1].filename, 'receipt.pdf');
  assert.equal(
    requests[2].body.input[0].content[1].file_data,
    'data:application/pdf;base64,dGVzdA==',
  );
  assert.equal('key' in ai.status(), false);
});

test('provider errors, refusals and incomplete responses have bounded public errors', async () => {
  for (const [status, expected] of [
    [401, 503],
    [403, 503],
    [429, 503],
    [500, 502],
  ]) {
    const ai = createAiService({
      env,
      fetchImpl: provider({ error: 'private upstream details test-secret' }, status),
    });
    await assert.rejects(
      ai.generate('budget', {}),
      (error) => error.status === expected && !error.message.includes('test-secret'),
    );
  }
  for (const [body, status] of [
    [{ status: 'incomplete', output: [] }, 502],
    [
      {
        status: 'completed',
        output: [{ content: [{ type: 'refusal', refusal: 'private detail' }] }],
      },
      422,
    ],
    [
      {
        status: 'completed',
        output: [{ content: [{ type: 'output_text', text: 'invalid json' }] }],
      },
      502,
    ],
    [{ status: 'completed', output: [] }, 502],
  ])
    await assert.rejects(
      createAiService({ env, fetchImpl: provider(body) }).generate('budget', {}),
      { status },
    );
  for (const [name, status] of [
    ['TimeoutError', 504],
    ['AbortError', 504],
    ['TypeError', 502],
  ]) {
    const ai = createAiService({
      env,
      fetchImpl: async () => {
        const error = new Error('test-secret');
        error.name = name;
        throw error;
      },
    });
    await assert.rejects(ai.generate('budget', {}), { status });
  }
});

test('AI limits are per user, reject overlap, release after failure and expire', async () => {
  let now = 0;
  const limited = createAiLimiter({ limit: 2, windowMs: 100, now: () => now });
  let finish;
  const pending = limited(1, () => new Promise((resolve) => (finish = resolve)));
  await assert.rejects(
    limited(1, async () => {}),
    { status: 429 },
  );
  assert.equal(await limited(2, async () => 'other user'), 'other user');
  finish('done');
  await pending;
  await assert.rejects(
    limited(1, async () => {
      throw new Error('failure');
    }),
    /failure/,
  );
  await assert.rejects(
    limited(1, async () => {}),
    { status: 429 },
  );
  now = 101;
  assert.equal(await limited(1, async () => 'reset'), 'reset');
});
