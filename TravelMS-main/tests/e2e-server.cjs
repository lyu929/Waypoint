const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { databaseOptions, createPool } = require('../db');
const { migrate } = require('../backend/schema');
const { createApp } = require('../backend/app');
const { createTestAi } = require('./ai-fixtures.cjs');
const database = process.env.WAYPOINT_E2E_DB;
let admin,
  pool,
  server,
  created = false,
  stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  if (server) await new Promise((resolve) => server.close(resolve));
  if (pool) await pool.end();
  if (admin) {
    if (created) await admin.query('DROP DATABASE ??', [database]);
    await admin.end();
  }
}
async function main() {
  if (!/^waypoint_e2e_\d+_\d+$/.test(database || ''))
    throw new Error('E2E tests require an isolated database name.');
  const built = path.join(__dirname, '..', 'dist', 'Waypoint', 'browser');
  if (!fs.existsSync(path.join(built, 'index.html')))
    throw new Error('Build the frontend before running browser tests.');
  admin = await mysql.createConnection(databaseOptions(null));
  await admin.query('CREATE DATABASE ??', [database]);
  created = true;
  pool = createPool(database);
  await migrate(pool);
  const password = await bcrypt.hash('Waypoint2026!', 10);
  for (const [first, last, email, role] of [
    ['Test', 'Owner', 'owner@waypoint.local', 'ADMIN'],
    ['Test', 'Traveler', 'traveler@waypoint.local', 'USER'],
  ])
    await pool.query(
      'INSERT INTO users (first_name,last_name,email,role,password_hash) VALUES (?,?,?,?,?)',
      [first, last, email, role, password],
    );
  const app = createApp(pool, { rateLimit: false, ai: createTestAi() });
  app.use(express.static(built));
  app.get('*', (req, res) => res.sendFile(path.join(built, 'index.html')));
  server = app.listen(Number(process.env.WAYPOINT_E2E_PORT), '127.0.0.1', () =>
    console.log('Isolated Waypoint browser test server ready.'),
  );
  process.on('SIGINT', () => stop().then(() => process.exit(0)));
  process.on('SIGTERM', () => stop().then(() => process.exit(0)));
}
main().catch(async (error) => {
  console.error(error.message);
  await stop();
  process.exitCode = 1;
});
