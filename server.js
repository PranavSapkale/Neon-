require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const ANTHROPIC_MODEL = 'claude-3-5-haiku-latest';
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const clean = (value, max = 50000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const noteShape = note => ({ ...note, cards: db.prepare('SELECT * FROM cards WHERE note_id = ? ORDER BY id').all(note.id) });
function getNote(id) { return db.prepare('SELECT * FROM notes WHERE id = ?').get(Number(id)); }
function parseCards(raw) {
  const cards = [];
  const add = (front, back, source = 'auto') => {
    front = clean(front, 500); back = clean(back, 2000);
    if (front && back && !cards.some(c => c.front.toLowerCase() === front.toLowerCase())) cards.push({ front, back, source });
  };
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let m = lines[i].match(/^\s*(?:[-*]|\d+[.)])\s*([^:]+):\s*(.+)$/); if (m) add(m[1], m[2], 'definition');
    m = lines[i].match(/^\s*(?:[-*]|\d+[.)])\s*([^-\n]+?)\s+-\s+(.+)$/); if (m) add(m[1], m[2], 'definition');
    m = lines[i].match(/^\s*Q:\s*(.+)/i); if (m && lines[i + 1] && /^\s*A:/i.test(lines[i + 1])) add(m[1], lines[i + 1].replace(/^\s*A:\s*/i, ''), 'qa');
    m = lines[i].match(/\?\?\s*(.+?)\s*::\s*(.+)$/); if (m) add(m[1], m[2], 'manual');
    m = lines[i].match(/\*\*(.+?)\*\*/); if (m) add(`What is ${m[1]}?`, lines[i].replace(/\*\*/g, '').trim(), 'bold');
    m = lines[i].match(/^#{1,6}\s+(.+)/); if (m && lines[i + 1] && /^\s*[-*]\s+/.test(lines[i + 1])) add(m[1], lines[i + 1].replace(/^\s*[-*]\s+/, ''), 'heading');
  }
  return cards.slice(0, 100);
}
function saveCards(noteId, cards) {
  const existing = db.prepare('SELECT * FROM cards WHERE note_id = ?').all(noteId);
  const insert = db.prepare('INSERT INTO cards (note_id, front, back, source) VALUES (?, ?, ?, ?)');
  const tx = db.transaction(items => items.forEach(card => {
    const old = existing.find(c => c.front.toLowerCase() === card.front.toLowerCase());
    if (old) db.prepare('UPDATE cards SET back = ?, source = ? WHERE id = ?').run(card.back, card.source || old.source, old.id);
    else insert.run(noteId, card.front, card.back, card.source || 'auto');
  }));
  tx(cards);
}

