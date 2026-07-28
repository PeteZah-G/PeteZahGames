import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Lock,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Share,
  Bookmark,
  Gamepad2,
  Bot,
  User,
  FileText,
  MessageSquare,
  MoreVertical,
  X,
  Music,
  Film,
  AppWindow,
  Monitor,
  MessageCircle,
  Plus,
  ZoomIn,
  ZoomOut,
  History,
  Maximize,
  Puzzle,
} from "lucide-react";
import { Tab } from "@/hooks/useBrowserState";
import {
  displayUrlForBar,
  loadFontMaps,
  shouldObfuscateDisplay,
} from "@/lib/fontObfuscation";

interface ToolbarProps {
  activeTab: Tab | undefined;
  urlInput: string;
  isUrlFocused: boolean;
  onUrlChange: (val: string) => void;
  onUrlFocus: (focused: boolean) => void;
  onNavigate: (url: string) => void;
  onNotificationClick: () => void;
  onCloseTab?: () => void;
  onCloseAllTabs?: () => void;
  onNewTab?: () => void;
  zoomLevel?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
  onFullscreen?: () => void;
  onShowHistory?: () => void;
  onShowBookmarks?: () => void;
  onShowDownloads?: () => void;
}

export default function Toolbar({
  activeTab,
  urlInput,
  isUrlFocused,
  onUrlChange,
  onUrlFocus,
  onNavigate,
  onNotificationClick,
  onCloseTab,
  onCloseAllTabs,
  onNewTab,
  zoomLevel = 100,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFullscreen,
  onShowHistory,
  onShowBookmarks,
  onShowDownloads,
}: ToolbarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [mapsReady, setMapsReady] = useState(false);

  useEffect(() => {
    loadFontMaps().then(() => setMapsReady(true));
  }, []);

  useEffect(() => {
    if (isUrlFocused && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isUrlFocused]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const rawDisplay = isUrlFocused
    ? urlInput
    : activeTab?.url?.startsWith("petezah://gameviewer")
    ? "petezah://gameviewer"
    : activeTab?.url?.startsWith("petezah://ad")
    ? "petezah://ad"
    : activeTab?.url || "";

  const displayUrl =
    !isUrlFocused && mapsReady
      ? displayUrlForBar(rawDisplay, false)
      : rawDisplay;

  const urlObfuscated =
    !isUrlFocused && mapsReady && shouldObfuscateDisplay(rawDisplay);

  const isNewTab =
    !activeTab?.url ||
    activeTab.url === "petezah://newtab" ||
    activeTab.url === "about:blank" ||
    activeTab.url === "https://";

  const handleBack = () => {
    try {
      activeTab?.frame?.back?.();
    } catch {}
  };

  const handleForward = () => {
    try {
      activeTab?.frame?.forward?.();
    } catch {}
  };

  const handleReload = () => {
    try {
      activeTab?.frame?.reload?.();
    } catch {}
  };

  const handleShare = () => {
    try {
      if (activeTab?.url && navigator.clipboard) {
        navigator.clipboard.writeText(activeTab.url);
      }
    } catch {}
  };

  return (
    <div
      className="relative z-20 flex items-center gap-2 px-4 h-11 flex-shrink-0 chrome-bar"
      style={{ borderBottom: "1px solid hsla(210, 40%, 80%, 0.08)" }}
    >
      <div className="flex items-center gap-0.5">
        <button
          onClick={handleBack}
          disabled={isNewTab}
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
          style={{ color: "hsla(0,0%,100%,0.78)" }}
          title="Back"
        >
          <ArrowLeft size={13} />
        </button>
        <button
          onClick={handleForward}
          disabled={isNewTab}
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
          style={{ color: "hsla(0,0%,100%,0.78)" }}
          title="Forward"
        >
          <ArrowRight size={13} />
        </button>
        <button
          onClick={handleReload}
          disabled={isNewTab}
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
          style={{ color: "hsla(0,0%,100%,0.78)" }}
          title="Reload"
        >
          <RotateCw size={12} />
        </button>
      </div>

      <div
        className={`flex-1 flex items-center gap-2 rounded-xl px-3 py-1.5 mx-2 transition-all duration-200 cursor-text ${
          isUrlFocused ? "ring-1 ring-white/20" : "border border-white/10"
        }`}
        style={{ background: isUrlFocused ? "hsla(210, 40%, 90%, 0.08)" : "hsla(210, 40%, 90%, 0.05)" }}
        onClick={() => {
          onUrlChange(activeTab?.url || "");
          onUrlFocus(true);
        }}
      >
        <AnimatePresence mode="wait">
          {isUrlFocused ? (
            <motion.div
              key="search"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
            >
              <Search size={12} style={{ color: "hsla(0,0%,100%,0.45)" }} />
            </motion.div>
          ) : (
            <motion.div
              key="lock"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
            >
              <Lock size={11} style={{ color: "hsla(0,0%,100%,0.4)" }} />
            </motion.div>
          )}
        </AnimatePresence>

        <input
          ref={inputRef}
          value={displayUrl}
          data-no-obfuscate="true"
          onChange={(e) => onUrlChange(e.target.value)}
          onFocus={() => {
            onUrlChange(activeTab?.url || "");
            onUrlFocus(true);
          }}
          onBlur={() => onUrlFocus(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onNavigate(urlInput);
            if (e.key === "Escape") onUrlFocus(false);
          }}
          placeholder="Search or enter URL"
          className="pz-url-input flex-1 bg-transparent text-[12px] outline-none placeholder:text-white/35"
          style={{
            color: "hsla(0,0%,100%,0.9)",
            fontFamily: urlObfuscated
              ? "plusjakartasans-obf, sans-serif"
              : "inherit",
            fontWeight: urlObfuscated ? 600 : undefined,
            fontSynthesis: urlObfuscated ? "none" : undefined,
            fontVariantLigatures: urlObfuscated ? "none" : undefined,
          }}
          spellCheck={false}
        />

        {!isUrlFocused && activeTab && !isNewTab && (
          <span className="text-[10px] font-mono" style={{ color: "hsla(0,0%,100%,0.4)" }}>
            {activeTab.url.split(".").pop()?.split("/")[0]}
          </span>
        )}
      </div>

      <div className="flex items-center gap-0.5 flex-shrink-0" style={{ color: "hsla(0,0%,100%,0.78)" }}>
        <button
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors toolbar-hide-sm"
          title="Games"
          onClick={() => onNavigate("petezah://games")}
        >
          <Gamepad2 size={13} />
        </button>
        <button
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors toolbar-hide-sm"
          title="AI"
          onClick={() => onNavigate("petezah://ai")}
        >
          <Bot size={13} />
        </button>

        <div className="w-px h-3.5 mx-0.5 toolbar-hide-sm" style={{ background: "hsla(210, 40%, 80%, 0.12)" }} />

        <button
          onClick={onNotificationClick}
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
          title="Account"
        >
          <User size={13} />
        </button>
        <button
          onClick={() => onNavigate("petezah://changelog")}
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors toolbar-hide-sm"
          title="Changelog"
        >
          <FileText size={13} />
        </button>
        <button
          onClick={() => onNavigate("petezah://feedback")}
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors toolbar-hide-sm"
          title="Feedback"
        >
          <MessageSquare size={13} />
        </button>

        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((prev) => !prev)}
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            title="More"
          >
            <MoreVertical size={13} />
          </button>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full right-0 mt-1.5 w-64 bg-card border border-border rounded-xl shadow-2xl py-1 z-50 overflow-hidden"
              >
                <button
                  onClick={() => {
                    onNewTab?.();
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-[12px] text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
                >
                  <Plus size={13} className="text-foreground/40" />
                  <span className="flex-1 text-left">New Tab</span>
                  <kbd className="text-[10px] text-muted-foreground font-mono">
                    Ctrl+T
                  </kbd>
                </button>
                <button
                  onClick={() => {
                    onCloseTab?.();
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-[12px] text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
                >
                  <X size={13} className="text-foreground/40" />
                  <span className="flex-1 text-left">Close Tab</span>
                  <kbd className="text-[10px] text-muted-foreground font-mono">
                    Ctrl+W
                  </kbd>
                </button>
                <button
                  onClick={() => {
                    onCloseAllTabs?.();
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-[12px] text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
                >
                  <X size={13} className="text-foreground/40" />
                  <span className="flex-1 text-left">Close All Tabs</span>
                </button>

                <div className="h-px bg-border my-1 mx-3" />

                <div className="flex items-center gap-1 px-4 py-1.5">
                  <span className="text-[12px] text-foreground/60 mr-auto">
                    Zoom
                  </span>
                  <button
                    onClick={() => onZoomOut?.()}
                    className="p-1 rounded hover:bg-accent text-foreground/60 hover:text-foreground transition-colors"
                  >
                    <ZoomOut size={13} />
                  </button>
                  <button
                    onClick={() => onResetZoom?.()}
                    className="px-2 py-0.5 rounded hover:bg-accent text-[11px] font-mono text-foreground/70 min-w-[40px] text-center"
                  >
                    {zoomLevel}%
                  </button>
                  <button
                    onClick={() => onZoomIn?.()}
                    className="p-1 rounded hover:bg-accent text-foreground/60 hover:text-foreground transition-colors"
                  >
                    <ZoomIn size={13} />
                  </button>
                  <button
                    onClick={() => {
                      onFullscreen?.();
                      setMenuOpen(false);
                    }}
                    className="p-1 rounded hover:bg-accent text-foreground/60 hover:text-foreground transition-colors ml-1"
                    title="Fullscreen"
                  >
                    <Maximize size={13} />
                  </button>
                </div>

                <div className="h-px bg-border my-1 mx-3" />

                <button
                  onClick={() => {
                    onNavigate("petezah://history");
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-[12px] text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
                >
                  <History size={13} className="text-foreground/40" />
                  <span className="flex-1 text-left">History</span>
                  <kbd className="text-[10px] text-muted-foreground font-mono">
                    Ctrl+H
                  </kbd>
                </button>
                <button
                  onClick={() => {
                    onNavigate("petezah://extensions");
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-[12px] text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
                >
                  <Puzzle size={13} className="text-foreground/40" />
                  <span className="flex-1 text-left">Extensions</span>
                  <kbd className="text-[10px] text-muted-foreground font-mono">
                    Ctrl+E
                  </kbd>
                </button>
                <button
                  onClick={() => {
                    onNavigate("petezah://bookmarks");
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-[12px] text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
                >
                  <Bookmark size={13} className="text-foreground/40" />
                  <span className="flex-1 text-left">Bookmarks</span>
                  <kbd className="text-[10px] text-muted-foreground font-mono">
                    Ctrl+D
                  </kbd>
                </button>

                <div className="h-px bg-border my-1 mx-3" />

                <button
                  onClick={() => {
                    onNavigate("petezah://games");
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-[12px] text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
                >
                  <Gamepad2 size={13} className="text-foreground/40" />
                  <span className="flex-1 text-left">Games</span>
                </button>
                <button
                  onClick={() => {
                    onNavigate("petezah://ai");
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-[12px] text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
                >
                  <Bot size={13} className="text-foreground/40" />
                  <span className="flex-1 text-left">AI</span>
                </button>
                <button
                  onClick={() => {
                    onNavigate("petezah://music");
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-[12px] text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
                >
                  <Music size={13} className="text-foreground/40" />
                  <span className="flex-1 text-left">Music</span>
                </button>
                <button
                  onClick={() => {
                    onNavigate("petezah://movies");
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-[12px] text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
                >
                  <Film size={13} className="text-foreground/40" />
                  <span className="flex-1 text-left">Movies</span>
                </button>
                <button
                  onClick={() => {
                    onNavigate("petezah://vm");
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-[12px] text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
                >
                  <Monitor size={13} className="text-foreground/40" />
                  <span className="flex-1 text-left">VM</span>
                </button>
                <button
                  onClick={() => {
                    onNavigate("petezah://chat");
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-[12px] text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
                >
                  <MessageCircle size={13} className="text-foreground/40" />
                  <span className="flex-1 text-left">Chat</span>
                </button>
                <button
                  onClick={() => {
                    onNavigate("petezah://apps");
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-[12px] text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
                >
                  <AppWindow size={13} className="text-foreground/40" />
                  <span className="flex-1 text-left">Apps</span>
                </button>

                <div className="h-px bg-border my-1 mx-3" />

                <button
                  onClick={() => {
                    handleShare();
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-[12px] text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
                >
                  <Share size={13} className="text-foreground/40" />
                  <span className="flex-1 text-left">Copy URL</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
