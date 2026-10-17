const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const v = require('./validation');
const { budgetSummary } = require('./budget');
const { mountFeatures, recordTripEvent } = require('./features');
const { mountReceipts, receiptColumns } = require('./receipts');
const { reportPdf } = require('./report-pdf');
const { mountAi } = require('./ai');

const COOKIE = 'waypoint_session';
const USER_FIELDS =
  'user_id, first_name, last_name, email, role, phone_number, avatar_key, created_at';
const CATEGORIES = ['FLIGHT', 'LODGING', 'FOOD', 'TRANSPORT', 'OTHER'];
const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');
const tokenFrom = (req) =>
  (req.headers.cookie || '')
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(COOKIE + '='))
    ?.slice(COOKIE.length + 1);
const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

async function transaction(pool, work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function createApp(pool, options = {}) {
  const app = express();
  app.disable('x-powered-by');
  const origins = new Set([
    'http://localhost:4200',
    'http://127.0.0.1:4200',
    `http://localhost:${process.env.PORT || 3000}`,
    `http://127.0.0.1:${process.env.PORT || 3000}`,
    ...(process.env.FRONTEND_ORIGIN ? [process.env.FRONTEND_ORIGIN] : []),
  ]);
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin || origins.has(origin)) callback(null, true);
        else callback(new v.HttpError(403, 'This origin is not allowed.'));
      },
    }),
  );
  app.post('/api/trips/:id/itinerary/import', express.json({ limit: '512kb' }));
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', (req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
    });
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      (req.get('sec-fetch-site') === 'cross-site' ||
        (req.get('origin') && !origins.has(req.get('origin'))))
    ) {
      return next(new v.HttpError(403, 'Cross-site requests are not allowed.'));
    }
    next();
  });
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/api',
  };
  const attempts = new Map();
  const throttle = (req, res, next) => {
    if (options.rateLimit === false) return next();
    const now = Date.now(),
      key = req.ip + req.path;
    const entry = attempts.get(key);
    const current = !entry || entry.until < now ? { count: 0, until: now + 15 * 60 * 1000 } : entry;
    current.count++;
    attempts.set(key, current);
    if (attempts.size > 1000) for (const [k, e] of attempts) if (e.until < now) attempts.delete(k);
    if (current.count > 20)
      return next(new v.HttpError(429, 'Too many attempts. Try again in 15 minutes.'));
    next();
  };
  async function createSession(c, userId) {
    const token = crypto.randomBytes(32).toString('hex');
    await c.query('DELETE FROM auth_sessions WHERE expires_at <= NOW()');
    await c.query(
      'INSERT INTO auth_sessions (token_hash,user_id,expires_at) VALUES (?,?,DATE_ADD(NOW(), INTERVAL 7 DAY))',
      [hash(token), userId],
    );
    return token;
  }
  function setSessionCookie(res, token) {
    res.cookie(COOKIE, token, { ...cookieOptions, maxAge: 7 * 86400 * 1000 });
  }
  async function session(res, userId) {
    setSessionCookie(res, await createSession(pool, userId));
  }
  const auth = (req, res, next) =>
    Promise.resolve(authenticateCheck(req, res)).then(() => next(), next);
  async function authenticateCheck(req, res) {
    const token = tokenFrom(req);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) v.fail(401, 'Please sign in to continue.');
    const [[user]] = await pool.query(
      `SELECT ${USER_FIELDS.split(', ')
        .map((f) => 'u.' + f)
        .join(', ')}
      FROM auth_sessions s JOIN users u ON u.user_id=s.user_id WHERE s.token_hash=? AND s.expires_at>NOW()`,
      [hash(token)],
    );
    if (!user) {
      res.clearCookie(COOKIE, cookieOptions);
      v.fail(401, 'Your session has expired. Please sign in again.');
    }
    req.user = user;
  }
  const admin = (req, res, next) =>
    req.user.role === 'ADMIN'
      ? next()
      : next(new v.HttpError(403, 'Administrator access is required.'));
  const isAdmin = (req) => req.user.role === 'ADMIN';
  function userInput(body, withPassword = true) {
    return {
      first_name: v.text(body.first_name, 'First name', 50),
      last_name: v.text(body.last_name, 'Last name', 50),
      email: v.email(body.email),
      phone_number: v.text(body.phone_number, 'Phone number', 20, false),
      ...(withPassword ? { password: v.password(body.password) } : {}),
    };
  }
  async function insertUser(body, role) {
    const u = userInput(body);
    const passwordHash = await bcrypt.hash(u.password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (first_name,last_name,email,phone_number,password_hash,role) VALUES (?,?,?,?,?,?)',
      [u.first_name, u.last_name, u.email, u.phone_number, passwordHash, role],
    );
    const [[user]] = await pool.query(`SELECT ${USER_FIELDS} FROM users WHERE user_id=?`, [
      result.insertId,
    ]);
    return user;
  }
  app.get(
    '/api/health',
    route(async (req, res) => {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', app: 'Waypoint' });
    }),
  );
  app.post(
    '/api/auth/register',
    throttle,
    route(async (req, res) => {
      if (req.body.role && req.body.role !== 'USER')
        v.fail(403, 'Public registration only creates traveler accounts.');
      const user = await insertUser(req.body, 'USER');
      await session(res, user.user_id);
      res.status(201).json(user);
    }),
  );
  const dummyHash = bcrypt.hashSync('invalid-account-placeholder', 10);
  app.post(
    '/api/auth/login',
    throttle,
    route(async (req, res) => {
      const email = v.email(req.body.email);
      if (
        typeof req.body.password !== 'string' ||
        !req.body.password ||
        Buffer.byteLength(req.body.password) > 72
      )
        v.fail(400, 'Enter your password.');
      const { user, token } = await transaction(pool, async (c) => {
        const [[user]] = await c.query('SELECT * FROM users WHERE email=? FOR UPDATE', [email]);
        const valid = await bcrypt.compare(req.body.password, user?.password_hash || dummyHash);
        if (!user?.password_hash || !valid) v.fail(401, 'The email or password is incorrect.');
        return { user, token: await createSession(c, user.user_id) };
      });
      setSessionCookie(res, token);
      const { password_hash, ...safe } = user;
      res.json(safe);
    }),
  );
  app.get('/api/auth/me', auth, (req, res) => res.json(req.user));
  app.post(
    '/api/auth/logout',
    auth,
    route(async (req, res) => {
      await pool.query('DELETE FROM auth_sessions WHERE token_hash=?', [hash(tokenFrom(req))]);
      res.clearCookie(COOKIE, cookieOptions);
      res.json({ success: true });
    }),
  );

  app.get(
    '/api/users',
    auth,
    admin,
    route(async (req, res) => {
      const [rows] = await pool.query(`SELECT ${USER_FIELDS} FROM users ORDER BY user_id`);
      res.json(rows);
    }),
  );
  app.post(
    '/api/users',
    auth,
    admin,
    route(async (req, res) => {
      res
        .status(201)
        .json(await insertUser(req.body, v.choice(req.body.role, ['ADMIN', 'USER'], 'role')));
    }),
  );
  app.put(
    '/api/users/:id',
    auth,
    admin,
    route(async (req, res) => {
      const userId = v.id(req.params.id),
        u = userInput(req.body, false);
      const role = v.choice(req.body.role, ['USER', 'ADMIN'], 'role');
      if (userId === req.user.user_id && role !== 'ADMIN')
        v.fail(409, 'You cannot remove your own administrator access.');
      const passwordHash = req.body.password
        ? await bcrypt.hash(v.password(req.body.password), 10)
        : null;
      await transaction(pool, async (c) => {
        const [[user]] = await c.query('SELECT * FROM users WHERE user_id=? FOR UPDATE', [userId]);
        if (!user) v.fail(404, 'User not found.');
        await c.query(
          'UPDATE users SET first_name=?,last_name=?,email=?,phone_number=?,role=?,password_hash=COALESCE(?,password_hash) WHERE user_id=?',
          [u.first_name, u.last_name, u.email, u.phone_number, role, passwordHash, userId],
        );
        if (passwordHash || user.role !== role)
          await c.query('DELETE FROM auth_sessions WHERE user_id=?', [userId]);
      });
      res.json({ success: true });
    }),
  );
  app.delete(
    '/api/users/:id',
    auth,
    admin,
    route(async (req, res) => {
      const userId = v.id(req.params.id);
      if (userId === req.user.user_id) v.fail(409, 'You cannot delete your own account.');
      await transaction(pool, async (c) => {
        const [[user]] = await c.query('SELECT user_id FROM users WHERE user_id=? FOR UPDATE', [
          userId,
        ]);
        if (!user) v.fail(404, 'User not found.');
        await c.query('DELETE FROM reports WHERE owner_id=?', [userId]);
        await c.query('DELETE FROM users WHERE user_id=?', [userId]);
      });
      res.json({ success: true });
    }),
  );

  async function tripAccess(c, req, tripId, lock = false) {
    const [[trip]] = await c.query(
      'SELECT * FROM trips WHERE trip_id=?' + (lock ? ' FOR UPDATE' : ''),
      [tripId],
    );
    if (!trip) v.fail(404, 'Trip not found.');
    if (!isAdmin(req) && trip.user_id !== req.user.user_id)
      v.fail(403, 'This trip belongs to another traveler.');
    return trip;
  }
  function tripInput(body) {
    const start = v.date(body.start_date, 'Start date'),
      end = v.date(body.end_date, 'End date');
    if (end < start) v.fail(400, 'End date must be on or after start date.');
    return {
      destination: v.text(body.destination, 'Destination', 100),
      start,
      end,
      purpose: v.text(body.purpose, 'Purpose', 200, false),
      budget: v.money(body.estimated_budget, 'Budget'),
    };
  }
  app.get(
    '/api/trips',
    auth,
    route(async (req, res) => {
      const filter = req.query.user_id ? v.id(req.query.user_id, 'traveler') : null;
      if (!isAdmin(req) && filter && filter !== req.user.user_id)
        v.fail(403, 'You can only view your own trips.');
      const userId = isAdmin(req) ? filter : req.user.user_id;
      const [rows] = await pool.query(
        `SELECT t.*, CONCAT(u.first_name,' ',u.last_name) AS user_name,
      COALESCE((SELECT SUM(amount) FROM expenses e WHERE e.trip_id=t.trip_id),0) AS spent
      FROM trips t JOIN users u ON t.user_id=u.user_id ${userId ? 'WHERE t.user_id=?' : ''} ORDER BY t.start_date DESC,t.trip_id DESC`,
        userId ? [userId] : [],
      );
      res.json(
        rows.map((trip) => ({ ...trip, budget: budgetSummary(trip.estimated_budget, trip.spent) })),
      );
    }),
  );
  app.post(
    '/api/trips',
    auth,
    route(async (req, res) => {
      const t = tripInput(req.body);
      const owner =
        isAdmin(req) && req.body.user_id ? v.id(req.body.user_id, 'traveler') : req.user.user_id;
      if (!isAdmin(req) && req.body.user_id && Number(req.body.user_id) !== owner)
        v.fail(403, 'You can only create your own trips.');
      if (req.body.status && req.body.status !== 'PLANNED')
        v.fail(403, 'New trips must be submitted for approval.');
      const [[user]] = await pool.query('SELECT user_id FROM users WHERE user_id=?', [owner]);
      if (!user) v.fail(404, 'Traveler not found.');
      const result = await transaction(pool, async (c) => {
        const [created] = await c.query(
          "INSERT INTO trips (user_id,destination,start_date,end_date,purpose,estimated_budget,status) VALUES (?,?,?,?,?,?,'PLANNED')",
          [owner, t.destination, t.start, t.end, t.purpose, t.budget],
        );
        await recordTripEvent(c, req, created.insertId, 'CREATED', null, 'PLANNED');
        return created;
      });
      res.status(201).json({ trip_id: result.insertId, user_id: owner, status: 'PLANNED' });
    }),
  );
  app.put(
    '/api/trips/:id',
    auth,
    route(async (req, res) => {
      const t = tripInput(req.body);
      await transaction(pool, async (c) => {
        const trip = await tripAccess(c, req, v.id(req.params.id), true);
        if (!isAdmin(req) && !['PLANNED', 'REJECTED'].includes(trip.status))
          v.fail(403, 'Only pending or rejected trips can be edited.');
        if (req.body.user_id && Number(req.body.user_id) !== trip.user_id)
          v.fail(400, 'A trip cannot be transferred to another traveler.');
        if (req.body.status && ![trip.status, 'PLANNED'].includes(req.body.status))
          v.fail(403, 'Use the approval action to change trip status.');
        const [[outside]] = await c.query(
          'SELECT COUNT(*) AS total FROM expenses WHERE trip_id=? AND (expense_date<? OR expense_date>?)',
          [trip.trip_id, t.start, t.end],
        );
        if (outside.total) v.fail(409, 'The new dates would exclude an existing expense.');
        const [[outsidePlan]] = await c.query(
          'SELECT COUNT(*) AS total FROM itinerary_items WHERE trip_id=? AND (item_date<? OR item_date>?)',
          [trip.trip_id, t.start, t.end],
        );
        if (outsidePlan.total) v.fail(409, 'The new dates would exclude an itinerary item.');
        const status = isAdmin(req) ? trip.status : 'PLANNED';
        await c.query(
          'UPDATE trips SET destination=?,start_date=?,end_date=?,purpose=?,estimated_budget=?,status=? WHERE trip_id=?',
          [t.destination, t.start, t.end, t.purpose, t.budget, status, trip.trip_id],
        );
        await recordTripEvent(
          c,
          req,
          trip.trip_id,
          trip.status === 'REJECTED' && status === 'PLANNED' ? 'RESUBMITTED' : 'UPDATED',
          trip.status,
          status,
        );
      });
      res.json({ success: true });
    }),
  );
  app.patch(
    '/api/trips/:id/status',
    auth,
    admin,
    route(async (req, res) => {
      const status = v.choice(
        req.body.status,
        ['PLANNED', 'APPROVED', 'REJECTED', 'COMPLETED'],
        'trip status',
      );
      const comment = v.text(req.body.comment, 'Review comment', 1000, status === 'REJECTED');
      await transaction(pool, async (c) => {
        const trip = await tripAccess(c, req, v.id(req.params.id), true);
        const transitions = {
          PLANNED: ['APPROVED', 'REJECTED'],
          REJECTED: ['PLANNED'],
          APPROVED: ['COMPLETED'],
          COMPLETED: [],
        };
        if (!(transitions[trip.status] || []).includes(status))
          v.fail(409, 'This status change is not available for the trip.');
        await c.query('UPDATE trips SET status=? WHERE trip_id=?', [status, trip.trip_id]);
        await recordTripEvent(c, req, trip.trip_id, 'STATUS_CHANGED', trip.status, status, comment);
      });
      res.json({ success: true });
    }),
  );
  app.delete(
    '/api/trips/:id',
    auth,
    route(async (req, res) => {
      await transaction(pool, async (c) => {
        const trip = await tripAccess(c, req, v.id(req.params.id), true);
        if (!isAdmin(req) && !['PLANNED', 'REJECTED'].includes(trip.status))
          v.fail(403, 'Only pending or rejected trips can be deleted.');
        const [[reports]] = await c.query('SELECT COUNT(*) AS total FROM reports WHERE trip_id=?', [
          trip.trip_id,
        ]);
        if (reports.total) v.fail(409, 'Delete the trip reports before deleting this trip.');
        await c.query('DELETE FROM trips WHERE trip_id=?', [trip.trip_id]);
      });
      res.json({ success: true });
    }),
  );

  app.get(
    '/api/expenses',
    auth,
    route(async (req, res) => {
      const [rows] = await pool.query(
        `SELECT e.*,${receiptColumns},t.destination,CONCAT(u.first_name,' ',u.last_name) AS user_name
      FROM expenses e JOIN trips t ON e.trip_id=t.trip_id JOIN users u ON t.user_id=u.user_id
      LEFT JOIN expense_receipts r ON r.expense_id=e.expense_id
      ${isAdmin(req) ? '' : 'WHERE t.user_id=?'} ORDER BY e.expense_date DESC,e.expense_id DESC`,
        isAdmin(req) ? [] : [req.user.user_id],
      );
      res.json(rows);
    }),
  );
  async function saveExpense(req, expenseId) {
    const b = req.body,
      amount = v.money(b.amount, 'Amount', true),
      date = v.date(b.expense_date, 'Expense date');
    const category = v.choice(b.category, CATEGORIES, 'category'),
      description = v.text(b.description, 'Description', 200, false),
      receipt = v.receipt(b.receipt_url);
    return transaction(pool, async (c) => {
      if (expenseId) {
        const [[old]] = await c.query('SELECT * FROM expenses WHERE expense_id=? FOR UPDATE', [
          expenseId,
        ]);
        if (!old) v.fail(404, 'Expense not found.');
        await tripAccess(c, req, old.trip_id, true);
      }
      const trip = await tripAccess(c, req, v.id(b.trip_id, 'trip'), true);
      if (!['APPROVED', 'COMPLETED'].includes(trip.status))
        v.fail(409, 'Expenses can be recorded after a trip is approved.');
      if (b.user_id && Number(b.user_id) !== trip.user_id)
        v.fail(400, 'Expense owner must match the trip traveler.');
      if (date < trip.start_date || date > trip.end_date)
        v.fail(400, 'Expense date must fall within the trip dates.');
      if (expenseId) {
        await c.query(
          'UPDATE expenses SET trip_id=?,user_id=?,category=?,amount=?,expense_date=?,description=?,receipt_url=? WHERE expense_id=?',
          [trip.trip_id, trip.user_id, category, amount, date, description, receipt, expenseId],
        );
        return { expense_id: expenseId };
      }
      const [result] = await c.query(
        'INSERT INTO expenses (trip_id,user_id,category,amount,expense_date,description,receipt_url) VALUES (?,?,?,?,?,?,?)',
        [trip.trip_id, trip.user_id, category, amount, date, description, receipt],
      );
      return { expense_id: result.insertId };
    });
  }
  app.post(
    '/api/expenses',
    auth,
    route(async (req, res) => res.status(201).json(await saveExpense(req))),
  );
  app.put(
    '/api/expenses/:id',
    auth,
    route(async (req, res) => res.json(await saveExpense(req, v.id(req.params.id)))),
  );
  app.delete(
    '/api/expenses/:id',
    auth,
    route(async (req, res) => {
      await transaction(pool, async (c) => {
        const expenseId = v.id(req.params.id);
        const [[expense]] = await c.query('SELECT * FROM expenses WHERE expense_id=? FOR UPDATE', [
          expenseId,
        ]);
        if (!expense) v.fail(404, 'Expense not found.');
        await tripAccess(c, req, expense.trip_id, true);
        await c.query('DELETE FROM expenses WHERE expense_id=?', [expenseId]);
      });
      res.json({ success: true });
    }),
  );

  app.get(
    '/api/reports',
    auth,
    route(async (req, res) => {
      const [rows] = await pool.query(
        `SELECT r.*,t.destination,CONCAT(u.first_name,' ',u.last_name) AS generated_by_name
      FROM reports r LEFT JOIN trips t ON r.trip_id=t.trip_id JOIN users u ON r.generated_by=u.user_id
      ${isAdmin(req) ? '' : 'WHERE r.owner_id=?'} ORDER BY r.generated_at DESC,r.report_id DESC`,
        isAdmin(req) ? [] : [req.user.user_id],
      );
      res.json(rows);
    }),
  );
  app.post(
    '/api/reports',
    auth,
    route(async (req, res) => {
      if (req.body.generated_by && Number(req.body.generated_by) !== req.user.user_id)
        v.fail(403, 'Reports are generated using your signed-in identity.');
      const result = await transaction(pool, async (c) => {
        const trip = await tripAccess(c, req, v.id(req.body.trip_id, 'trip'), true);
        if (!['APPROVED', 'COMPLETED'].includes(trip.status))
          v.fail(409, 'Generate a report after the trip is approved.');
        const [expenses] = await c.query(
          `SELECT e.*,${receiptColumns} FROM expenses e LEFT JOIN expense_receipts r ON r.expense_id=e.expense_id WHERE e.trip_id=? ORDER BY e.expense_date,e.expense_id`,
          [trip.trip_id],
        );
        const total = expenses.reduce((sum, e) => sum + Math.round(e.amount * 100), 0) / 100;
        const [reviews] = await c.query(
          "SELECT actor_name,to_status,comment,created_at FROM trip_events WHERE trip_id=? AND event_type='STATUS_CHANGED' ORDER BY event_id",
          [trip.trip_id],
        );
        const snapshot = JSON.stringify({ trip, expenses, reviews, currency: 'USD' });
        const [insert] = await c.query(
          "INSERT INTO reports (trip_id,generated_by,owner_id,total_expenses,report_status,snapshot) VALUES (?,?,?,?,'GENERATED',?)",
          [trip.trip_id, req.user.user_id, trip.user_id, total, snapshot],
        );
        return { report_id: insert.insertId, total_expenses: total, report_status: 'GENERATED' };
      });
      res.status(201).json(result);
    }),
  );
  async function reportAccess(c, req, reportId, lock = false) {
    const [[report]] = await c.query(
      'SELECT * FROM reports WHERE report_id=?' + (lock ? ' FOR UPDATE' : ''),
      [reportId],
    );
    if (!report) v.fail(404, 'Report not found.');
    if (!isAdmin(req) && report.owner_id !== req.user.user_id)
      v.fail(403, 'This report belongs to another traveler.');
    return report;
  }
  app.patch(
    '/api/reports/:id/status',
    auth,
    route(async (req, res) => {
      await transaction(pool, async (c) => {
        const report = await reportAccess(c, req, v.id(req.params.id), true);
        const status = v.choice(req.body.status, ['SUBMITTED', 'APPROVED'], 'report status');
        if (status === 'APPROVED' && !isAdmin(req))
          v.fail(403, 'Only administrators can approve reports.');
        if (
          (status === 'SUBMITTED' && report.report_status !== 'GENERATED') ||
          (status === 'APPROVED' && report.report_status !== 'SUBMITTED')
        )
          v.fail(409, 'This report status change is not available.');
        await c.query(
          "UPDATE reports SET report_status=?,approved_at=IF(?='APPROVED',NOW(),NULL) WHERE report_id=?",
          [status, status, report.report_id],
        );
      });
      res.json({ success: true });
    }),
  );
  app.get(
    '/api/reports/:id/pdf',
    auth,
    route(async (req, res) => {
      const report = await reportAccess(pool, req, v.id(req.params.id));
      const snapshot =
        typeof report.snapshot === 'string' ? JSON.parse(report.snapshot) : report.snapshot;
      const pdf = await reportPdf(report, snapshot, snapshot?.reviews || []);
      res.type('application/pdf').attachment(`waypoint-report-${report.report_id}.pdf`).send(pdf);
    }),
  );
  app.get(
    '/api/reports/:id/export',
    auth,
    route(async (req, res) => {
      const report = await reportAccess(pool, req, v.id(req.params.id));
      const snapshot =
        typeof report.snapshot === 'string' ? JSON.parse(report.snapshot) : report.snapshot;
      const cell = (value) => {
        let string = String(value ?? '');
        if (/^[\s]*[=+@-]/.test(string)) string = "'" + string;
        return '"' + string.replace(/"/g, '""') + '"';
      };
      const rows = [
        ['Waypoint expense report', report.report_id],
        ['Destination', snapshot?.trip?.destination || 'Archived trip'],
        ['Generated at', report.generated_at],
        ['Status', report.report_status],
        [],
        ['Date', 'Category', 'Description', 'Amount (USD)', 'Receipt URL'],
        ...(snapshot?.expenses || []).map((e) => [
          e.expense_date,
          e.category,
          e.description,
          Number(e.amount).toFixed(2),
          e.receipt_url,
        ]),
        [],
        ['Total expenses (USD)', Number(report.total_expenses).toFixed(2)],
      ];
      res
        .type('text/csv')
        .attachment(`waypoint-report-${report.report_id}.csv`)
        .send('\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n'));
    }),
  );
  app.delete(
    '/api/reports/:id',
    auth,
    route(async (req, res) => {
      await transaction(pool, async (c) => {
        const report = await reportAccess(c, req, v.id(req.params.id), true);
        if (!isAdmin(req) && report.report_status !== 'GENERATED')
          v.fail(403, 'Only draft reports can be deleted by travelers.');
        await c.query('DELETE FROM reports WHERE report_id=?', [report.report_id]);
      });
      res.json({ success: true });
    }),
  );
  mountFeatures(app, pool, {
    auth,
    throttle,
    route,
    transaction,
    tripAccess,
    userFields: USER_FIELDS,
    createSession,
    setSessionCookie,
  });
  mountReceipts(app, pool, { auth, route, transaction, tripAccess });
  mountAi(app, pool, {
    auth,
    route,
    transaction,
    tripAccess,
    ai: options.ai,
    rateLimit: options.rateLimit !== false,
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
  app.use((error, req, res, next) => {
    if (error.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'An account with this email already exists.' });
    if (error.code === 'ER_NO_REFERENCED_ROW_2')
      return res.status(400).json({ error: 'The selected related record does not exist.' });
    if (error.type === 'entity.parse.failed')
      return res.status(400).json({ error: 'The request must contain valid JSON.' });
    if (error.type === 'entity.too.large')
      return res.status(413).json({ error: 'The request is too large.' });
    if (error.status) return res.status(error.status).json({ error: error.message });
    if (options.logErrors !== false)
      console.error('Waypoint request failed:', error.code || error.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });
  return app;
}
module.exports = { createApp, transaction };
