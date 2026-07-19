import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Bot,
  Music,
  Film,
  Gamepad2,
  AppWindow,
  ShieldCheck,
  Pencil,
  Trash2,
  Plus,
  Upload,
  X,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";
import { Tab } from "@/hooks/useBrowserState";
import { PX, getMuxRoot, openMuxConnection, setMuxTransport } from "@/lib/px";
import GamesPage from "./GamesPage";
import GameViewerPage from "./GameViewerPage";
import AIPage from "./AIPage";
import AppsPage from "./AppsPage";
import MusicPage from "./MusicPage";
import ChatPage from "./ChatPage";
import MoviesPage from "./MoviesPage";
import AppViewerPage from "./AppViewerPage";
import ChangelogPage from "./ChangelogPage";
import FeedbackPage from "./FeedbackPage";
import AccountPage from "./AccountPage";
import HistoryPage from "./HistoryPage";
import ExtensionsPage from "./ExtensionsPage";
import BookmarksPage from "./BookmarksPage";
import ProfilePage from "./ProfilePage";
import { recordHistory } from "./HistoryPage";
import { runExtensionsOnFrame } from "./ExtensionsPage";
import { requestSyncSoon } from "@/lib/settingsSync";

interface ContentAreaProps {
  tabs: Tab[];
  activeTab: Tab | undefined;
  splitTab: Tab | undefined;
  focusedPane?: "main" | "split";
  onFocusPane?: (pane: "main" | "split") => void;
  onNavigate: (url: string) => void;
  onNewTab: () => void;
  onCloseSplit: () => void;
}

interface Preset {
  id: string;
  label: string;
  url: string;
  icon: string;
  builtIn?: boolean;
}

const DEFAULT_PRESETS: Preset[] = [
  {
    id: "games",
    label: "Games",
    url: "petezah://games",
    icon: "gamepad",
    builtIn: true,
  },
  {
    id: "ai",
    label: "AI",
    url: "petezah://ai",
    icon: "bot",
    builtIn: true,
  },
  {
    id: "music",
    label: "Music",
    url: "petezah://music",
    icon: "music",
    builtIn: true,
  },
  {
    id: "movies",
    label: "Movies",
    url: "petezah://movies",
    icon: "film",
    builtIn: true,
  },
  {
    id: "apps",
    label: "Apps",
    url: "petezah://apps",
    icon: "appwindow",
    builtIn: true,
  },
  {
    id: "chat",
    label: "Chat",
    url: "petezah://chat",
    icon: "chat",
    builtIn: true,
  },
];

const ICON_MAP: Record<string, LucideIcon> = {
  bot: Bot,
  music: Music,
  film: Film,
  gamepad: Gamepad2,
  appwindow: AppWindow,
  chat: MessageCircle,
};

