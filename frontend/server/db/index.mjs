import fs from 'node:fs';
import pkg from 'pg';
import { executeMemoryQuery } from './memoryStore.mjs';

const { Pool, types } = pkg;

// DATE columns carry no time zone, but pg parses them as *local* midnight, which
// in IST is 18:30 the previous day in UTC -- so every
// `row.some_date.toISOString().split('T')[0]` in the routes, and every date in a
// JSON response, came out one day early. UTC midnight keeps the calendar date.
types.setTypeParser(types.builtins.DATE, (value) => new Date(`${value}T00:00:00Z`));

const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: parseInt(process.env.PGPORT || '5434', 10),
  database: process.env.PGDATABASE || 'hospai_enterprise',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  max: 10,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 1500,
});

let pgAvailable = false;
let hasCheckedPg = false;
let lastCheckTime = 0;

pool.on('error', (err) => {
  // Suppress uncaught pool error spam when running in offline/in-memory mode
  pgAvailable = false;
});

async function checkPgHealth() {
  const now = Date.now();
  if (hasCheckedPg && !pgAvailable && (now - lastCheckTime < 4000)) {
    return false;
  }
  lastCheckTime = now;
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    if (!pgAvailable) {
      console.log('[HospAI HRMS DB] Connected successfully to PostgreSQL on port 5434');
    }
    pgAvailable = true;
    hasCheckedPg = true;
  } catch (err) {
    if (!hasCheckedPg) {
      console.log('[HospAI HRMS DB] PostgreSQL port 5434 not reachable. Operating in resilient In-Memory Engine mode.');
    }
    pgAvailable = false;
    hasCheckedPg = true;
  }
  return pgAvailable;
}

// Initial probe
checkPgHealth().catch(() => {});

// The in-memory engine exists for one case: Postgres is unreachable. A query
// that reached the server and failed (missing column, CHECK violation, bad
// input) is a bug or a bad request. Answering that from memory used to hide the
// error, report a write as saved when it never reached the database, and flip
// every other request into memory mode with it.
const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENOTFOUND', 'EPIPE',
  '57P01', '57P02', '57P03', // admin/crash shutdown, cannot connect now
  '3D000', '28000', '28P01', // database missing, auth rejected
]);

function isConnectionError(err) {
  if (!err) return false;
  if (CONNECTION_ERROR_CODES.has(err.code)) return true;
  if (typeof err.code === 'string' && err.code.startsWith('08')) return true; // connection_exception class
  return /Connection terminated|timeout exceeded when trying to connect/i.test(err.message || '');
}

async function usePg() {
  if (!pgAvailable && Date.now() - lastCheckTime >= 4000) {
    await checkPgHealth().catch(() => {});
  }
  return pgAvailable || !hasCheckedPg;
}

export async function query(text, params) {
  if (!(await usePg())) {
    return executeMemoryQuery(text, params);
  }

  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    pgAvailable = true;
    const duration = Date.now() - start;
    if (duration > 500) {
      console.warn(`[Slow Query ${duration}ms]`, text);
    }
    return res;
  } catch (err) {
    if (!isConnectionError(err)) throw err;
    pgAvailable = false;
    return executeMemoryQuery(text, params);
  }
}

export async function withTransaction(callback) {
  const memoryClient = { query: (t, p) => executeMemoryQuery(t, p) };
  if (!(await usePg())) {
    return callback(memoryClient);
  }

  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    if (!isConnectionError(err)) throw err;
    pgAvailable = false;
    return callback(memoryClient);
  }

  // From here a failure is the transaction's own -- roll back and report it.
  // It must not be replayed against memory: that turned a rejected write (or a
  // plain "Employee not found") into a 200 for data that was never saved.
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// schema.sql is written to be re-runnable (CREATE ... IF NOT EXISTS, guarded
// seeds, ADD COLUMN IF NOT EXISTS), so applying it on every start keeps an
// existing database in step with the routes instead of relying on someone to
// re-load it by hand after each change -- which is how /api/hr/alerts ended up
// selecting columns that did not exist.
export async function ensureSchema() {
  if (!(await checkPgHealth())) return false;
  const sql = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
  try {
    await pool.query(sql);
    console.log('[HospAI HRMS DB] Schema is up to date');
    return true;
  } catch (err) {
    console.error('[HospAI HRMS DB] Applying schema.sql failed:', err.message);
    return false;
  }
}

export async function testConnection() {
  const res = await query('SELECT current_database(), current_user, version()');
  return res.rows[0];
}

export default {
  query,
  withTransaction,
  ensureSchema,
  testConnection,
  pool,
};

