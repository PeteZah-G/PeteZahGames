import express from 'express';
import fetch from 'node-fetch';
import { bumpUsage } from '../utils/usage-daily.js';
import { mediaProxyPath, proxyMedia } from './music-media.js';

const router = express.Router();

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

let cachedClientId = null;
let clientIdFetchedAt = 0;

const browseCache = { at: 0, sections: null };
const ytSearchCache = new Map();

const SEED_SECTIONS = [
  {
    id: 'top',
    title: 'Top Hits',
    icon: 'flame',
    tracks: [
      { id: 'yt51zjlMhdSTE', title: 'Espresso', artist: 'Sabrina Carpenter', artwork: 'https://i.ytimg.com/vi/51zjlMhdSTE/hqdefault.jpg', duration: 176000 },
      { id: 'ytd5gf9dXbPi0', title: 'BIRDS OF A FEATHER', artist: 'Billie Eilish', artwork: 'https://i.ytimg.com/vi/d5gf9dXbPi0/hqdefault.jpg', duration: 212000 },
      { id: 'ytPfH7jq_uSCM', title: 'Die With A Smile', artist: 'Lady Gaga & Bruno Mars', artwork: 'https://i.ytimg.com/vi/PfH7jq_uSCM/hqdefault.jpg', duration: 252000 },
      { id: 'yt8Ebqe2Dbzls', title: 'APT.', artist: 'ROSÉ & Bruno Mars', artwork: 'https://i.ytimg.com/vi/8Ebqe2Dbzls/hqdefault.jpg', duration: 170000 },
      { id: 'ytnZjTtuNR3Og', title: 'A Bar Song (Tipsy)', artist: 'Shaboozey', artwork: 'https://i.ytimg.com/vi/nZjTtuNR3Og/hqdefault.jpg', duration: 172000 },
      { id: 'ytFkOpwodhROI', title: 'Lose Control', artist: 'Teddy Swims', artwork: 'https://i.ytimg.com/vi/FkOpwodhROI/hqdefault.jpg', duration: 211000 },
      { id: 'ytHU08BcK5SUY', title: 'Beautiful Things', artist: 'Benson Boone', artwork: 'https://i.ytimg.com/vi/HU08BcK5SUY/hqdefault.jpg', duration: 181000 },
      { id: 'yt1RKqOmSkGgM', title: 'Good Luck, Babe!', artist: 'Chappell Roan', artwork: 'https://i.ytimg.com/vi/1RKqOmSkGgM/hqdefault.jpg', duration: 219000 },
      { id: 'ytW_YOJWZIjxo', title: "That's So True", artist: 'Gracie Abrams', artwork: 'https://i.ytimg.com/vi/W_YOJWZIjxo/hqdefault.jpg', duration: 167000 },
      { id: 'ytkpwunIatorM', title: 'Ordinary', artist: 'Alex Warren', artwork: 'https://i.ytimg.com/vi/kpwunIatorM/hqdefault.jpg', duration: 188000 },
      { id: 'ytmhTiOYFF0wg', title: 'Messy', artist: 'Lola Young', artwork: 'https://i.ytimg.com/vi/mhTiOYFF0wg/hqdefault.jpg', duration: 285000 },
      { id: 'ytm0NZ-aH0G1g', title: 'Sailor Song', artist: 'Gigi Perez', artwork: 'https://i.ytimg.com/vi/m0NZ-aH0G1g/hqdefault.jpg', duration: 211000 },
    ],
  },
  {
    id: 'pop',
    title: 'Pop',
    icon: 'sparkles',
    tracks: [
      { id: 'ytzAgVtzhjfCA', title: 'Please Please Please', artist: 'Sabrina Carpenter', artwork: 'https://i.ytimg.com/vi/zAgVtzhjfCA/hqdefault.jpg', duration: 187000 },
      { id: 'ytz9Q9OzL_wI8', title: 'Taste', artist: 'Sabrina Carpenter', artwork: 'https://i.ytimg.com/vi/z9Q9OzL_wI8/hqdefault.jpg', duration: 158000 },
      { id: 'ytic8j13piAhQ', title: 'Cruel Summer', artist: 'Taylor Swift', artwork: 'https://i.ytimg.com/vi/ic8j13piAhQ/hqdefault.jpg', duration: 180000 },
      { id: 'ytV1Z586zoeeE', title: 'As It Was', artist: 'Harry Styles', artwork: 'https://i.ytimg.com/vi/V1Z586zoeeE/hqdefault.jpg', duration: 166000 },
      { id: 'ytXqN2qFvY64U', title: 'Anti-Hero', artist: 'Taylor Swift', artwork: 'https://i.ytimg.com/vi/XqN2qFvY64U/hqdefault.jpg', duration: 204000 },
      { id: 'ytWHuBW3qKm9g', title: 'Levitating', artist: 'Dua Lipa', artwork: 'https://i.ytimg.com/vi/WHuBW3qKm9g/hqdefault.jpg', duration: 221000 },
      { id: 'ytvp6XdbG3AhA', title: 'Pink Pony Club', artist: 'Chappell Roan', artwork: 'https://i.ytimg.com/vi/vp6XdbG3AhA/hqdefault.jpg', duration: 259000 },
      { id: 'ytHU08BcK5SUY', title: 'Beautiful Things', artist: 'Benson Boone', artwork: 'https://i.ytimg.com/vi/HU08BcK5SUY/hqdefault.jpg', duration: 181000 },
    ],
  },
  {
    id: 'hiphop',
    title: 'Hip-Hop',
    icon: 'zap',
    tracks: [
      { id: 'ytT6eK-2OQtew', title: 'Not Like Us', artist: 'Kendrick Lamar', artwork: 'https://i.ytimg.com/vi/T6eK-2OQtew/hqdefault.jpg', duration: 274000 },
      { id: 'ytHfWLgELllZs', title: 'luther', artist: 'Kendrick Lamar & SZA', artwork: 'https://i.ytimg.com/vi/HfWLgELllZs/hqdefault.jpg', duration: 178000 },
      { id: 'ytU-l4ya3ejko', title: 'FE!N', artist: 'Travis Scott', artwork: 'https://i.ytimg.com/vi/U-l4ya3ejko/hqdefault.jpg', duration: 194000 },
      { id: 'ytd-JBBNg8YKs', title: 'SICKO MODE', artist: 'Travis Scott', artwork: 'https://i.ytimg.com/vi/d-JBBNg8YKs/hqdefault.jpg', duration: 315000 },
      { id: 'ytm1a_GqJf02M', title: "God's Plan", artist: 'Drake', artwork: 'https://i.ytimg.com/vi/m1a_GqJf02M/hqdefault.jpg', duration: 199000 },
      { id: 'yti9PSG5mFYoo', title: 'Industry Baby', artist: 'Lil Nas X & Jack Harlow', artwork: 'https://i.ytimg.com/vi/i9PSG5mFYoo/hqdefault.jpg', duration: 229000 },
    ],
  },
  {
    id: 'rnb',
    title: 'R&B',
    icon: 'heart',
    tracks: [
      { id: 'ytSv5yCzPCkv8', title: 'Snooze', artist: 'SZA', artwork: 'https://i.ytimg.com/vi/Sv5yCzPCkv8/hqdefault.jpg', duration: 204000 },
      { id: 'ytSQnc1QibapQ', title: 'Kill Bill', artist: 'SZA', artwork: 'https://i.ytimg.com/vi/SQnc1QibapQ/hqdefault.jpg', duration: 156000 },
      { id: 'ytfHI8X4OXluQ', title: 'Blinding Lights', artist: 'The Weeknd', artwork: 'https://i.ytimg.com/vi/fHI8X4OXluQ/hqdefault.jpg', duration: 204000 },
      { id: 'ytu6lihZAcy4s', title: 'Save Your Tears', artist: 'The Weeknd', artwork: 'https://i.ytimg.com/vi/u6lihZAcy4s/hqdefault.jpg', duration: 217000 },
      { id: 'ytmX19AV35PhI', title: 'Timeless', artist: 'The Weeknd & Playboi Carti', artwork: 'https://i.ytimg.com/vi/mX19AV35PhI/hqdefault.jpg', duration: 257000 },
      { id: 'ytHfWLgELllZs', title: 'luther', artist: 'Kendrick Lamar & SZA', artwork: 'https://i.ytimg.com/vi/HfWLgELllZs/hqdefault.jpg', duration: 178000 },
    ],
  },
  {
    id: 'chill',
    title: 'Chill',
    icon: 'radio',
    tracks: [
      { id: 'ytFvOpPeKSf_4', title: 'Glimpse of Us', artist: 'Joji', artwork: 'https://i.ytimg.com/vi/FvOpPeKSf_4/hqdefault.jpg', duration: 234000 },
      { id: 'ytLUXu4aTnK7E', title: 'Slow Dancing in the Dark', artist: 'Joji', artwork: 'https://i.ytimg.com/vi/LUXu4aTnK7E/hqdefault.jpg', duration: 210000 },
      { id: 'ytApXoWvfEYVU', title: 'Sunflower', artist: 'Post Malone & Swae Lee', artwork: 'https://i.ytimg.com/vi/ApXoWvfEYVU/hqdefault.jpg', duration: 162000 },
      { id: 'ytpQV0WEdT_OE', title: 'Circles', artist: 'Post Malone', artwork: 'https://i.ytimg.com/vi/pQV0WEdT_OE/hqdefault.jpg', duration: 216000 },
      { id: 'ytKT7F15T9VBI', title: 'Heat Waves', artist: 'Glass Animals', artwork: 'https://i.ytimg.com/vi/KT7F15T9VBI/hqdefault.jpg', duration: 239000 },
      { id: 'ytFkOpwodhROI', title: 'Lose Control', artist: 'Teddy Swims', artwork: 'https://i.ytimg.com/vi/FkOpwodhROI/hqdefault.jpg', duration: 211000 },
    ],
  },
];

