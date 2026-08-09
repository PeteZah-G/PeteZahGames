import { Reorder, AnimatePresence, motion } from "framer-motion";
import { Plus, X } from "lucide-react";
import { Tab } from "@/hooks/useBrowserState";
import { themeById } from "@/lib/siteThemes";

function tabMark(tab: Tab) {
  const url = (tab.url || "").split("?")[0];
  if (url.startsWith("petezah://")) {
    const map: Record<string, string> = {
      "petezah://newtab": "H",
      "petezah://games": "G",
      "petezah://ai": "AI",
      "petezah://apps": "A",
      "petezah://music": "M",
      "petezah://movies": "MV",
      "petezah://vm": "VM",
      "petezah://firefox": "VM",
      "petezah://tools": "T",
      "petezah://history": "H",
      "petezah://bookmarks": "B",
      "petezah://extensions": "E",
      "petezah://account": "AC",
      "petezah://settings": "S",
    };
    return map[url] || "P";
  }
  try {
    if (url.startsWith("http")) {
      return `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(url)}&size=32`;
    }
  } catch {}
  return "";
}

function tabLabel(tab: Tab) {
  const url = (tab.url || "").split("?")[0];
  if (url === "petezah://newtab" || !url) return "Home";
  if (tab.title && tab.title !== "New Tab") return tab.title;
  if (url.startsWith("petezah://")) {
    const name = url.replace("petezah://", "");
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return tab.url || "Home";
}

export default function HorizontalTabBar({
  pinnedTabs,
  unpinnedTabs,
  activeTabId,
  onSelect,
  onClose,
  onReorder,
  onAddTab,
}: {
  pinnedTabs: Tab[];
  unpinnedTabs: Tab[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onAddTab: () => void;
}) {
  const tabs = [...pinnedTabs, ...unpinnedTabs];
  const ids = tabs.map((t) => t.id);
  let accent = "#d96a72";
  try {
    accent = themeById(localStorage.getItem("theme")).accent;
  } catch {}
  const activeBg = `color-mix(in srgb, ${accent} 22%, #121014 78%)`;
  const iconBg = `color-mix(in srgb, ${accent} 18%, #1a1418 82%)`;

  return (
    <div
      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 min-h-[44px] overflow-x-auto"
      style={{
        background: "hsla(0, 0%, 4%, 0.92)",
        borderBottom: "1px solid hsla(0, 0%, 100%, 0.06)",
        scrollbarWidth: "none",
      }}
    >
      <Reorder.Group
        as="div"
        axis="x"
        values={ids}
        onReorder={onReorder}
        className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto"
        style={{ scrollbarWidth: "none" }}
      >
        <AnimatePresence mode="popLayout">
          {tabs.map((tab) => {
            const active = tab.id === activeTabId;
            const mark = tabMark(tab);
            const isImg = mark.startsWith("http") || mark.startsWith("/");
            const title = tabLabel(tab);
            return (
              <Reorder.Item
                key={tab.id}
                value={tab.id}
                as="div"
                className="list-none flex-shrink-0"
                whileDrag={{ scale: 1.02, zIndex: 30 }}
              >
                <motion.button
                  type="button"
                  onClick={() => onSelect(tab.id)}
                  className="group relative flex items-center gap-2 max-w-[200px] min-w-[88px] h-[32px] pl-2.5 pr-1.5 cursor-grab active:cursor-grabbing"
                  style={{
                    background: active ? activeBg : "transparent",
                    color: active ? "hsla(0,0%,100%,0.95)" : "hsla(0,0%,100%,0.78)",
                    borderRadius: 999,
                    border: "none",
                    transition: "background 0.15s ease, color 0.15s ease",
                  }}
                  title={title}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = "hsla(0,0%,100%,0.06)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = "transparent";
                    }
                  }}
                >
                  {isImg ? (
                    <img
                      src={mark}
                      alt=""
                      className="w-4 h-4 rounded-[5px] object-contain flex-shrink-0"
                      draggable={false}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <span
                      className="w-4 h-4 rounded-[5px] text-[8px] font-bold flex items-center justify-center flex-shrink-0 tracking-tight"
                      style={{
                        background: iconBg,
                        color: "hsla(0,0%,100%,0.88)",
                      }}
                    >
                      {mark || "?"}
                    </span>
                  )}
                  <span className="text-[13px] truncate font-medium flex-1 text-left tracking-tight">
                    {title}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose(tab.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.stopPropagation();
                        onClose(tab.id);
                      }
                    }}
                    className={`p-0.5 rounded-full transition-opacity ${
                      active ? "opacity-55 hover:opacity-100" : "opacity-0 group-hover:opacity-55"
                    } hover:bg-white/10`}
                  >
                    <X size={11} />
                  </span>
                </motion.button>
              </Reorder.Item>
            );
          })}
        </AnimatePresence>
      </Reorder.Group>
      <button
        type="button"
        onClick={onAddTab}
        className="flex-shrink-0 w-7 h-7 ml-0.5 rounded-full flex items-center justify-center transition-colors"
        style={{ color: "hsla(0,0%,100%,0.7)" }}
        title="New tab"
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "hsla(0,0%,100%,0.08)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        <Plus size={15} strokeWidth={1.75} />
      </button>
    </div>
  );
}
