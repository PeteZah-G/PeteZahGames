import { useState, useEffect, useRef, useCallback, type CSSProperties, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Play, Pause, SkipBack, SkipForward, Repeat, Repeat1, ListMusic,
  Plus, Trash2, Share2, X, Music2, Heart, Copy, Check, Disc3, Flame,
  Sparkles, Zap, Radio, ChevronLeft, ChevronRight, MoreHorizontal,
  ListPlus, ListEnd, Library,
} from "lucide-react";
import { requestSyncSoon } from "@/lib/settingsSync";
import { pxEncode } from "@/lib/px";
import { trackAchievementEvent } from "@/lib/achievementEvents";
import { AdResponsiveBanner } from "@/components/ads/Adsterra";

interface Track {
  id: string;
  title: string;
  artist: string;
  artwork: string | null;
  duration: number;
  permalink_url?: string | null;
  genre?: string | null;
}

interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
  createdAt: number;
}

interface BrowseSection {
  id: string;
  title: string;
  icon: string;
  tracks: Track[];
}

type NavView = "browse" | "search" | "library" | "playlist";

const S = {
  bg: "transparent",
  surface: "hsla(220, 32%, 8%, 0.55)",
  elevated: "hsla(215, 28%, 14%, 0.72)",
  glass: "hsla(220, 35%, 6%, 0.42)",
  border: "hsla(210, 40%, 70%, 0.12)",
  borderFocus: "hsla(205, 80%, 55%, 0.55)",
  accent: "hsl(205 85% 62%)",
  accentDim: "hsla(205, 70%, 45%, 0.22)",
  accentHot: "hsla(340, 78%, 58%, 0.92)",
  text: "hsla(0, 0%, 98%, 0.95)",
  textSub: "hsla(210, 20%, 70%, 0.65)",
  textMuted: "hsla(210, 15%, 55%, 0.55)",
  danger: "hsl(0 60% 56%)",
};

const MUSIC_KEY = "petezah-music";
const LIKED_KEY = "petezah-music-liked";
const ease = [0.22, 1, 0.36, 1] as const;