function normalizeSeedTrack(t) {
  const vid = String(t.id || '').startsWith('yt') ? String(t.id).slice(2) : '';
  if (!/^[\w-]{11}$/.test(vid)) return null;
  return {
    id: `yt${vid}`,
    title: t.title,
    artist: t.artist,
    artwork: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
    duration: Number(t.duration) || 0,
    permalink_url: `https://www.youtube.com/watch?v=${vid}`,
    genre: null,
    streamable: true,
    source: 'yt',
  };
}

function seedSections() {
  return SEED_SECTIONS.map((s) => ({
    id: s.id,
    title: s.title,
    icon: s.icon,
    tracks: s.tracks.map(normalizeSeedTrack).filter(Boolean),
  }));
}

function seedFlat() {
  const seen = new Set();
  const out = [];
  for (const s of seedSections()) {
    for (const t of s.tracks) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
    }
  }
  return out;
}

function parseTrackId(raw) {
  const id = String(raw || '').trim();
  if (!id || id.length > 64) return null;
  if (/^yt[\w-]{11}$/.test(id)) return { kind: 'yt', id, videoId: id.slice(2) };
  if (/^[\w-]{11}$/.test(id) && !/^\d+$/.test(id)) return { kind: 'yt', id: `yt${id}`, videoId: id };
  if (/^it\d{1,18}$/.test(id)) return { kind: 'it', id, itunesId: id.slice(2) };
  if (/^\d{6,18}$/.test(id)) return { kind: 'sc', id };
  return null;
}

