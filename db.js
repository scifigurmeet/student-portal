'use strict';

/**
 * Data layer — zero external dependencies.
 *
 * Primary backend: SQLite via Node's built-in `node:sqlite` (stable on Node 24,
 * available on Node 22 with --experimental-sqlite). Passwords are hashed with
 * scrypt from `node:crypto`. All queries are parameterized (no SQL injection).
 *
 * Fallback backend: if `node:sqlite` is unavailable on the host (e.g. an older
 * Node on a serverless platform), we transparently fall back to an in-memory
 * store with the same interface. The demo therefore *always* runs, while still
 * using real SQLite wherever the runtime supports it.
 *
 * On Vercel the filesystem is read-only except for the ephemeral /tmp, so the
 * DB file lives there in production and in ./data locally.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');

// ---------- password hashing (scrypt) ----------

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [saltHex, hashHex] = stored.split(':');
  const hash = Buffer.from(hashHex, 'hex');
  const test = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 32);
  return hash.length === test.length && crypto.timingSafeEqual(hash, test);
}

// ---------- seed data ----------

const SEED = [
  { username: 'alice', password: 'Password123!', full_name: 'Alice Johnson', email: 'alice@college.edu', roll_no: 'CS2023-001', department: 'Computer Science', year: 2, phone: '555-0101', address: '12 Maple Street' },
  { username: 'bob',   password: 'Password123!', full_name: 'Bob Smith',     email: 'bob@college.edu',   roll_no: 'CS2023-002', department: 'Computer Science', year: 2, phone: '555-0102', address: '8 Oak Avenue' },
  { username: 'carol', password: 'Password123!', full_name: 'Carol Davis',   email: 'carol@college.edu', roll_no: 'EE2022-014', department: 'Electrical',       year: 3, phone: '555-0103', address: '44 Pine Road' },
  { username: 'dan',   password: 'Password123!', full_name: 'Dan Williams',  email: 'dan@college.edu',   roll_no: 'ME2024-007', department: 'Mechanical',       year: 1, phone: '555-0104', address: '90 Cedar Lane' },
  { username: 'eve',   password: 'Password123!', full_name: 'Eve Martinez',  email: 'eve@college.edu',   roll_no: 'CS2022-031', department: 'Computer Science', year: 3, phone: '555-0105', address: '5 Birch Court' },
];

// ---------- SQLite backend ----------

function createSqliteBackend() {
  const { DatabaseSync } = require('node:sqlite');

  const onVercel = !!process.env.VERCEL;
  const dataDir = onVercel ? '/tmp' : path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'portal.db');

  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      full_name     TEXT    NOT NULL,
      email         TEXT    NOT NULL,
      roll_no       TEXT    NOT NULL UNIQUE,
      department    TEXT    NOT NULL,
      year          INTEGER NOT NULL,
      phone         TEXT,
      address       TEXT,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const count = db.prepare('SELECT COUNT(*) AS c FROM students').get().c;
  if (count === 0) {
    const insert = db.prepare(`
      INSERT INTO students (username, password_hash, full_name, email, roll_no, department, year, phone, address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const s of SEED) {
      insert.run(s.username, hashPassword(s.password), s.full_name, s.email, s.roll_no, s.department, s.year, s.phone, s.address);
    }
    console.log(`[db] SQLite seeded ${SEED.length} students at ${dbPath} (password: Password123!)`);
  }

  return {
    kind: 'sqlite',
    findByUsername: (u) => db.prepare('SELECT * FROM students WHERE username = ?').get(u),
    findById: (id) => db.prepare('SELECT * FROM students WHERE id = ?').get(id),
    searchStudents: (term) => {
      const like = `%${term}%`;
      return db.prepare(
        `SELECT id, full_name, email, roll_no, department, year FROM students
          WHERE full_name LIKE ? OR roll_no LIKE ? OR department LIKE ? OR email LIKE ?
          ORDER BY full_name LIMIT 50`
      ).all(like, like, like, like);
    },
    listStudents: () =>
      db.prepare('SELECT id, full_name, email, roll_no, department, year FROM students ORDER BY full_name LIMIT 50').all(),
  };
}

// ---------- in-memory fallback backend ----------

function createMemoryBackend() {
  const rows = SEED.map((s, i) => ({
    id: i + 1,
    username: s.username,
    password_hash: hashPassword(s.password),
    full_name: s.full_name,
    email: s.email,
    roll_no: s.roll_no,
    department: s.department,
    year: s.year,
    phone: s.phone,
    address: s.address,
    created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
  }));

  const pick = (r) => ({ id: r.id, full_name: r.full_name, email: r.email, roll_no: r.roll_no, department: r.department, year: r.year });

  console.log(`[db] Using in-memory store (node:sqlite unavailable). Seeded ${rows.length} students.`);

  return {
    kind: 'memory',
    findByUsername: (u) => rows.find((r) => r.username === u),
    findById: (id) => rows.find((r) => r.id === Number(id)),
    searchStudents: (term) => {
      const t = term.toLowerCase();
      return rows
        .filter((r) =>
          [r.full_name, r.roll_no, r.department, r.email].some((f) => f.toLowerCase().includes(t)))
        .sort((a, b) => a.full_name.localeCompare(b.full_name))
        .slice(0, 50)
        .map(pick);
    },
    listStudents: () => rows.slice().sort((a, b) => a.full_name.localeCompare(b.full_name)).slice(0, 50).map(pick),
  };
}

// ---------- select backend ----------

let backend;
try {
  backend = createSqliteBackend();
} catch (err) {
  console.warn('[db] node:sqlite not usable:', err.message);
  backend = createMemoryBackend();
}

module.exports = {
  backend: backend.kind,
  verifyPassword,
  findByUsername: backend.findByUsername,
  findById: backend.findById,
  searchStudents: backend.searchStudents,
  listStudents: backend.listStudents,
};
