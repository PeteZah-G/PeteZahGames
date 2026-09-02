import express from 'express';
import fetch from 'node-fetch';
import { bumpUsage } from '../utils/usage-daily.js';

const router = express.Router();
const TMDB_BASE = 'https://api.themoviedb.org/3';

const cache = new Map();
const CACHE_TTL = 1000 * 60 * 12;

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}

function cacheSet(key, data) {
  cache.set(key, { at: Date.now(), data });
  if (cache.size > 400) {
    const first = cache.keys().next().value;
    cache.delete(first);
  }
}

function sanitizeId(raw) {
  const id = String(raw || '').replace(/\D/g, '');
  if (!id || id.length > 12) return null;
  return id;
}

function sanitizeQuery(q) {
  return String(q || '')
    .replace(/[<>{}[\]\\]/g, '')
    .trim()
    .slice(0, 120);
}

async function fetchTMDB(endpoint) {
  const TMDB_API_KEY = process.env.TMDB_API_KEY;
  if (!TMDB_API_KEY) {
    throw new Error('TMDB_API_KEY not configured');
  }
  const cached = cacheGet(endpoint);
  if (cached) return cached;
  const url = `${TMDB_BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${TMDB_API_KEY}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    let message = 'TMDB API error';
    try {
      const err = await res.json();
      message = err.status_message || message;
    } catch {}
    throw new Error(message);
  }
  const data = await res.json();
  cacheSet(endpoint, data);
  return data;
}

router.get('/search', async (req, res) => {
  const q = sanitizeQuery(req.query.q);
  if (!q) return res.status(400).json({ error: 'Missing query parameter' });
  try {
    const data = await fetchTMDB(`/search/multi?query=${encodeURIComponent(q)}&include_adult=false`);
    const results = (data.results || []).filter((r) => r.media_type === 'movie' || r.media_type === 'tv');
    res.setHeader('Cache-Control', 'public, max-age=120');
    res.json({ ...data, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/movie/popular', async (_req, res) => {
  try {
    const data = await fetchTMDB('/movie/popular?language=en-US&page=1');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/movie/trending', async (_req, res) => {
  try {
    const data = await fetchTMDB('/trending/movie/week');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/movie/top_rated', async (_req, res) => {
  try {
    const data = await fetchTMDB('/movie/top_rated?language=en-US&page=1');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/movie/now_playing', async (_req, res) => {
  try {
    const data = await fetchTMDB('/movie/now_playing?language=en-US&page=1');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/movie/search', async (req, res) => {
  const q = sanitizeQuery(req.query.q);
  if (!q) return res.status(400).json({ error: 'Missing query parameter' });
  try {
    const data = await fetchTMDB(`/search/movie?query=${encodeURIComponent(q)}&include_adult=false`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/tv/popular', async (_req, res) => {
  try {
    const data = await fetchTMDB('/tv/popular?language=en-US&page=1');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/tv/trending', async (_req, res) => {
  try {
    const data = await fetchTMDB('/trending/tv/week');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/tv/top_rated', async (_req, res) => {
  try {
    const data = await fetchTMDB('/tv/top_rated?language=en-US&page=1');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/tv/now_playing', async (_req, res) => {
  try {
    const data = await fetchTMDB('/tv/on_the_air?language=en-US&page=1');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/tv/search', async (req, res) => {
  const q = sanitizeQuery(req.query.q);
  if (!q) return res.status(400).json({ error: 'Missing query parameter' });
  try {
    const data = await fetchTMDB(`/search/tv?query=${encodeURIComponent(q)}&include_adult=false`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/movie/:id', async (req, res) => {
  const id = sanitizeId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await fetchTMDB(`/movie/${id}?append_to_response=videos,credits`);
    try { bumpUsage('movies', 1); } catch {}
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/tv/:id', async (req, res) => {
  const id = sanitizeId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await fetchTMDB(`/tv/${id}?append_to_response=videos,credits`);
    try { bumpUsage('movies', 1); } catch {}
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/tv/:id/season/:season', async (req, res) => {
  const id = sanitizeId(req.params.id);
  const season = sanitizeId(req.params.season);
  if (!id || season === null) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await fetchTMDB(`/tv/${id}/season/${season}`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
