const bcrypt = require('bcryptjs');
const v = require('./validation');
const { budgetSummary } = require('./budget');
const { receiptColumns } = require('./receipts');
const { itineraryInput } = require('./itinerary');

async function recordTripEvent(c, req, tripId, type, from = null, to = null, comment = '') {
  await c.query(
    `INSERT INTO trip_events (trip_id,actor_id,actor_name,actor_role,event_type,from_status,to_status,comment,created_at)
     VALUES (?,?,?,?,?,?,?,?,UTC_TIMESTAMP())`,
    [
      tripId,
      req.user.user_id,
      `${req.user.first_name} ${req.user.last_name}`,
      req.user.role,
      type,
      from,
      to,
      comment,
    ],
  );
}

function mountFeatures(
  app,
  pool,
  { auth, throttle, route, transaction, tripAccess, userFields, createSession, setSessionCookie },
) {
  app.put(
    '/api/profile',
    auth,
    route(async (req, res) => {
      if (['role', 'user_id', 'password', 'email'].some((key) => Object.hasOwn(req.body, key)))
        v.fail(400, 'Use profile fields only. Your email and role are managed separately.');
      const first = v.text(req.body.first_name, 'First name', 50);
      const last = v.text(req.body.last_name, 'Last name', 50);
      const phone = v.text(req.body.phone_number, 'Phone number', 20, false);
      const avatar = v.choice(
        req.body.avatar_key,
        ['initials', 'compass', 'plane', 'leaf', 'location'],
        'avatar',
      );
      const user = await transaction(pool, async (c) => {
        await c.query('SELECT user_id FROM users WHERE user_id=? FOR UPDATE', [req.user.user_id]);
        await c.query(
          'UPDATE users SET first_name=?,last_name=?,phone_number=?,avatar_key=? WHERE user_id=?',
          [first, last, phone, avatar, req.user.user_id],
        );
        const [[saved]] = await c.query(`SELECT ${userFields} FROM users WHERE user_id=?`, [
          req.user.user_id,
        ]);
        return saved;
      });
      res.json(user);
    }),
  );

  app.post(
    '/api/auth/change-password',
    auth,
    throttle,
    route(async (req, res) => {
      if (
        typeof req.body.current_password !== 'string' ||
        Buffer.byteLength(req.body.current_password) > 72
      )
        v.fail(400, 'Enter your current password.');
      const password = v.password(req.body.new_password);
      if (password !== req.body.confirm_password) v.fail(400, 'The new passwords do not match.');
      if (password === req.body.current_password) v.fail(400, 'Choose a different new password.');
      const token = await transaction(pool, async (c) => {
        const [[user]] = await c.query(
          'SELECT password_hash FROM users WHERE user_id=? FOR UPDATE',
          [req.user.user_id],
        );
        if (
          !user?.password_hash ||
          !(await bcrypt.compare(req.body.current_password, user.password_hash))
        )
          v.fail(403, 'The current password is incorrect.');
        await c.query('UPDATE users SET password_hash=? WHERE user_id=?', [
          await bcrypt.hash(password, 10),
          req.user.user_id,
        ]);
        await c.query('DELETE FROM auth_sessions WHERE user_id=?', [req.user.user_id]);
        return createSession(c, req.user.user_id);
      });
      setSessionCookie(res, token);
      res.json({ success: true });
    }),
  );

  app.get(
    '/api/trips/:id',
    auth,
    route(async (req, res) => {
      const detail = await transaction(pool, async (c) => {
        const trip = await tripAccess(c, req, v.id(req.params.id), true);
        const [[owner]] = await c.query(
          "SELECT CONCAT(first_name,' ',last_name) AS name FROM users WHERE user_id=?",
          [trip.user_id],
        );
        const [expenses] = await c.query(
          `SELECT e.*,${receiptColumns} FROM expenses e LEFT JOIN expense_receipts r ON r.expense_id=e.expense_id WHERE e.trip_id=? ORDER BY e.expense_date DESC,e.expense_id DESC`,
          [trip.trip_id],
        );
        const [reports] = await c.query(
          `SELECT r.*,CONCAT(u.first_name,' ',u.last_name) AS generated_by_name
        FROM reports r JOIN users u ON r.generated_by=u.user_id WHERE r.trip_id=? ORDER BY r.report_id DESC`,
          [trip.trip_id],
        );
        const [itinerary] = await c.query(
          "SELECT * FROM itinerary_items WHERE trip_id=? ORDER BY item_date,COALESCE(start_time,'99:99'),item_id",
          [trip.trip_id],
        );
        const [history] = await c.query(
          'SELECT * FROM trip_events WHERE trip_id=? ORDER BY event_id DESC',
          [trip.trip_id],
        );
        const spent =
          expenses.reduce((total, expense) => total + Math.round(expense.amount * 100), 0) / 100;
        return {
          trip: {
            ...trip,
            user_name: owner.name,
            spent,
            budget: budgetSummary(trip.estimated_budget, spent),
          },
          expenses,
          reports,
          itinerary,
          history,
        };
      });
      res.json(detail);
    }),
  );

  async function editableTrip(c, req) {
    const trip = await tripAccess(c, req, v.id(req.params.id), true);
    if (['COMPLETED', 'CANCELLED'].includes(trip.status))
      v.fail(409, 'This trip has a read-only itinerary.');
    return trip;
  }
  app.post(
    '/api/trips/:id/itinerary',
    auth,
    route(async (req, res) => {
      const result = await transaction(pool, async (c) => {
        const trip = await editableTrip(c, req);
        const fields = itineraryInput(req.body, trip);
        const [created] = await c.query(
          'INSERT INTO itinerary_items (trip_id,item_date,start_time,kind,title,location,notes) VALUES (?,?,?,?,?,?,?)',
          [trip.trip_id, ...fields],
        );
        await recordTripEvent(c, req, trip.trip_id, 'ITINERARY_CREATED', null, null, fields[3]);
        return { item_id: created.insertId };
      });
      res.status(201).json(result);
    }),
  );
  app.put(
    '/api/trips/:id/itinerary/:itemId',
    auth,
    route(async (req, res) => {
      await transaction(pool, async (c) => {
        const trip = await editableTrip(c, req);
        const itemId = v.id(req.params.itemId);
        const [[item]] = await c.query(
          'SELECT * FROM itinerary_items WHERE item_id=? AND trip_id=? FOR UPDATE',
          [itemId, trip.trip_id],
        );
        if (!item) v.fail(404, 'Itinerary item not found.');
        const fields = itineraryInput(req.body, trip);
        await c.query(
          'UPDATE itinerary_items SET item_date=?,start_time=?,kind=?,title=?,location=?,notes=? WHERE item_id=?',
          [...fields, itemId],
        );
        await recordTripEvent(c, req, trip.trip_id, 'ITINERARY_UPDATED', null, null, fields[3]);
      });
      res.json({ success: true });
    }),
  );
  app.delete(
    '/api/trips/:id/itinerary/:itemId',
    auth,
    route(async (req, res) => {
      await transaction(pool, async (c) => {
        const trip = await editableTrip(c, req);
        const itemId = v.id(req.params.itemId);
        const [[item]] = await c.query(
          'SELECT * FROM itinerary_items WHERE item_id=? AND trip_id=? FOR UPDATE',
          [itemId, trip.trip_id],
        );
        if (!item) v.fail(404, 'Itinerary item not found.');
        await c.query('DELETE FROM itinerary_items WHERE item_id=?', [itemId]);
        await recordTripEvent(c, req, trip.trip_id, 'ITINERARY_DELETED', null, null, item.title);
      });
      res.json({ success: true });
    }),
  );
}
module.exports = { mountFeatures, recordTripEvent };
