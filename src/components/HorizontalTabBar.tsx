import { Reorder, AnimatePresence, motion } from "framer-motion";
import { Plus, X } from "lucide-react";
import { Tab } from "@/hooks/useBrowserState";

function tabMark(tab: Tab) {
  const url = tab.url || "";
  if (url.startsWith("petezah://")) {
    const map: Record<string, string> = {
      "petezah://newtab": "N",
      "petezah://games": "G",
      "petezah://ai": "AI",
      "petezah://apps": "A",
      "petezah://music": "M",
      "petezah://movies": "MV",
      "petezah://vm": "VM",
      "petezah://firefox": "VM",
    };
    return map[url.split("?")[0]] || "P";
  }
  try {
    if (url.startsWith("http")) {
      return `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(url)}&size=32`;
    }
  } catch {}
  return "";
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

  return (
    <div
      className="flex-shrink-0 flex items-center gap-1.5 px-2 py-1.5 min-h-[42px] overflow-x-auto"
      style={{
        borderBottom: "1px solid hsla(210, 40%, 80%, 0.08)",
        background: "hsla(220, 30%, 6%, 0.35)",
        backdropFilter: "blur(14px)",
        scrollbarWidth: "none",
      }}
    >
      <span
        className="text-[8px] font-bold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-md flex-shrink-0"
        style={{
          color: "hsla(45, 90%, 70%, 0.9)",
          background: "hsla(45, 80%, 45%, 0.14)",
          border: "1px solid hsla(45, 80%, 50%, 0.28)",
        }}
      >
        Beta
      </span>
      <Reorder.Group
        as="div"
        axis="x"
        values={ids}
        onReorder={onReorder}
        className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto"
        style={{ scrollbarWidth: "none" }}
      >
        <AnimatePresence mode="popLayout">
          {tabs.map((tab) => {
            const active = tab.id === activeTabId;
            const mark = tabMark(tab);
            const isImg = mark.startsWith("http") || mark.startsWith("/");
            const title =
              tab.title && tab.title !== "New Tab"
                ? tab.title
                : tab.url?.startsWith("petezah://")
                  ? tab.url.replace("petezah://", "")
                  : tab.url || "New Tab";
            return (
              <Reorder.Item
                key={tab.id}
                value={tab.id}
                as="div"
                className="list-none flex-shrink-0"
                whileDrag={{ scale: 1.04, zIndex: 30 }}
              >
                <motion.button
                  type="button"
                  onClick={() => onSelect(tab.id)}
                  className="group flex items-center gap-1.5 max-w-[160px] pl-2 pr-1 py-1 rounded-lg cursor-grab active:cursor-grabbing"
                  style={{
                    background: active ? "hsla(0,0%,100%,0.1)" : "hsla(0,0%,100%,0.04)",
                    border: `1px solid ${active ? "hsla(0,0%,100%,0.16)" : "hsla(0,0%,100%,0.06)"}`,
                    color: active ? "hsla(0,0%,100%,0.95)" : "hsla(0,0%,100%,0.7)",
                  }}
                  title={title}
                >
                  {isImg ? (
                    <img
                      src={mark}
                      alt=""
                      className="w-3.5 h-3.5 rounded-sm object-contain"
                      draggable={false}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <span className="text-[9px] font-semibold opacity-70 w-3.5 text-center">{mark || "?"}</span>
                  )}
                  <span className="text-[11px] truncate font-medium">{title}</span>
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
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10 transition-opacity"
                  >
                    <X size={10} />
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
        className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
        style={{
          color: "hsla(0,0%,100%,0.7)",
          background: "hsla(0,0%,100%,0.05)",
          border: "1px solid hsla(0,0%,100%,0.08)",
        }}
        title="New tab"
      >
        <Plus size={13} />
      </button>
    </div>
  );
}
