import express from 'express';
import fetch from 'node-fetch';
import { bumpUsage } from '../utils/usage-daily.js';

const router = express.Router();
const TMDB_BASE = 'https://api.themoviedb.org/3';

const cache = new Map();
const CACHE_TTL = 1000 * 60 * 12;
const WATCH_TTL = 1000 * 60 * 60 * 18;

const PROVIDER_HOME = {
  8: 'https://www.netflix.com',
  9: 'https://www.primevideo.com',
  15: 'https://www.hulu.com',
  337: 'https://www.disneyplus.com',
  1899: 'https://www.max.com',
  384: 'https://www.max.com',
  350: 'https://tv.apple.com',
  2: 'https://tv.apple.com',
  386: 'https://www.peacocktv.com',
  387: 'https://www.peacocktv.com',
  531: 'https://www.paramountplus.com',
  43: 'https://www.starz.com',
  37: 'https://www.paramountplus.com',
  283: 'https://www.crunchyroll.com',
  73: 'https://tubitv.com',
  300: 'https://pluto.tv',
  11: 'https://mubi.com',
  34: 'https://mubi.com',
  207: 'https://www.shudder.com',
  526: 'https://www.amcplus.com',
  257: 'https://www.fubo.tv',
  188: 'https://www.youtube.com',
  192: 'https://www.youtube.com',
  3: 'https://play.google.com/store/movies',
  10: 'https://www.amazon.com/gp/video',
  7: 'https://www.vudu.com',
  68: 'https://www.microsoft.com/store/movies-and-tv',
  1796: 'https://www.netflix.com',
  1825: 'https://www.primevideo.com',
  175: 'https://www.netflix.com',
};

function cacheGet(key, ttl = CACHE_TTL) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ttl) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}

function cacheSet(key, data) {
  cache.set(key, { at: Date.now(), data });
  if (cache.size > 2500) {
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

function sanitizeRegion(raw) {
  const v = String(raw || 'US').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(v)) return 'US';
  return v;
}

function mapOffers(block, link) {
  const groups = [
    ['flatrate', 'subscription'],
    ['ads', 'free'],
    ['free', 'free'],
    ['rent', 'rent'],
    ['buy', 'buy'],
  ];
  const seen = new Set();
  const offers = [];
  for (const [key, group] of groups) {
    const list = Array.isArray(block?.[key]) ? block[key] : [];
    for (const row of list) {
      const id = Number(row.provider_id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const name = String(row.provider_name || '').slice(0, 80);
      const home = PROVIDER_HOME[id] || link || '';
      if (!name || !home) continue;
      offers.push({
        id,
        name,
        logo: typeof row.logo_path === 'string' ? row.logo_path : null,
        url: home,
        group,
      });
    }
  }
  return offers;
}

async function watchPayload(kind, id, region) {
  const data = await fetchTMDB(`/${kind}/${id}/watch/providers`);
  const block = data?.results?.[region] || data?.results?.US || {};
  const link = typeof block.link === 'string' && /^https:\/\//i.test(block.link) ? block.link : '';
  return { region, offers: mapOffers(block, link), link };
}

async function fetchTMDB(endpoint) {
  const TMDB_API_KEY = process.env.TMDB_API_KEY;
  if (!TMDB_API_KEY) {
    throw new Error('TMDB_API_KEY not configured');
  }
  const ttl = endpoint.includes('/watch/providers') ? WATCH_TTL : CACHE_TTL;
  const cached = cacheGet(endpoint, ttl);
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

router.get('/movie/:id/watch', async (req, res) => {
  const id = sanitizeId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await watchPayload('movie', id, sanitizeRegion(req.query.region));
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/tv/:id/watch', async (req, res) => {
  const id = sanitizeId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  try {
    const data = await watchPayload('tv', id, sanitizeRegion(req.query.region));
    res.setHeader('Cache-Control', 'public, max-age=3600');
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
