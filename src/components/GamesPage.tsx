import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Dices, Plus, Star, MoreVertical, X, Trash2, Share2, Copy, Check, Upload } from "lucide-react";
import { requestSyncSoon } from "@/lib/settingsSync";

const CATEGORIES = ["All", "Action", "Racing", "Strategy", "Sports", "Skill", "Shooting", "2 Player", "Io"];
const PINNED_LABELS = ["Request Games", "Minecraft", "Roblox"];

function generateGameId(game: { label: string; url: string }) {
  return `${game.label}-${game.url}`.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
}

function pinnedRank(label: string) {
  const i = PINNED_LABELS.findIndex((p) => p.toLowerCase() === String(label || "").toLowerCase());
  return i === -1 ? 999 : i;
}

function recordPlay(game: Game) {
  try {
    fetch("/api/games/play", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameId: game.id,
        label: game.label,
        imageUrl: game.imageUrl || "",
      }),
    }).catch(() => {});
  } catch {}
}

interface Game {
  id: string;
  label: string;
  url: string;
  imageUrl: string;
  categories: string[];
  isCustom?: boolean;
}

interface GamesPageProps {
  onNavigate?: (url: string) => void;
}

function getCustomGames(): Game[] {
  try { const s = localStorage.getItem("customGames"); return s ? JSON.parse(s) : []; } catch { return []; }
}
function saveCustomGames(games: Game[]) {
  try { localStorage.setItem("customGames", JSON.stringify(games)); requestSyncSoon(); } catch {}
}
function getFavorites(): string[] {
  try { const s = localStorage.getItem("favoriteGames"); return s ? JSON.parse(s) : []; } catch { return []; }
}
function saveFavorites(favs: string[]) {
  try { localStorage.setItem("favoriteGames", JSON.stringify(favs)); requestSyncSoon(); } catch {}
}
function getHiddenGames(): string[] {
  try { const s = localStorage.getItem("hiddenGames"); return s ? JSON.parse(s) : []; } catch { return []; }
}
function saveHiddenGames(hidden: string[]) {
  try { localStorage.setItem("hiddenGames", JSON.stringify(hidden)); requestSyncSoon(); } catch {}
}

function resolveGameUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/iframe.html?url=")) {
    const inner = url.slice("/iframe.html?url=".length);
    const decoded = decodeURIComponent(inner);
    if (decoded.startsWith("http://") || decoded.startsWith("https://")) return decoded;
    return window.location.origin + decoded;
  }
  return window.location.origin + url;
}



function HypeAd() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    // Set options before script loads
    (window as any).atOptions = {
      key: "5aed292251276d82b269fc3b8ecc354d",
      format: "iframe",
      height: 90,
      width: 728,
      params: {},
    };

    const script = document.createElement("script");
    script.src = "https://www.highperformanceformat.com/5aed292251276d82b269fc3b8ecc354d/invoke.js";
    script.async = true;
    container.appendChild(script);

    return () => {
      if (container.contains(script)) container.removeChild(script);
    };
  }, []);

  return (
    <div
      ref={ref}
      style={{ display: "flex", justifyContent: "center", width: "100%", minHeight: 90 }}
    />
  );
}

