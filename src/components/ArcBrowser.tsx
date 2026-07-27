import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useBrowserState } from "@/hooks/useBrowserState";
import { useAuth } from "@/hooks/useAuth";
import { schedulePushSettings } from "@/lib/settingsSync";
import Sidebar from "@/components/BrowserSidebar";
import Toolbar from "@/components/BrowserToolbar";
import ContentArea from "@/components/ContentArea";
import StatusBar from "@/components/StatusBar";
import DiscordPopup from "@/components/DiscordPopup";
import VantaBackground from "@/components/VantaBackground";
import GlobalAnnouncement from "@/components/GlobalAnnouncement";
import {
  classifyOpenUrl,
  installParentOpenTrap,
  toAdTabUrl,
  unwrapProxyUrl,
  type OpenTabRequest,
} from "@/lib/openTabBridge";

function getPresenceClientId() {
  try {
    let id = sessionStorage.getItem("pz-presence-id");
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem("pz-presence-id", id);
    }
    return id;
  } catch {
    return "anon";
  }
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return !!target.closest("[contenteditable='true']");
}

export default function ArcBrowser() {
  const state = useBrowserState();
  const { user } = useAuth();
  const splitTab = state.splitTabId
    ? state.tabs.find((t) => t.id === state.splitTabId)
    : undefined;
  const [zoomLevel, setZoomLevel] = useState(100);
  const contentRef = useRef<HTMLDivElement>(null);
  const [openToast, setOpenToast] = useState<string | null>(null);
  const openToastTimer = useRef<number | null>(null);

  const zoomIn = useCallback(() => setZoomLevel((z) => Math.min(z + 10, 200)), []);
  const zoomOut = useCallback(() => setZoomLevel((z) => Math.max(z - 10, 50)), []);
  const resetZoom = useCallback(() => setZoomLevel(100), []);

  const toggleContentFullscreen = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        el.requestFullscreen();
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!user) return;
    const onSync = () => schedulePushSettings();
    window.addEventListener("petezah-settings-updated", onSync);
    window.addEventListener("petezah-sync-request", onSync);
    return () => {
      window.removeEventListener("petezah-settings-updated", onSync);
      window.removeEventListener("petezah-sync-request", onSync);
    };
  }, [user]);

  useEffect(() => {
    const report = () => {
      const urls = state.tabs
        .map((t) => t.url)
        .filter((u) => typeof u === "string" && /^https?:\/\//i.test(u))
        .slice(0, 4);
      fetch("/api/presence", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: getPresenceClientId(), urls }),
      }).catch(() => {});
    };
    report();
    const t = window.setInterval(report, 12000);
    return () => window.clearInterval(t);
  }, [state.tabs]);

  useEffect(() => {
    installParentOpenTrap();

    const openFromDetail = (detail: OpenTabRequest) => {
      const raw = detail?.url;
      if (!raw) return;
      const url = unwrapProxyUrl(raw);
      const classified = classifyOpenUrl(url);
      const kind =
        detail.mode === "ad" || detail.soft || classified === "ad" ? "ad" : classified;
      if (kind === "skip") return;
      if (kind === "ad") {
        state.addTab(toAdTabUrl(url));
        if (openToastTimer.current) window.clearTimeout(openToastTimer.current);
        setOpenToast("Sponsored");
        openToastTimer.current = window.setTimeout(() => setOpenToast(null), 1400);
        return;
      }
      state.addTab(url);
    };

    const onCustom = (e: Event) => {
      openFromDetail((e as CustomEvent).detail as OpenTabRequest);
    };
    const onMessage = (e: MessageEvent) => {
      const d = e.data;
      if (!d || d.source !== "pz-open-trap" || typeof d.url !== "string") return;
      openFromDetail({
        url: d.url,
        mode: d.mode === "ad" ? "ad" : "proxy",
        soft: !!d.soft,
      });
    };

    window.addEventListener("petezah-open-tab", onCustom);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("petezah-open-tab", onCustom);
      window.removeEventListener("message", onMessage);
      if (openToastTimer.current) window.clearTimeout(openToastTimer.current);
    };
  }, [state.addTab]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { tabId, url } = (e as CustomEvent).detail;
      state.updateTabUrl(tabId, url);
      try {
        const entries = JSON.parse(localStorage.getItem("petezah-history") || "[]");
        const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url)}&sz=32`;
        const newEntry = {
          id: String(Date.now()) + Math.random(),
          url,
          title: url,
          favicon,
          visitedAt: Date.now(),
          isProxied: true,
        };
        const filtered = entries.filter((entry: any) => entry.url !== url);
        localStorage.setItem("petezah-history", JSON.stringify([newEntry, ...filtered].slice(0, 500)));
        window.dispatchEvent(new CustomEvent("petezah-sync-request"));
      } catch {}
    };
    window.addEventListener("petezah-url-change", handler);
    return () => window.removeEventListener("petezah-url-change", handler);
  }, []);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const deep = params.get("m") || params.get("music");
      if (deep && deep.startsWith("petezah://")) {
        state.navigateToUrl(deep);
        const clean = window.location.pathname || "/";
        window.history.replaceState({}, "", clean);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (e.key === "F11") {
        e.preventDefault();
        toggleContentFullscreen();
        return;
      }

      if (!mod) return;
      if (isTypingTarget(e.target) && !["t", "w", "l"].includes(key)) return;

      if (key === "t") {
        e.preventDefault();
        state.addTab();
        return;
      }
      if (key === "w") {
        e.preventDefault();
        if (state.focusedTab) state.closeTab(state.focusedTab.id);
        return;
      }
      if (key === "l") {
        e.preventDefault();
        state.setIsUrlFocused(true);
        return;
      }
      if (key === "h") {
        e.preventDefault();
        state.navigateToUrl("petezah://history");
        return;
      }
      if (key === "e") {
        e.preventDefault();
        state.navigateToUrl("petezah://extensions");
        return;
      }
      if (key === "d") {
        e.preventDefault();
        state.navigateToUrl("petezah://bookmarks");
        return;
      }
      if (key === "=" || key === "+") {
        e.preventDefault();
        zoomIn();
        return;
      }
      if (key === "-") {
        e.preventDefault();
        zoomOut();
        return;
      }
      if (key === "0") {
        e.preventDefault();
        resetZoom();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    state.addTab,
    state.closeTab,
    state.focusedTab,
    state.setIsUrlFocused,
    state.navigateToUrl,
    zoomIn,
    zoomOut,
    resetZoom,
    toggleContentFullscreen,
  ]);

  return (
    <div
      style={{
        height: "100dvh",
        width: "100%",
        display: "flex",
        overflow: "hidden",
        backgroundColor: "transparent",
        position: "relative",
      }}
    >
      <VantaBackground />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          width: "100%",
          height: "100%",
          overflow: "hidden",
        }}
      >
        <Sidebar
          spaces={state.spaces}
          activeSpaceId={state.activeSpaceId}
          pinnedTabs={state.pinnedTabs}
          unpinnedTabs={state.unpinnedTabs}
          activeTabId={state.focusedTabId}
          splitTabId={state.splitTabId}
          collapsed={state.sidebarCollapsed}
          onSpaceSwitch={() => {}}
          onTabSelect={state.selectTab}
          onTabClose={state.closeTab}
          onTabPin={state.togglePin}
          onTabSplit={(id) => state.openSplit(id)}
          onAddTab={() => state.addTab()}
          onToggleCollapse={() => state.setSidebarCollapsed(!state.sidebarCollapsed)}
          onAccountClick={() => state.navigateToUrl("petezah://account")}
          onNavigate={state.navigateToUrl}
          user={user}
        />
        <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden relative bg-transparent">
          <Toolbar
            activeTab={state.focusedTab}
            urlInput={state.urlInput}
            isUrlFocused={state.isUrlFocused}
            onUrlChange={state.setUrlInput}
            onUrlFocus={state.setIsUrlFocused}
            onNavigate={state.navigateToUrl}
            onNotificationClick={() => state.navigateToUrl("petezah://account")}
            onCloseTab={() => state.focusedTab && state.closeTab(state.focusedTab.id)}
            onCloseAllTabs={state.closeAllTabs}
            onNewTab={() => state.addTab()}
            zoomLevel={zoomLevel}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onResetZoom={resetZoom}
            onFullscreen={toggleContentFullscreen}
          />
          <ContentArea
            tabs={state.tabs}
            activeTab={state.activeTab}
            splitTab={splitTab}
            focusedPane={state.focusedPane}
            onFocusPane={state.setFocusedPane}
            onNavigate={state.navigateToUrl}
            onNewTab={() => state.addTab()}
            onCloseSplit={state.closeSplit}
            zoomLevel={zoomLevel}
            contentRef={contentRef}
          />
          <StatusBar tabCount={state.tabs.length} spaceCount={state.spaces.length} />
        </main>
      </div>
      <DiscordPopup />
      <GlobalAnnouncement />
      <AnimatePresence>
        {openToast && (
          <motion.div
            initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 4, filter: "blur(3px)" }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-8 left-1/2 z-[1000] -translate-x-1/2 px-3.5 py-2 rounded-full text-[11px] font-medium tracking-wide"
            style={{
              background: "hsla(216, 28%, 9%, 0.88)",
              border: "1px solid hsla(210, 40%, 80%, 0.12)",
              color: "hsla(210, 30%, 88%, 0.82)",
              boxShadow: "0 8px 28px rgba(0,0,0,0.28)",
              backdropFilter: "blur(14px)",
            }}
          >
            {openToast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
