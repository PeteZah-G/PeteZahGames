import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Code2, Activity, HardDrive } from "lucide-react";
import { hrefs } from "@/lib/uiMarks";

function canInspectUrl(url?: string): boolean {
  if (!url) return false;
  const u = url.trim().toLowerCase();
  if (u.startsWith("http://") || u.startsWith("https://")) return true;
  if (u.startsWith(hrefs.gv())) return true;
  if (u.startsWith(hrefs.g())) return true;
  if (u.startsWith("petezah://appviewer")) return true;
  return false;
}

function formatHtml(raw: string): string {
  const text = raw.slice(0, 100000);
  let out = "";
  let depth = 0;
  let i = 0;
  while (i < text.length) {
    if (text[i] === "<") {
      const end = text.indexOf(">", i);
      if (end === -1) {
        out += text.slice(i);
        break;
      }
      const tag = text.slice(i, end + 1);
      const isClose = /^<\//.test(tag);
      const isSelf = /\/>$/.test(tag) || /^<(br|hr|img|input|meta|link|source|area|base|col|embed|wbr)\b/i.test(tag);
      if (isClose) depth = Math.max(0, depth - 1);
      out += `${out && !out.endsWith("\n") ? "\n" : ""}${"  ".repeat(depth)}${tag}`;
      if (!isClose && !isSelf) depth += 1;
      i = end + 1;
      continue;
    }
    const next = text.indexOf("<", i);
    const chunk = (next === -1 ? text.slice(i) : text.slice(i, next)).replace(/\s+/g, " ").trim();
    if (chunk) out += `\n${"  ".repeat(depth)}${chunk}`;
    i = next === -1 ? text.length : next;
  }
  return out.trim().slice(0, 80000);
}

function readFrameSource(): { source: string; note: string } {
  try {
    const frames = Array.from(document.querySelectorAll("iframe")) as HTMLIFrameElement[];
    const visible = frames.find((f) => {
      const r = f.getBoundingClientRect();
      return r.width > 40 && r.height > 40 && getComputedStyle(f).display !== "none";
    });
    if (!visible) return { source: "", note: "No page frame found." };
    let doc: Document | null = null;
    try {
      doc = visible.contentDocument;
    } catch {
      doc = null;
    }
    if (!doc?.documentElement) {
      return { source: "", note: "Cross-origin frame — source is blocked." };
    }
    const raw = doc.documentElement.outerHTML || "";
    return {
      source: formatHtml(raw),
      note: raw.length > 100000 ? "Showing formatted source (trimmed)." : "Formatted document source (read-only).",
    };
  } catch {
    return { source: "", note: "Could not read frame source." };
  }
}

function perfSnapshot() {
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  const paints = performance.getEntriesByType("paint") as PerformanceEntry[];
  const resources = performance.getEntriesByType("resource");
  const fcp = paints.find((p) => p.name === "first-contentful-paint");
  return {
    rows: [
      ["DOM ready", nav ? `${Math.round(nav.domContentLoadedEventEnd)} ms` : "—"],
      ["Load", nav ? `${Math.round(nav.loadEventEnd)} ms` : "—"],
      ["TTFB", nav ? `${Math.round(nav.responseStart)} ms` : "—"],
      ["FCP", fcp ? `${Math.round(fcp.startTime)} ms` : "—"],
      ["Resources", String(resources.length)],
      ["Transfer", nav ? `${Math.round((nav.transferSize || 0) / 1024)} KB` : "—"],
    ] as [string, string][],
  };
}

function memorySnapshot() {
  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  if (!mem) {
    return {
      rows: [["Heap", "Unavailable in this browser"]] as [string, string][],
      note: "Chrome exposes performance.memory; other browsers may not.",
    };
  }
  const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return {
    rows: [
      ["Used heap", mb(mem.usedJSHeapSize)],
      ["Total heap", mb(mem.totalJSHeapSize)],
      ["Heap limit", mb(mem.jsHeapSizeLimit)],
      ["Usage", `${Math.round((mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100)}%`],
    ] as [string, string][],
    note: "Approximate JS heap for this tab (not the iframe isolate).",
  };
}

type TabId = "source" | "performance" | "memory";

