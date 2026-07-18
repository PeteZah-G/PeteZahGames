import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, X, Film, Search, Heart, ArrowLeft, Tv, Star, Clapperboard, Sparkles,
  ChevronLeft, ChevronRight,
} from "lucide-react";

interface CatalogItem {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string;
  backdrop_path?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  media_type?: string;
}

interface SeasonInfo {
  season_number: number;
  name?: string;
  episode_count?: number;
}

interface EpisodeInfo {
  episode_number: number;
  name?: string;
  overview?: string;
  still_path?: string;
}

interface SavedMovie {
  id: string;
  type: "movie" | "tv";
  tmdbId: number;
  title: string;
  poster_path?: string;
  backdrop_path?: string;
  release_date?: string;
  first_air_date?: string;
  groupId: string | null;
  season?: number;
  episode?: number;
  createdAt: number;
}

interface MovieGroup {
  id: string;
  name: string;
  collapsed: boolean;
  createdAt: number;
}

interface PlayerState {
  type: "movie" | "tv";
  tmdbId: number;
  title: string;
  poster_path?: string;
  backdrop_path?: string;
  overview?: string;
  season?: number;
  episode?: number;
}

const S = {
  bg: "hsl(216 32% 6%)",
  surface: "hsl(216 26% 9%)",
  elevated: "hsl(216 22% 12%)",
  border: "hsl(216 20% 16%)",
  borderFocus: "hsl(213 60% 40%)",
  accent: "hsl(213 70% 58%)",
  accentDim: "hsl(213 50% 40% / 0.3)",
  text: "hsl(0 0% 96%)",
  textSub: "hsl(216 15% 45%)",
  textMuted: "hsl(216 12% 28%)",
  danger: "hsl(0 60% 56%)",
  gold: "hsl(42 90% 55%)",
};

const TMDB_IMG = "https://image.tmdb.org/t/p/w342";
const TMDB_BACKDROP = "https://image.tmdb.org/t/p/w1280";
const TMDB_STILL = "https://image.tmdb.org/t/p/w300";

const PROVIDERS = [
  {
    id: "vidlink",
    label: "VidLink",
    movie: (id: number) => `https://vidlink.pro/movie/${id}`,
    tv: (id: number, s: number, e: number) => `https://vidlink.pro/tv/${id}/${s}/${e}`,
  },
  {
    id: "vidsrc",
    label: "VidSrc",
    movie: (id: number) => `https://vidsrc.xyz/embed/movie/${id}`,
    tv: (id: number, s: number, e: number) => `https://vidsrc.xyz/embed/tv/${id}/${s}-${e}`,
  },
  {
    id: "vidsrccc",
    label: "VidSrc CC",
    movie: (id: number) => `https://vidsrc.cc/v2/embed/movie/${id}`,
    tv: (id: number, s: number, e: number) => `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: "embedsu",
    label: "EmbedSU",
    movie: (id: number) => `https://embed.su/embed/movie/${id}`,
    tv: (id: number, s: number, e: number) => `https://embed.su/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: "multiembed",
    label: "MultiEmbed",
    movie: (id: number) => `https://multiembed.mov/?video_id=${id}&tmdb=1`,
    tv: (id: number, s: number, e: number) => `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}`,
  },
  {
    id: "moviesapi",
    label: "MoviesAPI",
    movie: (id: number) => `https://moviesapi.club/movie/${id}`,
    tv: (id: number, s: number, e: number) => `https://moviesapi.club/tv/${id}-${s}-${e}`,
  },
];

function getSavedMovies(): { items: SavedMovie[]; groups: MovieGroup[] } {
  try {
    const raw = localStorage.getItem("movies-saved");
    if (raw) return JSON.parse(raw);
  } catch {}
  return { items: [], groups: [] };
}

function saveFavorites(data: { items: SavedMovie[]; groups: MovieGroup[] }) {
  try {
    localStorage.setItem("movies-saved", JSON.stringify(data));
  } catch {}
}

