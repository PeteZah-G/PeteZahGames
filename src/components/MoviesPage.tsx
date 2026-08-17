import { useState, useEffect, useRef, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, X, Film, Search, Heart, Tv, Star, Clapperboard, Sparkles, Info,
} from "lucide-react";
import { AdResponsiveBanner } from "@/components/ads/Adsterra";
import MoviesWatchPanel from "@/components/MoviesWatchPanel";

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
  bg: "transparent",
  surface: "hsla(220, 28%, 12%, 0.38)",
  elevated: "hsla(220, 24%, 16%, 0.45)",
  border: "hsla(210, 30%, 80%, 0.12)",
  borderFocus: "hsla(210, 40%, 70%, 0.28)",
  accent: "hsla(205, 70%, 62%, 0.95)",
  accentDim: "hsla(210, 40%, 55%, 0.16)",
  text: "hsla(210, 20%, 96%, 0.95)",
  textSub: "hsla(210, 14%, 70%, 0.78)",
  textMuted: "hsla(210, 12%, 55%, 0.55)",
  danger: "hsl(0 60% 58%)",
  gold: "hsl(42 90% 55%)",
};

const TMDB_IMG = "https://image.tmdb.org/t/p/w342";
const TMDB_BACKDROP = "https://image.tmdb.org/t/p/w1280";
const TMDB_STILL = "https://image.tmdb.org/t/p/w300";

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

function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      margin: "0 0 12px",
    }}>
      <p style={{
        fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em",
        color: S.text, margin: 0, display: "flex", alignItems: "center", gap: 8,
      }}>
        {children}
      </p>
      {action}
    </div>
  );
}

function PosterCard({
  item, type, isFavorited, onFavorite, onPlay, wide, rank,
}: {
  item: CatalogItem;
  type: "movie" | "tv";
  isFavorited?: boolean;
  onFavorite?: (item: CatalogItem, type: "movie" | "tv") => void;
  onPlay: (item: CatalogItem, type: "movie" | "tv") => void;
  wide?: boolean;
  rank?: number;
}) {
  const title = item.title || item.name || "Untitled";
  const year = (item.release_date || item.first_air_date || "").slice(0, 4);
  const poster = item.poster_path ? TMDB_IMG + item.poster_path : "";
  const rating = item.vote_average ? item.vote_average.toFixed(1) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3, scale: 1.02 }}
      transition={{ duration: 0.18 }}
      style={{
        position: "relative", background: "transparent", border: "none",
        borderRadius: 14, overflow: "visible", cursor: "pointer",
        flex: wide ? "0 0 132px" : undefined, width: wide ? 132 : undefined,
      }}
      onClick={() => onPlay(item, type)}
    >
      <div style={{
        aspectRatio: "2/3", overflow: "hidden", background: S.elevated, position: "relative",
        borderRadius: 14, border: `1px solid ${S.border}`,
        boxShadow: "0 12px 28px rgba(0,0,0,0.35)",
      }}>
        {poster ? (
          <img src={poster} alt={title} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: S.textMuted }}>
            {type === "tv" ? <Tv size={28} /> : <Film size={28} />}
          </div>
        )}
        {typeof rank === "number" && (
          <span style={{
            position: "absolute", left: 6, bottom: -2, fontSize: 42, fontWeight: 850,
            color: "hsla(0,0%,100%,0.88)", letterSpacing: "-0.06em",
            textShadow: "0 4px 18px rgba(0,0,0,0.75)", lineHeight: 1, zIndex: 2,
          }}>
            {rank}
          </span>
        )}
        {rating && (
          <span style={{
            position: "absolute", top: 7, left: 7, fontSize: 10, fontWeight: 700,
            background: "hsla(220, 32%, 6%, 0.72)", color: S.gold, padding: "3px 6px",
            borderRadius: 999, display: "flex", alignItems: "center", gap: 3, backdropFilter: "blur(8px)",
          }}>
            <Star size={9} fill={S.gold} /> {rating}
          </span>
        )}
        {onFavorite && (
          <button
            onClick={(e) => { e.stopPropagation(); onFavorite(item, type); }}
            style={{
              position: "absolute", top: 7, right: 7, width: 26, height: 26, borderRadius: 999,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "hsla(220, 32%, 6%, 0.72)", border: `1px solid ${S.border}`,
              cursor: "pointer", color: isFavorited ? "hsla(0,72%,62%,0.95)" : S.textMuted, backdropFilter: "blur(8px)",
            }}
          >
            <Heart size={11} fill={isFavorited ? "currentColor" : "none"} />
          </button>
        )}
        <div style={{
          position: "absolute", inset: 0, opacity: 0, transition: "opacity 0.15s",
          background: "linear-gradient(to top, hsla(220,35%,4%,0.75), transparent 50%)",
          display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 12,
        }}
          className="pz-poster-hover"
        />
      </div>
      <div style={{ padding: "8px 2px 0" }}>
        <h3 style={{ fontSize: 12, fontWeight: 650, color: S.text, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </h3>
        <p style={{ fontSize: 10, color: S.textMuted, margin: "2px 0 0" }}>
          {year || "—"} · {type === "tv" ? "Series" : "Movie"}
        </p>
      </div>
    </motion.div>
  );
}

