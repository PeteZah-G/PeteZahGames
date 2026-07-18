import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();
const TMDB_BASE = 'https://api.themoviedb.org/3';

async function fetchTMDB(endpoint) {
  const TMDB_API_KEY = process.env.TMDB_API_KEY;
  if (!TMDB_API_KEY) {
    throw new Error('TMDB_API_KEY not configured');
  }
  const url = `${TMDB_BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${TMDB_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.status_message || 'TMDB API error');
  }
  return await res.json();
}

router.get('/search', async (req, res) => {
  const q = req.query.q || '';
  if (!q) return res.status(400).json({ error: 'Missing query parameter' });
  try {
    const data = await fetchTMDB(`/search/multi?query=${encodeURIComponent(q)}`);
    const results = (data.results || []).filter((r) => r.media_type === 'movie' || r.media_type === 'tv');
    res.json({ ...data, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/movie/popular', async (req, res) => {
  try {
    const data = await fetchTMDB('/movie/popular');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/movie/trending', async (req, res) => {
  try {
    const data = await fetchTMDB('/trending/movie/day');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/movie/search', async (req, res) => {
  const q = req.query.q || '';
  if (!q) return res.status(400).json({ error: 'Missing query parameter' });
  try {
    const data = await fetchTMDB(`/search/movie?query=${encodeURIComponent(q)}`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/tv/popular', async (req, res) => {
  try {
    const data = await fetchTMDB('/tv/popular');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/tv/trending', async (req, res) => {
  try {
    const data = await fetchTMDB('/trending/tv/day');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/tv/search', async (req, res) => {
  const q = req.query.q || '';
  if (!q) return res.status(400).json({ error: 'Missing query parameter' });
  try {
    const data = await fetchTMDB(`/search/tv?query=${encodeURIComponent(q)}`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/movie/:id', async (req, res) => {
  try {
    const data = await fetchTMDB(`/movie/${req.params.id}`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/tv/:id', async (req, res) => {
  try {
    const data = await fetchTMDB(`/tv/${req.params.id}`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/tv/:id/season/:season', async (req, res) => {
  try {
    const data = await fetchTMDB(`/tv/${req.params.id}/season/${req.params.season}`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;