function sanitizeQuery(q) {
  return String(q || '')
    .replace(/[<>{}[\]\\]/g, '')
    .trim()
    .slice(0, 120);
}

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
  const artwork = t.artwork_url || t.user?.avatar_url || null;
  const followers = Number(t.user?.followers_count || 0);
  const verified = !!(t.user?.verified || t.user?.badges?.verified || t.user?.badges?.pro_unlimited || t.user?.badges?.pro);
  const transcodings = t.media?.transcodings || [];
  const hasProgressive = transcodings.some((x) => x?.format?.protocol === 'progressive' && x?.url);
  const hasHls = transcodings.some((x) => x?.format?.protocol === 'hls' && x?.url);
  const policy = t.policy || null;
  const streamable =
    policy === 'BLOCK'
      ? false
      : hasProgressive
        ? true
        : !!(t.streamable && hasHls && policy !== 'MONETIZE');
  return {
    id: String(t.id),
    title: t.title || 'Untitled',
    artist: t.user?.username || t.user?.full_name || 'Unknown',
    artwork: artwork ? artwork.replace('-large', '-t500x500') : null,
    duration: t.duration || 0,
    permalink_url: t.permalink_url || null,
    genre: t.genre || null,
    streamable,
    policy,
    hasProgressive,
    hasHls,
    followers,
    verified,
    playbackCount: Number(t.playback_count || 0),
    source: 'sc',
  };
}