function ShelfRow({
  title, items, onPlay, isFavorited, onFavorite, ranked,
}: {
  title: ReactNode;
  items: CatalogItem[];
  onPlay: (item: CatalogItem, type: "movie" | "tv") => void;
  isFavorited?: (id: number, type: "movie" | "tv") => boolean;
  onFavorite?: (item: CatalogItem, type: "movie" | "tv") => void;
  ranked?: boolean;
}) {
  if (!items.length) return null;
  return (
    <div style={{ marginBottom: 28 }}>
      <SectionLabel>{title}</SectionLabel>
      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8, paddingRight: 8, scrollbarWidth: "none" }}>
        {items.map((item, i) => {
          const type = mediaTypeOf(item);
          return (
            <PosterCard
              key={`${title}-${type}-${item.id}`}
              wide
              rank={ranked ? i + 1 : undefined}
              item={item}
              type={type}
              isFavorited={isFavorited?.(item.id, type)}
              onFavorite={onFavorite}
              onPlay={onPlay}
            />
          );
        })}
      </div>
    </div>
  );
}

function MoviePlayer({
  state, onBack, onOpenService,
}: {
  state: PlayerState;
  onBack: () => void;
  onOpenService: (url: string, label: string) => void;
}) {
  return (
    <MoviesWatchPanel
      type={state.type}
      tmdbId={state.tmdbId}
      title={state.title}
      overview={state.overview}
      poster={state.poster_path}
      backdrop={state.backdrop_path}
      rating={undefined}
      onBack={onBack}
      onOpenService={onOpenService}
    />
  );
}