export default function InspectOverlay({
  open,
  onClose,
  url,
  title,
}: {
  open: boolean;
  onClose: () => void;
  url?: string;
  title?: string;
}) {
  const allowed = canInspectUrl(url);
  const [tab, setTab] = useState<TabId>("source");
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");
  const [perf, setPerf] = useState(perfSnapshot());
  const [mem, setMem] = useState(memorySnapshot());

  useEffect(() => {
    if (!open) return;
    setTab("source");
    if (!allowed) {
      setSource("");
      setNote("You can only inspect proxy pages or games.");
      return;
    }
    const got = readFrameSource();
    setSource(got.source);
    setNote(got.note);
    setPerf(perfSnapshot());
    setMem(memorySnapshot());
  }, [open, allowed, url]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-stretch justify-end no-obfuscate"
          data-no-obfuscate="true"
          style={{ background: "hsla(220, 40%, 4%, 0.4)", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
          onClick={onClose}
        >
          <motion.aside
            initial={{ x: 36, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 20, opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="h-full w-full max-w-[420px] flex flex-col no-obfuscate"
            data-no-obfuscate="true"
            style={{
              background: "hsla(220, 28%, 8%, 0.97)",
              borderLeft: "1px solid hsla(210, 40%, 80%, 0.12)",
              backdropFilter: "blur(16px)",
              boxShadow: "-20px 0 48px rgba(0,0,0,0.4)",
            }}
          >
            <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid hsla(210, 40%, 80%, 0.1)" }}>
              <Code2 size={14} style={{ color: "hsla(200, 80%, 70%, 0.9)" }} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold m-0" style={{ color: "hsla(0,0%,100%,0.92)" }}>Inspect</p>
                <p className="text-[10px] m-0 truncate" style={{ color: "hsla(0,0%,100%,0.45)" }}>{title || url || "Page"}</p>
              </div>
              <button type="button" onClick={onClose} className="p-1.5 rounded-lg border-0 cursor-pointer" style={{ background: "hsla(0,0%,100%,0.06)", color: "hsla(0,0%,100%,0.7)" }}>
                <X size={14} />
              </button>
            </div>

            {!allowed ? (
              <div className="px-5 py-6">
                <p className="text-[13px] m-0 leading-relaxed" style={{ color: "hsla(0,0%,100%,0.78)", overflowWrap: "anywhere" }}>{note}</p>
                <p className="text-[11px] m-0 mt-3" style={{ color: "hsla(0,0%,100%,0.4)" }}>
                  Supported: proxied http(s) pages, game viewer, and apps viewer.
                </p>
              </div>
            ) : (
              <>
                <div className="flex gap-1 px-3 py-2 flex-shrink-0" style={{ borderBottom: "1px solid hsla(210, 40%, 80%, 0.08)" }}>
                  {([
                    { id: "source" as const, label: "Source", icon: Code2 },
                    { id: "performance" as const, label: "Performance", icon: Activity },
                    { id: "memory" as const, label: "Memory", icon: HardDrive },
                  ]).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setTab(t.id);
                        if (t.id === "performance") setPerf(perfSnapshot());
                        if (t.id === "memory") setMem(memorySnapshot());
                        if (t.id === "source") {
                          const got = readFrameSource();
                          setSource(got.source);
                          setNote(got.note);
                        }
                      }}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-semibold border-0 cursor-pointer"
                      style={{
                        background: tab === t.id ? "hsla(205, 70%, 45%, 0.22)" : "transparent",
                        color: tab === t.id ? "hsla(0,0%,100%,0.92)" : "hsla(0,0%,100%,0.5)",
                      }}
                    >
                      <t.icon size={11} />
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="px-4 py-2 flex-shrink-0">
                  <p className="text-[10px] m-0 mb-1 uppercase tracking-wider" style={{ color: "hsla(0,0%,100%,0.4)" }}>URL</p>
                  <p className="text-[11px] m-0 break-all font-mono" style={{ color: "hsla(200, 70%, 75%, 0.9)", overflowWrap: "anywhere" }}>{url}</p>
                  {note && tab === "source" && <p className="text-[11px] m-0 mt-2" style={{ color: "hsla(0,0%,100%,0.5)", overflowWrap: "anywhere" }}>{note}</p>}
                </div>

                <div className="flex-1 min-h-0 overflow-auto px-4 pb-4">
                  {tab === "source" && (
                    source ? (
                      <pre
                        className="text-[10px] leading-relaxed m-0 p-3 rounded-xl font-mono whitespace-pre-wrap break-all"
                        data-no-obfuscate="true"
                        style={{
                          background: "hsla(220, 30%, 5%, 0.9)",
                          border: "1px solid hsla(210, 40%, 80%, 0.1)",
                          color: "hsla(140, 40%, 75%, 0.85)",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {source}
                      </pre>
                    ) : (
                      <p className="text-[12px] m-0" style={{ color: "hsla(0,0%,100%,0.45)" }}>{note || "No source available."}</p>
                    )
                  )}
                  {tab === "performance" && (
                    <div className="rounded-xl p-3 space-y-2" style={{ background: "hsla(220, 30%, 5%, 0.9)", border: "1px solid hsla(210, 40%, 80%, 0.1)" }}>
                      {perf.rows.map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-3 text-[12px]">
                          <span style={{ color: "hsla(0,0%,100%,0.45)" }}>{k}</span>
                          <span className="font-mono" style={{ color: "hsla(0,0%,100%,0.88)" }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {tab === "memory" && (
                    <div className="rounded-xl p-3 space-y-2" style={{ background: "hsla(220, 30%, 5%, 0.9)", border: "1px solid hsla(210, 40%, 80%, 0.1)" }}>
                      {mem.rows.map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-3 text-[12px]">
                          <span style={{ color: "hsla(0,0%,100%,0.45)" }}>{k}</span>
                          <span className="font-mono" style={{ color: "hsla(0,0%,100%,0.88)" }}>{v}</span>
                        </div>
                      ))}
                      {mem.note && <p className="text-[11px] m-0 pt-2" style={{ color: "hsla(0,0%,100%,0.4)" }}>{mem.note}</p>}
                    </div>
                  )}
                </div>
              </>
            )}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
