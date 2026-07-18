import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, Star, MoreVertical, X, Trash2, Share2, Copy, Check, Upload } from "lucide-react";
import { requestSyncSoon } from "@/lib/settingsSync";

function generateAppId(app: { label: string; url: string }) {
  return `${app.label}-${app.url}`.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
}

interface App {
  id: string;
  label: string;
  url: string;
  imageUrl: string;
  isCustom?: boolean;
  external?: boolean;
}

interface AppsPageProps {
  onNavigate?: (url: string) => void;
}

const BUILT_IN_APPS: App[] = [
  { id: "app-request", label: "App Request", url: "https://docs.google.com/forms/d/e/1FAIpQLSfDWiLkFUAcAsVVzb57HFW1xfGY3dSUwbMUhDdinsyESCCYeg/viewform?usp=sf_link", imageUrl: "/storage/images/main/googleforms.jpg", external: true },
  { id: "pete-ai", label: "PeteAI", url: "petezah://ai", imageUrl: "/storage/images/PeteAI.png", external: true },
  { id: "pete-music", label: "Music", url: "petezah://music", imageUrl: "/storage/images/petemusic-removebg-preview.png", external: true },
  { id: "pete-movies", label: "Movies", url: "petezah://movies", imageUrl: "/storage/images/pete-movies.png", external: true },
  { id: "pete-chat", label: "PeteChat", url: "petezah://chat", imageUrl: "/storage/images/vortex-petezah.webp", external: true },
  { id: "google", label: "Google", url: "https://www.google.com", imageUrl: "/storage/ag/apps/google/IMG_5324.webp" },
  { id: "youtube", label: "YouTube", url: "https://youtube.com", imageUrl: "/storage/ag/apps/youtube/IMG_5338.webp" },
  { id: "nowgg", label: "Now.gg", url: "https://now.gg", imageUrl: "/storage/ag/apps/nowgg/IMG_5325.png" },
  { id: "reddit", label: "Reddit", url: "https://reddit.com", imageUrl: "/storage/ag/apps/reddit/IMG_5326.jpeg" },
  { id: "geforce", label: "GeForce", url: "https://play.geforcenow.com", imageUrl: "/storage/images/main/geforce.jpg" },
  { id: "xbox", label: "Xbox", url: "https://xbox.com", imageUrl: "/storage/ag/apps/xbox/IMG_5327.png" },
  { id: "chatgpt", label: "ChatGPT", url: "https://chat.openai.com", imageUrl: "/storage/ag/apps/chatgpt/IMG_5328.jpeg" },
  { id: "github", label: "Github", url: "https://github.com", imageUrl: "/storage/images/main/github.jpg" },
  { id: "coolmathgames", label: "Cool Math Games", url: "https://coolmathgames.com", imageUrl: "/storage/ag/apps/coolmathgames/IMG_5329.png" },
  { id: "sentinel", label: "Sentinel", url: "https://sentinel.home.kg/", imageUrl: "/storage/images/main/sentinal.png" },
  { id: "crazygames", label: "Crazy Games", url: "https://crazygames.com", imageUrl: "/storage/ag/apps/crazygames/IMG_5330.webp" },
  { id: "facebook", label: "Facebook", url: "https://facebook.com", imageUrl: "/storage/ag/apps/facebook/IMG_5332.jpeg" },
  { id: "discord", label: "Discord", url: "https://discord.com/app", imageUrl: "/storage/ag/apps/discord/IMG_5331.jpeg" },
  { id: "poki", label: "Poki", url: "https://poki.com", imageUrl: "/storage/ag/apps/poki/IMG_5333.png" },
  { id: "tiktok", label: "TikTok", url: "https://tiktok.com", imageUrl: "/storage/ag/apps/tiktok/IMG_5335.png" },
  { id: "snapchat", label: "Snapchat", url: "https://web.snapchat.com", imageUrl: "/storage/ag/apps/snapchat/IMG_5334.png" },
  { id: "twitch", label: "Twitch", url: "https://twitch.tv", imageUrl: "/storage/ag/apps/twitch/IMG_5336.png" },
  { id: "x", label: "X", url: "https://x.com", imageUrl: "/storage/ag/apps/x/IMG_5337.png" },
  { id: "invid", label: "YouTube Invidious", url: "https://invidious.io", imageUrl: "/storage/images/main/invid.png" },
  { id: "hdtoday", label: "HD Today", url: "https://hdtoday.tv", imageUrl: "/storage/ag/apps/hdtoday/IMG_5342.jpeg" },
  { id: "aptoid", label: "Aptoid", url: "https://aptoide.com", imageUrl: "/storage/ag/apps/aptoid/IMG_5343.png" },
  { id: "android", label: "Android Emulator", url: "https://appetize.io", imageUrl: "/storage/ag/apps/android/logo.webp" },
  { id: "emulatorjs", label: "EmulatorJS", url: "https://emulatorjs.org", imageUrl: "/storage/ag/apps/emulatorjs/docs/Logo-light.png" },
  { id: "rumble", label: "Rumble", url: "https://rumble.com", imageUrl: "/storage/images/main/rumble.jpg" },
  { id: "yahoo", label: "Yahoo", url: "https://yahoo.com", imageUrl: "/storage/images/main/yahoo.jpg" },
  { id: "netflix", label: "Netflix", url: "https://netflix.com", imageUrl: "/storage/images/main/netflix.jpg" },
  { id: "hulu", label: "Hulu", url: "https://hulu.com", imageUrl: "/storage/images/main/hulu.jpg" },
  { id: "pinterest", label: "Pinterest", url: "https://pinterest.com", imageUrl: "/storage/images/main/pinterist.jpg" },
  { id: "soundcloud", label: "Soundcloud", url: "https://soundcloud.com", imageUrl: "/storage/images/main/soundcloud.jpg" },
  { id: "espn", label: "ESPN", url: "https://espn.com", imageUrl: "/storage/images/main/espn.jpg" },
  { id: "vortex", label: "Vortex", url: "https://vtx.chat.cdn.cloudflare.net", imageUrl: "/storage/images/main/vortex.png" },
  { id: "fifa", label: "Fifa Rosters", url: "https://www.ea.com/fifa", imageUrl: "/storage/images/main/fifarosters.jpg" },
  { id: "vercel", label: "Vercel", url: "https://vercel.com", imageUrl: "/storage/images/main/vercel.jpg" },
  { id: "vscode", label: "VsCode", url: "https://vscode.dev", imageUrl: "/storage/images/main/vscode.jpg" },
  { id: "y8games", label: "Y8Games", url: "https://y8.com", imageUrl: "/storage/images/main/y8games.jpg" },
  { id: "w3school", label: "W3School", url: "https://w3schools.com", imageUrl: "/storage/images/main/w3school.jpg" },
  { id: "scratch", label: "Scratch", url: "https://scratch.mit.edu", imageUrl: "/storage/images/main/scratch.jpg" },
  { id: "gmail", label: "Gmail", url: "https://mail.google.com", imageUrl: "/storage/images/main/gmail.jpg" },
  { id: "drive", label: "Google Drive", url: "https://drive.google.com", imageUrl: "/storage/images/main/drive.jpg" },
  { id: "chipin", label: "ChipIn", url: "https://chip-in.internetbowser.com/", imageUrl: "/storage/images/chip-in-logo.png" },
];

