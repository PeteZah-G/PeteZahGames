import { useState, useEffect } from "react";
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

export default function ArcBrowser() {
  const state = useBrowserState();
  const { user } = useAuth();
  const splitTab = state.splitTabId
    ? state.tabs.find((t) => t.id === state.splitTabId)
    : undefined;
  const [zoomLevel, setZoomLevel] = useState(100);

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
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative bg-transparent">
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
            onZoomIn={() => setZoomLevel((z) => Math.min(z + 10, 200))}
            onZoomOut={() => setZoomLevel((z) => Math.max(z - 10, 50))}
            onResetZoom={() => setZoomLevel(100)}
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
          />
          <StatusBar tabCount={state.tabs.length} spaceCount={state.spaces.length} />
        </main>
      </div>
      <DiscordPopup />
      <GlobalAnnouncement />
    </div>
  );
}
