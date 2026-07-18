import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

let cachedClientId = null;
let clientIdFetchedAt = 0;

async function resolveClientId() {
  if (cachedClientId && Date.now() - clientIdFetchedAt < 1000 * 60 * 60 * 6) {
    return cachedClientId;
  }

  const home = await fetch('https://soundcloud.com', {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
  });
  const html = await home.text();
  const scriptUrls = [...html.matchAll(/src="(https:\/\/[a-zA-Z0-9./_-]*sndcdn\.com\/assets\/[a-zA-Z0-9-_.]+\.js)"/g)].map(
    (m) => m[1]
  );

  const candidates = scriptUrls.slice(-8).reverse();
  for (const url of candidates) {
    try {
      const js = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();
      const match =
        js.match(/client_id\s*:\s*"([a-zA-Z0-9]{16,})"/) ||
        js.match(/client_id:"([a-zA-Z0-9]{16,})"/) ||
        js.match(/,client_id:"([a-zA-Z0-9]{16,})"/);
      if (match?.[1]) {
        cachedClientId = match[1];
        clientIdFetchedAt = Date.now();
        return cachedClientId;
      }
    } catch {}
  }

  if (cachedClientId) return cachedClientId;
  throw new Error('Could not resolve music client');
}

function mapTrack(t) {
  if (!t || !t.id) return null;
  const artwork =
    t.artwork_url ||
    t.user?.avatar_url ||
    null;
  return {
    id: String(t.id),
    title: t.title || 'Untitled',
    artist: t.user?.username || t.user?.full_name || 'Unknown',
    artwork: artwork ? artwork.replace('-large', '-t500x500') : null,
    duration: t.duration || 0,
    permalink_url: t.permalink_url || null,
    genre: t.genre || null,
    streamable: !!t.streamable || t.policy === 'ALLOW' || t.access === 'playable',
  };
}

async function fetchStreamUrl(trackId, clientId) {
  const trackRes = await fetch(`https://api-v2.soundcloud.com/tracks/${trackId}?client_id=${clientId}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!trackRes.ok) throw new Error('Track not found');
  const track = await trackRes.json();

  const transcodings = track?.media?.transcodings || [];
  const progressive = transcodings.find((x) => x.format?.protocol === 'progressive');
  const hls = transcodings.find((x) => x.format?.protocol === 'hls');
  const chosen = progressive || hls;
  if (!chosen?.url) throw new Error('No stream available');

  const streamMeta = await fetch(`${chosen.url}?client_id=${clientId}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!streamMeta.ok) throw new Error('Stream resolve failed');
  const meta = await streamMeta.json();
  if (!meta?.url) throw new Error('No stream url');

  return {
    streamUrl: meta.url,
    protocol: chosen.format?.protocol || 'progressive',
    track: mapTrack(track),
  };
}

router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing query' });
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '24'), 10) || 24));

  try {
    const clientId = await resolveClientId();
    const url = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&client_id=${clientId}&limit=${limit}&offset=0`;
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!r.ok) return res.status(502).json({ error: 'Search failed' });
    const data = await r.json();
    const tracks = (data.collection || []).map(mapTrack).filter(Boolean);
    res.json({ tracks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/track/:id', async (req, res) => {
  const id = String(req.params.id || '').replace(/[^\d]/g, '');
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  try {
    const clientId = await resolveClientId();
    const r = await fetch(`https://api-v2.soundcloud.com/tracks/${id}?client_id=${clientId}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!r.ok) return res.status(404).json({ error: 'Track not found' });
    const track = mapTrack(await r.json());
    res.json({ track });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/stream/:id', async (req, res) => {
  const id = String(req.params.id || '').replace(/[^\d]/g, '');
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  try {
    const clientId = await resolveClientId();
    const data = await fetchStreamUrl(id, clientId);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/trending', async (_req, res) => {
  try {
    const clientId = await resolveClientId();
    const url = `https://api-v2.soundcloud.com/charts?kind=top&genre=soundcloud%3Agenres%3Aall-music&client_id=${clientId}&limit=24&offset=0`;
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!r.ok) return res.status(502).json({ error: 'Trending failed' });
    const data = await r.json();
    const tracks = (data.collection || [])
      .map((c) => mapTrack(c.track || c))
      .filter(Boolean);
    res.json({ tracks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