function mediaTypeOf(item: CatalogItem): "movie" | "tv" {
  if (item.media_type === "tv" || (!item.title && item.name)) return "tv";
  return "movie";
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em",
      color: S.textMuted, margin: "0 0 14px", display: "flex", alignItems: "center", gap: 8,
    }}>
      {children}
    </p>
  );
}

function PosterCard({
  item, type, isFavorited, onFavorite, onPlay, wide,
}: {
  item: CatalogItem;
  type: "movie" | "tv";
  isFavorited?: boolean;
  onFavorite?: (item: CatalogItem, type: "movie" | "tv") => void;
  onPlay: (item: CatalogItem, type: "movie" | "tv") => void;
  wide?: boolean;
}) {
  const title = item.title || item.name || "Untitled";
  const year = (item.release_date || item.first_air_date || "").slice(0, 4);
  const poster = item.poster_path ? TMDB_IMG + item.poster_path : "";
  const rating = item.vote_average ? item.vote_average.toFixed(1) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      style={{
        position: "relative", background: S.surface, border: `1px solid ${S.border}`,
        borderRadius: 12, overflow: "hidden", cursor: "pointer",
        flex: wide ? "0 0 160px" : undefined, width: wide ? 160 : undefined,
      }}
      onClick={() => onPlay(item, type)}
    >
      <div style={{ aspectRatio: "2/3", overflow: "hidden", background: S.elevated, position: "relative" }}>
        {poster ? (
          <img src={poster} alt={title} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: S.textMuted }}>
            {type === "tv" ? <Tv size={28} /> : <Film size={28} />}
          </div>
        )}
        {rating && (
          <span style={{
            position: "absolute", top: 8, left: 8, fontSize: 10, fontWeight: 700,
            background: "hsl(216 32% 6% / 0.85)", color: S.gold, padding: "3px 7px",
            borderRadius: 6, display: "flex", alignItems: "center", gap: 3, backdropFilter: "blur(6px)",
          }}>
            <Star size={9} fill={S.gold} /> {rating}
          </span>
        )}
        <span style={{
          position: "absolute", bottom: 8, left: 8, fontSize: 9, fontWeight: 700,
          background: "hsl(216 32% 6% / 0.85)", color: S.textSub, padding: "3px 7px",
          borderRadius: 6, backdropFilter: "blur(6px)", textTransform: "uppercase", letterSpacing: "0.04em",
        }}>
          {type === "tv" ? "TV" : "Movie"}
        </span>
        {onFavorite && (
          <button
            onClick={(e) => { e.stopPropagation(); onFavorite(item, type); }}
            style={{
              position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "hsl(216 32% 6% / 0.85)", border: `1px solid ${S.border}`,
              cursor: "pointer", color: isFavorited ? S.accent : S.textMuted, backdropFilter: "blur(6px)",
            }}
          >
            <Heart size={12} fill={isFavorited ? "currentColor" : "none"} />
          </button>
        )}
      </div>
      <div style={{ padding: "10px 11px 12px" }}>
        <h3 style={{ fontSize: 12, fontWeight: 600, color: S.text, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </h3>
        <p style={{ fontSize: 10, color: S.textMuted, margin: "3px 0 0" }}>{year || "—"}</p>
      </div>
    </motion.div>
  );
}

