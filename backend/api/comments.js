import { randomUUID } from 'crypto';
import db from '../db.js';
import { sanitizeUsername } from '../utils/sanitize.js';

function sanitizeContent(content) {
  if (typeof content !== 'string') return '';
  let cleaned = content;
  cleaned = cleaned.replace(/\\u[\dA-F]{4}/gi, (match) => String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16)));
  cleaned = cleaned.replace(/&#x?[0-9a-f]+;?/gi, '');
  cleaned = cleaned.replace(/\x00/g, '');
  cleaned = cleaned.replace(/\\/g, '');
  return cleaned
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

function validateContent(content) {
  if (!content || typeof content !== 'string') return false;
  if (content.length < 1 || content.length > 10000) return false;
  const banned = [/\bnigg\w*\b/i, /\bcunt\b/i, /\bchink\b/i, /\bfag\w*\b/i, /\btrann\w*\b/i, /\bspic\b/i, /\bslut\b/i, /\bwhore\b/i, /\bretard\b/i];
  if (banned.some((r) => r.test(content))) return false;
  const dangerousPatterns = [/<script/i, /javascript:/i, /on\w+\s*=/i, /<iframe/i, /<object/i, /<embed/i, /<img/i, /<svg/i, /<link/i, /<style/i, /data:/i, /vbscript:/i, /\.innerHTML/i, /document\./i, /window\./i, /eval\(/i, /expression\(/i];
  if (dangerousPatterns.some((p) => p.test(content))) return false;
  return true;
}

function cleanupMaliciousComments() {
  const allComments = db.prepare('SELECT id, content FROM comments').all();
  let deletedCount = 0;
  for (const comment of allComments) {
    if (!validateContent(comment.content)) {
      db.prepare('DELETE FROM comments WHERE id = ?').run(comment.id);
      deletedCount++;
    }
  }
  return deletedCount;
}

function isSessionAdmin(req) {
  const level = Number(req.session?.user?.is_admin || 0);
  if (level >= 1) return true;
  if (!req.session?.user?.id) return false;
  const row = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.session.user.id);
  return !!(row && row.is_admin >= 1);
}

export async function addCommentHandler(req, res) {
  if (!req.session?.user) return res.status(401).json({ error: 'Unauthorized' });
  const { type, targetId, content } = req.body;
  if (!['changelog', 'feedback'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
  if (!targetId || typeof targetId !== 'string' || targetId.length > 80) return res.status(400).json({ error: 'Invalid targetId' });
  if (!validateContent(content)) return res.status(400).json({ error: 'Invalid or inappropriate content' });
  const sanitizedContent = sanitizeContent(content);
  const id = randomUUID();
  const now = Date.now();
  db.prepare('INSERT INTO comments (id, type, target_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    type,
    targetId,
    req.session.user.id,
    sanitizedContent,
    now
  );
  const me = db.prepare('SELECT username, avatar_url FROM users WHERE id = ?').get(req.session.user.id);
  res.json({
    message: 'Comment posted.',
    id,
    comment: {
      id,
      content: sanitizedContent,
      created_at: now,
      username: sanitizeUsername(me?.username || '') || 'User',
      avatar_url: me?.avatar_url && String(me.avatar_url).startsWith('/uploads/avatars/') ? me.avatar_url : null,
      user_id: req.session.user.id,
    },
  });
}

export async function getCommentsHandler(req, res) {
  const { type, targetId } = req.query;
  if (!['changelog', 'feedback'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
  if (!targetId || typeof targetId !== 'string' || targetId.length > 80) return res.status(400).json({ error: 'Invalid targetId' });
  const rows = db
    .prepare(
      'SELECT c.id, c.content, c.created_at, c.user_id, u.username, u.avatar_url FROM comments c LEFT JOIN users u ON c.user_id = u.id WHERE c.type = ? AND c.target_id = ? ORDER BY c.created_at ASC'
    )
    .all(type, targetId);
  const comments = rows.map((c) => ({
    id: c.id,
    content: c.content,
    created_at: c.created_at,
    user_id: c.user_id,
    username: sanitizeUsername(c.username || '') || 'User',
    avatar_url:
      c.avatar_url && String(c.avatar_url).startsWith('/uploads/avatars/')
        ? c.avatar_url
        : null,
  }));
  res.json({ comments });
}

export async function deleteCommentHandler(req, res) {
  if (!req.session?.user) return res.status(401).json({ error: 'Unauthorized' });
  const { commentId } = req.body;
  if (!commentId || typeof commentId !== 'string') return res.status(400).json({ error: 'Invalid commentId' });
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(commentId);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (comment.user_id !== req.session.user.id && !isSessionAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  db.prepare('DELETE FROM comments WHERE id = ?').run(commentId);
  res.json({ message: 'Comment deleted.' });
}

export async function cleanupMaliciousCommentsHandler(req, res) {
  if (!req.session?.user || !isSessionAdmin(req)) return res.status(403).json({ error: 'Admin access required' });
  const deletedCount = cleanupMaliciousComments();
  res.json({ message: `Cleaned up ${deletedCount} malicious comment(s).`, deletedCount });
}