export default function MoviesPage({
  onNavigate,
  initialQuery = "",
}: {
  onNavigate?: (url: string) => void;
  initialQuery?: string;
}) {
  const [data, setData] = useState(getSavedMovies);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [trending, setTrending] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [sortBy, setSortBy] = useState<"popular" | "trending" | "top_rated" | "now_playing">("popular");
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

  const openService = (url: string, label: string) => {
    if (!onNavigate || !url) return;
    onNavigate(`petezah://appviewer?url=${encodeURIComponent(url)}&title=${encodeURIComponent(label)}`);
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

  const continueList = items.slice(0, 12);
  const featured = (!searchQuery && (trending[0] || catalog[0])) || null;

  if (playerState) {
    return (
      <MoviePlayer
        key={`${playerState.type}-${playerState.tmdbId}`}
        state={playerState}
        onBack={() => setPlayerState(null)}
        onOpenService={openService}
      />
    );
  }

  const featuredType = featured ? mediaTypeOf(featured) : "movie";
  const featuredRating = featured?.vote_average ? featured.vote_average.toFixed(1) : null;
  const topTen = (trending.length ? trending : catalog).slice(0, 10);
  const shelfCatalog = catalog.slice(0, 18);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: S.bg }}>
      <div style={{ position: "absolute", inset: 0, overflowY: "auto", scrollbarWidth: "none" }}>
        {!searchQuery && featured && (
          <div style={{ position: "relative", height: "min(58vh, 460px)", minHeight: 280 }}>
            {featured.backdrop_path && (
              <img
                src={TMDB_BACKDROP + featured.backdrop_path}
                alt=""
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
              />
            )}
            <div style={{
              position: "absolute", inset: 0,
              background:
                "linear-gradient(to top, hsla(220,35%,4%,0.98) 0%, hsla(220,35%,4%,0.55) 42%, hsla(220,35%,4%,0.25) 70%, hsla(220,35%,4%,0.45) 100%), linear-gradient(90deg, hsla(220,35%,4%,0.88) 0%, hsla(220,35%,4%,0.35) 55%, transparent 100%)",
            }} />
            <div style={{
              position: "relative", zIndex: 2, height: "100%", display: "flex", flexDirection: "column",
              justifyContent: "flex-end", padding: "24px 28px 28px", maxWidth: 560,
            }}>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                color: S.accent, marginBottom: 8,
              }}>
                Featured · {featuredType === "tv" ? "Series" : "Movie"}
              </span>
              <h1 style={{
                fontSize: "clamp(1.6rem, 4vw, 2.6rem)", fontWeight: 800, color: S.text, margin: "0 0 8px",
                lineHeight: 1.08, letterSpacing: "-0.03em",
              }}>
                {featured.title || featured.name}
              </h1>
              {featuredRating && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <Star size={12} fill={S.gold} color={S.gold} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: S.gold }}>{featuredRating}</span>
                </div>
              )}
              <p style={{
                fontSize: 13, color: S.textSub, margin: "0 0 16px", lineHeight: 1.45,
                display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
              }}>
                {featured.overview || "See where you can watch this on a licensed service."}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => openPlayer(featured, featuredType)}
                  style={{
                    width: 48, height: 48, borderRadius: 999, border: "none", cursor: "pointer",
                    background: "hsla(0,0%,98%,0.95)", color: "#0a0e16",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "0 10px 28px rgba(0,0,0,0.35)",
                  }}
                >
                  <Play size={18} fill="currentColor" />
                </button>
                <button
                  type="button"
                  onClick={() => openPlayer(featured, featuredType)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 14px",
                    borderRadius: 999, cursor: "pointer",
                    background: "hsla(220, 28%, 12%, 0.55)", border: `1px solid ${S.border}`,
                    color: S.text, fontSize: 12, fontWeight: 650, backdropFilter: "blur(10px)",
                  }}
                >
                  <Info size={13} /> Where to watch
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={{ padding: searchQuery ? "64px 24px 40px" : "8px 24px 48px", position: "relative", zIndex: 1 }}>
          {error && (
            <div style={{
              padding: "12px 16px", background: "hsl(0 60% 30% / 0.2)",
              border: `1px solid hsl(0 60% 50% / 0.4)`, borderRadius: 12,
              color: S.danger, fontSize: 12, marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          {searchQuery ? (
            <div>
              <SectionLabel>
                <Search size={14} /> Results for “{searchQuery}”
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))", gap: 14 }}>
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
          ) : (
            <>
              {continueList.length > 0 && (
                <div style={{ marginBottom: 28 }}>
                  <SectionLabel><Play size={14} /> Saved</SectionLabel>
                  <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8, scrollbarWidth: "none" }}>
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
                          openPlayer(
                            {
                              id: item.tmdbId,
                              title: item.title,
                              poster_path: item.poster_path,
                              backdrop_path: item.backdrop_path,
                              release_date: item.release_date,
                              first_air_date: item.first_air_date,
                              media_type: item.type,
                            },
                            item.type
                          )
                        }
                      />
                    ))}
                  </div>
                </div>
              )}

              <ShelfRow
                title={<>TOP 10 Today</>}
                items={topTen}
                ranked
                onPlay={openPlayer}
                isFavorited={isFavorited}
                onFavorite={toggleFavorite}
              />

              <ShelfRow
                title={<><Sparkles size={14} /> Trending</>}
                items={trending.slice(0, 16)}
                onPlay={openPlayer}
                isFavorited={isFavorited}
                onFavorite={toggleFavorite}
              />

              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                  <p style={{
                    fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em",
                    color: S.text, margin: 0, display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <Film size={14} />{" "}
                    {sortBy === "trending" ? "Trending" : sortBy === "top_rated" ? "Top rated" : sortBy === "now_playing" ? "Now playing" : "Popular"}
                  </p>
                  <div style={{ flex: 1 }} />
                  <div style={{
                    display: "inline-flex", gap: 4, padding: 3, borderRadius: 999,
                    background: "hsla(220,28%,12%,0.4)", border: `1px solid ${S.border}`,
                  }}>
                    {([
                      ["popular", "Popular"],
                      ["trending", "Trending"],
                      ["top_rated", "Top"],
                      ["now_playing", "New"],
                    ] as const).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setSortBy(id)}
                        style={{
                          padding: "5px 10px", borderRadius: 999, border: "none", cursor: "pointer",
                          fontSize: 11, fontWeight: 650,
                          background: sortBy === id ? S.accentDim : "transparent",
                          color: sortBy === id ? S.text : S.textMuted,
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {loading ? (
                  <div style={{ textAlign: "center", color: S.textMuted, padding: "28px 0" }}>
                    <p style={{ fontSize: 12 }}>Loading…</p>
                  </div>
                ) : (
                  <>
                    <div style={{ padding: "0 0 12px" }}>
                      <AdResponsiveBanner />
                    </div>
                    <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8, scrollbarWidth: "none" }}>
                      {shelfCatalog.map((item) => {
                        const type = mediaTypeOf(item);
                        return (
                          <PosterCard
                            key={`shelf-${type}-${item.id}`}
                            wide
                            item={item}
                            type={type}
                            isFavorited={isFavorited(item.id, type)}
                            onFavorite={toggleFavorite}
                            onPlay={openPlayer}
                          />
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div
        className="pointer-events-none"
        style={{
          position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, padding: "14px 20px",
          background: "linear-gradient(to bottom, hsla(220,35%,6%,0.55) 0%, hsla(220,35%,6%,0.12) 75%, transparent 100%)",
        }}
      >
        <div className="pointer-events-auto" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 999,
              background: S.accentDim, border: `1px solid ${S.borderFocus}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Clapperboard size={13} style={{ color: S.accent }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 750, color: S.text, letterSpacing: "-0.02em" }}>Cinema</span>
          </div>
          <div style={{
            marginLeft: "auto", display: "flex", alignItems: "center", gap: 8,
            background: "hsla(220, 28%, 12%, 0.42)", border: `1px solid ${S.border}`,
            borderRadius: 999, padding: "7px 12px", backdropFilter: "blur(14px)",
            width: "min(340px, 52vw)",
          }}>
            <Search size={12} style={{ color: S.textMuted, flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search movies & TV…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1, background: "none", border: "none", color: S.text,
                fontSize: 12, outline: "none", fontFamily: "inherit", minWidth: 0,
              }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} style={{ background: "none", border: "none", cursor: "pointer", color: S.textMuted, display: "flex", padding: 0 }}>
                <X size={11} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