function loadPlaylists(): Playlist[] {
  try {
    const raw = localStorage.getItem(MUSIC_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [{ id: "default", name: "Liked Mix", tracks: [], createdAt: Date.now() }];
}

function savePlaylists(playlists: Playlist[]) {
  try {
    localStorage.setItem(MUSIC_KEY, JSON.stringify(playlists));
    requestSyncSoon();
  } catch {}
}

function loadLiked(): Track[] {
  try {
    const raw = localStorage.getItem(LIKED_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveLiked(tracks: Track[]) {
  try {
    localStorage.setItem(LIKED_KEY, JSON.stringify(tracks));
    requestSyncSoon();
  } catch {}
}

function formatTime(ms: number) {
  const s = Math.floor((ms || 0) / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function formatSec(sec: number) {
  const m = Math.floor(sec / 60);
  const r = Math.floor(sec % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function encodeShare(payload: object) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeShare(raw: string) {
  try {
    const pad = raw.length % 4 === 0 ? "" : "=".repeat(4 - (raw.length % 4));
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/") + pad;
    return JSON.parse(decodeURIComponent(escape(atob(b64))));
  } catch {
    return null;
  }
}

function proxifyStream(url: string): string {
  return pxEncode(url) || url;
}

function parseMusicUrl(url?: string) {
  if (!url || !url.startsWith("petezah://music")) return { trackId: null as string | null, share: null as any };
  try {
    const q = url.includes("?") ? url.split("?")[1] : "";
    const params = new URLSearchParams(q);
    const trackId = params.get("t") || params.get("track");
    const shareRaw = params.get("share") || params.get("p");
    return { trackId, share: shareRaw ? decodeShare(shareRaw) : null };
  } catch {
    return { trackId: null, share: null };
  }
}

function sectionIcon(name: string) {
  switch (name) {
    case "flame": return <Flame size={14} />;
    case "sparkles": return <Sparkles size={14} />;
    case "zap": return <Zap size={14} />;
    case "radio": return <Radio size={14} />;
    case "heart": return <Heart size={14} />;
    default: return <Disc3 size={14} />;
  }
}

export default function MusicPage({
  onNavigate,
  initialUrl,
}: {
  onNavigate: (url: string) => void;
  initialUrl?: string;
}) {
  const [query, setQuery] = useState(() => {
    try {
      if (!initialUrl) return "";
      return new URLSearchParams(initialUrl.split("?")[1] || "").get("q") || "";
    } catch {
      return "";
    }
  });
  const [results, setResults] = useState<Track[]>([]);
  const [trending, setTrending] = useState<Track[]>([]);
  const [sections, setSections] = useState<BrowseSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [error, setError] = useState("");
  const [playlists, setPlaylists] = useState<Playlist[]>(loadPlaylists);
  const [liked, setLiked] = useState<Track[]>(loadLiked);
  const [nav, setNav] = useState<NavView>(() => {
    try {
      if (!initialUrl) return "browse";
      const q = new URLSearchParams(initialUrl.split("?")[1] || "").get("q");
      return q ? "search" : "browse";
    } catch {
      return "browse";
    }
  });
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loopTrack, setLoopTrack] = useState(false);
  const [loopPlaylist, setLoopPlaylist] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shareMsg, setShareMsg] = useState("");
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const [menuTrack, setMenuTrack] = useState<Track | null>(null);
  const [addMenuTrack, setAddMenuTrack] = useState<Track | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = queue[queueIndex] || null;

  useEffect(() => { savePlaylists(playlists); }, [playlists]);
  useEffect(() => { saveLiked(liked); }, [liked]);

  useEffect(() => {
    let cancelled = false;
    setBrowseLoading(true);
    Promise.all([
      fetch("/api/music/browse").then((r) => r.json()).catch(() => ({ sections: [] })),
      fetch("/api/music/trending").then((r) => r.json()).catch(() => ({ tracks: [] })),
    ]).then(([browse, trend]) => {
      if (cancelled) return;
      const secs: BrowseSection[] = browse.sections || [];
      setSections(secs);
      setTrending(trend.tracks?.length ? trend.tracks : secs[0]?.tracks || []);
    }).finally(() => {
      if (!cancelled) setBrowseLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const { trackId, share } = parseMusicUrl(initialUrl);
    if (share?.type === "playlist" && Array.isArray(share.tracks)) {
      const imported: Playlist = {
        id: `shared-${Date.now()}`,
        name: share.name || "Shared playlist",
        tracks: share.tracks,
        createdAt: Date.now(),
      };
      setPlaylists((prev) => [imported, ...prev]);
      setActivePlaylistId(imported.id);
      setNav("playlist");
      if (imported.tracks.length) {
        setQueue(imported.tracks);
        setQueueIndex(0);
      }
    } else if (share?.type === "track" && share.track) {
      setQueue([share.track as Track]);
      setQueueIndex(0);
    } else if (trackId) {
      fetch(`/api/music/track/${trackId}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.track) {
            setQueue([d.track]);
            setQueueIndex(0);
          }
        })
        .catch(() => {});
    }
  }, [initialUrl]);

  useEffect(() => {
    if (nav !== "search" || !query.trim()) {
      if (!query.trim()) setResults([]);
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const r = await fetch(`/api/music/search?q=${encodeURIComponent(query.trim())}`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Search failed");
        setResults(d.tracks || []);
      } catch (e: any) {
        setError(e.message || "Search failed");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query, nav]);

  const loadAndPlay = useCallback(async (track: Track) => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      const r = await fetch(`/api/music/stream/${track.id}`);
      const d = await r.json();
      if (!r.ok || !d.streamUrl) throw new Error(d.error || "Stream failed");
      audio.src = proxifyStream(d.streamUrl);
      await audio.play();
      setPlaying(true);
    } catch (e: any) {
      setError(e.message || "Could not play track");
      setPlaying(false);
    }
  }, []);

  const playTrack = useCallback((track: Track, list?: Track[]) => {
    const nextQueue = list && list.length ? list : [track];
    const idx = nextQueue.findIndex((t) => t.id === track.id);
    setQueue(nextQueue);
    setQueueIndex(idx >= 0 ? idx : 0);
  }, []);

  const playNext = useCallback((track: Track) => {
    setQueue((prev) => {
      if (!prev.length) return [track];
      const next = [...prev];
      next.splice(queueIndex + 1, 0, track);
      return next;
    });
  }, [queueIndex]);

  const addToQueue = useCallback((track: Track) => {
    setQueue((prev) => {
      if (!prev.length) {
        setQueueIndex(0);
        return [track];
      }
      return [...prev, track];
    });
  }, []);

  useEffect(() => {
    if (!current) return;
    loadAndPlay(current);
  }, [current?.id, queueIndex]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.loop = !!loopTrack;
  }, [loopTrack]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => {
      setProgress(audio.currentTime);
      setDuration(audio.duration || 0);
    };
    const onEnded = () => {
      if (loopTrack) return;
      if (queueIndex < queue.length - 1) {
        setQueueIndex((i) => i + 1);
      } else if (loopPlaylist && queue.length) {
        setQueueIndex(0);
      } else {
        setPlaying(false);
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [loopTrack, loopPlaylist, queue.length, queueIndex]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (playing) audio.pause();
    else audio.play().catch(() => {});
  };

  const prev = () => {
    if (progress > 3) {
      if (audioRef.current) audioRef.current.currentTime = 0;
      return;
    }
    setQueueIndex((i) => Math.max(0, i - 1));
  };

  const next = () => {
    if (queueIndex < queue.length - 1) setQueueIndex((i) => i + 1);
    else if (loopPlaylist) setQueueIndex(0);
  };

  const isLiked = (id: string) => liked.some((t) => t.id === id);

  const toggleLike = (track: Track) => {
    setLiked((prev) => {
      if (prev.some((t) => t.id === track.id)) return prev.filter((t) => t.id !== track.id);
      return [track, ...prev];
    });
  };

  const createPlaylist = () => {
    const name = newPlaylistName.trim() || "New playlist";
    const pl: Playlist = { id: `pl-${Date.now()}`, name, tracks: [], createdAt: Date.now() };
    setPlaylists((prev) => [...prev, pl]);
    setNewPlaylistName("");
    setShowNewPlaylist(false);
    setActivePlaylistId(pl.id);
    setNav("playlist");
    trackAchievementEvent("playlist");
  };

  const addToPlaylist = (playlistId: string, track: Track) => {
    setPlaylists((prev) =>
      prev.map((p) => {
        if (p.id !== playlistId) return p;
        if (p.tracks.some((t) => t.id === track.id)) return p;
        return { ...p, tracks: [...p.tracks, track] };
      })
    );
    setAddMenuTrack(null);
    setMenuTrack(null);
  };

  const removeFromPlaylist = (playlistId: string, trackId: string) => {
    setPlaylists((prev) =>
      prev.map((p) => (p.id === playlistId ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) } : p))
    );
  };

  const deletePlaylist = (id: string) => {
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
    if (activePlaylistId === id) {
      setActivePlaylistId(null);
      setNav("browse");
    }
  };

  const shareTrack = async (track: Track) => {
    const internal = `petezah://music?t=${track.id}`;
    const url = `${window.location.origin}/?m=${encodeURIComponent(internal)}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareMsg("Link copied");
    } catch {
      setShareMsg(url);
    }
    setTimeout(() => setShareMsg(""), 2200);
  };

  const sharePlaylist = async (pl: Playlist) => {
    const payload = { type: "playlist", name: pl.name, tracks: pl.tracks };
    const token = encodeShare(payload);
    const internal = `petezah://music?share=${token}`;
    const url = `${window.location.origin}/?m=${encodeURIComponent(internal)}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareMsg("Link copied");
    } catch {
      setShareMsg(url);
    }
    setTimeout(() => setShareMsg(""), 2200);
  };

  const activePlaylist = playlists.find((p) => p.id === activePlaylistId);
  const listTracks =
    nav === "search"
      ? results
      : nav === "playlist" && activePlaylist
        ? activePlaylist.tracks
        : nav === "library"
          ? liked
          : trending;

  const mainTitle =
    nav === "search"
      ? "Search"
      : nav === "playlist" && activePlaylist
        ? activePlaylist.name
        : nav === "library"
          ? "Your Library"
          : "Browse";

  return (
    <div
      className="music-page"
      style={{
        position: "absolute", inset: 0, background: S.bg, display: "flex", flexDirection: "column", overflow: "hidden",
      }}
    >
      <audio ref={audioRef} preload="metadata" />

      <div className="music-body" style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Sidebar */}
        <motion.aside
          className="music-sidebar"
          initial={{ opacity: 0, x: -18, filter: "blur(8px)" }}
          animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.7, ease }}
          style={{
            width: 196,
            borderRight: `1px solid ${S.border}`,
            padding: "14px 12px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 3,
            overflowY: "auto",
            flexShrink: 0,
            background: S.glass,
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
          }}
        >
          <motion.h1
            initial={{ opacity: 0, y: 10, letterSpacing: "0.14em", filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, letterSpacing: "-0.03em", filter: "blur(0px)" }}
            transition={{ duration: 0.8, ease }}
            style={{
              fontSize: 22, fontWeight: 750, color: S.text, margin: "2px 4px 12px",
              textShadow: "0 0 28px hsla(205, 80%, 60%, 0.18)",
            }}
          >
            Music
          </motion.h1>

          <SideBtn
            active={nav === "browse"}
            onClick={() => { setNav("browse"); setActivePlaylistId(null); setQuery(""); }}
            icon={<Flame size={13} />}
            label="Browse"
            delay={0.12}
          />
          <SideBtn
            active={nav === "search"}
            onClick={() => { setNav("search"); setActivePlaylistId(null); }}
            icon={<Search size={13} />}
            label="Search"
            delay={0.18}
          />
          <SideBtn
            active={nav === "library"}
            onClick={() => { setNav("library"); setActivePlaylistId(null); setQuery(""); }}
            icon={<Library size={13} />}
            label="Your Library"
            delay={0.24}
          />

          <div className="music-side-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "14px 4px 6px", gap: 6 }}>
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: S.textMuted, margin: 0 }}>
              Playlists
            </p>
            <button
              type="button"
              onClick={() => setShowNewPlaylist(true)}
              title="New playlist"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                padding: "2px 6px",
                borderRadius: 6,
                border: `1px solid ${S.border}`,
                background: "transparent",
                color: S.textMuted,
                fontSize: 9,
                fontWeight: 550,
                cursor: "pointer",
                lineHeight: 1.2,
              }}
            >
              <Plus size={9} /> New
            </button>
          </div>

          {playlists.length === 0 && (
            <p style={{ fontSize: 10, color: S.textMuted, margin: "0 4px 8px", lineHeight: 1.4 }}>
              Create your first playlist.
            </p>
          )}

          {showNewPlaylist && (
            <div style={{ display: "flex", gap: 4, marginBottom: 8, marginInline: 4 }}>
              <input
                autoFocus
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createPlaylist()}
                placeholder="Name"
                style={{
                  flex: 1, background: S.elevated, border: `1px solid ${S.border}`, borderRadius: 8,
                  color: S.text, fontSize: 11, padding: "7px 9px", outline: "none",
                }}
              />
              <button onClick={createPlaylist} style={{
                background: S.accentDim, border: `1px solid ${S.borderFocus}`, borderRadius: 8,
                color: S.accent, padding: "0 8px", cursor: "pointer", display: "flex", alignItems: "center",
              }}>
                <Check size={12} />
              </button>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minHeight: 0, overflowY: "auto" }}>
            {playlists.map((pl, i) => (
              <div key={pl.id} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <SideBtn
                    active={nav === "playlist" && activePlaylistId === pl.id}
                    onClick={() => { setNav("playlist"); setActivePlaylistId(pl.id); setQuery(""); }}
                    icon={<ListMusic size={13} />}
                    label={`${pl.name}`}
                    delay={0.36 + i * 0.04}
                  />
                </div>
                <button
                  onClick={() => sharePlaylist(pl)}
                  title="Share playlist"
                  style={{ background: "none", border: "none", color: S.textMuted, cursor: "pointer", padding: 4, display: "flex" }}
                >
                  <Share2 size={11} />
                </button>
                <button
                  onClick={() => deletePlaylist(pl.id)}
                  title="Delete"
                  style={{ background: "none", border: "none", color: S.textMuted, cursor: "pointer", padding: 4, display: "flex" }}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>

        </motion.aside>

        {/* Main */}
        <div className="music-main" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <motion.div
            className="music-list-header"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease }}
            style={{
              padding: "12px 16px 6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexShrink: 0,
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, color: S.text, margin: 0, letterSpacing: "-0.02em" }}>
              {mainTitle}
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {nav === "playlist" && activePlaylist && activePlaylist.tracks.length > 0 && (
                <button
                  onClick={() => {
                    setQueue(activePlaylist.tracks);
                    setQueueIndex(0);
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 999,
                    background: S.accent, border: "none", color: "#fff", fontSize: 11, fontWeight: 650, cursor: "pointer",
                  }}
                >
                  <Play size={11} fill="#fff" /> Play all
                </button>
              )}
              <div
                style={{
                  width: 30, height: 30, borderRadius: "50%",
                  border: `1px solid ${S.border}`, background: S.elevated,
                  display: "flex", alignItems: "center", justifyContent: "center", color: S.textMuted,
                }}
              >
                <Music2 size={13} />
              </div>
            </div>
          </motion.div>

          {nav === "search" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease }}
              className="music-search"
              style={{
                margin: "0 22px 12px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: S.elevated,
                border: `1px solid ${S.border}`,
                borderRadius: 12,
                padding: "10px 12px",
              }}
            >
              <Search size={14} style={{ color: S.textMuted }} />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search songs, artists…"
                style={{
                  flex: 1, background: "none", border: "none", outline: "none",
                  color: S.text, fontSize: 13, fontFamily: "inherit",
                }}
              />
              {query && (
                <button onClick={() => setQuery("")} style={{ background: "none", border: "none", color: S.textMuted, cursor: "pointer", padding: 0, display: "flex" }}>
                  <X size={13} />
                </button>
              )}
            </motion.div>
          )}

          {error && (
            <div style={{ margin: "0 22px 10px", padding: "8px 12px", borderRadius: 8, background: "hsl(0 60% 30% / 0.15)", border: `1px solid hsl(0 50% 40% / 0.3)`, color: S.danger, fontSize: 11 }}>
              {error}
            </div>
          )}

          <div className="music-track-list" style={{ flex: 1, overflowY: "auto", padding: "4px 0 12px", scrollbarWidth: "none" }}>
            {nav === "browse" ? (
              <BrowseView
                sections={sections}
                trending={trending}
                loading={browseLoading}
                currentId={current?.id}
                playing={playing}
                onPlay={(track, list) => playTrack(track, list)}
                onMenu={setMenuTrack}
              />
            ) : (
              <TrackListView
                tracks={listTracks}
                loading={loading || (nav === "browse" && browseLoading)}
                emptyLabel={
                  nav === "search"
                    ? query
                      ? "No tracks found"
                      : "Type to search the catalog"
                    : nav === "library"
                      ? "Liked tracks show up here"
                      : "This playlist is empty"
                }
                currentId={current?.id}
                playing={playing}
                isLiked={isLiked}
                onPlay={(track) => playTrack(track, listTracks)}
                onLike={toggleLike}
                onMenu={setMenuTrack}
                onRemove={
                  nav === "playlist" && activePlaylist
                    ? (id) => removeFromPlaylist(activePlaylist.id, id)
                    : undefined
                }
              />
            )}

            {/* Ad sits below all shelves / lists — scroll to reach */}
            <div style={{ padding: "28px 22px 48px", minHeight: 140 }}>
              <AdResponsiveBanner />
            </div>
          </div>
        </div>
      </div>

      {/* Player — only when a track is loaded */}
      <AnimatePresence>
      {current && (
      <motion.div
        className="music-player"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.4, ease }}
        style={{
          borderTop: `1px solid ${S.border}`,
          background: "hsla(220, 35%, 6%, 0.72)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          padding: "10px 14px 12px",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            height: 4, borderRadius: 99, background: S.elevated, marginBottom: 12, cursor: current ? "pointer" : "default",
            position: "relative", overflow: "hidden",
          }}
          onClick={(e) => {
            if (!audioRef.current || !duration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
            audioRef.current.currentTime = ratio * duration;
          }}
        >
          <div style={{
            height: "100%", width: `${duration ? (progress / duration) * 100 : 0}%`,
            background: S.accent,
            borderRadius: 99, transition: "width 0.1s linear",
          }} />
        </div>

        <div className="music-player-row" style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div className="music-now" style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
            <div style={{
              width: 46, height: 46, borderRadius: 11, overflow: "hidden", background: S.elevated, flexShrink: 0,
              border: `1px solid ${S.border}`,
            }}>
              {current?.artwork ? (
                <img src={current.artwork} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: S.textMuted }}>
                  <Music2 size={16} />
                </div>
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 650, color: S.text, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {current?.title || "Nothing playing"}
              </p>
              <p style={{ fontSize: 10, color: S.textMuted, margin: "2px 0 0" }}>
                {current?.artist || "—"}
              </p>
            </div>
          </div>

          <div className="music-controls" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={prev} style={ctrlBtn}><SkipBack size={15} /></button>
            <button
              onClick={togglePlay}
              disabled={!current}
              style={{
                width: 40, height: 40, borderRadius: "50%", border: "none", cursor: current ? "pointer" : "default",
                background: S.accent,
                color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                opacity: current ? 1 : 0.4,
              }}
            >
              {playing ? <Pause size={15} fill="#fff" /> : <Play size={15} fill="#fff" style={{ marginLeft: 2 }} />}
            </button>
            <button onClick={next} style={ctrlBtn}><SkipForward size={15} /></button>
          </div>

          <div className="music-extra" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
            <span className="music-time" style={{ fontSize: 10, color: S.textMuted, fontVariantNumeric: "tabular-nums" }}>
              {formatSec(progress)} / {formatSec(duration)}
            </span>
            <button
              onClick={() => setLoopTrack((v) => !v)}
              title="Loop track"
              style={{ ...ctrlBtn, color: loopTrack ? S.accent : S.textMuted }}
            >
              <Repeat1 size={14} />
            </button>
            <button
              onClick={() => setLoopPlaylist((v) => !v)}
              title="Loop playlist"
              style={{ ...ctrlBtn, color: loopPlaylist ? S.accent : S.textMuted }}
            >
              <Repeat size={14} />
            </button>
            {current && (
              <button onClick={() => shareTrack(current)} style={ctrlBtn} title="Share track">
                <Share2 size={13} />
              </button>
            )}
          </div>
        </div>
      </motion.div>
      )}
      </AnimatePresence>

      {/* Track action sheet */}
      <AnimatePresence>
        {menuTrack && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "absolute", inset: 0, background: "hsla(220, 40%, 4%, 0.55)",
              backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center",
              zIndex: 40, padding: 16,
            }}
            onClick={() => setMenuTrack(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.96, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: 10, scale: 0.97 }}
              transition={{ duration: 0.35, ease }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%", maxWidth: 320,
                background: "hsla(220, 28%, 10%, 0.82)",
                border: `1px solid ${S.border}`,
                borderRadius: 18,
                padding: "16px 8px 10px",
                boxShadow: "0 24px 70px hsla(0,0%,0%,0.5)",
                backdropFilter: "blur(20px)",
              }}
            >
              <div style={{ padding: "0 12px 12px" }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: S.text, margin: 0 }}>{menuTrack.title}</p>
                <p style={{ fontSize: 12, color: S.textMuted, margin: "4px 0 0" }}>{menuTrack.artist}</p>
              </div>
              <MenuGroup>
                <MenuItem icon={<Play size={15} />} label="Play now" onClick={() => { playTrack(menuTrack); setMenuTrack(null); }} />
                <MenuItem icon={<ListEnd size={15} />} label="Play next" onClick={() => { playNext(menuTrack); setMenuTrack(null); }} />
                <MenuItem icon={<ListPlus size={15} />} label="Add to queue" onClick={() => { addToQueue(menuTrack); setMenuTrack(null); }} />
              </MenuGroup>
              <MenuDivider />
              <MenuGroup>
                <MenuItem icon={<Plus size={15} />} label="Add to playlist" onClick={() => { setAddMenuTrack(menuTrack); setMenuTrack(null); }} />
                <MenuItem
                  icon={<Heart size={15} fill={isLiked(menuTrack.id) ? "currentColor" : "none"} />}
                  label={isLiked(menuTrack.id) ? "Unlike" : "Like"}
                  onClick={() => { toggleLike(menuTrack); setMenuTrack(null); }}
                />
              </MenuGroup>
              <MenuDivider />
              <MenuGroup>
                <MenuItem icon={<Copy size={15} />} label="Copy link" onClick={() => { shareTrack(menuTrack); setMenuTrack(null); }} />
                {menuTrack.permalink_url && (
                  <MenuItem
                    icon={<Share2 size={15} />}
                    label="Open source"
                    onClick={() => {
                      window.open(menuTrack.permalink_url!, "_blank", "noopener,noreferrer");
                      setMenuTrack(null);
                    }}
                  />
                )}
              </MenuGroup>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {addMenuTrack && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "absolute", inset: 0, background: "hsla(220, 40%, 4%, 0.55)",
              display: "flex", alignItems: "center", justifyContent: "center", zIndex: 45,
            }}
            onClick={() => setAddMenuTrack(null)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 280, background: S.surface, border: `1px solid ${S.border}`,
                borderRadius: 14, padding: 16, boxShadow: "0 20px 60px hsl(0 0% 0% / 0.45)",
                backdropFilter: "blur(16px)",
              }}
            >
              <p style={{ fontSize: 12, fontWeight: 650, color: S.text, margin: "0 0 4px" }}>Add to playlist</p>
              <p style={{ fontSize: 10, color: S.textMuted, margin: "0 0 12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {addMenuTrack.title}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto" }}>
                {playlists.map((pl) => (
                  <button
                    key={pl.id}
                    onClick={() => addToPlaylist(pl.id, addMenuTrack)}
                    style={{
                      textAlign: "left", padding: "9px 11px", borderRadius: 8, cursor: "pointer",
                      background: S.elevated, border: `1px solid ${S.border}`, color: S.text, fontSize: 12,
                    }}
                  >
                    {pl.name}
                  </button>
                ))}
                {playlists.length === 0 && (
                  <p style={{ fontSize: 11, color: S.textMuted, textAlign: "center", padding: 12 }}>Create a playlist first</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {shareMsg && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              position: "absolute", bottom: 110, left: "50%", transform: "translateX(-50%)",
              background: S.elevated, border: `1px solid ${S.borderFocus}`, borderRadius: 10,
              padding: "8px 14px", color: S.accent, fontSize: 11, fontWeight: 600,
              display: "flex", alignItems: "center", gap: 6, zIndex: 50, maxWidth: "80%",
            }}
          >
            <Copy size={12} /> {shareMsg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BrowseView({
  sections,
  trending,
  loading,
  currentId,
  playing,
  onPlay,
  onMenu,
}: {
  sections: BrowseSection[];
  trending: Track[];
  loading: boolean;
  currentId?: string;
  playing: boolean;
  onPlay: (track: Track, list: Track[]) => void;
  onMenu: (track: Track) => void;
}) {
  const rows = sections.length
    ? sections
    : trending.length
      ? [{ id: "top", title: "Top Hits", icon: "flame", tracks: trending }]
      : [];

  if (loading && !rows.length) {
    return <p style={{ textAlign: "center", color: S.textMuted, fontSize: 12, padding: 48 }}>Loading shelves…</p>;
  }
  if (!rows.length) {
    return <p style={{ textAlign: "center", color: S.textMuted, fontSize: 12, padding: 48 }}>Nothing to browse yet</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 12 }}>
      {rows.map((row, ri) => (
        <ShelfRow
          key={row.id}
          title={row.title}
          icon={sectionIcon(row.icon)}
          tracks={row.tracks}
          delay={0.18 + ri * 0.08}
          currentId={currentId}
          playing={playing}
          onPlay={onPlay}
          onMenu={onMenu}
        />
      ))}
    </div>
  );
}

function ShelfRow({
  title,
  icon,
  tracks,
  delay,
  currentId,
  playing,
  onPlay,
  onMenu,
}: {
  title: string;
  icon: ReactNode;
  tracks: Track[];
  delay: number;
  currentId?: string;
  playing: boolean;
  onPlay: (track: Track, list: Track[]) => void;
  onMenu: (track: Track) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const visibleTracks = tracks.filter((t) => !hiddenIds.has(t.id));

  const hideTrack = useCallback((id: string) => {
    setHiddenIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const scrollBy = (dir: number) => {
    scrollerRef.current?.scrollBy({ left: dir * 300, behavior: "smooth" });
  };

  if (!visibleTracks.length) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.65, delay, ease }}
      style={{ paddingInline: 18 }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, color: S.text }}>
          <span style={{ color: S.accent, display: "flex" }}>{icon}</span>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{title}</h3>
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          <button onClick={() => scrollBy(-1)} style={chevBtn} aria-label="Scroll left">
            <ChevronLeft size={13} />
          </button>
          <button onClick={() => scrollBy(1)} style={chevBtn} aria-label="Scroll right">
            <ChevronRight size={13} />
          </button>
        </div>
      </div>
      <div
        ref={scrollerRef}
        className="music-shelf"
        style={{
          display: "flex",
          gap: 12,
          overflowX: "auto",
          paddingBottom: 4,
          scrollbarWidth: "none",
        }}
      >
        {visibleTracks.map((track, i) => {
          const active = currentId === track.id;
          return (
            <motion.button
              key={track.id}
              type="button"
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.45, delay: delay + 0.05 + i * 0.03, ease }}
              onClick={() => onPlay(track, visibleTracks)}
              className="music-card"
              style={{
                flex: "0 0 128px",
                width: 128,
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                textAlign: "left",
                color: S.text,
              }}
            >
              <div
                style={{
                  width: 128,
                  height: 128,
                  borderRadius: 12,
                  overflow: "hidden",
                  background: S.elevated,
                  border: `1px solid ${active ? S.borderFocus : S.border}`,
                  position: "relative",
                  boxShadow: active ? `0 0 0 1px ${S.accentDim}` : "none",
                }}
              >
                {track.artwork ? (
                  <img
                    src={track.artwork}
                    alt=""
                    loading="lazy"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    onError={() => hideTrack(track.id)}
                  />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: S.textMuted }}>
                    <Music2 size={20} />
                  </div>
                )}
                <div
                  className="music-card-overlay"
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "linear-gradient(to top, hsla(220,40%,4%,0.55), transparent 55%)",
                    opacity: active ? 1 : 0,
                    transition: "opacity 0.2s ease",
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "space-between",
                    padding: 8,
                  }}
                >
                  <span style={{
                    width: 28, height: 28, borderRadius: "50%", background: S.accent,
                    display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
                  }}>
                    {active && playing ? <Pause size={11} fill="#fff" /> : <Play size={11} fill="#fff" style={{ marginLeft: 1 }} />}
                  </span>
                  <span
                    onClick={(e) => { e.stopPropagation(); onMenu(track); }}
                    style={{
                      width: 24, height: 24, borderRadius: "50%", background: "hsla(0,0%,0%,0.45)",
                      display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
                    }}
                  >
                    <MoreHorizontal size={13} />
                  </span>
                </div>
              </div>
              <p style={{
                margin: "7px 1px 0", fontSize: 11, fontWeight: 650, color: active ? S.accent : S.text,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {track.title}
              </p>
              <p style={{
                margin: "2px 1px 0", fontSize: 10, color: S.textMuted,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {track.artist}
              </p>
            </motion.button>
          );
        })}
      </div>
    </motion.section>
  );
}

function TrackListView({
  tracks,
  loading,
  emptyLabel,
  currentId,
  playing,
  isLiked,
  onPlay,
  onLike,
  onMenu,
  onRemove,
}: {
  tracks: Track[];
  loading: boolean;
  emptyLabel: string;
  currentId?: string;
  playing: boolean;
  isLiked: (id: string) => boolean;
  onPlay: (track: Track) => void;
  onLike: (track: Track) => void;
  onMenu: (track: Track) => void;
  onRemove?: (id: string) => void;
}) {
  if (loading) return <p style={{ textAlign: "center", color: S.textMuted, fontSize: 12, padding: 40 }}>Searching…</p>;
  if (!tracks.length) return <p style={{ textAlign: "center", color: S.textMuted, fontSize: 12, padding: 40 }}>{emptyLabel}</p>;

  return (
    <div style={{ padding: "0 14px" }}>
      <AnimatePresence>
        {tracks.map((track, i) => {
          const active = currentId === track.id;
          return (
            <motion.div
              key={`${track.id}-${i}`}
              initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.35, delay: Math.min(i * 0.02, 0.35), ease }}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", borderRadius: 12,
                background: active ? S.accentDim : "transparent",
                border: `1px solid ${active ? S.borderFocus : "transparent"}`,
                cursor: "pointer", marginBottom: 2,
              }}
              onClick={() => onPlay(track)}
              onMouseEnter={(e) => {
                if (!active) (e.currentTarget as HTMLDivElement).style.background = S.elevated;
              }}
              onMouseLeave={(e) => {
                if (!active) (e.currentTarget as HTMLDivElement).style.background = "transparent";
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 10, overflow: "hidden",
                background: S.elevated, flexShrink: 0, position: "relative",
              }}>
                {track.artwork ? (
                  <img src={track.artwork} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: S.textMuted }}>
                    <Music2 size={14} />
                  </div>
                )}
                {active && playing && (
                  <div style={{
                    position: "absolute", inset: 0, background: "hsla(220, 35%, 6%, 0.45)",
                    display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
                  }}>
                    <Pause size={12} fill="#fff" />
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: active ? S.accent : S.text, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {track.title}
                </p>
                <p style={{ fontSize: 10, color: S.textMuted, margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {track.artist}
                </p>
              </div>
              <span style={{ fontSize: 10, color: S.textMuted, fontVariantNumeric: "tabular-nums" }}>
                {formatTime(track.duration)}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); onLike(track); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: isLiked(track.id) ? S.accent : S.textMuted, padding: 4, display: "flex" }}
              >
                <Heart size={13} fill={isLiked(track.id) ? "currentColor" : "none"} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onMenu(track); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: S.textMuted, padding: 4, display: "flex" }}
              >
                <MoreHorizontal size={14} />
              </button>
              {onRemove && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove(track.id); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: S.textMuted, padding: 4, display: "flex" }}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function MenuGroup({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>{children}</div>;
}

function MenuDivider() {
  return <div style={{ height: 1, background: S.border, margin: "6px 10px" }} />;
}

function MenuItem({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "11px 14px",
        borderRadius: 10,
        border: "none",
        background: "transparent",
        color: S.text,
        fontSize: 13,
        cursor: "pointer",
        textAlign: "left",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = S.elevated; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
    >
      <span style={{ width: 18, display: "flex", color: S.textSub }}>{icon}</span>
      {label}
    </button>
  );
}

const ctrlBtn: CSSProperties = {
  background: "none",
  border: "none",
  color: "hsla(210, 20%, 75%, 0.7)",
  cursor: "pointer",
  padding: 6,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const chevBtn: CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: "50%",
  border: `1px solid ${S.border}`,
  background: S.elevated,
  color: S.textSub,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

function SideBtn({
  active, onClick, icon, label, delay = 0,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  delay?: number;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay, ease }}
      onClick={onClick}
      className="music-side-btn"
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "7px 10px",
        borderRadius: 999, border: "none",
        background: active ? "hsla(210, 40%, 90%, 0.1)" : "transparent",
        color: active ? S.text : S.textSub, fontSize: 12, fontWeight: active ? 600 : 500, cursor: "pointer",
        textAlign: "left", overflow: "hidden",
      }}
    >
      <span style={{ flexShrink: 0, display: "flex", color: active ? S.accent : "inherit" }}>{icon}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </motion.button>
  );
}