const JUNK_TITLE =
  /\b(playlist|mashup|mix|1\s*hour|one\s*hour|kumpulan|lagu|cover|nightcore|sped\s*up|slowed|reverb|bootleg|compilation|mega\s*mix|year\s*mix|tiktok\s*viral|best\s+of|top\s+\d+|mp3|\.mp3|full\s+album|lyrics?\s+video|audio\s+visualizer)\b/i;

function isQualityTrack(t, { strict = true } = {}) {
  if (!t || !t.id || !t.title) return false;
  if (!t.artwork) return false;
  if (JUNK_TITLE.test(t.title)) return false;
  if (t.title.length > 80) return false;
  const dur = Number(t.duration || 0);
  if (dur > 0 && (dur < 45_000 || dur > 450_000)) return false;
  if (strict) {
    if (t.verified) return true;
    if ((t.followers || 0) >= 50_000) return true;
    if ((t.playbackCount || 0) >= 100_000 && (t.followers || 0) >= 5_000) return true;
    return false;
  }
  return (t.followers || 0) >= 2_000 || (t.playbackCount || 0) >= 20_000;
}

function stripMeta(t) {
  if (!t) return null;
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    artwork: t.artwork,
    duration: t.duration,
    permalink_url: t.permalink_url || null,
    genre: t.genre || null,
    streamable: t.streamable !== false,
    source: t.source || null,
  };
}

