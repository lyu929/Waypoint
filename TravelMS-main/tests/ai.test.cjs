const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const { databaseOptions, createPool } = require('../db');
const { migrate } = require('../backend/schema');
const { createApp } = require('../backend/app');
const { createTestAi } = require('./ai-fixtures.cjs');
const { PNG_RECEIPT } = require('./fixtures.cjs');
const { PDFDocument } = require('pdf-lib');

const database = `waypoint_test_ai_${process.pid}_${Date.now()}`;
const calls = [];
let adminConnection, pool, server, base, alice, bob, owner;
let available = true,
  transform = (_kind, value) => value;
const testAi = createTestAi({
  onRequest: (kind, context, payload) => calls.push({ kind, context, payload }),
  transform: (kind, value) => transform(kind, value),
});
async function request(path, actor, body, method = 'POST') {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(actor ? { Cookie: actor } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers.get('set-cookie')?.split(';')[0],
  };
}
async function trip(overrides = {}) {
  const response = await request('/trips', alice, {
    destination: 'Chicago',
    start_date: '2027-05-01',
    end_date: '2027-05-03',
    purpose: 'Course demonstration',
    estimated_budget: 100,
    ...overrides,
  });
  assert.equal(response.status, 201);
  return response.data.trip_id;
}
async function expense(tripId) {
  assert.equal(
    (await request(`/trips/${tripId}/status`, owner, { status: 'APPROVED' }, 'PATCH')).status,
    200,
  );
  const response = await request('/expenses', alice, {
    trip_id: tripId,
    category: 'OTHER',
    amount: 90,
    expense_date: '2027-05-01',
    description: 'Original expense',
    receipt_url: '',
  });
  assert.equal(response.status, 201);
  const id = response.data.expense_id;
  const form = new FormData();
  form.append('receipt', new Blob([PNG_RECEIPT], { type: 'image/png' }), 'private.png');
  assert.equal(
    (
      await fetch(base + `/expenses/${id}/receipt`, {
        method: 'PUT',
        headers: { Cookie: alice },
        body: form,
      })
    ).status,
    200,
  );
  return id;
}
before(async () => {
  adminConnection = await mysql.createConnection(databaseOptions(null));
  await adminConnection.query('CREATE DATABASE ??', [database]);
  pool = createPool(database);
  await migrate(pool);
  server = createApp(pool, {
    rateLimit: false,
    logErrors: false,
    ai: {
      status: () => ({ available, provider: 'OpenAI' }),
      generate: (...args) => testAi.generate(...args),
    },
  }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
  for (const name of ['alice', 'bob', 'owner']) {
    const response = await request('/auth/register', null, {
      first_name: name,
      last_name: 'Test',
      email: `${name}@example.invalid`,
      phone_number: '',
      password: 'Testing2026!',
    });
    assert.equal(response.status, 201);
    if (name === 'alice') alice = response.cookie;
    else if (name === 'bob') bob = response.cookie;
    else {
      owner = response.cookie;
      await pool.query("UPDATE users SET role='ADMIN' WHERE user_id=?", [response.data.user_id]);
    }
  }
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (pool) await pool.end();
  if (adminConnection) {
    await adminConnection.query('DROP DATABASE IF EXISTS ??', [database]);
    await adminConnection.end();
  }
});

test('AI routes enforce sessions and ownership before any provider call', async () => {
  const id = await trip();
  const beforeCalls = calls.length;
  assert.equal((await request('/ai/status', null, undefined, 'GET')).status, 401);
  assert.deepEqual((await request('/ai/status', alice, undefined, 'GET')).data, {
    available: true,
    provider: 'OpenAI',
  });
  for (const suffix of ['/ai/itinerary', '/ai/budget', '/itinerary/import']) {
    assert.equal((await request(`/trips/${id}${suffix}`, null, {})).status, 401);
    assert.equal((await request(`/trips/${id}${suffix}`, bob, {})).status, 403);
  }
  assert.equal(calls.length, beforeCalls);
  assert.equal((await request(`/trips/${id}/ai/budget`, owner, {})).status, 200);
});

test('AI planning returns a bounded draft without changing saved itinerary or exposing account data', async () => {
  const id = await trip();
  const result = await request(`/trips/${id}/ai/itinerary`, alice, {
    preferences: 'Museums and local food',
    pace: 'relaxed',
    user_id: 999,
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.items.length, 3);
  const detail = await request(`/trips/${id}`, alice, undefined, 'GET');
  assert.equal(detail.data.itinerary.length, 0);
  assert.ok(!detail.data.history.some((event) => event.event_type === 'AI_ITINERARY_IMPORTED'));
  const context = calls.at(-1).context;
  for (const field of ['email', 'user_id', 'password_hash', 'first_name'])
    assert.equal(field in context, false);
  assert.equal(context.destination, 'Chicago');
  assert.equal(context.pace, 'relaxed');
  for (const body of [
    { preferences: '', pace: 'relaxed' },
    { preferences: 'x', pace: 'invalid' },
    { preferences: 'x'.repeat(1001), pace: 'active' },
  ])
    assert.equal((await request(`/trips/${id}/ai/itinerary`, alice, body)).status, 400);
  const long = await trip({ end_date: '2027-06-01' });
  assert.equal(
    (await request(`/trips/${long}/ai/itinerary`, alice, { preferences: 'Walks', pace: 'relaxed' }))
      .status,
    400,
  );
});

test('reviewed itinerary batches are atomic and deduplicate retries, batch duplicates and concurrent saves', async () => {
  const id = await trip();
  const generated = await request(`/trips/${id}/ai/itinerary`, alice, {
    preferences: 'Museums',
    pace: 'balanced',
  });
  const items = generated.data.items;
  assert.equal(
    (
      await request(`/trips/${id}/itinerary/import`, alice, {
        items: [items[0], { ...items[1], item_date: '2027-05-10' }],
      })
    ).status,
    400,
  );
  assert.equal((await request(`/trips/${id}`, alice, undefined, 'GET')).data.itinerary.length, 0);
  const results = await Promise.all(
    [1, 2].map(() =>
      request(`/trips/${id}/itinerary/import`, alice, {
        items: [items[0], items[0], { ...items[1], title: 'Edited food walk' }],
      }),
    ),
  );
  assert.equal(
    results.reduce((sum, result) => sum + result.data.added, 0),
    2,
  );
  const detail = (await request(`/trips/${id}`, alice, undefined, 'GET')).data;
  assert.equal(detail.itinerary.length, 2);
  assert.equal(
    detail.history.filter((event) => event.event_type === 'AI_ITINERARY_IMPORTED').length,
    1,
  );
  assert.ok(detail.itinerary.some((item) => item.title === 'Edited food walk'));
  assert.deepEqual(
    (await request(`/trips/${id}/itinerary/import`, alice, { items: [items[0]] })).data,
    { added: 0, skipped: 1 },
  );
  await request(`/trips/${id}/status`, owner, { status: 'APPROVED' }, 'PATCH');
  await request(`/trips/${id}/status`, owner, { status: 'COMPLETED' }, 'PATCH');
  assert.equal((await request(`/trips/${id}/itinerary/import`, alice, { items })).status, 409);
  assert.equal(
    (await request(`/trips/${id}/ai/itinerary`, alice, { preferences: 'Walks', pace: 'relaxed' }))
      .status,
    409,
  );
});

test('invalid provider drafts are rejected and unconfigured AI leaves manual workflows usable', async () => {
  const id = await trip();
  transform = (kind, value) =>
    kind === 'itinerary'
      ? { ...value, items: [{ ...value.items[0], item_date: '2027-12-31' }] }
      : value;
  try {
    assert.equal(
      (await request(`/trips/${id}/ai/itinerary`, alice, { preferences: 'Walks', pace: 'relaxed' }))
        .status,
      502,
    );
  } finally {
    transform = (_kind, value) => value;
  }
  available = false;
  const previous = calls.length;
  try {
    assert.equal((await request(`/trips/${id}/ai/budget`, alice, {})).status, 503);
    assert.equal(
      (await request(`/trips/${id}/ai/itinerary`, alice, { preferences: 'Walks', pace: 'relaxed' }))
        .status,
      503,
    );
    assert.equal(calls.length, previous);
    assert.equal(
      (
        await request(`/trips/${id}/itinerary`, alice, {
          item_date: '2027-05-01',
          kind: 'NOTE',
          title: 'Manual plan',
          notes: '',
          location: '',
        })
      ).status,
      201,
    );
  } finally {
    available = true;
  }
});

test('reviewed batches support the full edited note size without relaxing other JSON request limits', async () => {
  const id = await trip();
  const items = Array.from({ length: 20 }, (_, i) => ({
    item_date: '2027-05-01',
    start_time: null,
    kind: 'NOTE',
    title: `Reviewed note ${i}`,
    location: '',
    notes: 'x'.repeat(2000),
  }));
  const imported = await request(`/trips/${id}/itinerary/import`, alice, { items });
  assert.equal(imported.status, 201);
  assert.equal(imported.data.added, 20);
  assert.equal(
    (
      await request(`/trips/${id}/ai/itinerary`, alice, {
        preferences: 'x'.repeat(40000),
        pace: 'balanced',
      })
    ).status,
    413,
  );
});

test('budget insights use exact saved category totals and never mutate expenses', async () => {
  const id = await trip();
  await expense(id);
  const result = await request(`/trips/${id}/ai/budget`, alice, {});
  assert.equal(result.status, 200);
  assert.equal(result.data.snapshot.spent, 90);
  assert.equal(result.data.snapshot.remaining, 10);
  assert.equal(result.data.snapshot.state, 'NEAR');
  assert.equal(result.data.snapshot.categories.OTHER, 90);
  assert.equal(result.data.snapshot.expense_count, 1);
  assert.equal(
    (await request(`/trips/${id}`, alice, undefined, 'GET')).data.expenses[0].amount,
    90,
  );
  const empty = await trip({ estimated_budget: 0 });
  const zero = await request(`/trips/${empty}/ai/budget`, alice, {});
  assert.equal(zero.data.snapshot.state, 'UNSET');
  assert.equal(zero.data.snapshot.used_percent, null);
});

test('receipt scan is private, makes no writes, and applies only reviewed valid USD fields', async () => {
  const id = await trip();
  const expenseId = await expense(id);
  const beforeCalls = calls.length;
  assert.equal((await request(`/expenses/${expenseId}/ai/receipt`, null, {})).status, 401);
  assert.equal((await request(`/expenses/${expenseId}/ai/receipt`, bob, {})).status, 403);
  assert.equal(calls.length, beforeCalls);
  const scan = await request(`/expenses/${expenseId}/ai/receipt`, alice, {});
  assert.equal(scan.status, 200);
  assert.equal(scan.data.amount, 12.5);
  assert.equal(
    (await request(`/trips/${id}`, alice, undefined, 'GET')).data.expenses[0].amount,
    90,
  );
  const content = calls.at(-1).payload.input[0].content;
  assert.ok(content[1].image_url.startsWith('data:image/png;base64,'));
  assert.equal('file_url' in content[1], false);
  assert.equal(
    (await request(`/expenses/${expenseId}/ai/receipt/apply`, bob, scan.data)).status,
    403,
  );
  for (const overrides of [{ currency: 'EUR' }, { amount: 0 }, { expense_date: '2027-05-10' }])
    assert.equal(
      (
        await request(`/expenses/${expenseId}/ai/receipt/apply`, alice, {
          ...scan.data,
          ...overrides,
        })
      ).status,
      400,
    );
  assert.equal(
    (
      await request(`/expenses/${expenseId}/ai/receipt/apply`, alice, {
        ...scan.data,
        amount: 14.25,
        description: 'User-reviewed lunch',
      })
    ).status,
    200,
  );
  const detail = (await request(`/trips/${id}`, alice, undefined, 'GET')).data;
  assert.equal(detail.expenses[0].amount, 14.25);
  assert.equal(detail.expenses[0].description, 'User-reviewed lunch');
  assert.ok(detail.expenses[0].receipt_id);
  assert.ok(detail.history.some((event) => event.event_type === 'AI_RECEIPT_APPLIED'));
  assert.equal(
    (await request(`/expenses/${expenseId}/ai/receipt/apply`, alice, scan.data)).status,
    409,
  );
});

test('receipt changes invalidate drafts, unsupported currencies stay explicit and PDF scans are bounded', async () => {
  const id = await trip();
  const expenseId = await expense(id);
  transform = (kind, value) => (kind === 'receipt' ? { ...value, currency: 'EUR' } : value);
  try {
    assert.equal(
      (await request(`/expenses/${expenseId}/ai/receipt`, alice, {})).data.currency,
      'EUR',
    );
  } finally {
    transform = (_kind, value) => value;
  }
  const scanned = await request(`/expenses/${expenseId}/ai/receipt`, alice, {});
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText('Test receipt');
  async function uploadPdf() {
    const form = new FormData();
    form.append(
      'receipt',
      new Blob([await pdf.save()], { type: 'application/pdf' }),
      'receipt.pdf',
    );
    assert.equal(
      (
        await fetch(base + `/expenses/${expenseId}/receipt`, {
          method: 'PUT',
          headers: { Cookie: alice },
          body: form,
        })
      ).status,
      200,
    );
  }
  await uploadPdf();
  assert.equal(
    (await request(`/expenses/${expenseId}/ai/receipt/apply`, alice, scanned.data)).status,
    409,
  );
  assert.equal((await request(`/expenses/${expenseId}/ai/receipt`, alice, {})).status, 200);
  assert.equal(calls.at(-1).payload.input[0].content[1].type, 'input_file');
  for (let i = 1; i < 6; i++) pdf.addPage();
  await uploadPdf();
  const previous = calls.length;
  assert.equal((await request(`/expenses/${expenseId}/ai/receipt`, alice, {})).status, 400);
  assert.equal(calls.length, previous);
});