const VPN_REGIONS = [
  {
    id: "default",
    label: "Default",
    sublabel: "International",
    wisp: "/wisp/",
    config: "config.js",
    flag: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="w-4 h-4"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
        <path d="M2 12h20" />
      </svg>
    ),
  },
  {
    id: "1",
    label: "Quebec",
    sublabel: "Canada",
    wisp: "/api/alt-wisp-5/",
    config: "/static/alt-config-5.js",
    flag: (
      <svg viewBox="0 0 900 600" className="w-4 h-4 rounded-[2px]">
        <rect width="900" height="600" fill="#fff" />
        <rect width="225" height="600" fill="#d80621" />
        <rect x="675" width="225" height="600" fill="#d80621" />
        {/* Fleur-de-lis simplified */}
        <g fill="#d80621" transform="translate(450,300) scale(0.55)">
          <path d="M0-80 C-10-40-40-30-40 0 C-40 25-20 30 0 20 C20 30 40 25 40 0 C40-30 10-40 0-80Z" />
          <rect x="-8" y="20" width="16" height="50" />
          <path d="M-40-10 C-60-20-70 0-50 10 C-40 14-30 10-30 10Z" />
          <path d="M40-10 C60-20 70 0 50 10 C40 14 30 10 30 10Z" />
          <rect x="-30" y="5" width="60" height="10" rx="5" />
        </g>
      </svg>
    ),
  },
  {
    id: "2",
    label: "Massachusetts",
    sublabel: "USA",
    wisp: "/api/alt-wisp-1/",
    config: "/static/alt-config-1.js",
    flag: (
      <svg viewBox="0 0 19 10" className="w-4 h-4 rounded-[2px]">
        <rect width="19" height="10" fill="#B22234" />
        {[0, 2, 4, 6, 8].map((y) => (
          <rect
            key={y}
            y={y}
            width="19"
            height="1"
            fill={y === 0 ? "#B22234" : "#fff"}
          />
        ))}
        {[1, 3, 5, 7].map((y) => (
          <rect key={y} y={y} width="19" height="1" fill="#fff" />
        ))}
        <rect width="8" height="5.4" fill="#3C3B6E" />
        {[0.9, 2.7, 4.5].map((y, i) =>
          [
            0.8,
            2.4,
            4.0,
            5.6,
            7.2,
            ...(i % 2 === 0 ? [1.6, 3.2, 4.8, 6.4] : []),
          ]
            .slice(0, i % 2 === 0 ? 9 : 6)
            .map((x, j) => (
              <circle key={`${i}-${j}`} cx={x} cy={y} r="0.35" fill="#fff" />
            ))
        )}
      </svg>
    ),
  },
  {
    id: "3",
    label: "Phoenix",
    sublabel: "USA",
    wisp: "/api/alt-wisp-2/",
    config: "/static/alt-config-2.js",
    flag: (
      <svg viewBox="0 0 19 10" className="w-4 h-4 rounded-[2px]">
        <rect width="19" height="10" fill="#B22234" />
        {[1, 3, 5, 7].map((y) => (
          <rect key={y} y={y} width="19" height="1" fill="#fff" />
        ))}
        <rect width="8" height="5.4" fill="#3C3B6E" />
        {[0.9, 2.7, 4.5].map((y, i) =>
          [
            0.8,
            2.4,
            4.0,
            5.6,
            7.2,
            ...(i % 2 === 0 ? [1.6, 3.2, 4.8, 6.4] : []),
          ]
            .slice(0, i % 2 === 0 ? 9 : 6)
            .map((x, j) => (
              <circle key={`${i}-${j}`} cx={x} cy={y} r="0.35" fill="#fff" />
            ))
        )}
      </svg>
    ),
  },
  {
    id: "4",
    label: "Virginia",
    sublabel: "USA",
    wisp: "/api/alt-wisp-3/",
    config: "/static/alt-config-3.js",
    flag: (
      <svg viewBox="0 0 19 10" className="w-4 h-4 rounded-[2px]">
        <rect width="19" height="10" fill="#B22234" />
        {[1, 3, 5, 7].map((y) => (
          <rect key={y} y={y} width="19" height="1" fill="#fff" />
        ))}
        <rect width="8" height="5.4" fill="#3C3B6E" />
        {[0.9, 2.7, 4.5].map((y, i) =>
          [
            0.8,
            2.4,
            4.0,
            5.6,
            7.2,
            ...(i % 2 === 0 ? [1.6, 3.2, 4.8, 6.4] : []),
          ]
            .slice(0, i % 2 === 0 ? 9 : 6)
            .map((x, j) => (
              <circle key={`${i}-${j}`} cx={x} cy={y} r="0.35" fill="#fff" />
            ))
        )}
      </svg>
    ),
  },
  {
    id: "5",
    label: "Vienna",
    sublabel: "Austria",
    wisp: "/api/alt-wisp-4/",
    config: "/static/alt-config-4.js",
    flag: (
      <svg viewBox="0 0 3 2" className="w-4 h-4 rounded-[2px]">
        <rect width="3" height="2" fill="#ED2939" />
        <rect y="0.667" width="3" height="0.667" fill="#fff" />
      </svg>
    ),
  },
];

