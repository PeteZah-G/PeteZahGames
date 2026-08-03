import crypto from 'crypto';
import db from '../db.js';

const MAX_CONVOS = 25;
const MAX_MESSAGES = 40;
const MAX_CONTENT = 4000;
const MAX_TITLE = 80;
const MAX_PREVIEW = 180;
const MAX_ANON = 400;

function requireUser(req, res) {
  if (!req.session?.user?.id) {
    res.status(401).json({ error: 'Sign in to save chats' });
    return null;
  }
  return req.session.user;
}

function requireAdmin(req, res) {
  if (!req.session?.user?.id) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const row = db.prepare('SELECT is_admin, email FROM users WHERE id = ?').get(req.session.user.id);
  if (!row) {
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
  const out = [];
  for (const m of raw.slice(-MAX_MESSAGES)) {
    if (!m || typeof m !== 'object') continue;
    const role = m.role === 'assistant' || m.role === 'ai' ? 'assistant' : m.role === 'user' ? 'user' : null;
    if (!role) continue;
    const content = String(m.content || '').slice(0, MAX_CONTENT).trim();
    if (!content) continue;
    out.push({ role, content });
  }
  return out;
}

function firstUserPreview(messages) {
  const first = messages.find((m) => m.role === 'user');
  if (!first) return 'New chat';
  return first.content.replace(/\s+/g, ' ').trim().slice(0, MAX_PREVIEW) || 'New chat';
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

export function logAnonymousFirstPrompt(prompt) {
  try {
    const text = String(prompt || '').replace(/\s+/g, ' ').trim().slice(0, MAX_PREVIEW);
    if (!text || text.length < 3) return;
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
      title: r.title,
      preview: r.preview,
      updatedAt: r.updated_at,
      createdAt: r.created_at,
    })),
  });
}

export function getConversationHandler(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  const id = String(req.params.id || '');
  const row = db
    .prepare('SELECT id, title, preview, messages_json, updated_at, created_at FROM ai_conversations WHERE id = ? AND user_id = ?')
    .get(id, user.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  let messages = [];
  try {
    messages = JSON.parse(row.messages_json || '[]');
  } catch {
    messages = [];
  }
  res.json({
    conversation: {
      id: row.id,
      title: row.title,
      preview: row.preview,
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
  const messages = sanitizeMessages(body.messages);
  if (!messages.length) return res.status(400).json({ error: 'Empty conversation' });

  const preview = firstUserPreview(messages);
  const title = String(body.title || preview).replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE) || 'New chat';
  const now = Date.now();
  let id = typeof body.id === 'string' && body.id.length <= 64 ? body.id : null;

  const existing = id
    ? db.prepare('SELECT id FROM ai_conversations WHERE id = ? AND user_id = ?').get(id, user.id)
    : null;

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
  const title = String(req.body?.title || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
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
      preview: r.preview,
      createdAt: r.created_at,
    })),
  });
}