function getCustomApps(): App[] {
  try { const s = localStorage.getItem("customApps"); return s ? JSON.parse(s) : []; } catch { return []; }
}
function saveCustomApps(apps: App[]) {
  try { localStorage.setItem("customApps", JSON.stringify(apps)); requestSyncSoon(); } catch {}
}
function getFavorites(): string[] {
  try { const s = localStorage.getItem("favoriteApps"); return s ? JSON.parse(s) : []; } catch { return []; }
}
function saveFavorites(favs: string[]) {
  try { localStorage.setItem("favoriteApps", JSON.stringify(favs)); requestSyncSoon(); } catch {}
}
function getHiddenApps(): string[] {
  try { const s = localStorage.getItem("hiddenApps"); return s ? JSON.parse(s) : []; } catch { return []; }
}
function saveHiddenApps(hidden: string[]) {
  try { localStorage.setItem("hiddenApps", JSON.stringify(hidden)); requestSyncSoon(); } catch {}
}

function FluidCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const parent = canvas.parentElement;
      const w = parent ? parent.clientWidth : canvas.offsetWidth;
      const h = parent ? parent.clientHeight : canvas.offsetHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);
    const blobs = Array.from({ length: 6 }, (_, i) => ({
      x: Math.random() * (canvas.offsetWidth || 800),
      y: Math.random() * (canvas.offsetHeight || 600),
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      radius: 140 + Math.random() * 200,
      hue: 200 + i * 10,
      saturation: 60 + Math.random() * 25,
      lightness: 40 + Math.random() * 15,
      opacity: 0.15 + Math.random() * 0.12,
    }));
    let time = 0;
    const animate = () => {
      time += 0.003;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);
      blobs.forEach((b) => {
        b.x += b.vx + Math.sin(time + b.hue) * 0.15;
        b.y += b.vy + Math.cos(time * 0.7 + b.hue) * 0.15;
        if (b.x < -b.radius) b.x = w + b.radius;
        if (b.x > w + b.radius) b.x = -b.radius;
        if (b.y < -b.radius) b.y = h + b.radius;
        if (b.y > h + b.radius) b.y = -b.radius;
        const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius);
        grad.addColorStop(0, `hsla(${b.hue}, ${b.saturation}%, ${b.lightness}%, ${b.opacity * 2.2})`);
        grad.addColorStop(0.4, `hsla(${b.hue}, ${b.saturation}%, ${b.lightness}%, ${b.opacity * 1.1})`);
        grad.addColorStop(1, `hsla(${b.hue}, ${b.saturation}%, ${b.lightness}%, 0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      });
      for (let i = 0; i < 3; i++) {
        const wx = w * (0.2 + i * 0.3) + Math.sin(time * 0.5 + i) * 60;
        const wy = h * (0.3 + i * 0.2) + Math.cos(time * 0.4 + i * 2) * 40;
        const wg = ctx.createRadialGradient(wx, wy, 0, wx, wy, 120);
        wg.addColorStop(0, "hsla(210, 70%, 90%, 0.07)");
        wg.addColorStop(1, "hsla(210, 60%, 90%, 0)");
        ctx.fillStyle = wg;
        ctx.fillRect(0, 0, w, h);
      }
      animRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => { window.removeEventListener("resize", resize); cancelAnimationFrame(animRef.current); };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
      <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "block" }} />
    </div>
  );
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

function AddAppModal({ onAdd, onClose }: { onAdd: (a: App) => void; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [imageData, setImageData] = useState("");
  const [preview, setPreview] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setImageData(reader.result as string); setPreview(reader.result as string); };
    reader.readAsDataURL(file);
  };

  const handleSubmit = () => {
    if (!title.trim() || !url.trim() || !imageData) return;
    let finalUrl = url.trim();
    if (!finalUrl.startsWith("http")) finalUrl = "https://" + finalUrl;
    onAdd({ id: generateAppId({ label: title, url: finalUrl }), label: title.trim(), url: finalUrl, imageUrl: imageData, isCustom: true });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(12px)" }}>
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 6 }}
        className="relative w-full max-w-sm rounded-2xl p-6 shadow-2xl bg-card border border-border">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-semibold text-foreground">Add Custom App</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-accent text-muted-foreground transition-colors"><X size={14} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="App name"
              className="w-full mt-1 px-3 py-2 rounded-xl bg-accent border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-foreground/20" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">URL</label>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com"
              className="w-full mt-1 px-3 py-2 rounded-xl bg-accent border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-foreground/20" />
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
          <button onClick={handleSubmit} disabled={!title || !url || !imageData}
            className="w-full py-2.5 rounded-xl bg-foreground/10 border border-foreground/20 text-foreground text-sm font-medium hover:bg-foreground/15 transition-colors disabled:opacity-40">
            Add App
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function AppOptionsMenu({ app, isFav, onFav, onRemove, onShare, onClose }: {
  app: App; isFav: boolean; onFav: () => void; onRemove: () => void; onShare: () => void; onClose: () => void;
}) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[150] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }} onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
        onClick={e => e.stopPropagation()} className="w-full max-w-xs rounded-2xl p-5 shadow-2xl bg-card border border-border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground truncate pr-4">{app.label}</h3>
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
            <Share2 size={13} className="text-muted-foreground" /> Share App
          </button>
          <button onClick={onRemove}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-sm font-medium text-destructive hover:bg-destructive/20 transition-all">
            <Trash2 size={13} /> Remove App
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ShareModal({ url, onClose }: { url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[160] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }} onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
        onClick={e => e.stopPropagation()} className="w-full max-w-xs rounded-2xl p-5 shadow-2xl bg-card border border-border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Share App</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X size={14} /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Share this app with others:</p>
        <div className="flex gap-2">
          <input value={url} readOnly className="flex-1 px-3 py-2 rounded-xl bg-accent border border-border text-xs text-foreground outline-none" />
          <button onClick={copy} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent border border-border text-xs font-medium text-foreground hover:bg-accent/70 transition-colors">
            {copied ? <Check size={12} /> : <Copy size={12} />}{copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function AppCard({ app, isFav, onOpen, onOptions }: {
  app: App; isFav: boolean; onOpen: () => void; onOptions: () => void;
}) {
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ scale: 1.28, zIndex: 10 }} whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 380, damping: 20 }}
      className="relative cursor-pointer group rounded-xl overflow-hidden border-2 border-white/5 hover:border-white/40 transition-colors duration-150"
      style={{ aspectRatio: "4/3", background: "var(--accent)" }}
      onClick={onOpen}>
      <img src={app.imageUrl} alt={app.label}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" decoding="async" />
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.4) 50%, transparent 100%)" }} />
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl"
        style={{ boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.28), 0 0 60px rgba(99,179,237,0.35)" }} />
      <div className="absolute bottom-0 left-0 right-0 px-2.5 py-2.5 translate-y-2 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-200">
        <p className="text-white text-[11px] font-semibold truncate drop-shadow-sm">{app.label}</p>
      </div>
      {isFav && (
        <div className="absolute top-1.5 left-1.5">
          <Star size={10} className="fill-yellow-400 text-yellow-400 drop-shadow-sm" />
        </div>
      )}
      <button onClick={e => { e.stopPropagation(); onOptions(); }}
        className="absolute top-1.5 right-1.5 w-5 h-5 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 border border-white/15 backdrop-blur-sm">
        <MoreVertical size={9} className="text-white" />
      </button>
    </motion.div>
  );
}

export default function AppsPage({ onNavigate }: AppsPageProps) {
  const [customApps, setCustomApps] = useState<App[]>(getCustomApps);
  const [favorites, setFavorites] = useState<string[]>(getFavorites);
  const [hidden, setHidden] = useState<string[]>(getHiddenApps);
  const [search, setSearch] = useState("");
  const [optionsApp, setOptionsApp] = useState<App | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const allApps = [...customApps, ...BUILT_IN_APPS].filter(a => !hidden.includes(a.id));

  const filtered = (() => {
    let a = allApps;
    if (search.trim()) a = a.filter(x => x.label.toLowerCase().includes(search.toLowerCase()));
    return [...a].sort((a, b) => {
      const af = favorites.includes(a.id), bf = favorites.includes(b.id);
      return af === bf ? 0 : af ? -1 : 1;
    });
  })();

  const handleOpen = useCallback((app: App) => {
    if (!onNavigate) return;
    if (app.external || app.url.startsWith("petezah://") || app.url.includes("docs.google.com/forms")) {
      onNavigate(app.url);
    } else {
      onNavigate(`petezah://appviewer?url=${encodeURIComponent(app.url)}&title=${encodeURIComponent(app.label)}`);
    }
  }, [onNavigate]);

  const handleFav = useCallback((id: string) => {
    setFavorites(prev => { const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]; saveFavorites(next); return next; });
    setOptionsApp(null);
  }, []);

  const handleRemove = useCallback((app: App) => {
    if (app.isCustom) saveCustomApps(getCustomApps().filter(a => a.id !== app.id));
    const h = getHiddenApps(); h.push(app.id); saveHiddenApps(h);
    setHidden(prev => [...prev, app.id]);
    setFavorites(prev => { const next = prev.filter(x => x !== app.id); saveFavorites(next); return next; });
    setOptionsApp(null);
  }, []);

  const handleAddApp = useCallback((app: App) => {
    saveCustomApps([app, ...getCustomApps()]);
    setCustomApps(prev => [app, ...prev]);
    setShowAdd(false);
  }, []);

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">
      <FluidCanvas />
      <div className="flex-shrink-0 relative z-10 px-6 pt-5 pb-3"
        style={{ backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", background: "rgba(5, 10, 20, 0.35)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-accent/40 border border-white/8 focus-within:border-white/25 focus-within:bg-accent/60 transition-all">
              <Search size={13} className="text-muted-foreground flex-shrink-0" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search apps..."
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
              {search && (
                <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X size={12} />
                </button>
              )}
            </div>
            <button onClick={() => setShowAdd(true)}
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-accent/40 border border-white/8 hover:border-white/20 hover:bg-accent/60 text-muted-foreground hover:text-foreground transition-all flex-shrink-0"
              title="Add custom app">
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto relative z-0" style={{ scrollbarWidth: "none" }}>
        <div className="px-6 py-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
              <p className="text-sm">No apps found</p>
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
              <AnimatePresence mode="popLayout">
                {filtered.map(app => (
                  <AppCard key={app.id} app={app} isFav={favorites.includes(app.id)}
                    onOpen={() => handleOpen(app)} onOptions={() => setOptionsApp(app)} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showAdd && <AddAppModal onAdd={handleAddApp} onClose={() => setShowAdd(false)} />}
        {optionsApp && (
          <AppOptionsMenu app={optionsApp} isFav={favorites.includes(optionsApp.id)}
            onFav={() => handleFav(optionsApp.id)} onRemove={() => handleRemove(optionsApp)}
            onShare={() => { setShareUrl(optionsApp.url); setOptionsApp(null); }}
            onClose={() => setOptionsApp(null)} />
        )}
        {shareUrl && <ShareModal url={shareUrl} onClose={() => setShareUrl(null)} />}
      </AnimatePresence>
    </div>
  );
}
