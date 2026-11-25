import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';

// Loaded via require so bundlers (Vitest) don't try to resolve the newer built-in.
const { DatabaseSync: Sqlite } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

export type DB = DatabaseSync;

export function openDb(file = process.env.DB_FILE ?? 'rate-setter.db'): DB {
  const db = new Sqlite(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      pw_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      seed TEXT NOT NULL,
      daily_date TEXT,
      score REAL NOT NULL,
      grade TEXT NOT NULL,
      quarters INTEGER NOT NULL,
      completed INTEGER NOT NULL,
      outcome TEXT NOT NULL,
      decisions TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, seed)
    );
    CREATE INDEX IF NOT EXISTS runs_score ON runs (score DESC);
    CREATE INDEX IF NOT EXISTS runs_daily ON runs (daily_date, score DESC);
  `);
  return db;
}