async function fetchSearchRaw(clientId, q, limit = 24) {
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

async function itunesSearch(term, limit = 20) {
  const q = sanitizeQuery(term);
  if (!q) return [];
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=${Math.min(50, limit)}`;
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!r.ok) return [];
    const data = await r.json();
    return (data.results || [])
      .filter((x) => x?.trackId && x?.trackName)
      .map((x) => ({
        id: `it${x.trackId}`,
        title: x.trackName,
        artist: x.artistName || 'Unknown',
        artwork: String(x.artworkUrl100 || '').replace('100x100bb', '500x500bb') || null,
        duration: Number(x.trackTimeMillis) || 0,
        permalink_url: x.trackViewUrl || null,
        genre: x.primaryGenreName || null,
        streamable: true,
        source: 'it',
        previewUrl: typeof x.previewUrl === 'string' ? x.previewUrl : null,
        _searchHint: `${x.trackName} ${x.artistName || ''}`.trim(),
      }));
  } catch {
    return [];
  }
}

async function itunesChart(limit = 20) {
  try {
    const url = 'https://itunes.apple.com/us/rss/topsongs/limit=50/json';
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!r.ok) return [];
    const data = await r.json();
    const entries = data?.feed?.entry || [];
    return entries.slice(0, limit).map((e) => {
      const id = String(e?.id?.attributes?.['im:id'] || '').replace(/\D/g, '');
      const title = e?.['im:name']?.label || e?.title?.label || 'Untitled';
      const artist = e?.['im:artist']?.label || 'Unknown';
      const arts = e?.['im:image'] || [];
      const art = arts[arts.length - 1]?.label || null;
      return {
        id: id ? `it${id}` : `ytseed-${title}`,
        title,
        artist,
        artwork: art ? art.replace(/\d+x\d+bb/, '500x500bb') : null,
        duration: 0,
        permalink_url: e?.link?.attributes?.href || null,
        genre: e?.category?.attributes?.label || null,
        streamable: true,
        source: 'it',
        _searchHint: `${title} ${artist}`.trim(),
      };
    }).filter((t) => t.id.startsWith('it'));
  } catch {
    return [];
  }
}

function extractYtVideoId(urlOrId) {
  const s = String(urlOrId || '');
  const m =
    s.match(/^[a-zA-Z0-9_-]{11}$/) ||
    s.match(/[?&]v=([a-zA-Z0-9_-]{11})/) ||
    s.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/) ||
    s.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
  return m ? (m[1] || m[0]) : null;
}

async function youtubeSearch(query, limit = 12) {
  const q = sanitizeQuery(query);
  if (!q) return [];
  const cacheKey = q.toLowerCase();
  const cached = ytSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 1000 * 60 * 20) return cached.tracks.slice(0, limit);

  try {
    const body = {
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20240101.00.00',
          hl: 'en',
          gl: 'US',
        },
      },
      query: `${q} official audio`,
    };
    const r = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Origin: 'https://www.youtube.com',
        Referer: 'https://www.youtube.com/',
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) return [];
    const data = await r.json();
    const tracks = [];
    const seen = new Set();

    const walk = (node) => {
      if (!node || tracks.length >= limit) return;
      if (Array.isArray(node)) {
        for (const n of node) walk(n);
        return;
      }
      if (typeof node !== 'object') return;
      const vr = node.videoRenderer || node.compactVideoRenderer || node.lockupViewModel;
      if (vr) {
        const videoId =
          vr.videoId ||
          extractYtVideoId(vr?.onTap?.innertubeCommand?.watchEndpoint?.videoId) ||
          extractYtVideoId(vr?.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint?.videoId);
        if (videoId && !seen.has(videoId)) {
          const title =
            vr.title?.runs?.map((x) => x.text).join('') ||
            vr.title?.simpleText ||
            vr?.metadata?.lockupMetadataViewModel?.title?.content ||
            'Untitled';
          const artist =
            vr.ownerText?.runs?.[0]?.text ||
            vr.shortBylineText?.runs?.[0]?.text ||
            vr.longBylineText?.runs?.[0]?.text ||
            vr?.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content ||
            'YouTube';
          const lengthText = vr.lengthText?.simpleText || vr.lengthText?.runs?.[0]?.text || '';
          let duration = 0;
          if (lengthText) {
            const parts = lengthText.split(':').map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n));
            if (parts.length === 2) duration = (parts[0] * 60 + parts[1]) * 1000;
            if (parts.length === 3) duration = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
          }
          if (!JUNK_TITLE.test(title) && duration >= 60_000 && duration <= 480_000) {
            seen.add(videoId);
            tracks.push({
              id: `yt${videoId}`,
              title,
              artist,
              artwork: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
              duration,
              permalink_url: `https://www.youtube.com/watch?v=${videoId}`,
              genre: null,
              streamable: true,
              source: 'yt',
            });
          }
        }
      }
      for (const v of Object.values(node)) walk(v);
    };
    walk(data);
    ytSearchCache.set(cacheKey, { at: Date.now(), tracks });
    if (ytSearchCache.size > 200) {
      const first = ytSearchCache.keys().next().value;
      ytSearchCache.delete(first);
    }
    return tracks.slice(0, limit);
  } catch {
    return [];
  }
}


async function findSoundCloudPlayable(title, artist) {
  const q = sanitizeQuery(`${title || ''} ${artist || ''}`.trim());
  if (!q) return null;
  try {
    const clientId = await resolveClientId();
    const tracks = await fetchSearchRaw(clientId, q, 20);
    const scored = tracks
      .filter((t) => t.streamable && t.policy !== 'BLOCK')
      .filter((t) => Number(t.duration || 0) >= 60_000)
      .filter((t) => !JUNK_TITLE.test(t.title));
    if (!scored.length) return null;
    const wantTitle = String(title || '').toLowerCase();
    const wantArtist = String(artist || '').toLowerCase().split(/\s+/)[0] || '';
    scored.sort((a, b) => {
      const aScore =
        (wantTitle && String(a.title).toLowerCase().includes(wantTitle.slice(0, 12)) ? 50 : 0) +
        (wantArtist && String(a.artist).toLowerCase().includes(wantArtist) ? 30 : 0) +
        (a.policy === 'ALLOW' ? 20 : 0);
      const bScore =
        (wantTitle && String(b.title).toLowerCase().includes(wantTitle.slice(0, 12)) ? 50 : 0) +
        (wantArtist && String(b.artist).toLowerCase().includes(wantArtist) ? 30 : 0) +
        (b.policy === 'ALLOW' ? 20 : 0);
      return bScore - aScore;
    });
    return scored[0];
  } catch {
    return null;
  }
}

