const crypto = require('node:crypto');
const { PDFDocument } = require('pdf-lib');
const v = require('./validation');
const { budgetSummary } = require('./budget');
const { itineraryInput, itineraryObject } = require('./itinerary');
const { recordTripEvent } = require('./features');
const { createAiService, createAiLimiter } = require('./ai-service');

const categories = ['FLIGHT', 'LODGING', 'FOOD', 'TRANSPORT', 'OTHER'];
const tripContext = (trip) => ({
  destination: trip.destination,
  start_date: trip.start_date,
  end_date: trip.end_date,
  purpose: trip.purpose,
  budget_usd: trip.estimated_budget,
});
const identity = (item) =>
  JSON.stringify([
    item.item_date,
    item.start_time || '',
    item.kind,
    item.title.trim().toLowerCase(),
    item.location.trim().toLowerCase(),
  ]);
const fingerprint = (expense) =>
  crypto
    .createHash('sha256')
    .update(
      JSON.stringify([
        expense.trip_id,
        expense.category,
        expense.amount,
        expense.expense_date,
        expense.description,
      ]),
    )
    .digest('hex');

function validateDraft(read) {
  try {
    return read();
  } catch {
    v.fail(502, 'AI returned an invalid draft. Please try again or enter the details manually.');
  }
}
function itemsInput(items, trip) {
  if (!Array.isArray(items) || !items.length || items.length > 42)
    v.fail(400, 'Select between 1 and 42 itinerary items.');
  return items.map((item) => itineraryObject(itineraryInput(item, trip)));
}