app.get('/api/notes', (req, res) => res.json(db.prepare('SELECT * FROM notes ORDER BY updated_at DESC, id DESC').all()));
app.get('/api/notes/:id', (req, res) => {
  const note = getNote(req.params.id); if (!note) return res.status(404).json({ error: 'Note not found' });
  res.json(noteShape(note));
});
app.post('/api/notes', (req, res) => {
  try {
    const raw = clean(req.body.raw_text, 100000);
    const title = clean(req.body.title, 200) || raw.split('\n').find(Boolean)?.replace(/^#+\s*/, '').slice(0, 80) || 'UNTITLED NOTE';
    const info = db.prepare('INSERT INTO notes (title, raw_text) VALUES (?, ?)').run(title, raw);
    db.prepare('INSERT INTO versions (note_id, raw_text) VALUES (?, ?)').run(info.lastInsertRowid, raw);
    saveCards(info.lastInsertRowid, parseCards(raw));
    res.status(201).json(noteShape(getNote(info.lastInsertRowid)));
  } catch (e) { res.status(500).json({ error: 'Could not create note' }); }
});
app.put('/api/notes/:id', (req, res) => {
  try {
    const note = getNote(req.params.id); if (!note) return res.status(404).json({ error: 'Note not found' });
    const raw = clean(req.body.raw_text, 100000);
    const title = clean(req.body.title, 200) || raw.split('\n').find(Boolean)?.replace(/^#+\s*/, '').slice(0, 80) || note.title;
    db.prepare('INSERT INTO versions (note_id, raw_text) VALUES (?, ?)').run(note.id, note.raw_text);
    db.prepare("UPDATE notes SET title = ?, raw_text = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(title, raw, note.id);
    if (req.body.build) saveCards(note.id, parseCards(raw));
    res.json(noteShape(getNote(note.id)));
  } catch (e) { res.status(500).json({ error: 'Could not save note' }); }
});
app.delete('/api/notes/:id', (req, res) => {
  if (!getNote(req.params.id)) return res.status(404).json({ error: 'Note not found' });
  db.prepare('DELETE FROM notes WHERE id = ?').run(Number(req.params.id)); res.status(204).end();
});
app.post('/api/notes/:id/duplicate', (req, res) => {
  const note = getNote(req.params.id); if (!note) return res.status(404).json({ error: 'Note not found' });
  const info = db.prepare('INSERT INTO notes (title, raw_text) VALUES (?, ?)').run(`${note.title} COPY`, note.raw_text);
  db.prepare('INSERT INTO versions (note_id, raw_text) VALUES (?, ?)').run(info.lastInsertRowid, note.raw_text);
  saveCards(info.lastInsertRowid, db.prepare('SELECT front, back, source FROM cards WHERE note_id = ?').all(note.id));
  res.status(201).json(noteShape(getNote(info.lastInsertRowid)));
});
app.get('/api/notes/:id/versions', (req, res) => res.json(db.prepare('SELECT * FROM versions WHERE note_id = ? ORDER BY saved_at DESC, id DESC').all(Number(req.params.id))));
app.post('/api/notes/:id/restore/:versionId', (req, res) => {
  const version = db.prepare('SELECT * FROM versions WHERE id = ? AND note_id = ?').get(Number(req.params.versionId), Number(req.params.id));
  if (!version) return res.status(404).json({ error: 'Version not found' });
  db.prepare('UPDATE notes SET raw_text = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(version.raw_text, Number(req.params.id));
  res.json(noteShape(getNote(req.params.id)));
});
app.put('/api/cards/:id', (req, res) => {
  const front = clean(req.body.front, 500), back = clean(req.body.back, 2000);
  if (!front || !back) return res.status(400).json({ error: 'Front and back are required' });
  db.prepare('UPDATE cards SET front = ?, back = ? WHERE id = ?').run(front, back, Number(req.params.id));
  res.json(db.prepare('SELECT * FROM cards WHERE id = ?').get(Number(req.params.id)));
});
app.delete('/api/cards/:id', (req, res) => { db.prepare('DELETE FROM cards WHERE id = ?').run(Number(req.params.id)); res.status(204).end(); });
app.post('/api/notes/:id/cards', (req, res) => {
  const front = clean(req.body.front, 500), back = clean(req.body.back, 2000);
  if (!front || !back) return res.status(400).json({ error: 'Front and back are required' });
  const info = db.prepare("INSERT INTO cards (note_id, front, back, source) VALUES (?, ?, ?, 'manual')").run(Number(req.params.id), front, back);
  res.status(201).json(db.prepare('SELECT * FROM cards WHERE id = ?').get(info.lastInsertRowid));
});
app.post('/api/cards/:id/review', (req, res) => {
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(Number(req.params.id)); if (!card) return res.status(404).json({ error: 'Card not found' });
  const rating = ['hard', 'okay', 'easy'].includes(req.body.rating) ? req.body.rating : 'okay';
  const box = rating === 'hard' ? Math.max(1, card.box - 1) : rating === 'easy' ? Math.min(5, card.box + 1) : card.box;
  const days = rating === 'hard' ? 0 : rating === 'easy' ? box * 3 : box;
  db.prepare('UPDATE cards SET box = ?, due_at = datetime(?, ?), reviews = reviews + 1, correct = correct + ? WHERE id = ?').run(box, 'now', `+${days} days`, rating === 'hard' ? 0 : 1, card.id);
  res.json(db.prepare('SELECT * FROM cards WHERE id = ?').get(card.id));
});
app.put('/api/settings/:key', (req, res) => { db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(clean(req.params.key, 50), JSON.stringify(req.body.value)); res.json({ ok: true }); });
app.get('/api/settings', (req, res) => res.json(Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map(row => [row.key, JSON.parse(row.value)]))));
app.post('/api/notes/:id/ai-cards', async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'AI is offline: add ANTHROPIC_API_KEY to .env.' });
  const note = getNote(req.params.id); if (!note) return res.status(404).json({ error: 'Note not found' });
  try {
    const existing = db.prepare('SELECT front FROM cards WHERE note_id = ?').all(note.id).map(c => c.front).join('\n');
    const response = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 3000, messages: [{ role: 'user', content: `Return ONLY a JSON array of up to 20 objects with front and back strings. Create useful flashcards from these notes, avoid these existing fronts:\n${existing}\nNOTES:\n${note.raw_text}` }] }) });
    if (!response.ok) return res.status(response.status === 429 ? 429 : 502).json({ error: response.status === 429 ? 'AI rate limit reached. Try again soon.' : 'AI service did not respond.' });
    const data = await response.json(); const text = data.content?.map(x => x.text || '').join('') || '';
    const cards = JSON.parse(text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim());
    if (!Array.isArray(cards)) throw new Error('Invalid AI response');
    res.json(cards.filter(c => c && typeof c.front === 'string' && typeof c.back === 'string').slice(0, 20).map(c => ({ front: clean(c.front, 500), back: clean(c.back, 2000), source: 'ai' })));
  } catch (e) { res.status(502).json({ error: 'AI returned an unreadable response. Try again.' }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`NEON NOTES online at http://localhost:${PORT}`));
