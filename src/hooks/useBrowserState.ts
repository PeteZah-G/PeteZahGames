import { useState, useCallback } from "react";
import { pxCreateFrame, pxEncode, pxReady } from "@/lib/px";
import { ensureProxyEngine } from "@/lib/browserInit";
import { getHomeUrl } from "@/lib/homeUrl";

export interface ProxyFrame {
  frame: HTMLIFrameElement;
  back?: () => void;
  forward?: () => void;
  reload?: () => void;
  go?: (url: string) => void;
  destroy?: () => void;
  addEventListener?: (event: string, handler: (e: any) => void) => void;
}

export type ScramjetFrame = ProxyFrame;

export interface Tab {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  pinned?: boolean;
  spaceId: string;
  icon?: string;
  frame?: ProxyFrame;
}

export interface Space {
  id: string;
  name: string;
  color: string;
}

const DEFAULT_SPACES: Space[] = [
  { id: "main", name: "Home", color: "var(--space-blue)" },
];

let tabCounter = 1;

function getFavicon(url: string): string {
  try {
    if (
      !url ||
      url === "petezah://newtab" ||
      url === "about:blank" ||
      url === "https://"
    )
      return "";
    const clean = url.startsWith("http") ? url : `https://${url}`;
    return `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(
      clean
    )}&size=32`;
  } catch {
    return "";
  }
}

function formatUrl(raw: string): string {
  let trimmed = raw.trim();
  if (!trimmed) return "petezah://newtab";
  if (trimmed.startsWith("petezah://")) return trimmed;
  try {
    if (localStorage.getItem("preferHttps") === "true" && trimmed.startsWith("http://")) {
      trimmed = "https://" + trimmed.slice(7);
    }
  } catch {}
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      if (localStorage.getItem("stripTrackers") === "true") {
        const u = new URL(trimmed);
        [...u.searchParams.keys()].forEach((k) => {
          if (/^(utm_|fbclid|gclid|mc_eid|igshid)/i.test(k)) u.searchParams.delete(k);
        });
        return u.toString();
      }
    } catch {}
    return trimmed;
  }
  if (trimmed.includes(".") && !trimmed.includes(" "))
    return `https://${trimmed}`;
  try {
    const eng = localStorage.getItem("searchEngine") || "ddg";
    const map: Record<string, string> = {
      ddg: "https://duckduckgo.com/?q=",
      bing: "https://www.bing.com/search?q=",
      google: "https://www.google.com/search?q=",
      startpage: "https://www.startpage.com/sp/search?query=",
      brave: "https://search.brave.com/search?q=",
    };
    return `${map[eng] || map.ddg}${encodeURIComponent(trimmed)}`;
  } catch {
    return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
  }
}

function makeProxyFrame(url: string): ProxyFrame | undefined {
  if (!pxReady()) {
    return undefined;
  }
  try {
    const scFrame = pxCreateFrame();
    if (!scFrame) return undefined;
    const frame = scFrame.frame as HTMLIFrameElement;
    frame.src = pxEncode(url);
    frame.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;border:none;opacity:0;transition:opacity 0.25s ease;";
    frame.referrerPolicy = "no-referrer";
    frame.setAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals allow-presentation allow-pointer-lock"
    );
    frame.allow =
      "fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-read; clipboard-write";
    frame.onload = () => {
      frame.style.opacity = "1";
    };
    return scFrame;
  } catch {
    return undefined;
  }
}

function createTab(url: string, spaceId: string): Tab {
  const tabId = String(tabCounter++);
  const isNewTab = !url || url === "petezah://newtab" || url === "about:blank";
  const finalUrl = isNewTab ? "petezah://newtab" : url;
  const frame = isNewTab || finalUrl.startsWith("petezah://") ? undefined : makeProxyFrame(url);
  if (frame) {
    frame.addEventListener?.("urlchange", (e: any) => {
      const newUrl = e?.url || e?.detail?.url || "";
      if (newUrl && newUrl.startsWith("http")) {
        window.dispatchEvent(new CustomEvent("petezah-url-change", {
          detail: { tabId: tabId, url: newUrl }
        }));
      }
    });
  }
  let title = "New Tab";
  if (!isNewTab) {
    if (finalUrl === "petezah://trending") title = "Trending";
    else if (finalUrl.startsWith("petezah://ad")) title = "Sponsored";
    else if (finalUrl.startsWith("petezah://")) {
      const name = finalUrl.replace("petezah://", "").split("?")[0];
      title = name.charAt(0).toUpperCase() + name.slice(1);
    } else {
      title = url.split("/")[2] || url;
    }
  }
  return {
    id: tabId,
    title,
    url: finalUrl,
    favicon: getFavicon(finalUrl),
    spaceId,
    frame,
  };
}

function makeNewTabEntry(spaceId: string): Tab {
  const url = getHomeUrl();
  return {
    id: String(tabCounter++),
    title: url === "petezah://trending" ? "Trending" : "New Tab",
    url,
    spaceId,
  };
}

