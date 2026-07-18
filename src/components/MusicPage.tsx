import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Play, Pause, SkipBack, SkipForward, Repeat, Repeat1, ListMusic,
  Plus, Trash2, Share2, X, Music2, Heart, Copy, Check, Disc3,
} from "lucide-react";
import { requestSyncSoon } from "@/lib/settingsSync";

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

const S = {
  bg: "transparent",
  surface: "hsla(220, 32%, 8%, 0.72)",
  elevated: "hsla(215, 28%, 14%, 0.85)",
  border: "hsla(210, 40%, 70%, 0.12)",
  borderFocus: "hsla(205, 80%, 55%, 0.55)",
  accent: "hsl(205 85% 62%)",
  accentDim: "hsla(205, 70%, 45%, 0.22)",
  text: "hsla(0, 0%, 98%, 0.95)",
  textSub: "hsla(210, 20%, 70%, 0.65)",
  textMuted: "hsla(210, 15%, 55%, 0.55)",
  danger: "hsl(0 60% 56%)",
  success: "hsl(150 50% 45%)",
};

const MUSIC_KEY = "petezah-music";
const LIKED_KEY = "petezah-music-liked";

function loadPlaylists(): Playlist[] {
  try {
    const raw = localStorage.getItem(MUSIC_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [{ id: "default", name: "Liked", tracks: [], createdAt: Date.now() }];
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
  const scramjet = (window as any).scramjet;
  if (scramjet && typeof scramjet.encodeUrl === "function") {
    try {
      return scramjet.encodeUrl(url);
    } catch {}
  }
  return url;
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

export default function MusicPage({
  onNavigate,
  initialUrl,
}: {
  onNavigate: (url: string) => void;
  initialUrl?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [trending, setTrending] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [playlists, setPlaylists] = useState<Playlist[]>(loadPlaylists);
  const [liked, setLiked] = useState<Track[]>(loadLiked);
  const [libraryView, setLibraryView] = useState<"discover" | "liked" | "playlist">("discover");
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
  const [addMenuTrack, setAddMenuTrack] = useState<Track | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = queue[queueIndex] || null;

  useEffect(() => { savePlaylists(playlists); }, [playlists]);
  useEffect(() => { saveLiked(liked); }, [liked]);

  useEffect(() => {
    fetch("/api/music/trending")
      .then((r) => r.json())
      .then((d) => setTrending(d.tracks || []))
      .catch(() => {});
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
      setLibraryView("playlist");
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
    if (!query.trim()) {
      setResults([]);
      setError("");
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
  }, [query]);

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
  };

  const removeFromPlaylist = (playlistId: string, trackId: string) => {
    setPlaylists((prev) =>
      prev.map((p) => (p.id === playlistId ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) } : p))
    );
  };

  const deletePlaylist = (id: string) => {
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
    if (activePlaylistId === id) setActivePlaylistId(null);
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
  const displayList = query.trim()
    ? results
    : libraryView === "playlist" && activePlaylist
      ? activePlaylist.tracks
      : libraryView === "liked"
        ? liked
        : trending;
  const listLabel = query.trim()
    ? "Search"
    : libraryView === "playlist" && activePlaylist
      ? activePlaylist.name
      : libraryView === "liked"
        ? "Liked"
        : "Trending";

  return (
    <div style={{
      position: "absolute", inset: 0, background: S.bg, display: "flex", flexDirection: "column", overflow: "hidden",
      backgroundImage: "radial-gradient(ellipse 80% 50% at 20% 0%, hsla(205,90%,50%,0.12), transparent 55%), radial-gradient(ellipse 60% 40% at 90% 100%, hsla(230,70%,40%,0.1), transparent 50%)",
    }}>
      <audio ref={audioRef} preload="metadata" />

      <div style={{
        display: "flex", alignItems: "center", gap: 14, padding: "16px 20px 12px",
        borderBottom: `1px solid ${S.border}`, flexShrink: 0,
        backdropFilter: "blur(12px)",
        background: "hsla(220, 35%, 6%, 0.45)",
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 11,
          background: "linear-gradient(135deg, hsla(205, 90%, 55%, 0.4), hsla(250, 50%, 45%, 0.25))",
          border: `1px solid ${S.borderFocus}`, display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 24px hsla(205, 90%, 55%, 0.25)",
        }}>
          <Music2 size={15} style={{ color: S.accent }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 15, fontWeight: 700, color: S.text, margin: 0, letterSpacing: "-0.02em" }}>Music</h1>
          <p style={{ fontSize: 10, color: S.textMuted, margin: 0 }}>Search · play · share</p>
        </div>
        <div style={{
          flex: 1.4, maxWidth: 420, display: "flex", alignItems: "center", gap: 8,
          background: S.elevated, border: `1px solid ${S.border}`, borderRadius: 12, padding: "9px 12px",
        }}>
          <Search size={13} style={{ color: S.textMuted }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search songs…"
            style={{
              flex: 1, background: "none", border: "none", outline: "none",
              color: S.text, fontSize: 12, fontFamily: "inherit",
            }}
          />
          {query && (
            <button onClick={() => setQuery("")} style={{ background: "none", border: "none", color: S.textMuted, cursor: "pointer", padding: 0, display: "flex" }}>
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{
          width: 200, borderRight: `1px solid ${S.border}`, padding: "14px 12px",
          display: "flex", flexDirection: "column", gap: 4, overflowY: "auto", flexShrink: 0,
        }}>
          <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: S.textMuted, margin: "0 0 8px 6px" }}>
            Library
          </p>
          <SideBtn
            active={libraryView === "discover" && !query}
            onClick={() => { setLibraryView("discover"); setActivePlaylistId(null); setQuery(""); }}
            icon={<Disc3 size={12} />}
            label="Discover"
          />
          <SideBtn
            active={libraryView === "liked" && !query}
            onClick={() => { setLibraryView("liked"); setActivePlaylistId(null); setQuery(""); }}
            icon={<Heart size={12} />}
            label={`Liked (${liked.length})`}
          />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "14px 6px 8px" }}>
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: S.textMuted, margin: 0 }}>
              Playlists
            </p>
            <button
              onClick={() => setShowNewPlaylist(true)}
              style={{ background: "none", border: "none", color: S.accent, cursor: "pointer", padding: 0, display: "flex" }}
            >
              <Plus size={13} />
            </button>
          </div>

          {showNewPlaylist && (
            <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
              <input
                autoFocus
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createPlaylist()}
                placeholder="Name"
                style={{
                  flex: 1, background: S.elevated, border: `1px solid ${S.border}`, borderRadius: 7,
                  color: S.text, fontSize: 11, padding: "6px 8px", outline: "none",
                }}
              />
              <button onClick={createPlaylist} style={{
                background: S.accentDim, border: `1px solid ${S.borderFocus}`, borderRadius: 7,
                color: S.accent, padding: "0 8px", cursor: "pointer",
              }}>
                <Check size={12} />
              </button>
            </div>
          )}

          {playlists.map((pl) => (
            <div key={pl.id} style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <SideBtn
                  active={libraryView === "playlist" && activePlaylistId === pl.id}
                  onClick={() => { setLibraryView("playlist"); setActivePlaylistId(pl.id); setQuery(""); }}
                  icon={<ListMusic size={12} />}
                  label={`${pl.name} (${pl.tracks.length})`}
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

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ padding: "14px 20px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ fontSize: 13, fontWeight: 650, color: S.text, margin: 0 }}>{listLabel}</h2>
            {activePlaylist && activePlaylist.tracks.length > 0 && (
              <button
                onClick={() => {
                  setQueue(activePlaylist.tracks);
                  setQueueIndex(0);
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 8,
                  background: S.accent, border: "none", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer",
                }}
              >
                <Play size={11} fill="#fff" /> Play all
              </button>
            )}
          </div>

          {error && (
            <div style={{ margin: "0 20px 10px", padding: "8px 12px", borderRadius: 8, background: "hsl(0 60% 30% / 0.15)", border: `1px solid hsl(0 50% 40% / 0.3)`, color: S.danger, fontSize: 11 }}>
              {error}
            </div>
          )}

          <div style={{ flex: 1, overflowY: "auto", padding: "4px 12px 20px" }}>
            {loading && <p style={{ textAlign: "center", color: S.textMuted, fontSize: 12, padding: 40 }}>Searching…</p>}
            {!loading && displayList.length === 0 && (
              <p style={{ textAlign: "center", color: S.textMuted, fontSize: 12, padding: 40 }}>
                {query ? "No tracks found" : "Search for a song to get started"}
              </p>
            )}
            <AnimatePresence>
              {displayList.map((track, i) => {
                const active = current?.id === track.id;
                return (
                  <motion.div
                    key={`${listLabel}-${track.id}-${i}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", borderRadius: 10,
                      background: active ? S.accentDim : "transparent",
                      border: `1px solid ${active ? S.borderFocus : "transparent"}`,
                      cursor: "pointer", marginBottom: 2,
                    }}
                    onClick={() => playTrack(track, displayList)}
                    onMouseEnter={(e) => {
                      if (!active) (e.currentTarget as HTMLDivElement).style.background = S.elevated;
                    }}
                    onMouseLeave={(e) => {
                      if (!active) (e.currentTarget as HTMLDivElement).style.background = "transparent";
                    }}
                  >
                    <div style={{
                      width: 42, height: 42, borderRadius: 8, overflow: "hidden",
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
                          position: "absolute", inset: 0, background: "hsl(216 32% 6% / 0.45)",
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
                      onClick={(e) => { e.stopPropagation(); toggleLike(track); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: isLiked(track.id) ? S.accent : S.textMuted, padding: 4, display: "flex" }}
                    >
                      <Heart size={13} fill={isLiked(track.id) ? "currentColor" : "none"} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setAddMenuTrack(track); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: S.textMuted, padding: 4, display: "flex" }}
                    >
                      <Plus size={13} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); shareTrack(track); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: S.textMuted, padding: 4, display: "flex" }}
                    >
                      <Share2 size={12} />
                    </button>
                    {libraryView === "playlist" && activePlaylist && (
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFromPlaylist(activePlaylist.id, track.id); }}
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
        </div>
      </div>

      <div style={{
        borderTop: `1px solid ${S.border}`,
        background: "hsla(220, 35%, 6%, 0.82)",
        backdropFilter: "blur(16px)",
        padding: "12px 18px 14px", flexShrink: 0,
      }}>
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
            background: `linear-gradient(90deg, ${S.accent}, hsl(230 80% 70%))`,
            borderRadius: 99, transition: "width 0.1s linear",
            boxShadow: "0 0 12px hsla(205, 90%, 60%, 0.45)",
          }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
            <div style={{
              width: 46, height: 46, borderRadius: 11, overflow: "hidden", background: S.elevated, flexShrink: 0,
              border: `1px solid ${S.border}`, boxShadow: current ? "0 0 20px hsla(205, 80%, 50%, 0.2)" : "none",
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

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={prev} style={ctrlBtn}><SkipBack size={15} /></button>
            <button
              onClick={togglePlay}
              disabled={!current}
              style={{
                width: 40, height: 40, borderRadius: "50%", border: "none", cursor: current ? "pointer" : "default",
                background: `linear-gradient(135deg, ${S.accent}, hsl(230 75% 55%))`,
                color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                opacity: current ? 1 : 0.4,
                boxShadow: current ? "0 4px 20px hsla(205, 90%, 50%, 0.4)" : "none",
              }}
            >
              {playing ? <Pause size={15} fill="#fff" /> : <Play size={15} fill="#fff" style={{ marginLeft: 2 }} />}
            </button>
            <button onClick={next} style={ctrlBtn}><SkipForward size={15} /></button>
          </div>

          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
            <span style={{ fontSize: 10, color: S.textMuted, fontVariantNumeric: "tabular-nums" }}>
              {formatSec(progress)} / {formatSec(duration)}
            </span>
            <button
              onClick={() => setLoopTrack((v) => !v)}
              title="Loop track"
              style={{
                ...ctrlBtn,
                color: loopTrack ? S.accent : S.textMuted,
              }}
            >
              <Repeat1 size={14} />
            </button>
            <button
              onClick={() => setLoopPlaylist((v) => !v)}
              title="Loop playlist"
              style={{
                ...ctrlBtn,
                color: loopPlaylist ? S.accent : S.textMuted,
              }}
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
      </div>

      <AnimatePresence>
        {addMenuTrack && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "absolute", inset: 0, background: "hsl(216 32% 4% / 0.65)",
              display: "flex", alignItems: "center", justifyContent: "center", zIndex: 40,
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
              position: "absolute", bottom: 100, left: "50%", transform: "translateX(-50%)",
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

const ctrlBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "hsla(210, 20%, 75%, 0.7)",
  cursor: "pointer",
  padding: 6,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

function SideBtn({
  active, onClick, icon, label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
        borderRadius: 8, border: `1px solid ${active ? S.borderFocus : "transparent"}`,
        background: active ? S.accentDim : "transparent",
        color: active ? S.accent : S.textSub, fontSize: 11, fontWeight: 500, cursor: "pointer",
        textAlign: "left", overflow: "hidden",
      }}
    >
      <span style={{ flexShrink: 0, display: "flex" }}>{icon}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </button>
  );
}
