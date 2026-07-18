import { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Maximize, Minimize, ExternalLink, Eye, EyeOff, GripHorizontal } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface AppViewerPageProps {
  url: string;
  title?: string;
  onBack?: () => void;
}

function ControlBtn({ onClick, children, title }: { onClick: () => void; children: React.ReactNode; title?: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button onClick={onClick} title={title}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ width: 26, height: 26, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center",
        background: hovered ? "rgba(255,255,255,0.09)" : "none", border: "none",
        color: hovered ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)",
        cursor: "pointer", transition: "all 0.15s", flexShrink: 0 }}>
      {children}
    </button>
  );
}

const getEmbedUrl = (originalUrl: string, scramjet: any) => {
  try {
    const domain = new URL(originalUrl).hostname;
    if (domain.includes('google.com')) return '/static/google-embed.html#google.com';
    if (domain.includes('youtube.com')) return '/static/google-embed.html#youtube.com';
    if (domain.includes('reddit.com')) return '/static/google-embed.html#reddit.com';
  } catch { }
  return scramjet.encodeUrl(originalUrl);
};

export default function AppViewerPage({ url, title, onBack }: AppViewerPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const scramjetFrameRef = useRef<HTMLIFrameElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const tryCreate = () => {
      const scramjet = (window as any).scramjet;
      if (!scramjet) return false;
      try {
        const scFrame = scramjet.createFrame();
        scFrame.frame.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border:none;opacity:0;transition:opacity 0.25s ease;";
        scFrame.frame.src = getEmbedUrl(url, scramjet);
        scFrame.frame.onload = () => { scFrame.frame.style.opacity = "1"; };
        scramjetFrameRef.current = scFrame.frame;
        const wrapper = wrapperRef.current;
        if (wrapper) wrapper.appendChild(scFrame.frame);
        return true;
      } catch { return false; }
    };

    if (!tryCreate()) {
      const interval = setInterval(() => { if (tryCreate()) clearInterval(interval); }, 100);
      return () => clearInterval(interval);
    }
  }, [url]);

  useEffect(() => {
    const handler = () => { const inFs = !!document.fullscreenElement; setIsFullscreen(inFs); if (!inFs) setControlsVisible(true); };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const applyZoom = (z: number) => {
    const wrapper = wrapperRef.current;
    const container = containerRef.current;
    if (!wrapper || !container) return;
    const newZoom = Math.min(Math.max(z, 0.5), 2);
    setZoom(newZoom);
    wrapper.style.transform = `scale(${newZoom})`;
    wrapper.style.width = container.offsetWidth / newZoom + "px";
    wrapper.style.height = container.offsetHeight / newZoom + "px";
    container.style.overflow = newZoom === 1 ? "hidden" : "auto";
  };

  const handleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) { document.exitFullscreen(); }
    else { container.requestFullscreen().catch(() => {}); }
  };

  const openExternal = () => window.open(url, "_blank");

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="relative w-full h-full overflow-hidden">
        <div ref={wrapperRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", transformOrigin: "0 0", transition: "transform 0.2s ease" }} />

        <AnimatePresence>
          {controlsVisible && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.15 }}
              style={{ position: "absolute", bottom: 20, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 50, pointerEvents: "none" }}>
              <motion.div drag dragMomentum={false} dragElastic={0} whileDrag={{ scale: 1.02 }}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 14,
                  background: "rgba(6, 12, 26, 0.88)", border: "1px solid rgba(255,255,255,0.08)",
                  backdropFilter: "blur(20px)", boxShadow: "0 4px 32px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(255,255,255,0.04) inset",
                  userSelect: "none", pointerEvents: "auto", cursor: "grab" }}>
                <div style={{ display: "flex", alignItems: "center", paddingRight: 4, color: "rgba(255,255,255,0.18)" }}>
                  <GripHorizontal size={12} />
                </div>
                {onBack && (
                  <>
                    <button onClick={onBack}
                      style={{ padding: "3px 8px", borderRadius: 8, fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.4)",
                        background: "none", border: "none", cursor: "pointer", transition: "color 0.15s", whiteSpace: "nowrap" }}
                      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.85)"}
                      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)"}>
                      ← Apps
                    </button>
                    <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />
                  </>
                )}
                <ControlBtn onClick={() => applyZoom(zoom - 0.25)} title="Zoom out"><ZoomOut size={12} /></ControlBtn>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontVariantNumeric: "tabular-nums", minWidth: 28, textAlign: "center", flexShrink: 0 }}>
                  {Math.round(zoom * 100)}%
                </span>
                <ControlBtn onClick={() => applyZoom(zoom + 0.25)} title="Zoom in"><ZoomIn size={12} /></ControlBtn>
                <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />
                <ControlBtn onClick={openExternal} title="Open in new tab"><ExternalLink size={12} /></ControlBtn>
                <ControlBtn onClick={handleFullscreen} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
                  {isFullscreen ? <Minimize size={12} /> : <Maximize size={12} />}
                </ControlBtn>
                <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />
                <ControlBtn onClick={() => setControlsVisible(false)} title="Hide controls"><EyeOff size={12} /></ControlBtn>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {!controlsVisible && (
            <motion.button initial={{ opacity: 0 }} animate={{ opacity: 0.35 }} exit={{ opacity: 0 }} whileHover={{ opacity: 1 }}
              onClick={() => setControlsVisible(true)}
              style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center",
                gap: 6, padding: "5px 14px", borderRadius: 10, background: "rgba(6, 12, 26, 0.75)", border: "1px solid rgba(255,255,255,0.07)",
                backdropFilter: "blur(12px)", color: "rgba(255,255,255,0.75)", fontSize: 11, cursor: "pointer", zIndex: 50,
                transition: "opacity 0.2s", whiteSpace: "nowrap" }}>
              <Eye size={11} /> Show Controls
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