export function useBrowserState() {
  const [spaces] = useState<Space[]>(DEFAULT_SPACES);
  const [activeSpaceId] = useState("main");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [splitTabId, setSplitTabId] = useState<string | null>(null);
  const [focusedPane, setFocusedPane] = useState<"main" | "split">("main");
  const [urlInput, setUrlInput] = useState("");
  const [isUrlFocused, setIsUrlFocused] = useState(false);

  const [tabs, setTabs] = useState<Tab[]>(() => {
    const initialTab = makeNewTabEntry("main");
    return [initialTab];
  });
  const [activeTabId, setActiveTabId] = useState(() => {
    return String(tabCounter - 1);
  });

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const spaceTabs = tabs.filter((t) => t.spaceId === activeSpaceId);
  const pinnedTabs = spaceTabs.filter((t) => t.pinned);
  const unpinnedTabs = spaceTabs.filter((t) => !t.pinned);

  const addTab = useCallback(
    (url?: unknown) => {
      const targetUrl =
        typeof url === "string" && url.trim() ? url : getHomeUrl();
      const needsEngine =
        !!targetUrl &&
        !targetUrl.startsWith("petezah://") &&
        targetUrl !== "about:blank";
      if (needsEngine && !pxReady()) {
        ensureProxyEngine().catch(() => {});
      }
      const newTab = createTab(targetUrl, activeSpaceId);
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.id);
      if (needsEngine && !newTab.frame) {
        const id = newTab.id;
        const start = Date.now();
        const iv = setInterval(() => {
          if (!pxReady()) {
            if (Date.now() - start > 15000) clearInterval(iv);
            return;
          }
          clearInterval(iv);
          const frame = makeProxyFrame(targetUrl);
          if (!frame) return;
          frame.addEventListener?.("urlchange", (e: any) => {
            const newUrl = e?.url || e?.detail?.url || "";
            if (newUrl && newUrl.startsWith("http")) {
              window.dispatchEvent(
                new CustomEvent("petezah-url-change", {
                  detail: { tabId: id, url: newUrl },
                })
              );
            }
          });
          setTabs((prev) =>
            prev.map((t) => (t.id === id && !t.frame ? { ...t, frame } : t))
          );
        }, 100);
      }
      return newTab;
    },
    [activeSpaceId]
  );

  const closeTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const tab = prev.find((t) => t.id === id);
        if (tab?.frame) {
          try {
            tab.frame.frame?.parentNode?.removeChild(tab.frame.frame);
            tab.frame.destroy?.();
          } catch {}
        }
        const next = prev.filter((t) => t.id !== id);
        if (next.length === 0) {
          const fallback = makeNewTabEntry(activeSpaceId);
          setTimeout(() => setActiveTabId(fallback.id), 0);
          return [fallback];
        }
        if (id === activeTabId) {
          const idx = prev.findIndex((t) => t.id === id);
          const nextActive = next[Math.min(idx, next.length - 1)];
          setTimeout(() => setActiveTabId(nextActive.id), 0);
        }
        return next;
      });
      setSplitTabId((prev) => (prev === id ? null : prev));
    },
    [activeTabId, activeSpaceId]
  );

  // ── Close all tabs ─────────────────────────────────────────────────────────
  const closeAllTabs = useCallback(() => {
    setTabs((prev) => {
      prev.forEach((tab) => {
        try {
          tab.frame?.frame?.parentNode?.removeChild(tab.frame.frame);
          tab.frame?.destroy?.();
        } catch {}
      });
      const fallback = makeNewTabEntry(activeSpaceId);
      setTimeout(() => setActiveTabId(fallback.id), 0);
      return [fallback];
    });
    setSplitTabId(null);
  }, [activeSpaceId]);

  const togglePin = useCallback((id: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t))
    );
  }, []);

  /** Reorder tabs within the active space. `orderedIds` is the full space tab order. */
  const reorderTabs = useCallback((orderedIds: string[]) => {
    if (!orderedIds.length) return;
    setTabs((prev) => {
      const byId = new Map(prev.map((t) => [t.id, t]));
      const first = byId.get(orderedIds[0]);
      if (!first) return prev;
      const spaceId = first.spaceId;
      const reordered = orderedIds
        .map((id) => byId.get(id))
        .filter((t): t is Tab => !!t && t.spaceId === spaceId);
      if (reordered.length === 0) return prev;
      // Keep pin grouping: pinned first, then unpinned — order preserved within each group.
      const pinned = reordered.filter((t) => t.pinned);
      const unpinned = reordered.filter((t) => !t.pinned);
      const spaceOrdered = [...pinned, ...unpinned];
      const others = prev.filter((t) => t.spaceId !== spaceId);
      return [...others, ...spaceOrdered];
    });
  }, []);

  const openSplit = useCallback((tabId?: string) => {
    if (tabId) {
      if (splitTabId === tabId) {
        setSplitTabId(null);
        return;
      }
      if (tabId === activeTabId) {
        const newTab = makeNewTabEntry(activeSpaceId);
        setTabs((prev) => [...prev, newTab]);
        setSplitTabId(tabId);
        setActiveTabId(newTab.id);
        setFocusedPane("main");
        return;
      }
      setSplitTabId(tabId);
      setFocusedPane("split");
      return;
    }
    const newTab = makeNewTabEntry(activeSpaceId);
    setTabs((prev) => [...prev, newTab]);
    setSplitTabId(newTab.id);
    setFocusedPane("split");
  }, [activeSpaceId, activeTabId, splitTabId]);

  const closeSplit = useCallback(() => {
    setSplitTabId(null);
    setFocusedPane("main");
  }, []);

  const selectTab = useCallback((id: string) => {
    if (splitTabId && id === splitTabId) {
      setFocusedPane("split");
      return;
    }
    setActiveTabId(id);
    setFocusedPane("main");
  }, [splitTabId]);

  const focusedTabId =
    focusedPane === "split" && splitTabId ? splitTabId : activeTabId;
  const focusedTab = tabs.find((t) => t.id === focusedTabId) || activeTab;

  const navigateToUrl = useCallback(
  (rawUrl: unknown) => {
    if (!rawUrl || typeof rawUrl !== "string" || !rawUrl.trim()) return;
    const url = formatUrl(rawUrl);
    const targetId = focusedTabId;

    const doNavigate = () => {
      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== targetId) return t;

          if (url === "petezah://newtab" || url.startsWith("petezah://")) {
            try {
              t.frame?.frame?.parentNode?.removeChild(t.frame.frame);
              t.frame?.destroy?.();
            } catch {}
            let title = "New Tab";
            if (url === "petezah://newtab") {
              title = "New Tab";
            } else if (url === "petezah://trending") {
              title = "Trending";
            } else if (url.startsWith("petezah://ad")) {
              title = "Sponsored";
            } else if (url.startsWith("petezah://gameviewer") || url.startsWith("petezah://appviewer")) {
              try {
                const params = new URLSearchParams(url.split("?")[1] || "");
                title = params.get("title") || (url.startsWith("petezah://gameviewer") ? "Game" : "App");
              } catch {
                title = url.startsWith("petezah://gameviewer") ? "Game" : "App";
              }
            } else {
              title = url.replace("petezah://", "").split("?")[0].replace(/^\w/, (c) => c.toUpperCase());
            }
            return { ...t, url, title, favicon: "", frame: undefined };
          }

          if (t.frame?.go) {
            try { t.frame.go(url); } catch {}
            const existingTabId = t.id;
            t.frame.addEventListener?.("urlchange", (e: any) => {
              const newUrl = e?.url || e?.detail?.url || "";
              if (newUrl && newUrl.startsWith("http")) {
                window.dispatchEvent(new CustomEvent("petezah-url-change", {
                  detail: { tabId: existingTabId, url: newUrl }
                }));
              }
            });
            return { ...t, url, title: url.split("/")[2] || url, favicon: getFavicon(url) };
          }

          const frame = makeProxyFrame(url);
          if (frame) {
            const newTabId = t.id;
            frame.addEventListener?.("urlchange", (e: any) => {
              const newUrl = e?.url || e?.detail?.url || "";
              if (newUrl && newUrl.startsWith("http")) {
                window.dispatchEvent(new CustomEvent("petezah-url-change", {
                  detail: { tabId: newTabId, url: newUrl }
                }));
              }
            });
          }
          return {
            ...t,
            url,
            title: url.split("/")[2] || url,
            favicon: getFavicon(url),
            ...(frame ? { frame } : {}),
          };
        })
      );
    };

    if (url.startsWith("petezah://") || url === "about:blank") {
      doNavigate();
    } else if (!pxReady()) {
      ensureProxyEngine().catch(() => {});
      const start = Date.now();
      const interval = setInterval(() => {
        if (pxReady()) {
          clearInterval(interval);
          doNavigate();
        } else if (Date.now() - start > 15000) {
          clearInterval(interval);
        }
      }, 100);
    } else {
      doNavigate();
    }

    setUrlInput("");
    setIsUrlFocused(false);
  },
  [focusedTabId]
);

  const updateTabMeta = useCallback(
    (id: string, updates: Partial<Pick<Tab, "title" | "url" | "favicon">>) => {
      setTabs((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
      );
    },
    []
  );

  const updateTabUrl = useCallback((tabId: string, url: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, url, favicon: getFavicon(url) } : t))
    );
    setActiveTabId((prev) => {
      if (prev === tabId) setUrlInput(url);
      return prev;
    });
  }, []);

  return {
    spaces,
    tabs,
    activeTabId,
    activeSpaceId,
    activeTab,
    focusedTab,
    focusedPane,
    focusedTabId,
    pinnedTabs,
    unpinnedTabs,
    sidebarCollapsed,
    splitTabId,
    urlInput,
    isUrlFocused,
    setActiveTabId,
    selectTab,
    setFocusedPane,
    setSidebarCollapsed,
    setUrlInput,
    setIsUrlFocused,
    addTab,
    closeTab,
    closeAllTabs,
    togglePin,
    reorderTabs,
    openSplit,
    closeSplit,
    setSplitTabId,
    navigateToUrl,
    updateTabMeta,
    updateTabUrl,
  };
}
