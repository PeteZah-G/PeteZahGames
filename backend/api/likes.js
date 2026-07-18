import { randomUUID } from 'crypto';
import db from '../db.js';

export async function likeHandler(req, res) {
  if (!req.session?.user) return res.status(401).json({ error: 'Unauthorized' });
  const { type, targetId } = req.body;
  if (!['changelog', 'feedback'].includes(type) || !targetId || typeof targetId !== 'string' || targetId.length > 80) {
    return res.status(400).json({ error: 'Invalid request' });
  }
  const existing = db
    .prepare('SELECT id FROM likes WHERE type = ? AND target_id = ? AND user_id = ?')
    .get(type, targetId, req.session.user.id);
  if (existing) {
    db.prepare('DELETE FROM likes WHERE id = ?').run(existing.id);
    const count = db.prepare('SELECT COUNT(*) as count FROM likes WHERE type = ? AND target_id = ?').get(type, targetId)?.count || 0;
    return res.json({ message: 'Unliked.', liked: false, count });
  }
  const id = randomUUID();
  db.prepare('INSERT INTO likes (id, type, target_id, user_id, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    type,
    targetId,
    req.session.user.id,
    Date.now()
  );
  const count = db.prepare('SELECT COUNT(*) as count FROM likes WHERE type = ? AND target_id = ?').get(type, targetId)?.count || 0;
  res.json({ message: 'Liked!', liked: true, count });
}

export async function getLikesHandler(req, res) {
  const { type, targetId } = req.query;
  if (!['changelog', 'feedback'].includes(type) || !targetId || typeof targetId !== 'string') {
    return res.status(400).json({ error: 'Invalid request' });
  }
  const count = db.prepare('SELECT COUNT(*) as count FROM likes WHERE type = ? AND target_id = ?').get(type, targetId)?.count || 0;
  const userLiked = req.session?.user
    ? !!db.prepare('SELECT id FROM likes WHERE type = ? AND target_id = ? AND user_id = ?').get(type, targetId, req.session.user.id)
    : false;
  res.json({ count, userLiked });
}