function MoviePlayer({
  state, onBack, onUpdate, recommended, onPlayRecommended,
}: {
  state: PlayerState;
  onBack: () => void;
  onUpdate: (next: Partial<PlayerState>) => void;
  recommended: CatalogItem[];
  onPlayRecommended: (item: CatalogItem, type: "movie" | "tv") => void;
}) {
  const frameHostRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [provider, setProvider] = useState("vidlink");
  const [season, setSeason] = useState(state.season || 1);
  const [episode, setEpisode] = useState(state.episode || 1);
  const [seasons, setSeasons] = useState<SeasonInfo[]>([]);
  const [episodes, setEpisodes] = useState<EpisodeInfo[]>([]);
  const [frameReady, setFrameReady] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    setSeason(state.season || 1);
    setEpisode(state.episode || 1);
  }, [state.tmdbId, state.type]);

  useEffect(() => {
    if (state.type !== "tv") {
      setSeasons([]);
      setEpisodes([]);
      return;
    }
    fetch(`/api/tmdb/tv/${state.tmdbId}`)
      .then((r) => r.json())
      .then((d) => {
        const list: SeasonInfo[] = (d.seasons || []).filter((s: SeasonInfo) => s.season_number > 0);
        setSeasons(list);
      })
      .catch(() => setSeasons([]));
  }, [state.tmdbId, state.type]);

  useEffect(() => {
    if (state.type !== "tv") return;
    fetch(`/api/tmdb/tv/${state.tmdbId}/season/${season}`)
      .then((r) => r.json())
      .then((d) => setEpisodes(d.episodes || []))
      .catch(() => setEpisodes([]));
  }, [state.tmdbId, state.type, season]);

  useEffect(() => {
    onUpdate({ season, episode });
  }, [season, episode]);

  useEffect(() => {
    const prevOpen = window.open;
    window.open = (() => null) as typeof window.open;
    const blockAux = (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("auxclick", blockAux, true);
    return () => {
      window.open = prevOpen;
      document.removeEventListener("auxclick", blockAux, true);
    };
  }, []);

  useEffect(() => {
    const host = frameHostRef.current;
    if (!host) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let sealTimer: ReturnType<typeof setInterval> | null = null;

    const cleanup = () => {
      try {
        if (iframeRef.current?.parentNode) iframeRef.current.parentNode.removeChild(iframeRef.current);
      } catch {}
      iframeRef.current = null;
    };

    const sealFrame = (iframe: HTMLIFrameElement) => {
      try {
        const w = iframe.contentWindow as any;
        if (!w) return;
        w.open = () => null;
        w.alert = () => {};
        const doc = iframe.contentDocument;
        if (doc && !(doc as any).__pzSeal) {
          (doc as any).__pzSeal = true;
          doc.addEventListener(
            "click",
            (e: MouseEvent) => {
              const el = e.target as HTMLElement | null;
              const a = el?.closest?.("a");
              if (a && (a.getAttribute("target") === "_blank" || a.getAttribute("rel")?.includes("noopener"))) {
                e.preventDefault();
                e.stopPropagation();
              }
            },
            true
          );
        }
      } catch {}
    };

    const mount = () => {
      const scramjet = (window as any).scramjet;
      if (!scramjet || typeof scramjet.encodeUrl !== "function") return false;
      try {
        cleanup();
        const prov = PROVIDERS.find((p) => p.id === provider) || PROVIDERS[0];
        const target =
          state.type === "tv"
            ? prov.tv(state.tmdbId, season, episode)
            : prov.movie(state.tmdbId);

        const iframe = document.createElement("iframe");
        iframe.style.cssText =
          "position:absolute;inset:0;width:100%;height:100%;border:none;background:#000;opacity:0;transition:opacity 0.25s ease;";
        iframe.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
        iframe.allowFullscreen = true;
        iframe.referrerPolicy = "no-referrer";
        iframe.setAttribute(
          "sandbox",
          "allow-scripts allow-same-origin allow-forms allow-presentation allow-fullscreen"
        );
        iframe.title = "Player";
        iframe.onload = () => {
          iframe.style.opacity = "1";
          sealFrame(iframe);
        };
        iframe.src = scramjet.encodeUrl(target);
        host.appendChild(iframe);
        iframeRef.current = iframe;
        setFrameReady(true);
        setLoadError("");
        return true;
      } catch (e: any) {
        setLoadError(e?.message || "Failed to start player");
        return false;
      }
    };

    setFrameReady(false);
    if (!mount()) {
      timer = setInterval(() => {
        if (cancelled) return;
        if (mount() && timer) clearInterval(timer);
      }, 120);
    }

    sealTimer = setInterval(() => {
      if (iframeRef.current) sealFrame(iframeRef.current);
    }, 800);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (sealTimer) clearInterval(sealTimer);
      cleanup();
    };
  }, [provider, state.tmdbId, state.type, season, episode]);

  return (
    <div style={{ position: "absolute", inset: 0, background: S.bg, display: "flex", flexDirection: "column" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "12px 20px",
        borderBottom: `1px solid ${S.border}`, background: S.surface, flexShrink: 0, zIndex: 5,
      }}>
        <button
          onClick={onBack}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "7px 11px",
            background: S.elevated, border: `1px solid ${S.border}`, borderRadius: 8,
            color: S.textSub, fontSize: 12, cursor: "pointer",
          }}
        >
          <ArrowLeft size={13} /> Catalog
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 14, fontWeight: 650, color: S.text, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {state.title}
          </h2>
          {state.type === "tv" && (
            <p style={{ fontSize: 10, color: S.textMuted, margin: "2px 0 0" }}>
              Season {season} · Episode {episode}
            </p>
          )}
        </div>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          style={{
            background: S.elevated, border: `1px solid ${S.border}`, borderRadius: 8,
            color: S.textSub, fontSize: 11, padding: "7px 10px", outline: "none", cursor: "pointer",
          }}
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ flex: 1, background: "#000", position: "relative", minHeight: 0 }}>
            <div ref={frameHostRef} style={{ position: "absolute", inset: 0 }} />
            {!frameReady && (
              <div style={{
                position: "absolute", inset: 0, display: "flex", alignItems: "center",
                justifyContent: "center", color: S.textMuted, fontSize: 12, zIndex: 2,
              }}>
                {loadError || "Loading player…"}
              </div>
            )}
          </div>

          {state.type === "tv" && (
            <div style={{
              borderTop: `1px solid ${S.border}`, background: S.surface,
              padding: "14px 18px", flexShrink: 0, maxHeight: 220, overflowY: "auto",
            }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
                <label style={{ fontSize: 10, color: S.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Season</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(seasons.length ? seasons : [{ season_number: season }]).map((s) => (
                    <button
                      key={s.season_number}
                      onClick={() => setSeason(s.season_number)}
                      style={{
                        padding: "5px 11px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer",
                        background: season === s.season_number ? S.accentDim : S.elevated,
                        border: `1px solid ${season === s.season_number ? S.borderFocus : S.border}`,
                        color: season === s.season_number ? S.accent : S.textSub,
                      }}
                    >
                      {s.season_number}
                    </button>
                  ))}
                </div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button
                    onClick={() => setEpisode((e) => Math.max(1, e - 1))}
                    style={{
                      width: 28, height: 28, borderRadius: 7, border: `1px solid ${S.border}`,
                      background: S.elevated, color: S.textSub, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    onClick={() => {
                      const max = episodes.length || episode + 1;
                      setEpisode((e) => Math.min(max, e + 1));
                    }}
                    style={{
                      width: 28, height: 28, borderRadius: 7, border: `1px solid ${S.border}`,
                      background: S.elevated, color: S.textSub, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                {(episodes.length
                  ? episodes
                  : Array.from({ length: Math.max(episode, 12) }, (_, i) => ({
                      episode_number: i + 1,
                      name: `Episode ${i + 1}`,
                    }))
                ).map((ep) => {
                  const active = ep.episode_number === episode;
                  return (
                    <button
                      key={ep.episode_number}
                      onClick={() => setEpisode(ep.episode_number)}
                      style={{
                        flex: "0 0 150px", textAlign: "left", padding: 0, overflow: "hidden",
                        borderRadius: 10, cursor: "pointer",
                        background: active ? S.accentDim : S.elevated,
                        border: `1px solid ${active ? S.borderFocus : S.border}`,
                      }}
                    >
                      {ep.still_path ? (
                        <img src={TMDB_STILL + ep.still_path} alt="" style={{ width: "100%", height: 72, objectFit: "cover", display: "block" }} />
                      ) : (
                        <div style={{ height: 72, background: S.bg, display: "flex", alignItems: "center", justifyContent: "center", color: S.textMuted }}>
                          <Play size={16} />
                        </div>
                      )}
                      <div style={{ padding: "8px 9px" }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: active ? S.accent : S.textMuted, margin: 0 }}>E{ep.episode_number}</p>
                        <p style={{ fontSize: 11, fontWeight: 500, color: S.text, margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {ep.name || `Episode ${ep.episode_number}`}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div style={{
          width: 240, borderLeft: `1px solid ${S.border}`, background: S.surface,
          display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden",
        }}>
          <div style={{ padding: "14px 14px 8px" }}>
            <SectionLabel><Sparkles size={11} /> Recommended</SectionLabel>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            {recommended.slice(0, 10).map((item) => {
              const type = mediaTypeOf(item);
              const title = item.title || item.name || "Untitled";
              const poster = item.poster_path ? TMDB_IMG + item.poster_path : "";
              return (
                <button
                  key={`${type}-${item.id}`}
                  onClick={() => onPlayRecommended(item, type)}
                  style={{
                    display: "flex", gap: 10, alignItems: "center", padding: 6, borderRadius: 9,
                    background: "transparent", border: `1px solid ${S.border}`, cursor: "pointer", textAlign: "left",
                  }}
                >
                  <div style={{ width: 40, height: 56, borderRadius: 6, overflow: "hidden", background: S.elevated, flexShrink: 0 }}>
                    {poster && <img src={poster} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: S.text, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</p>
                    <p style={{ fontSize: 10, color: S.textMuted, margin: "3px 0 0" }}>{type === "tv" ? "TV" : "Movie"}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MoviesPage(_props: { onNavigate?: (url: string) => void }) {
  const [data, setData] = useState(getSavedMovies);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [trending, setTrending] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"popular" | "trending">("popular");
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { items } = data;

  const isFavorited = (tmdbId: number, type: "movie" | "tv") =>
    items.some((i) => i.tmdbId === tmdbId && i.type === type);

  const toggleFavorite = (item: CatalogItem, type: "movie" | "tv") => {
    const tmdbId = item.id;
    if (isFavorited(tmdbId, type)) {
      setData((prev) => ({
        ...prev,
        items: prev.items.filter((i) => !(i.tmdbId === tmdbId && i.type === type)),
      }));
    } else {
      setData((prev) => ({
        ...prev,
        items: [{
          id: String(Date.now()),
          type,
          tmdbId,
          title: item.title || item.name || "Untitled",
          poster_path: item.poster_path,
          backdrop_path: item.backdrop_path,
          release_date: item.release_date,
          first_air_date: item.first_air_date,
          groupId: null,
          season: type === "tv" ? 1 : undefined,
          episode: type === "tv" ? 1 : undefined,
          createdAt: Date.now(),
        }, ...prev.items],
      }));
    }
  };

  useEffect(() => { saveFavorites(data); }, [data]);

  useEffect(() => {
    const fetchCatalog = async () => {
      setLoading(true);
      setError("");
      try {
        if (searchQuery.trim()) {
          const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(searchQuery.trim())}`);
          const d = await res.json();
          if (!res.ok) throw new Error(d.error || "Search failed");
          setCatalog(d.results || []);
        } else {
          const [moviesRes, tvRes, trendMovie, trendTv] = await Promise.all([
            fetch(`/api/tmdb/movie/${sortBy}`),
            fetch(`/api/tmdb/tv/${sortBy}`),
            fetch(`/api/tmdb/movie/trending`),
            fetch(`/api/tmdb/tv/trending`),
          ]);
          const [movies, tv, tm, tt] = await Promise.all([
            moviesRes.json(), tvRes.json(), trendMovie.json(), trendTv.json(),
          ]);
          const merged = [
            ...(movies.results || []).map((r: CatalogItem) => ({ ...r, media_type: "movie" })),
            ...(tv.results || []).map((r: CatalogItem) => ({ ...r, media_type: "tv" })),
          ].sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
          setCatalog(merged);
          setTrending([
            ...(tm.results || []).map((r: CatalogItem) => ({ ...r, media_type: "movie" })),
            ...(tt.results || []).map((r: CatalogItem) => ({ ...r, media_type: "tv" })),
          ]);
        }
      } catch (e: any) {
        setError(e.message || "Failed to load catalog");
      } finally {
        setLoading(false);
      }
    };

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (searchQuery) searchTimeoutRef.current = setTimeout(fetchCatalog, 320);
    else fetchCatalog();
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery, sortBy]);

  const openPlayer = (item: CatalogItem, type: "movie" | "tv") => {
    const saved = items.find((i) => i.tmdbId === item.id && i.type === type);
    setPlayerState({
      type,
      tmdbId: item.id,
      title: item.title || item.name || "Untitled",
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      overview: item.overview,
      season: type === "tv" ? saved?.season || 1 : undefined,
      episode: type === "tv" ? saved?.episode || 1 : undefined,
    });
  };

  const continueList = items.slice(0, 12);
  const featured = (!searchQuery && (trending[0] || catalog[0])) || null;
  const recommended = (trending.length ? trending : catalog).filter(
    (i) => !playerState || i.id !== playerState.tmdbId
  );

  if (playerState) {
    return (
      <MoviePlayer
        state={playerState}
        onBack={() => {
          if (playerState.type === "tv") {
            setData((prev) => ({
              ...prev,
              items: prev.items.map((i) =>
                i.tmdbId === playerState.tmdbId && i.type === "tv"
                  ? { ...i, season: playerState.season, episode: playerState.episode }
                  : i
              ),
            }));
          }
          setPlayerState(null);
        }}
        onUpdate={(next) => setPlayerState((prev) => (prev ? { ...prev, ...next } : null))}
        recommended={recommended}
        onPlayRecommended={openPlayer}
      />
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: S.bg }}>
      <div style={{ position: "relative", zIndex: 10, height: "100%", display: "flex", flexDirection: "column" }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "22px 28px 14px", flexShrink: 0, borderBottom: `1px solid ${S.border}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 11,
              background: "linear-gradient(135deg, hsl(213 70% 45% / 0.35), hsl(250 50% 40% / 0.25))",
              border: `1px solid hsl(213 60% 40% / 0.35)`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Clapperboard size={16} style={{ color: S.accent }} />
            </div>
            <div>
              <h1 style={{ fontSize: 17, fontWeight: 700, color: S.text, margin: 0 }}>Cinema</h1>
              <p style={{ fontSize: 11, color: S.textSub, margin: 0 }}>
                {catalog.length} titles · {items.length} saved
              </p>
            </div>
          </div>
        </div>

        <div style={{
          padding: "12px 28px", display: "flex", gap: 12, alignItems: "center",
          borderBottom: `1px solid ${S.border}`, flexShrink: 0,
        }}>
          <div style={{
            flex: 1, display: "flex", alignItems: "center", gap: 8,
            background: S.elevated, border: `1px solid ${S.border}`, borderRadius: 9, padding: "8px 12px",
          }}>
            <Search size={14} style={{ color: S.textMuted, flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search movies & TV shows…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1, background: "none", border: "none", color: S.text,
                fontSize: 12, outline: "none", fontFamily: "inherit",
              }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} style={{ background: "none", border: "none", cursor: "pointer", color: S.textMuted, display: "flex", padding: 0 }}>
                <X size={12} />
              </button>
            )}
          </div>
          {!searchQuery && (
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "popular" | "trending")}
              style={{
                background: S.elevated, border: `1px solid ${S.border}`, borderRadius: 9,
                color: S.textSub, fontSize: 12, padding: "8px 11px", outline: "none", cursor: "pointer",
              }}
            >
              <option value="popular">Popular</option>
              <option value="trending">Trending</option>
            </select>
          )}
        </div>

        <div style={{
          flex: 1, overflowY: "auto", padding: "22px 28px 40px",
          scrollbarWidth: "thin", scrollbarColor: `${S.border} transparent`,
        }}>
          {error && (
            <div style={{
              padding: "12px 16px", background: "hsl(0 60% 30% / 0.2)",
              border: `1px solid hsl(0 60% 50% / 0.4)`, borderRadius: 8,
              color: S.danger, fontSize: 12, marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          {featured && !searchQuery && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                position: "relative", borderRadius: 16, overflow: "hidden", marginBottom: 28,
                height: 220, border: `1px solid ${S.border}`, cursor: "pointer",
              }}
              onClick={() => openPlayer(featured, mediaTypeOf(featured))}
            >
              {featured.backdrop_path && (
                <img
                  src={TMDB_BACKDROP + featured.backdrop_path}
                  alt=""
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                />
              )}
              <div style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(90deg, hsl(216 32% 6% / 0.95) 0%, hsl(216 32% 6% / 0.55) 55%, transparent 100%)",
              }} />
              <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 24, maxWidth: 480 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: S.accent, marginBottom: 8 }}>
                  Featured · {mediaTypeOf(featured) === "tv" ? "TV" : "Movie"}
                </span>
                <h2 style={{ fontSize: 26, fontWeight: 750, color: S.text, margin: "0 0 8px", lineHeight: 1.15 }}>
                  {featured.title || featured.name}
                </h2>
                <p style={{
                  fontSize: 12, color: S.textSub, margin: "0 0 14px",
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                }}>
                  {featured.overview || "Start watching now."}
                </p>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 8, alignSelf: "flex-start",
                  padding: "8px 14px", borderRadius: 9, background: S.accent, color: "#fff",
                  fontSize: 12, fontWeight: 650,
                }}>
                  <Play size={12} fill="#fff" /> Play now
                </div>
              </div>
            </motion.div>
          )}

          {continueList.length > 0 && !searchQuery && (
            <div style={{ marginBottom: 28 }}>
              <SectionLabel><Play size={11} /> Continue Watching</SectionLabel>
              <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6 }}>
                {continueList.map((item) => (
                  <PosterCard
                    key={`${item.type}-${item.tmdbId}`}
                    wide
                    item={{
                      id: item.tmdbId,
                      title: item.title,
                      poster_path: item.poster_path,
                      release_date: item.release_date,
                      first_air_date: item.first_air_date,
                      media_type: item.type,
                    }}
                    type={item.type}
                    onPlay={() =>
                      setPlayerState({
                        type: item.type,
                        tmdbId: item.tmdbId,
                        title: item.title,
                        poster_path: item.poster_path,
                        backdrop_path: item.backdrop_path,
                        season: item.season,
                        episode: item.episode,
                      })
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {!searchQuery && trending.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <SectionLabel><Sparkles size={11} /> Recommended</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
                {trending.slice(0, 12).map((item) => {
                  const type = mediaTypeOf(item);
                  return (
                    <PosterCard
                      key={`rec-${type}-${item.id}`}
                      item={item}
                      type={type}
                      isFavorited={isFavorited(item.id, type)}
                      onFavorite={toggleFavorite}
                      onPlay={openPlayer}
                    />
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <SectionLabel>
              <Film size={11} /> {searchQuery ? "Search results" : sortBy === "trending" ? "Trending" : "Popular"}
            </SectionLabel>
            {loading && (
              <div style={{ textAlign: "center", color: S.textMuted, padding: "40px 0" }}>
                <p style={{ fontSize: 12 }}>Loading…</p>
              </div>
            )}
            {!loading && catalog.length === 0 && (
              <div style={{ textAlign: "center", color: S.textMuted, padding: "40px 0" }}>
                <p style={{ fontSize: 12 }}>No results found</p>
              </div>
            )}
            {!loading && catalog.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: 12 }}>
                <AnimatePresence>
                  {catalog.map((item) => {
                    const type = mediaTypeOf(item);
                    return (
                      <PosterCard
                        key={`${type}-${item.id}`}
                        item={item}
                        type={type}
                        isFavorited={isFavorited(item.id, type)}
                        onFavorite={toggleFavorite}
                        onPlay={openPlayer}
                      />
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