async function applyVpnRegion(regionId: string) {
  const region = VPN_REGIONS.find((r) => r.id === regionId);
  if (!region) return;

  try {
    localStorage.setItem("selectedVpnRegion", regionId);

    const old = document.getElementById("config-script");
    if (old) old.remove();
    await new Promise<void>((resolve) => {
      const s = document.createElement("script");
      s.id = "config-script";
      s.src = region.config;
      s.onload = () => resolve();
      s.onerror = () => resolve(); 
      document.body.appendChild(s);
    });

    const cfg = (window as any)._CONFIG;
    const wispUrl =
      cfg?.wispurl ??
      (location.protocol === "https:" ? "wss" : "ws") +
        "://" +
        location.host +
        region.wisp;

    if (getMuxRoot()) {
      const conn = openMuxConnection(PX.muxWorker);
      await setMuxTransport(conn, PX.epoxyMod, wispUrl).catch(() => {});
    }

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "selectedVpnRegion",
        newValue: regionId,
      })
    );
  } catch (e) {
    console.error("[vpn] region switch failed", e);
  }
}

function VpnSelector() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>(
    () => localStorage.getItem("selectedVpnRegion") ?? "default"
  );
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const current = VPN_REGIONS.find(r => r.id === selected) ?? VPN_REGIONS[0];

  const handleSelect = async (id: string) => {
    setSelected(id);
    setOpen(false);
    await applyVpnRegion(id);
  };

  return (
    <div ref={ref} className="relative mt-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full glass-subtle border border-border text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <ShieldCheck size={11} className="flex-shrink-0" />
        <span className="flex items-center gap-1.5">
          {current.flag}
          {current.label}
        </span>
        <span className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 w-44 rounded-2xl glass-heavy border border-border shadow-2xl p-2 flex flex-col gap-1"
          >
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground px-2 pb-1">VPN Region</p>
            {VPN_REGIONS.map(region => (
              <button
                key={region.id}
                onClick={() => handleSelect(region.id)}
                className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-left transition-colors w-full
                  ${selected === region.id
                    ? "bg-primary/10 text-foreground border border-primary/20"
                    : "hover:bg-accent text-muted-foreground hover:text-foreground"
                  }`}
              >
                <span className="flex-shrink-0">{region.flag}</span>
                <span className="flex flex-col">
                  <span className="text-[11px] font-medium leading-tight">{region.label}</span>
                  <span className="text-[9px] opacity-60 leading-tight">{region.sublabel}</span>
                </span>
                {selected === region.id && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function getStoredPresets(): Preset[] {
  try {
    const stored = localStorage.getItem("petezah-presets");
    if (stored) return JSON.parse(stored);
  } catch {}
  return DEFAULT_PRESETS;
}

function savePresetsToStorage(presets: Preset[]) {
  try {
    localStorage.setItem("petezah-presets", JSON.stringify(presets));
    requestSyncSoon();
  } catch {}
}

function FluidCanvas({ enabled }: { enabled: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
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
      x: Math.random() * canvas.offsetWidth,
      y: Math.random() * canvas.offsetHeight,
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

        if (enabled) {
          const dx = mouseRef.current.x - b.x;
          const dy = mouseRef.current.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 300) {
            b.x += dx * 0.003;
            b.y += dy * 0.003;
          }
        }

        if (b.x < -b.radius) b.x = w + b.radius;
        if (b.x > w + b.radius) b.x = -b.radius;
        if (b.y < -b.radius) b.y = h + b.radius;
        if (b.y > h + b.radius) b.y = -b.radius;

        const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius);
        grad.addColorStop(
          0,
          `hsla(${b.hue}, ${b.saturation}%, ${b.lightness}%, ${
            b.opacity * 2.2
          })`
        );
        grad.addColorStop(
          0.4,
          `hsla(${b.hue}, ${b.saturation}%, ${b.lightness}%, ${
            b.opacity * 1.1
          })`
        );
        grad.addColorStop(
          1,
          `hsla(${b.hue}, ${b.saturation}%, ${b.lightness}%, 0)`
        );
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

    const handleMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    if (enabled) canvas.addEventListener("mousemove", handleMouse);

    return () => {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", handleMouse);
      cancelAnimationFrame(animRef.current);
    };
  }, [enabled]);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: enabled ? "auto" : "none",
          display: "block",
        }}
      />
    </div>
  );
}

function NewTabSearchBar({
  onNavigate,
}: {
  onNavigate: (url: string) => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleSubmit = () => {
    if (!query.trim()) return;
    let url = query.trim();
    if (url.startsWith("http") || url.includes(".")) {
      if (!url.startsWith("http")) url = "https://" + url;
    } else {
      url = "https://duckduckgo.com/?q=" + encodeURIComponent(url);
    }
    onNavigate(url);
    setQuery("");
  };

  const isMac =
    typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);

  return (
    <div className="w-full max-w-lg">
      <div className="flex items-center gap-3 rounded-2xl glass-heavy px-5 py-3 transition-all duration-200 focus-within:ring-1 focus-within:ring-foreground/20">
        <Search size={15} className="text-muted-foreground flex-shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
          placeholder="Search or enter URL..."
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          spellCheck={false}
        />
        <kbd className="hidden sm:flex items-center gap-0.5 px-2 py-0.5 rounded-lg bg-accent border border-border text-[10px] font-mono text-muted-foreground">
          {isMac ? "⌘" : "Ctrl"}+K
        </kbd>
      </div>
    </div>
  );
}

function PresetEditModal({
  preset,
  onSave,
  onDelete,
  onClose,
}: {
  preset: Preset | null;
  onSave: (p: Preset) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(preset?.label || "");
  const [url, setUrl] = useState(preset?.url || "");
  const [iconData, setIconData] = useState(preset?.icon || "");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setIconData(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!label.trim()) return;
    onSave({
      id: preset?.id || String(Date.now()),
      label: label.trim(),
      url: url.trim() || "about:blank",
      icon: iconData || "bot",
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 5 }}
        className="relative z-10 w-full max-w-xs bg-card border border-border rounded-2xl p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">
            {preset ? "Edit Preset" : "Add Preset"}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground"
          >
            <X size={14} />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Title
            </label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-xl bg-accent border border-border text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
              URL
            </label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-xl bg-accent border border-border text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Icon
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleFile}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full mt-1 px-3 py-2 rounded-xl bg-accent border border-border text-sm text-muted-foreground hover:text-foreground flex items-center gap-2 transition-colors"
            >
              <Upload size={12} />
              <span>
                {iconData?.startsWith("data:")
                  ? "Image selected"
                  : "Upload image"}
              </span>
            </button>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Save
            </button>
            {onDelete && (
              <button
                onClick={onDelete}
                className="px-3 py-2 rounded-xl bg-destructive/10 text-destructive text-sm hover:bg-destructive/20 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function PresetCard({
  preset,
  onClick,
  onEdit,
  index = 0,
}: {
  preset: Preset;
  onClick: () => void;
  onEdit: () => void;
  index?: number;
}) {
  const IconComp = ICON_MAP[preset.icon];
  const isCustomImage = preset.icon?.startsWith("data:");

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay: 0.32 + index * 0.04, ease: [0.22, 1, 0.36, 1] }}
      className="relative group"
    >
      <button
        type="button"
        title={preset.label}
        onClick={onClick}
        onContextMenu={(e) => {
          e.preventDefault();
          onEdit();
        }}
        className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110"
        style={{
          background: "hsla(220, 35%, 5%, 0.92)",
          border: "1px solid hsla(210, 40%, 80%, 0.12)",
          color: "hsla(0,0%,100%,0.82)",
        }}
      >
        {isCustomImage ? (
          <img src={preset.icon} alt="" className="w-3.5 h-3.5 object-cover rounded-full" />
        ) : IconComp ? (
          <IconComp size={13} />
        ) : (
          <span className="text-[9px] font-semibold">{preset.label[0]}</span>
        )}
      </button>
      <span
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1.5 px-2 py-0.5 rounded-md text-[9px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-20"
        style={{
          background: "hsla(220, 35%, 5%, 0.95)",
          border: "1px solid hsla(210, 40%, 80%, 0.14)",
          color: "hsla(0,0%,100%,0.88)",
        }}
      >
        {preset.label}
      </span>
    </motion.div>
  );
}

function NewTabPage({ onNavigate }: { onNavigate: (url: string) => void }) {
  const fluidCursor = true;
  const [presets, setPresets] = useState<Preset[]>(getStoredPresets);
  const [editingPreset, setEditingPreset] = useState<Preset | null | "new">(
    null
  );

  const savePresets = useCallback((updated: Preset[]) => {
    setPresets(updated);
    savePresetsToStorage(updated);
  }, []);

  const ease = [0.22, 1, 0.36, 1] as const;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden">
      <FluidCanvas enabled={fluidCursor} />
      <motion.a
        href="https://discord.gg/cYjHFDguxS"
        target="_blank"
        rel="noopener noreferrer"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.55, ease }}
        className="absolute top-3 right-3 z-9 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-medium transition-all"
        style={{
          background: "hsla(220, 35%, 6%, 0.92)",
          border: "1px solid hsla(210, 40%, 80%, 0.14)",
          color: "hsla(0,0%,100%,0.88)",
          backdropFilter: "blur(10px)",
        }}
      >
        <MessageCircle size={11} style={{ color: "hsla(0,0%,100%,0.92)" }} />
        <span>Discord</span>
      </motion.a>

      <div className="relative z-10 flex flex-col items-center gap-5 max-w-2xl w-full px-6 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 18, letterSpacing: "0.18em", filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, letterSpacing: "-0.03em", filter: "blur(0px)" }}
          transition={{ duration: 0.85, ease }}
          className="text-[2rem] sm:text-[2.15rem] font-extrabold text-white tracking-tight"
          style={{ textShadow: "0 0 40px hsla(205, 80%, 60%, 0.25)" }}
        >
          PeteZah
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2, ease }}
          className="w-full flex justify-center"
        >
          <NewTabSearchBar onNavigate={onNavigate} />
        </motion.div>

        <div className="flex items-center justify-center gap-2.5 py-1">
          {presets.map((preset, i) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              index={i}
              onClick={() => onNavigate(preset.url)}
              onEdit={() => setEditingPreset(preset)}
            />
          ))}
          <motion.button
            type="button"
            title="Add"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.32 + presets.length * 0.04, ease }}
            onClick={() => setEditingPreset("new")}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110"
            style={{
              background: "hsla(220, 35%, 5%, 0.72)",
              border: "1px dashed hsla(210, 40%, 80%, 0.22)",
              color: "hsla(0,0%,100%,0.45)",
            }}
          >
            <Plus size={13} />
          </motion.button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.42 + presets.length * 0.03, ease }}
        >
          <VpnSelector />
        </motion.div>
      </div>
      <AnimatePresence>
        {editingPreset && (
          <PresetEditModal
            preset={editingPreset === "new" ? null : editingPreset}
            onSave={(p) => {
              if (editingPreset === "new") {
                savePresets([...presets, p]);
              } else {
                savePresets(presets.map((x) => (x.id === p.id ? p : x)));
              }
              setEditingPreset(null);
            }}
            onDelete={
              editingPreset !== "new"
                ? () => {
                    savePresets(
                      presets.filter(
                        (x) => x.id !== (editingPreset as Preset).id
                      )
                    );
                    setEditingPreset(null);
                  }
                : undefined
            }
            onClose={() => setEditingPreset(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Adopts the scramjet iframe into a React container div.
// The iframe is NEVER recreated — we just toggle display.
function ScramjetFrame({ tab, isVisible }: { tab: Tab; isVisible: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tab.frame?.frame) return;
    const container = containerRef.current;
    if (!container) return;
    const frame = tab.frame.frame as HTMLIFrameElement;
    if (frame.parentElement !== container) {
      container.appendChild(frame);
    }
    frame.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;border:none;";
  }, [tab.frame]);

  useEffect(() => {
    if (!tab.frame?.frame) return;
    (tab.frame.frame as HTMLIFrameElement).style.display = isVisible
      ? "block"
      : "none";
  }, [isVisible, tab.frame]);

  useEffect(() => {
    if (!isVisible || !tab.frame?.frame) return;
    const iframe = tab.frame.frame as HTMLIFrameElement;

    const inject = (url?: string) => {
      runExtensionsOnFrame(iframe, url || tab.url);
    };

    inject();
    const onLoad = () => inject();
    iframe.addEventListener("load", onLoad);

    const onUrl = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.tabId === tab.id && detail?.url) {
        try {
          (iframe as any).__pzExtRan = new Set();
        } catch {}
        setTimeout(() => inject(detail.url), 250);
      }
    };
    window.addEventListener("petezah-url-change", onUrl);

    const poll = window.setInterval(() => inject(), 2500);

    return () => {
      iframe.removeEventListener("load", onLoad);
      window.removeEventListener("petezah-url-change", onUrl);
      window.clearInterval(poll);
    };
  }, [isVisible, tab.frame, tab.id, tab.url]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full"
      style={{ display: isVisible ? "block" : "none" }}
    />
  );
}

function ExtensionAwareIframe({
  src,
  pageUrl,
  isVisible,
}: {
  src: string;
  pageUrl: string;
  isVisible: boolean;
}) {
  const ref = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!isVisible) return;
    const iframe = ref.current;
    if (!iframe) return;
    const inject = () => runExtensionsOnFrame(iframe, pageUrl);
    inject();
    iframe.addEventListener("load", inject);
    const poll = window.setInterval(inject, 2500);
    return () => {
      iframe.removeEventListener("load", inject);
      window.clearInterval(poll);
    };
  }, [src, pageUrl, isVisible]);

  return <iframe
    ref={ref}
    src={src}
    className="w-full h-full border-none"
    title="proxy"
    referrerPolicy="no-referrer"
    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals allow-presentation"
    allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
  />;
}

function TabPane({
  tab,
  isVisible,
  onNavigate,
}: {
  tab: Tab;
  isVisible: boolean;
  onNavigate: (url: string) => void;
}) {
  const isNewTab =
    !tab.url ||
    tab.url === "petezah://newtab" ||
    tab.url === "about:blank" ||
    tab.url === "https://";

  const isGames = tab.url === "petezah://games";
  const isAI = tab.url === "petezah://ai";
  const isApps = tab.url === "petezah://apps";
  const isMusic = tab.url === "petezah://music" || tab.url.startsWith("petezah://music?");
  const isChat = tab.url === "petezah://chat";
  const isMovies = tab.url === "petezah://movies";
  const isUserProfile = tab.url.startsWith("petezah://user/");
  const isGameViewer = tab.url.startsWith("petezah://gameviewer");
  const displayUrl = isGameViewer ? "petezah://gameviewer" : tab.url;
  const isAppViewer = tab.url.startsWith("petezah://appviewer");
  const isYoutube = tab.url.startsWith("https://www.youtube.com/") || tab.url.startsWith("https://youtube.com/") || tab.url.startsWith("youtube.com/");
  const isReddit = tab.url.startsWith("https://www.reddit.com/") || tab.url.startsWith("https://reddit.com/") || tab.url.startsWith("reddit.com/");

  if (isGameViewer) {
    const params = new URLSearchParams(tab.url.split("?")[1] || "");
    const gameUrl = params.get("url") || "";
    const gameTitle = params.get("title") || "";
    return (
      <div
        className="absolute inset-0"
        style={{ display: isVisible ? "block" : "none" }}
      >
        <GameViewerPage
          url={gameUrl}
          title={gameTitle}
          onBack={() => onNavigate("petezah://games")}
        />
      </div>
    );
  }
  if (isNewTab) {
    return (
      <div
        className="absolute inset-0"
        style={{ display: isVisible ? "block" : "none" }}
      >
        <NewTabPage onNavigate={onNavigate} />
      </div>
    );
  }

  if (isGames) {
    return (
      <div
        className="absolute inset-0"
        style={{ display: isVisible ? "block" : "none" }}
      >
        <GamesPage onNavigate={onNavigate} />
      </div>
    );
  }

  if (isAI) {
    return (
      <div
        className="absolute inset-0"
        style={{ display: isVisible ? "block" : "none" }}
      >
        <AIPage onNavigate={onNavigate} />
      </div>
    );
  }

  if (isApps) {
    return (
      <div
        className="absolute inset-0"
        style={{ display: isVisible ? "block" : "none" }}
      >
        <AppsPage onNavigate={onNavigate} />
      </div>
    );
  }

  if (isMusic) {
    return (
      <div
        className="absolute inset-0"
        style={{ display: isVisible ? "block" : "none" }}
      >
        <MusicPage onNavigate={onNavigate} initialUrl={tab.url} />
      </div>
    );
  }

  if (isUserProfile) {
    const handle = tab.url.replace(/^petezah:\/\/user\//, "");
    return (
      <div
        className="absolute inset-0"
        style={{ display: isVisible ? "block" : "none" }}
      >
        <ProfilePage username={handle} onNavigate={onNavigate} embedded />
      </div>
    );
  }

  if (isChat) {
    return (
      <div
        className="absolute inset-0"
        style={{ display: isVisible ? "block" : "none" }}
      >
        <ChatPage onNavigate={onNavigate} />
      </div>
    );
  }

  if (isMovies) {
    return (
      <div
        className="absolute inset-0"
        style={{ display: isVisible ? "block" : "none" }}
      >
        <MoviesPage onNavigate={onNavigate} />
      </div>
    );
  }

  if (tab.url === "petezah://changelog") {
    return (
      <div
        className="absolute inset-0"
        style={{ display: isVisible ? "block" : "none" }}
      >
        <ChangelogPage onNavigate={onNavigate} />
      </div>
    );
  }

  if (tab.url === "petezah://feedback") {
    return (
      <div
        className="absolute inset-0"
        style={{ display: isVisible ? "block" : "none" }}
      >
        <FeedbackPage onNavigate={onNavigate} />
      </div>
    );
  }

  if (tab.url === "petezah://settings") {
  return (
    <div
      className="absolute inset-0"
      style={{ display: isVisible ? "block" : "none" }}
    >
      <AccountPage onNavigate={onNavigate} />
    </div>
  );
}

  if (tab.url === "petezah://account") {
    return (
      <div
        className="absolute inset-0"
        style={{ display: isVisible ? "block" : "none" }}
      >
        <AccountPage onNavigate={onNavigate} />
      </div>
    );
  }

  if (tab.url === "petezah://history") {
    return (
      <div
        className="absolute inset-0"
        style={{ display: isVisible ? "block" : "none" }}
      >
        <HistoryPage onNavigate={onNavigate} />
      </div>
    );
  }
  if (tab.url === "petezah://extensions") {
    return (
      <div
        className="absolute inset-0"
        style={{ display: isVisible ? "block" : "none" }}
      >
        <ExtensionsPage onNavigate={onNavigate} />
      </div>
    );
  }
  if (tab.url === "petezah://bookmarks") {
    return (
      <div
        className="absolute inset-0"
        style={{ display: isVisible ? "block" : "none" }}
      >
        <BookmarksPage onNavigate={onNavigate} />
      </div>
    );
  }

  if (isAppViewer) {
    const params = new URLSearchParams(tab.url.split("?")[1] || "");
    const appUrl = params.get("url") || "";
    const appTitle = params.get("title") || "";
    return (
      <div
        className="absolute inset-0"
        style={{ display: isVisible ? "block" : "none" }}
      >
        <AppViewerPage
          url={appUrl}
          title={appTitle}
          onBack={() => onNavigate("petezah://apps")}
        />
      </div>
    );
  }

  if (isYoutube) {
    const embedUrl = "/static/google-embed.html#" + tab.url.replace(/^https?:\/\/(www\.)?/, "");
    return (
      <div className="absolute inset-0 w-full h-full" style={{ display: isVisible ? "block" : "none" }}>
        <ExtensionAwareIframe src={embedUrl} pageUrl={tab.url} isVisible={isVisible} />
      </div>
    );
  }

  if (isReddit) {
    const embedUrl = "/static/google-embed.html#" + tab.url.replace(/^https?:\/\/(www\.)?/, "");
    return (
      <div className="absolute inset-0 w-full h-full" style={{ display: isVisible ? "block" : "none" }}>
        <ExtensionAwareIframe src={embedUrl} pageUrl={tab.url} isVisible={isVisible} />
      </div>
    );
  }

  return (
    <div
      className="absolute inset-0 w-full h-full"
      style={{ display: isVisible ? "block" : "none" }}
    >
      {tab.frame ? (
        <ScramjetFrame tab={tab} isVisible={isVisible} />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden">
      <FluidCanvas enabled={false} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 flex flex-col items-center gap-6"
      >
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="relative"
        >
          <div className="w-16 h-16 rounded-full bg-foreground/5 border border-border" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-foreground/30" />
          </div>
        </motion.div>
        <div className="text-center">
          <h2 className="text-base font-medium text-foreground">
            Nothing to see
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Open a tab to begin
          </p>
        </div>
      </motion.div>
    </div>
  );
}

export default function ContentArea({
  tabs,
  activeTab,
  splitTab,
  focusedPane = "main",
  onFocusPane,
  onNavigate,
  onNewTab,
  onCloseSplit,
}: ContentAreaProps) {
  if (!activeTab && tabs.length === 0) return <EmptyState />;

  const mainTabs = tabs.filter((t) => !splitTab || t.id !== splitTab.id);
  const leftActive =
    activeTab && splitTab && activeTab.id === splitTab.id
      ? mainTabs[0]
      : activeTab;

  return (
    <div className="flex-1 flex relative w-full" style={{ overflow: "clip" }}>
      <div
        className="flex-1 relative"
        onMouseDown={() => onFocusPane?.("main")}
        style={{
          outline: focusedPane === "main" && splitTab ? "1px solid hsl(210 100% 65% / 0.25)" : undefined,
          outlineOffset: -1,
        }}
      >
        {mainTabs.length === 0 ? (
          <EmptyState />
        ) : (
          mainTabs.map((tab) => (
            <TabPane
              key={tab.id}
              tab={tab}
              isVisible={leftActive?.id === tab.id}
              onNavigate={onNavigate}
            />
          ))
        )}
      </div>

      {splitTab && (
        <>
          <div className="w-px bg-border/40 flex-shrink-0" />
          <div
            className="flex-1 relative min-w-0"
            onMouseDown={() => onFocusPane?.("split")}
            style={{
              outline: focusedPane === "split" ? "1px solid hsl(210 100% 65% / 0.25)" : undefined,
              outlineOffset: -1,
            }}
          >
            <TabPane tab={splitTab} isVisible onNavigate={onNavigate} />
            <button
              onClick={onCloseSplit}
              className="absolute top-2 right-2 z-50 p-1.5 rounded-lg glass-heavy border border-border text-foreground/70 hover:text-white transition-colors"
              title="Close split view"
            >
              <X size={11} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}