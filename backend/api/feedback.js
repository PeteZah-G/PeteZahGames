import { randomUUID } from 'crypto';
import db from '../db.js';
import { displayUsername, sanitizeTextContent } from '../utils/sanitize.js';
import { isOwnerEmail } from '../utils/auth-roles.js';

const PAGE_SIZE = 20;

function mapFeedbackEntry(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    content: row.content,
    created_at: row.created_at,
    username: displayUsername(row.username, row.email),
  };
}

export async function getFeedbackHandler(req, res) {
  if (!req.session?.user) return res.status(401).json({ error: 'Unauthorized' });
  const user = db.prepare('SELECT is_admin, email FROM users WHERE id = ?').get(req.session.user.id);
  const owner = user && isOwnerEmail(user.email);
  if (owner && user.is_admin < 3) {
    db.prepare('UPDATE users SET is_admin = 3 WHERE id = ?').run(req.session.user.id);
  }
  const isAdmin = !!(user && (user.is_admin >= 1 || owner));
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  // non-admins only ever see their own submissions, not everyone's
  const { c: total } = isAdmin
    ? db.prepare('SELECT COUNT(*) as c FROM feedback').get()
    : db.prepare('SELECT COUNT(*) as c FROM feedback WHERE user_id = ?').get(req.session.user.id);
  const rows = isAdmin
    ? db.prepare(`
        SELECT f.id, f.user_id, f.content, f.created_at, u.username, u.email
        FROM feedback f
        LEFT JOIN users u ON f.user_id = u.id
        ORDER BY f.created_at DESC
        LIMIT ? OFFSET ?
      `).all(PAGE_SIZE, offset)
    : db.prepare(`
        SELECT f.id, f.user_id, f.content, f.created_at, u.username, u.email
        FROM feedback f
        LEFT JOIN users u ON f.user_id = u.id
        WHERE f.user_id = ?
        ORDER BY f.created_at DESC
        LIMIT ? OFFSET ?
      `).all(req.session.user.id, PAGE_SIZE, offset);

  res.json({
    entries: rows.map(mapFeedbackEntry),
    isAdmin,
    page,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    total,
  });
}

export async function createFeedbackHandler(req, res) {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const content = sanitizeTextContent(req.body?.content);
  if (!content || content.length > 2000) return res.status(400).json({ error: 'Invalid content' });
  const id = randomUUID();
  const now = Date.now();
  db.prepare('INSERT INTO feedback (id, user_id, content, created_at) VALUES (?, ?, ?, ?)').run(id, req.session.user.id, content, now);
  const author = db.prepare('SELECT username, email FROM users WHERE id = ?').get(req.session.user.id);
  res.status(201).json({
    message: 'Feedback submitted',
    id,
    entry: mapFeedbackEntry({
      id,
      user_id: req.session.user.id,
      content,
      created_at: now,
      username: author?.username,
      email: author?.email,
    }),
  });
}

export async function deleteFeedbackHandler(req, res) {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const { id } = req.params;
  const entry = db.prepare('SELECT * FROM feedback WHERE id = ?').get(id);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.session.user.id);
  const isAdmin = user && user.is_admin >= 1;
  if (entry.user_id !== req.session.user.id && !isAdmin) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM feedback WHERE id = ?').run(id);
  res.json({ message: 'Deleted' });
}
