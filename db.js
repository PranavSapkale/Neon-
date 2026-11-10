const Database = require('better-sqlite3');

const db = new Database('notes.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    raw_text TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    raw_text TEXT NOT NULL,
    saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'auto',
    box INTEGER NOT NULL DEFAULT 1,
    due_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviews INTEGER NOT NULL DEFAULT 0,
    correct INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

function seed() {
  if (db.prepare('SELECT COUNT(*) AS count FROM notes').get().count) return;
  const raw = `# NEON FIELD MANUAL

1. Mission:
- Build a resilient knowledge system.
- Ship small, learn fast.

Important: This sample demonstrates every parser primitive.
Note: Edit this note and click Build Page to create your own neon document.
Remember: spaced repetition beats rereading.
Tip: Use ?? question :: answer for manual cards.
Warning: Never expose API keys in the browser.

## Definitions
Latency: The time between a request and its response.
Leitner - A box-based spaced repetition method.

Q: What powers this app?
A: Node.js, Express, SQLite, and vanilla JavaScript.

| Signal | Meaning |
| --- | --- |
| CYAN | Focus |
| MAGENTA | Creativity |

\`\`\`js
const signal = "NEON";
console.log(signal);
\`\`\`

**Ship date** is 2026-12-01. ?? What is the primary rule? :: Keep learning loops short.`;
  const info = db.prepare('INSERT INTO notes (title, raw_text) VALUES (?, ?)').run('NEON FIELD MANUAL', raw);
  db.prepare('INSERT INTO versions (note_id, raw_text) VALUES (?, ?)').run(info.lastInsertRowid, raw);
}
seed();

module.exports = db;