const playCache = new Map();
const searchResultCache = new Map();

function cacheSet(map, key, value, max = 400) {
  map.set(key, { at: Date.now(), value });
  if (map.size > max) {
    const first = map.keys().next().value;
    map.delete(first);
  }
}

function cacheGet(map, key, ttlMs) {
  const hit = map.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ttlMs) {
    map.delete(key);
    return null;
  }
  return hit.value;
}

function youtubePlayIntent(videoId, metaHint = {}) {
  if (!/^[\w-]{11}$/.test(videoId)) throw new Error('Invalid video id');
  return {
    provider: 'youtube',
    videoId,
    embed: true,
    track: stripMeta({
      id: `yt${videoId}`,
      title: metaHint.title || 'YouTube',
      artist: metaHint.artist || 'YouTube',
      artwork: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration: metaHint.duration || 0,
      permalink_url: `https://www.youtube.com/watch?v=${videoId}`,
      streamable: true,
      source: 'yt',
    }),
  };
}

function soundcloudPlayIntent(track, audioUrl) {
  const id = String(track.id);
  const proxied = audioUrl ? mediaProxyPath(audioUrl) : null;
  if (proxied) {
    return {
      provider: 'audio',
      audioUrl: proxied,
      track: stripMeta({
        ...track,
        source: 'sc',
        streamable: true,
      }),
    };
  }
  return {
    provider: 'soundcloud',
    soundcloudId: id,
    embed: true,
    widgetUrl:
      'https://w.soundcloud.com/player/?url=' +
      encodeURIComponent(`https://api.soundcloud.com/tracks/${id}`) +
      '&color=%23ffffff&auto_play=true&hide_related=true&show_comments=false&show_user=false&show_reposts=false&show_teaser=false&visual=false',
    track: stripMeta({
      ...track,
      source: 'sc',
      streamable: true,
    }),
  };
}

function itunesAudioIntent(track) {
  const proxied = track?.previewUrl ? mediaProxyPath(track.previewUrl) : null;
  if (!proxied) return null;
  return {
    provider: 'audio',
    audioUrl: proxied,
    track: stripMeta({
      ...track,
      source: 'it',
      streamable: true,
    }),
  };
}

