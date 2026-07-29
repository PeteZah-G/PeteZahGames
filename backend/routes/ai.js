import { Router } from 'express';
import fetch from 'node-fetch';
import { checkCircuitBreaker, toIPv4 } from '../middleware/security.js';

const router = Router();

const promptCache = new Map();
const CACHE_TTL = 60 * 60 * 1000;
const CACHE_MAX_SIZE = 500;
const CACHE_MAX_PROMPT_LEN = 120;

const ALLOWED_MODELS = new Set([
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-scout-17b-16e-instruct',
]);

const DEFAULT_MODEL = 'llama-3.1-8b-instant';

function normalizeCacheKey(prompt) {
  return prompt.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

function getCached(key) {
  const entry = promptCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) { promptCache.delete(key); return null; }
  return entry.response;
}

function setCache(key, response) {
  if (promptCache.size >= CACHE_MAX_SIZE) promptCache.delete(promptCache.keys().next().value);
  promptCache.set(key, { response, expires: Date.now() + CACHE_TTL });
}

function resolveModel(raw) {
  const model = typeof raw === 'string' ? raw.trim() : '';
  if (ALLOWED_MODELS.has(model)) return model;
  return DEFAULT_MODEL;
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return null;
  const out = [];
  for (const msg of messages.slice(-48)) {
    if (!msg || typeof msg !== 'object') continue;
    const role = msg.role === 'assistant' || msg.role === 'system' || msg.role === 'user' ? msg.role : null;
    if (!role) continue;
    if (typeof msg.content === 'string') {
      out.push({ role, content: msg.content.slice(0, 12000) });
      continue;
    }
    if (Array.isArray(msg.content)) {
      const parts = [];
      for (const part of msg.content.slice(0, 4)) {
        if (!part || typeof part !== 'object') continue;
        if (part.type === 'text' && typeof part.text === 'string') {
          parts.push({ type: 'text', text: part.text.slice(0, 8000) });
        } else if (part.type === 'image_url' && part.image_url?.url && typeof part.image_url.url === 'string') {
          const url = part.image_url.url;
          if (url.startsWith('data:image/') && url.length < 4_500_000) {
            parts.push({ type: 'image_url', image_url: { url } });
          }
        }
      }
      if (parts.length) out.push({ role, content: parts });
    }
  }
  return out.length ? out : null;
}

const MAX_CONCURRENT = 5;
const MAX_QUEUE = 25;
let active = 0;
const queue = [];

function next() {
  if (active >= MAX_CONCURRENT || !queue.length) return;
  active++;
  const { task, resolve, reject } = queue.shift();
  task().then(resolve).catch(reject).finally(() => { active--; next(); });
}

function enqueue(task) {
  return new Promise((resolve, reject) => {
    if (queue.length >= MAX_QUEUE) return reject(Object.assign(new Error('Queue full'), { code: 'QUEUE_FULL' }));
    queue.push({ task, resolve, reject });
    next();
  });
}

router.post('/', async (req, res) => {
  const ip = toIPv4(null, req);
  if (checkCircuitBreaker(ip, null)) return res.status(429).json({ error: 'Too many requests' });

  const { prompt, model, system, groqMessages } = req.body ?? {};
  if (!prompt || typeof prompt !== 'string' || prompt.length > 10000) {
    return res.status(400).json({ error: 'Invalid prompt' });
  }

  const resolvedModel = resolveModel(model);
  const safeMessages = sanitizeMessages(groqMessages);

  const isSimple = prompt.length <= CACHE_MAX_PROMPT_LEN && !safeMessages;
  const cacheKey = isSimple ? normalizeCacheKey(prompt) : null;
  if (cacheKey) {
    const cached = getCached(cacheKey);
    if (cached) return res.json({ response: cached, cached: true });
  }

  const callGroq = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      const messages =
        safeMessages ||
        [
          ...(system && typeof system === 'string' ? [{ role: 'system', content: system.slice(0, 4000) }] : []),
          { role: 'user', content: prompt },
        ];
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: resolvedModel,
          messages,
          max_tokens: 1024,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail =
          typeof data?.error?.message === 'string'
            ? data.error.message
            : `Groq ${response.status}`;
        throw Object.assign(new Error(detail), { code: 'GROQ_ERROR', detail });
      }
      return data.choices?.[0]?.message?.content ?? 'No response.';
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  };

  try {
    const result = await enqueue(callGroq);
    if (cacheKey) setCache(cacheKey, result);
    res.json({ response: result });
    const uid = req.session?.user?.id;
    if (uid) {
      setImmediate(() => {
        import('../api/achievements.js')
          .then(({ bumpStat }) => {
            try { bumpStat(uid, 'ai_messages', 1); } catch {}
          })
          .catch(() => {});
      });
    }
  } catch (err) {
    if (err.code === 'QUEUE_FULL') return res.status(503).json({ error: 'Server busy, try again in a moment' });
    if (err.name === 'AbortError') return res.status(504).json({ error: 'Request timeout' });
    if (err.code === 'GROQ_ERROR') {
      return res.status(502).json({ error: 'AI service error', detail: err.detail || err.message });
    }
    return res.status(500).json({ error: 'AI service unavailable' });
  }
});

export default router;
