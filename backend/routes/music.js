import express from 'express';
import fetch from 'node-fetch';
import { bumpUsage } from '../utils/usage-daily.js';

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
    try { bumpUsage('music', 1); } catch {}
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

async function fetchChart(clientId, genre, limit = 16) {
  const genrePath = `soundcloud:genres:${genre}`;
  const url = `https://api-v2.soundcloud.com/charts?kind=top&genre=${encodeURIComponent(genrePath)}&client_id=${clientId}&limit=${limit}&offset=0`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!r.ok) return [];
    const data = await r.json();
    return (data.collection || [])
      .map((c) => mapTrack(c.track || c))
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchSearchTracks(clientId, q, limit = 14) {
  try {
    const url = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&client_id=${clientId}&limit=${limit}&offset=0`;
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!r.ok) return [];
    const data = await r.json();
    return (data.collection || []).map(mapTrack).filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchSectionTracks(clientId, { genre, genreAlts = [], search }, limit = 14) {
  const genres = [genre, ...genreAlts].filter(Boolean);
  for (const g of genres) {
    const tracks = await fetchChart(clientId, g, limit);
    if (tracks.length) return tracks;
  }
  if (search) {
    const tracks = await fetchSearchTracks(clientId, search, limit);
    if (tracks.length) return tracks;
  }
  return [];
}

router.get('/trending', async (_req, res) => {
  try {
    const clientId = await resolveClientId();
    let tracks = await fetchChart(clientId, 'all-music', 24);
    if (!tracks.length) tracks = await fetchSearchTracks(clientId, 'viral hits english 2025', 24);
    if (!tracks.length) tracks = await fetchSearchTracks(clientId, 'trending pop songs', 24);
    res.json({ tracks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/browse', async (_req, res) => {
  try {
    const clientId = await resolveClientId();
    const sections = [
      { id: 'top', title: 'Trending Now', genre: 'all-music', genreAlts: ['allmusic'], search: 'viral english hits 2025', icon: 'flame' },
      { id: 'pop', title: 'Fresh Pop', genre: 'pop', search: 'new pop hits english', icon: 'sparkles' },
      { id: 'hiphop', title: 'Rap & Hip-Hop', genre: 'hiphoprap', genreAlts: ['hip-hop-rap', 'hiphop'], search: 'english rap hits 2025', icon: 'zap' },
      { id: 'chill', title: 'Chill Vibes', genre: 'ambient', genreAlts: ['deephouse'], search: 'chill pop english playlist', icon: 'radio' },
      { id: 'rnb', title: 'R&B Favorites', genre: 'rbsoul', genreAlts: ['r-b-soul', 'soul'], search: 'rnb english hits', icon: 'heart' },
    ];
    const results = await Promise.all(
      sections.map(async (s) => ({
        id: s.id,
        title: s.title,
        icon: s.icon,
        tracks: await fetchSectionTracks(clientId, s, 16),
      }))
    );
    let out = results.filter((s) => s.tracks.length > 0);
    if (!out.length) {
      const fallback = await fetchSearchTracks(clientId, 'english pop songs', 20);
      if (fallback.length) {
        out = [{ id: 'top', title: 'Trending Now', icon: 'flame', tracks: fallback }];
      }
    }
    res.json({ sections: out });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function mapArtist(u) {
  if (!u || !u.id) return null;
  const avatar = u.avatar_url || null;
  return {
    id: String(u.id),
    name: u.username || u.full_name || 'Artist',
    avatar: avatar ? String(avatar).replace('-large', '-t500x500') : null,
    followers: Number(u.followers_count || 0),
    permalink_url: u.permalink_url || null,
  };
}

router.get('/home', async (_req, res) => {
  try {
    const clientId = await resolveClientId();
    let tracks = await fetchChart(clientId, 'all-music', 18);
    if (!tracks.length) tracks = await fetchSearchTracks(clientId, 'viral english hits 2025', 18);
    if (!tracks.length) tracks = await fetchSearchTracks(clientId, 'trending pop songs', 18);

    let artists = [];
    const artistMap = new Map();
    // Prefer chart users when available; otherwise derive from track search results.
    const chartUrl = `https://api-v2.soundcloud.com/charts?kind=top&genre=${encodeURIComponent('soundcloud:genres:all-music')}&client_id=${clientId}&limit=24&offset=0`;
    try {
      const chartRes = await fetch(chartUrl, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
      });
      if (chartRes.ok) {
        const data = await chartRes.json();
        for (const c of data.collection || []) {
          const track = c.track || c;
          const a = mapArtist(track?.user);
          if (a && !artistMap.has(a.id)) artistMap.set(a.id, a);
        }
      }
    } catch {}

    if (!artistMap.size) {
      // Pull a few popular artist queries for avatars/names
      const artistQueries = ['drake', 'taylor swift', 'the weeknd', 'billie eilish', 'travis scott', 'sza', 'bad bunny', 'doja cat'];
      for (const q of artistQueries) {
        try {
          const url = `https://api-v2.soundcloud.com/search/users?q=${encodeURIComponent(q)}&client_id=${clientId}&limit=1&offset=0`;
          const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
          if (!r.ok) continue;
          const data = await r.json();
          const a = mapArtist((data.collection || [])[0]);
          if (a && !artistMap.has(a.id)) artistMap.set(a.id, a);
        } catch {}
      }
    }

    artists = [...artistMap.values()].slice(0, 12);
    if (!artists.length) {
      const seen = new Set();
      for (const t of tracks) {
        if (!t.artist || seen.has(t.artist)) continue;
        seen.add(t.artist);
        artists.push({
          id: `name-${seen.size}`,
          name: t.artist,
          avatar: t.artwork,
          followers: 0,
          permalink_url: null,
        });
        if (artists.length >= 10) break;
      }
    }
    res.json({ tracks: tracks.slice(0, 12), artists });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