async function resolveSoundCloudStream(trackId) {
  const clientId = await resolveClientId();
  const meta = await fetch(`https://api-v2.soundcloud.com/tracks/${trackId}?client_id=${clientId}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!meta.ok) return null;
  const data = await meta.json();
  const progressive = (data.media?.transcodings || []).find(
    (x) => x?.format?.protocol === 'progressive' && x?.url
  );
  if (!progressive?.url) return null;
  const sep = progressive.url.includes('?') ? '&' : '?';
  const streamMeta = await fetch(`${progressive.url}${sep}client_id=${clientId}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!streamMeta.ok) return null;
  const body = await streamMeta.json();
  const url = typeof body?.url === 'string' ? body.url : null;
  if (!url || !/^https:\/\//i.test(url)) return null;
  return { url, track: mapTrack(data) };
}

async function itunesPreviewFor(title, artist) {
  const hint = `${title || ''} ${artist || ''}`.trim();
  if (!hint) return null;
  const hits = await itunesSearch(hint, 8);
  const lowerTitle = String(title || '').toLowerCase();
  const lowerArtist = String(artist || '').toLowerCase();
  const best =
    hits.find(
      (t) =>
        t.previewUrl &&
        String(t.title).toLowerCase() === lowerTitle &&
        (!lowerArtist || String(t.artist).toLowerCase().includes(lowerArtist.split(' ')[0] || ''))
    ) ||
    hits.find((t) => t.previewUrl && String(t.title).toLowerCase().includes(lowerTitle.slice(0, 18))) ||
    hits.find((t) => t.previewUrl);
  return best || null;
}

async function resolvePlayIntent(parsed, metaHint) {
  const cacheKey = `play:${parsed.kind}:${parsed.id}:${metaHint?.title || ''}:${metaHint?.artist || ''}`;
  const cached = cacheGet(playCache, cacheKey, 1000 * 60 * 45);
  if (cached) return cached;

  let intent = null;

  if (parsed.kind === 'yt') {
    intent = youtubePlayIntent(parsed.videoId, metaHint || {});
    if (!intent) {
      const preview = await itunesPreviewFor(metaHint?.title, metaHint?.artist);
      if (preview) intent = itunesAudioIntent(preview);
    }
  } else if (parsed.kind === 'it') {
    const hint =
      metaHint?._searchHint ||
      `${metaHint?.title || ''} ${metaHint?.artist || ''}`.trim() ||
      parsed.itunesId;
    let itTrack = null;
    try {
      const found = await itunesSearch(hint || metaHint?.title || parsed.itunesId, 8);
      itTrack =
        found.find((t) => t.id === parsed.id) ||
        found.find((t) => t.previewUrl) ||
        found[0] ||
        null;
    } catch {}
    if (!intent) {
      const sc = await findSoundCloudPlayable(metaHint?.title || hint, metaHint?.artist);
      if (sc) {
        try {
          const stream = await resolveSoundCloudStream(sc.id);
          if (stream?.url) intent = soundcloudPlayIntent(stream.track || sc, stream.url);
          else intent = soundcloudPlayIntent(sc);
        } catch {
          intent = soundcloudPlayIntent(sc);
        }
      }
    }
    if (!intent) {
      const yt = await youtubeSearch(hint || metaHint?.title || 'music', 6);
      if (yt.length) {
        intent = youtubePlayIntent(yt[0].id.slice(2), {
          title: metaHint?.title || yt[0].title,
          artist: metaHint?.artist || yt[0].artist,
          duration: metaHint?.duration || yt[0].duration,
        });
      }
    }
    if (!intent && itTrack?.previewUrl) intent = itunesAudioIntent(itTrack);
  } else {
    try {
      const stream = await resolveSoundCloudStream(parsed.id);
      if (stream?.url && stream.track && stream.track.policy !== 'BLOCK') {
        intent = soundcloudPlayIntent(stream.track, stream.url);
      }
    } catch {}
    if (!intent && metaHint?.title) {
      const yt = await youtubeSearch(`${metaHint.title} ${metaHint.artist || ''}`.trim(), 5);
      if (yt.length) {
        intent = youtubePlayIntent(yt[0].id.slice(2), {
          title: metaHint.title,
          artist: metaHint.artist,
          duration: metaHint.duration || yt[0].duration,
        });
      }
    }
    if (!intent && metaHint?.title) {
      const preview = await itunesPreviewFor(metaHint.title, metaHint.artist);
      if (preview) intent = itunesAudioIntent(preview);
    }
  }

  if (!intent) throw new Error('Could not resolve a stream for this track');
  cacheSet(playCache, cacheKey, intent);
  return intent;
}

router.get('/search', async (req, res) => {
  const q = sanitizeQuery(req.query.q);
  if (!q) return res.status(400).json({ error: 'Missing query' });
  const limit = Math.min(40, Math.max(1, parseInt(String(req.query.limit || '24'), 10) || 24));
  const cacheKey = `search:${q.toLowerCase()}:${limit}`;
  const cached = cacheGet(searchResultCache, cacheKey, 1000 * 60 * 12);
  if (cached) {
    res.setHeader('Cache-Control', 'public, max-age=120');
    return res.json(cached);
  }

  try {
    const [ytTracks, itunesTracks, scTracks] = await Promise.all([
      youtubeSearch(q, Math.min(16, limit)),
      itunesSearch(q, Math.min(12, limit)),
      (async () => {
        try {
          const clientId = await resolveClientId();
          return (await fetchSearchRaw(clientId, q, limit))
            .filter((t) => !JUNK_TITLE.test(t.title) && t.title.length <= 100)
            .filter((t) => t.streamable)
            .map(stripMeta);
        } catch {
          return [];
        }
      })(),
    ]);

    const seen = new Set();
    const tracks = [];
    for (const t of [...ytTracks, ...itunesTracks, ...scTracks]) {
      const key = `${String(t.title).toLowerCase()}|${String(t.artist).toLowerCase()}`;
      if (seen.has(t.id) || seen.has(key)) continue;
      seen.add(t.id);
      seen.add(key);
      tracks.push(stripMeta(t));
      if (tracks.length >= limit) break;
    }
    const payload = { tracks };
    cacheSet(searchResultCache, cacheKey, payload);
    res.setHeader('Cache-Control', 'public, max-age=120');
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/track/:id', async (req, res) => {
  const parsed = parseTrackId(req.params.id);
  if (!parsed) return res.status(400).json({ error: 'Invalid id' });
  try {
    if (parsed.kind === 'yt') {
      res.setHeader('Cache-Control', 'public, max-age=600');
      return res.json({
        track: stripMeta({
          id: parsed.id,
          title: 'YouTube track',
          artist: 'YouTube',
          artwork: `https://i.ytimg.com/vi/${parsed.videoId}/hqdefault.jpg`,
          duration: 0,
          permalink_url: `https://www.youtube.com/watch?v=${parsed.videoId}`,
          streamable: true,
          source: 'yt',
        }),
      });
    }
    if (parsed.kind === 'it') {
      const found = await itunesSearch(parsed.itunesId, 5);
      const hit = found.find((t) => t.id === parsed.id) || found[0];
      if (!hit) return res.status(404).json({ error: 'Track not found' });
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.json({ track: stripMeta(hit) });
    }
    const clientId = await resolveClientId();
    const r = await fetch(`https://api-v2.soundcloud.com/tracks/${parsed.id}?client_id=${clientId}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!r.ok) return res.status(404).json({ error: 'Track not found' });
    const track = mapTrack(await r.json());
    res.setHeader('Cache-Control', 'public, max-age=180');
    res.json({ track: stripMeta(track) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

async function handlePlay(req, res) {
  const parsed = parseTrackId(req.params.id);
  if (!parsed) return res.status(400).json({ error: 'Invalid id' });
  try {
    const title = sanitizeQuery(req.query.t || '');
    const artist = sanitizeQuery(req.query.a || '');
    const metaHint = title || artist ? { title, artist, _searchHint: `${title} ${artist}`.trim() } : null;
    const data = await resolvePlayIntent(parsed, metaHint);
    try { bumpUsage('music', 1); } catch {}
    res.setHeader('Cache-Control', 'private, max-age=120');
    return res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Play failed' });
  }
}

router.get('/media/:token', proxyMedia);
router.get('/play/:id', handlePlay);
router.get('/stream/:id', handlePlay);

router.get('/trending', async (_req, res) => {
  try {
    const seeded = seedFlat().slice(0, 20);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({ tracks: seeded });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/browse', async (_req, res) => {
  try {
    const seeded = seedSections().filter((s) => s.tracks.length > 0);
    if (browseCache.sections && Date.now() - browseCache.at < 1000 * 60 * 60) {
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.json({ sections: browseCache.sections });
    }
    res.setHeader('Cache-Control', 'public, max-age=120');
    res.json({ sections: seeded });

    Promise.resolve()
      .then(async () => {
        const chart = await itunesChart(24);
        const sections = seeded.map((s) => ({ ...s, tracks: [...s.tracks] }));
        if (chart.length) {
          const top = sections.find((s) => s.id === 'top');
          if (top) {
            const merged = [];
            const seen = new Set();
            for (const t of [...top.tracks, ...chart.map(stripMeta)]) {
              if (seen.has(t.id)) continue;
              seen.add(t.id);
              merged.push(t);
              if (merged.length >= 18) break;
            }
            top.tracks = merged;
          }
        }
        browseCache.at = Date.now();
        browseCache.sections = sections;
      })
      .catch(() => {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/home', async (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({ tracks: seedFlat().slice(0, 12), artists: [] });
});

export default router;