function mountAi(
  app,
  pool,
  { auth, route, transaction, tripAccess, ai = createAiService(), rateLimit = true },
) {
  const limited = rateLimit ? createAiLimiter() : async (_id, work) => work();
  const generate = (req, kind, context, attachment) => {
    if (!ai.status().available)
      v.fail(503, 'AI is not connected yet. Ask the workspace owner to enable it.');
    return limited(req.user.user_id, () => ai.generate(kind, context, attachment));
  };
  const editable = (trip) => {
    if (['COMPLETED', 'CANCELLED'].includes(trip.status))
      v.fail(409, 'This trip has a read-only itinerary.');
  };

  app.get('/api/ai/status', auth, (req, res) => res.json(ai.status()));
  app.post(
    '/api/trips/:id/ai/itinerary',
    auth,
    route(async (req, res) => {
      const trip = await tripAccess(pool, req, v.id(req.params.id));
      editable(trip);
      const days =
        Math.round((Date.parse(trip.end_date) - Date.parse(trip.start_date)) / 86400000) + 1;
      if (days > 14)
        v.fail(
          400,
          'AI planning supports trips of up to 14 days. You can still plan longer trips manually.',
        );
      const preferences = v.text(req.body.preferences, 'Preferences', 1000);
      const pace = v.choice(req.body.pace, ['relaxed', 'balanced', 'active'], 'travel pace');
      const [existing] = await pool.query(
        'SELECT item_date,start_time,kind,title,location FROM itinerary_items WHERE trip_id=? ORDER BY item_date,start_time LIMIT 201',
        [trip.trip_id],
      );
      if (existing.length > 200)
        v.fail(400, 'This itinerary has too many items for AI planning. Add new items manually.');
      const output = await generate(req, 'itinerary', {
        ...tripContext(trip),
        preferences,
        pace,
        existing,
      });
      const draft = validateDraft(() => ({
        summary: v.text(output.summary, 'Summary', 800),
        items: itemsInput(output.items, trip),
      }));
      res.json({ ...draft, generated_at: new Date().toISOString() });
    }),
  );

  app.post(
    '/api/trips/:id/itinerary/import',
    auth,
    route(async (req, res) => {
      const result = await transaction(pool, async (c) => {
        const trip = await tripAccess(c, req, v.id(req.params.id), true);
        editable(trip);
        // Validate the entire batch before writing; the trip lock serializes retrying imports.
        const items = itemsInput(req.body.items, trip);
        const [existing] = await c.query('SELECT * FROM itinerary_items WHERE trip_id=?', [
          trip.trip_id,
        ]);
        const seen = new Set(existing.map(identity));
        let added = 0;
        for (const item of items) {
          const key = identity(item);
          if (seen.has(key)) continue;
          await c.query(
            'INSERT INTO itinerary_items (trip_id,item_date,start_time,kind,title,location,notes) VALUES (?,?,?,?,?,?,?)',
            [trip.trip_id, ...itineraryInput(item, trip)],
          );
          seen.add(key);
          added++;
        }
        if (added)
          await recordTripEvent(
            c,
            req,
            trip.trip_id,
            'AI_ITINERARY_IMPORTED',
            null,
            null,
            `Reviewed and added ${added} AI-assisted itinerary item${added === 1 ? '' : 's'}.`,
          );
        return { added, skipped: items.length - added };
      });
      res.status(result.added ? 201 : 200).json(result);
    }),
  );

  app.post(
    '/api/trips/:id/ai/budget',
    auth,
    route(async (req, res) => {
      const snapshot = await transaction(pool, async (c) => {
        const trip = await tripAccess(c, req, v.id(req.params.id), true);
        const [rows] = await c.query(
          'SELECT category,ROUND(SUM(amount)*100) AS cents,COUNT(*) AS count FROM expenses WHERE trip_id=? GROUP BY category',
          [trip.trip_id],
        );
        const spent = rows.reduce((sum, row) => sum + Number(row.cents), 0) / 100;
        return {
          ...tripContext(trip),
          currency: 'USD',
          spent,
          expense_count: rows.reduce((sum, row) => sum + Number(row.count), 0),
          categories: Object.fromEntries(
            categories.map((category) => [
              category,
              Number(rows.find((r) => r.category === category)?.cents || 0) / 100,
            ]),
          ),
          ...budgetSummary(trip.estimated_budget, spent),
        };
      });
      const output = await generate(req, 'budget', snapshot);
      const draft = validateDraft(() => {
        if (
          !Array.isArray(output.suggestions) ||
          !output.suggestions.length ||
          output.suggestions.length > 5
        )
          v.fail(400, 'Invalid suggestions.');
        return {
          summary: v.text(output.summary, 'Summary', 800),
          suggestions: output.suggestions.map((item) => v.text(item, 'Suggestion', 300)),
        };
      });
      res.json({ ...draft, snapshot, generated_at: new Date().toISOString() });
    }),
  );

  async function receiptAccess(c, req, lock = false) {
    const [[expense]] = await c.query(
      'SELECT * FROM expenses WHERE expense_id=?' + (lock ? ' FOR UPDATE' : ''),
      [v.id(req.params.id)],
    );
    if (!expense) v.fail(404, 'Expense not found.');
    const trip = await tripAccess(c, req, expense.trip_id, lock);
    const [[receipt]] = await c.query(
      'SELECT * FROM expense_receipts WHERE expense_id=?' + (lock ? ' FOR UPDATE' : ''),
      [expense.expense_id],
    );
    if (!receipt) v.fail(404, 'Attach a receipt file before using AI scan.');
    return { expense, trip, receipt };
  }
  app.post(
    '/api/expenses/:id/ai/receipt',
    auth,
    route(async (req, res) => {
      const { expense, receipt } = await transaction(pool, (c) => receiptAccess(c, req, true));
      if (
        !['image/png', 'image/jpeg', 'application/pdf'].includes(receipt.media_type) ||
        receipt.content.length > 5 * 1024 * 1024
      )
        v.fail(400, 'AI scan supports PNG, JPEG and PDF receipts up to 5 MB.');
      if (receipt.media_type === 'application/pdf') {
        const pdf = await PDFDocument.load(receipt.content);
        if (pdf.getPageCount() > 5) v.fail(400, 'AI scan supports receipts of up to 5 PDF pages.');
      }
      const output = await generate(
        req,
        'receipt',
        { task: 'Extract this receipt without changing any expense.' },
        receipt,
      );
      const draft = validateDraft(() => {
        if (!Array.isArray(output.warnings) || output.warnings.length > 5)
          v.fail(400, 'Invalid warnings.');
        const currency =
          output.currency == null ? null : v.text(output.currency, 'Currency', 3).toUpperCase();
        if (currency && !/^[A-Z]{3}$/.test(currency)) v.fail(400, 'Invalid currency.');
        return {
          merchant: output.merchant == null ? null : v.text(output.merchant, 'Merchant', 200),
          amount: output.amount == null ? null : v.money(output.amount, 'Amount', true),
          currency,
          expense_date:
            output.expense_date == null ? null : v.date(output.expense_date, 'Receipt date'),
          category: v.choice(output.category, categories, 'category'),
          description: v.text(output.description, 'Description', 200, false),
          warnings: output.warnings.map((warning) => v.text(warning, 'Warning', 300)),
        };
      });
      res.json({
        ...draft,
        receipt_sha256: receipt.sha256,
        expense_fingerprint: fingerprint(expense),
      });
    }),
  );

  app.post(
    '/api/expenses/:id/ai/receipt/apply',
    auth,
    route(async (req, res) => {
      if (req.body.currency !== 'USD')
        v.fail(
          400,
          'Only confirmed USD amounts can be applied. Currency conversion is not supported.',
        );
      const amount = v.money(req.body.amount, 'Amount', true);
      const date = v.date(req.body.expense_date, 'Expense date');
      const category = v.choice(req.body.category, categories, 'category');
      const description = v.text(req.body.description, 'Description', 200, false);
      await transaction(pool, async (c) => {
        const { trip, expense, receipt } = await receiptAccess(c, req, true);
        if (!['APPROVED', 'COMPLETED'].includes(trip.status))
          v.fail(409, 'Expenses can be recorded after a trip is approved.');
        if (
          req.body.receipt_sha256 !== receipt.sha256 ||
          req.body.expense_fingerprint !== fingerprint(expense)
        )
          v.fail(
            409,
            'This expense or receipt changed. Close this draft and scan the current receipt again.',
          );
        if (date < trip.start_date || date > trip.end_date)
          v.fail(400, 'Expense date must fall within the trip dates.');
        await c.query(
          'UPDATE expenses SET category=?,amount=?,expense_date=?,description=? WHERE expense_id=?',
          [category, amount, date, description, expense.expense_id],
        );
        await recordTripEvent(
          c,
          req,
          trip.trip_id,
          'AI_RECEIPT_APPLIED',
          null,
          null,
          `Reviewed receipt details for expense ${expense.expense_id}.`,
        );
      });
      res.json({ success: true });
    }),
  );
}

module.exports = { mountAi };