function AddGameModal({ onAdd, onClose }: { onAdd: (g: Game) => void; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [imageData, setImageData] = useState("");
  const [preview, setPreview] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImageData(result);
      setPreview(result);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = () => {
    if (!title.trim() || !url.trim() || !imageData || !category) return;
    let finalUrl = url.trim();
    if (!finalUrl.startsWith("http")) finalUrl = "https://" + finalUrl;
    const game: Game = {
      id: generateGameId({ label: title, url: finalUrl }),
      label: title.trim(),
      url: finalUrl,
      imageUrl: imageData,
      categories: [category],
      isCustom: true,
    };
    onAdd(game);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(12px)" }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 6 }}
        className="relative w-full max-w-sm rounded-2xl p-6 shadow-2xl bg-card border border-border"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-semibold text-foreground">Add Custom Game</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-accent text-muted-foreground transition-colors"><X size={14} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Game name"
              className="w-full mt-1 px-3 py-2 rounded-xl bg-accent border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-foreground/20" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">URL</label>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com/game"
              className="w-full mt-1 px-3 py-2 rounded-xl bg-accent border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-foreground/20" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-xl bg-accent border border-border text-sm text-foreground outline-none focus:ring-1 focus:ring-foreground/20">
              <option value="">Select category</option>
              {CATEGORIES.filter(c => c !== "All").map(c => <option key={c} value={c.toLowerCase()}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Image</label>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
            <button onClick={() => fileRef.current?.click()}
              className="w-full mt-1 px-3 py-2 rounded-xl bg-accent border border-border text-sm text-muted-foreground hover:text-foreground flex items-center gap-2 transition-colors">
              <Upload size={12} />{preview ? "Image selected ✓" : "Upload image"}
            </button>
            {preview && <img src={preview} alt="preview" className="mt-2 w-full h-24 object-cover rounded-xl" />}
          </div>
          <button onClick={handleSubmit} disabled={!title || !url || !imageData || !category}
            className="w-full py-2.5 rounded-xl bg-foreground/10 border border-foreground/20 text-foreground text-sm font-medium hover:bg-foreground/15 transition-colors disabled:opacity-40">
            Add Game
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function GameOptionsMenu({ game, isFav, onFav, onRemove, onShare, onClose }: {
  game: Game; isFav: boolean; onFav: () => void; onRemove: () => void; onShare: () => void; onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[150] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-xs rounded-2xl p-5 shadow-2xl bg-card border border-border"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground truncate pr-4">{game.label}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X size={14} /></button>
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={onFav}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-accent border border-border text-sm font-medium text-foreground hover:bg-accent/70 transition-all">
            <Star size={13} className={isFav ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"} />
            {isFav ? "Unfavorite" : "Favorite"}
          </button>
          <button onClick={onShare}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-accent border border-border text-sm font-medium text-foreground hover:bg-accent/70 transition-all">
            <Share2 size={13} className="text-muted-foreground" /> Share Game
          </button>
          <button onClick={onRemove}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-sm font-medium text-destructive hover:bg-destructive/20 transition-all">
            <Trash2 size={13} /> Remove Game
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ShareModal({ url, onClose }: { url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[160] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-xs rounded-2xl p-5 shadow-2xl bg-card border border-border"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Share Game</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X size={14} /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Share this game with others:</p>
        <div className="flex gap-2">
          <input value={url} readOnly
            className="flex-1 px-3 py-2 rounded-xl bg-accent border border-border text-xs text-foreground outline-none" />
          <button onClick={copy}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent border border-border text-xs font-medium text-foreground hover:bg-accent/70 transition-colors">
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function GameCard({ game, isFav, onPlay, onOptions, priority = false, index = 0 }: {
  game: Game; isFav: boolean; onPlay: () => void; onOptions: () => void; priority?: boolean; index?: number;
}) {
  const ease = [0.22, 1, 0.36, 1] as const;
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.94, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      transition={{
        duration: 0.55,
        delay: Math.min(index, 20) * 0.038,
        ease,
      }}
      whileHover={{ scale: 1.06, zIndex: 10 }}
      whileTap={{ scale: 0.97 }}
      className="relative cursor-pointer group rounded-xl overflow-hidden border-2 border-white/5 hover:border-white/40 transition-colors duration-150 game-card"
      style={{ aspectRatio: "4/3", background: "var(--accent)" }}
      onClick={onPlay}
    >
      <img
        src={game.imageUrl}
        alt={game.label}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "low"}
        sizes="(max-width: 640px) 46vw, (max-width: 1024px) 22vw, 160px"
        width={160}
        height={120}
        style={{ background: "hsla(210, 30%, 12%, 0.6)" }}
      />

      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.4) 50%, transparent 100%)" }}
      />

      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl"
        style={{ boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.28), 0 0 60px rgba(99,179,237,0.35)" }}
      />

      <div className="absolute bottom-0 left-0 right-0 px-2.5 py-2.5 translate-y-2 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-200">
        <p className="text-white text-[11px] font-semibold truncate drop-shadow-sm">{game.label}</p>
      </div>

      {isFav && (
        <div className="absolute top-1.5 left-1.5">
          <Star size={10} className="fill-yellow-400 text-yellow-400 drop-shadow-sm" />
        </div>
      )}

      <button
        onClick={e => { e.stopPropagation(); onOptions(); }}
        className="absolute top-1.5 right-1.5 w-5 h-5 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 border border-white/15 backdrop-blur-sm"
      >
        <MoreVertical size={9} className="text-white" />
      </button>
    </motion.div>
  );
}

export default function GamesPage({ onNavigate }: GamesPageProps) {
  const [allGames, setAllGames] = useState<Game[]>([]);
  const [playCounts, setPlayCounts] = useState<Record<string, number>>({});
  const [listReady, setListReady] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(getFavorites);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [page, setPage] = useState(1);
  const PER_PAGE = 50;
  const [optionsGame, setOptionsGame] = useState<Game | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const [res, playsRes] = await Promise.all([
          fetch("/storage/data/collection.json"),
          fetch("/api/games/plays").catch(() => null),
        ]);
        const data = await res.json();
        const remote: Game[] = data.games.map((g: Game) => ({ ...g, id: generateGameId(g), isCustom: false }));
        const custom = getCustomGames();
        const hidden = getHiddenGames();
        let counts: Record<string, number> = {};
        if (playsRes && playsRes.ok) {
          const playsData = await playsRes.json();
          if (playsData?.counts && typeof playsData.counts === "object") {
            counts = playsData.counts;
          }
        }
        setPlayCounts(counts);
        setAllGames([...custom, ...remote].filter(g => !hidden.includes(g.id)));
        setListReady(true);
      } catch {
        const custom = getCustomGames();
        const hidden = getHiddenGames();
        setAllGames(custom.filter(g => !hidden.includes(g.id)));
        setListReady(true);
      }
    }
    load();
  }, []);

  const filtered = (() => {
    let g = allGames;
    if (search.trim()) g = g.filter(x => x.label.toLowerCase().includes(search.toLowerCase()));
    if (activeCategory !== "All") g = g.filter(x => x.categories.some(c => c.toLowerCase() === activeCategory.toLowerCase()));
    return [...g].sort((a, b) => {
      const ap = pinnedRank(a.label);
      const bp = pinnedRank(b.label);
      if (ap !== bp) return ap - bp;
      const ac = playCounts[a.id] || 0;
      const bc = playCounts[b.id] || 0;
      if (ac !== bc) return bc - ac;
      const af = favorites.includes(a.id), bf = favorites.includes(b.id);
      return af === bf ? 0 : af ? -1 : 1;
    });
  })();

  const visible = filtered.slice(0, page * PER_PAGE);
  const hasMore = visible.length < filtered.length;

  useEffect(() => {
    if (!hasMore || !loadMoreRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) setPage(p => p + 1); },
      { threshold: 0.1, rootMargin: "600px 0px" }
    );
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, visible.length]);

  const handlePlay = useCallback((game: Game) => {
    recordPlay(game);
    setPlayCounts((prev) => ({ ...prev, [game.id]: (prev[game.id] || 0) + 1 }));
    if (onNavigate) {
      const resolved = resolveGameUrl(game.url);
      onNavigate(`petezah://gameviewer?url=${encodeURIComponent(resolved)}&title=${encodeURIComponent(game.label)}&gid=${encodeURIComponent(game.id)}`);
    }
  }, [onNavigate]);

  const handleFav = useCallback((id: string) => {
    setFavorites(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      saveFavorites(next);
      return next;
    });
    setOptionsGame(null);
  }, []);

  const handleRemove = useCallback((game: Game) => {
    if (game.isCustom) saveCustomGames(getCustomGames().filter(g => g.id !== game.id));
    const hidden = getHiddenGames(); hidden.push(game.id); saveHiddenGames(hidden);
    setAllGames(prev => prev.filter(g => g.id !== game.id));
    setFavorites(prev => { const next = prev.filter(x => x !== game.id); saveFavorites(next); return next; });
    setOptionsGame(null);
  }, []);

  const handleAddGame = useCallback((game: Game) => {
    saveCustomGames([game, ...getCustomGames()]);
    setAllGames(prev => [game, ...prev]);
    setShowAdd(false);
  }, []);

  const randomGame = () => {
    if (!filtered.length) return;
    handlePlay(filtered[Math.floor(Math.random() * filtered.length)]);
  };

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">

      <div
        className="flex-shrink-0 relative z-10 px-6 pt-5 pb-3 games-toolbar"
        style={{
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          background: "rgba(5, 10, 20, 0.35)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={randomGame}
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-accent/40 border border-white/8 hover:border-white/20 hover:bg-accent/60 text-muted-foreground hover:text-foreground transition-all flex-shrink-0"
              title="Random game"
            >
              <Dices size={14} />
            </button>

            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-accent/40 border border-white/8 focus-within:border-white/25 focus-within:bg-accent/60 transition-all">
              <Search size={13} className="text-muted-foreground flex-shrink-0" />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search games..."
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X size={12} />
                </button>
              )}
            </div>

            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-accent/40 border border-white/8 hover:border-white/20 hover:bg-accent/60 text-muted-foreground hover:text-foreground transition-all flex-shrink-0"
              title="Add custom game"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="flex gap-1.5 justify-center overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => { setActiveCategory(cat); setPage(1); }}
                className="flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-medium transition-all duration-150"
                style={{
                  background: activeCategory === cat ? "rgba(255,255,255,0.12)" : "transparent",
                  color: activeCategory === cat ? "var(--foreground)" : "var(--muted-foreground)",
                  border: `1px solid ${activeCategory === cat ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.06)"}`,
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto relative z-0" style={{ scrollbarWidth: "none" }}>
        <div className="px-6 py-4 games-scroll">
          {!listReady ? (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
              <div className="w-4 h-4 rounded-full border border-white/10 border-t-white/40 animate-spin mb-3" />
              <p className="text-sm">Loading games…</p>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
              <p className="text-sm">No games found</p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 games-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
                {visible.map((game, i) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    isFav={favorites.includes(game.id)}
                    priority={i < 12}
                    index={i}
                    onPlay={() => handlePlay(game)}
                    onOptions={() => setOptionsGame(game)}
                  />
                ))}
              </div>
              <HypeAd />
              {hasMore && (
                <div ref={loadMoreRef} className="flex justify-center py-8">
                  <div className="w-4 h-4 rounded-full border border-white/10 border-t-white/40 animate-spin" />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showAdd && <AddGameModal onAdd={handleAddGame} onClose={() => setShowAdd(false)} />}
        {optionsGame && (
          <GameOptionsMenu
            game={optionsGame}
            isFav={favorites.includes(optionsGame.id)}
            onFav={() => handleFav(optionsGame.id)}
            onRemove={() => handleRemove(optionsGame)}
            onShare={() => { setShareUrl(resolveGameUrl(optionsGame.url)); setOptionsGame(null); }}
            onClose={() => setOptionsGame(null)}
          />
        )}
        {shareUrl && <ShareModal url={shareUrl} onClose={() => setShareUrl(null)} />}
      </AnimatePresence>
    </div>
  );
}