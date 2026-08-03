import crypto from 'crypto';
import db from '../db.js';

const MAX_CONVOS = 25;
const MAX_MESSAGES = 40;
const MAX_CONTENT = 4000;
const MAX_TITLE = 80;
const MAX_PREVIEW = 180;
const MAX_ANON = 400;
const MAX_PAYLOAD_CHARS = 160_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const anonLogBuckets = new Map();

function cleanText(raw, max) {
  return String(raw || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function requireUser(req, res) {
  if (!req.session?.user?.id) {
    res.status(401).json({ error: 'Sign in to save chats' });
    return null;
  }
  const row = db
    .prepare('SELECT id, banned FROM users WHERE id = ?')
    .get(req.session.user.id);
  if (!row) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  if (row.banned) {
    res.status(403).json({ error: 'Account restricted' });
    return null;
  }
  return req.session.user;
}

function requireAdmin(req, res) {
  if (!req.session?.user?.id) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const row = db.prepare('SELECT is_admin, email, banned FROM users WHERE id = ?').get(req.session.user.id);
  if (!row || row.banned) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const owner = (process.env.OWNER_EMAIL || '').toLowerCase() === String(row.email || '').toLowerCase();
  const level = Number(row.is_admin || 0);
  if (level < 1 && !owner) {
    res.status(403).json({ error: 'Admin required' });
    return null;
  }
  return { id: req.session.user.id, is_admin: Math.max(level, owner ? 3 : level) };
}

function sanitizeMessages(raw) {
  if (!Array.isArray(raw)) return [];
  if (raw.length > MAX_MESSAGES + 10) return [];
  const out = [];
  for (const m of raw.slice(-MAX_MESSAGES)) {
    if (!m || typeof m !== 'object') continue;
    const role = m.role === 'assistant' || m.role === 'ai' ? 'assistant' : m.role === 'user' ? 'user' : null;
    if (!role) continue;
    const content = cleanText(m.content, MAX_CONTENT);
    if (!content) continue;
    out.push({ role, content });
  }
  return out;
}

function firstUserPreview(messages) {
  const first = messages.find((m) => m.role === 'user');
  if (!first) return 'New chat';
  return cleanText(first.content, MAX_PREVIEW) || 'New chat';
}

function pruneUserConvos(userId) {
  const rows = db
    .prepare('SELECT id FROM ai_conversations WHERE user_id = ? ORDER BY updated_at DESC')
    .all(userId);
  if (rows.length <= MAX_CONVOS) return;
  const drop = rows.slice(MAX_CONVOS).map((r) => r.id);
  const del = db.prepare('DELETE FROM ai_conversations WHERE id = ?');
  const tx = db.transaction((ids) => {
    for (const id of ids) del.run(id);
  });
  tx(drop);
}

function pruneAnon() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM ai_prompt_samples').get()?.c || 0;
  if (count <= MAX_ANON) return;
  const excess = count - MAX_ANON;
  db.prepare(
    `DELETE FROM ai_prompt_samples WHERE id IN (
      SELECT id FROM ai_prompt_samples ORDER BY created_at ASC LIMIT ?
    )`
  ).run(excess);
}

function allowAnonLog(key) {
  const now = Date.now();
  const bucket = anonLogBuckets.get(key) || { count: 0, reset: now + 60_000 };
  if (now > bucket.reset) {
    bucket.count = 0;
    bucket.reset = now + 60_000;
  }
  bucket.count += 1;
  anonLogBuckets.set(key, bucket);
  return bucket.count <= 8;
}

export function logAnonymousFirstPrompt(prompt, ipKey = 'unknown') {
  try {
    if (!allowAnonLog(String(ipKey || 'unknown').slice(0, 64))) return;
    const text = cleanText(prompt, MAX_PREVIEW);
    if (!text || text.length < 3) return;
    // Skip obvious junk / injection attempts from analytics store
    if (/[<>`]{2,}|javascript:|data:/i.test(text)) return;
    const id = crypto.randomUUID();
    db.prepare(
      'INSERT INTO ai_prompt_samples (id, preview, created_at) VALUES (?, ?, ?)'
    ).run(id, text, Date.now());
    pruneAnon();
  } catch {}
}

export function listConversationsHandler(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  const rows = db
    .prepare(
      `SELECT id, title, preview, updated_at, created_at
       FROM ai_conversations WHERE user_id = ?
       ORDER BY updated_at DESC LIMIT ?`
    )
    .all(user.id, MAX_CONVOS);
  res.json({
    conversations: rows.map((r) => ({
      id: r.id,
      title: cleanText(r.title, MAX_TITLE),
      preview: cleanText(r.preview, MAX_PREVIEW),
      updatedAt: r.updated_at,
      createdAt: r.created_at,
    })),
  });
}

export function getConversationHandler(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  const id = String(req.params.id || '');
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid id' });
  const row = db
    .prepare('SELECT id, title, preview, messages_json, updated_at, created_at FROM ai_conversations WHERE id = ? AND user_id = ?')
    .get(id, user.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  let messages = [];
  try {
    const parsed = JSON.parse(row.messages_json || '[]');
    messages = sanitizeMessages(parsed);
  } catch {
    messages = [];
  }
  res.json({
    conversation: {
      id: row.id,
      title: cleanText(row.title, MAX_TITLE),
      preview: cleanText(row.preview, MAX_PREVIEW),
      messages,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
    },
  });
}

export function upsertConversationHandler(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  const body = req.body || {};
  try {
    const approx = JSON.stringify(body.messages || []).length;
    if (approx > MAX_PAYLOAD_CHARS) {
      return res.status(413).json({ error: 'Conversation too large' });
    }
  } catch {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const messages = sanitizeMessages(body.messages);
  if (!messages.length) return res.status(400).json({ error: 'Empty conversation' });
  if (!messages.some((m) => m.role === 'user')) {
    return res.status(400).json({ error: 'Missing user message' });
  }

  const preview = firstUserPreview(messages);
  const title = cleanText(body.title || preview, MAX_TITLE) || 'New chat';
  const now = Date.now();
  let id = typeof body.id === 'string' ? body.id.trim() : null;
  if (id && !UUID_RE.test(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const existing = id
    ? db.prepare('SELECT id FROM ai_conversations WHERE id = ? AND user_id = ?').get(id, user.id)
    : null;

  // Never allow writing another user's conversation id
  if (id && !existing) {
    const ownedByOther = db.prepare('SELECT id FROM ai_conversations WHERE id = ?').get(id);
    if (ownedByOther) return res.status(403).json({ error: 'Forbidden' });
  }

  if (existing) {
    db.prepare(
      `UPDATE ai_conversations
       SET title = ?, preview = ?, messages_json = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    ).run(title, preview, JSON.stringify(messages), now, id, user.id);
  } else {
    id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO ai_conversations (id, user_id, title, preview, messages_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, user.id, title, preview, JSON.stringify(messages), now, now);
  }

  pruneUserConvos(user.id);
  res.json({
    conversation: { id, title, preview, updatedAt: now },
  });
}

export function renameConversationHandler(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  const id = String(req.params.id || '');
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid id' });
  const title = cleanText(req.body?.title, MAX_TITLE);
  if (!title) return res.status(400).json({ error: 'Title required' });
  const result = db
    .prepare('UPDATE ai_conversations SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .run(title, Date.now(), id, user.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true, title });
}

export function deleteConversationHandler(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  const id = String(req.params.id || '');
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid id' });
  const result = db
    .prepare('DELETE FROM ai_conversations WHERE id = ? AND user_id = ?')
    .run(id, user.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
}

export function adminAiPromptsHandler(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
  const rows = db
    .prepare(
      `SELECT id, preview, created_at FROM ai_prompt_samples
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(limit);
  res.json({
    prompts: rows.map((r) => ({
      id: r.id,
      preview: cleanText(r.preview, MAX_PREVIEW),
      createdAt: r.created_at,
    })),
  });
}
