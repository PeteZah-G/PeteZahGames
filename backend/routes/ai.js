import { Router } from 'express';
import fetch from 'node-fetch';
import { checkCircuitBreaker, toIPv4 } from '../middleware/security.js';

const router = Router();

const promptCache = new Map();
const CACHE_TTL = 60 * 60 * 1000;
const CACHE_MAX_SIZE = 500;
const CACHE_MAX_PROMPT_LEN = 120;

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
  if (!prompt || typeof prompt !== 'string' || prompt.length > 10000) return res.status(400).json({ error: 'Invalid prompt' });

  const isSimple = prompt.length <= CACHE_MAX_PROMPT_LEN && !groqMessages;
  const cacheKey = isSimple ? normalizeCacheKey(prompt) : null;
  if (cacheKey) { const cached = getCached(cacheKey); if (cached) return res.json({ response: cached, cached: true }); }

  const callGroq = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      const messages = groqMessages || [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }];
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({ model: model || 'llama-3.1-8b-instant', messages, max_tokens: 1024 }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      const data = await response.json();
      if (!response.ok) throw Object.assign(new Error('AI error'), { code: 'GROQ_ERROR' });
      return data.choices?.[0]?.message?.content ?? 'No response.';
    } catch (err) { clearTimeout(timeout); throw err; }
  };

  try {
    const result = await enqueue(callGroq);
    if (cacheKey) setCache(cacheKey, result);
    return res.json({ response: result });
  } catch (err) {
    if (err.code === 'QUEUE_FULL') return res.status(503).json({ error: 'Server busy' });
    if (err.name === 'AbortError') return res.status(504).json({ error: 'Request timeout' });
    if (err.code === 'GROQ_ERROR') return res.status(502).json({ error: 'AI service error' });
    return res.status(500).json({ error: 'AI service unavailable' });
  }
});

export default router;