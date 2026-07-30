import { useEffect, useRef, useState } from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize,
  Minimize,
  ExternalLink,
  Eye,
  EyeOff,
  GripHorizontal,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useInterstitialUnlock, InterstitialOverlay } from "./InterstitialAdGate";
import { openNativeWindow } from "@/lib/openTabBridge";
import { pxCreateFrame, pxEncode, pxReady } from "@/lib/px";
import { ensureProxyEngine } from "@/lib/browserInit";

interface GameViewerPageProps {
  url: string;
  title?: string;
  onBack?: () => void;
}

function ControlBtn({
  onClick,
  children,
  title,
}: {
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 26,
        height: 26,
        borderRadius: 7,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: hovered ? "rgba(255,255,255,0.09)" : "none",
        border: "none",
        color: hovered ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)",
        cursor: "pointer",
        transition: "all 0.15s",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

function needsScramjetProxy(raw: string): boolean {
  try {
    const u = new URL(raw, window.location.origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (u.origin === window.location.origin) return false;
    return true;
  } catch {
    return false;
  }
}

export default function GameViewerPage({
  url,
  title,
  onBack,
}: GameViewerPageProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const frameHostRef = useRef<HTMLIFrameElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const { unlocked, phase } = useInterstitialUnlock("game");
  const useProxy = needsScramjetProxy(url);

  useEffect(() => {
    const handler = () => {
      const inFs = !!document.fullscreenElement;
      setIsFullscreen(inFs);
      if (!inFs) setControlsVisible(true);
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  useEffect(() => {
    if (url.includes("/storage/ag/originals/precision/index.html")) {
      openNativeWindow("/storage/ag/originals/Resent-Client-main/index.html");
    }
  }, [url]);

  useEffect(() => {
    if (!unlocked || !useProxy) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    ensureProxyEngine().catch(() => {});

    const tryCreate = () => {
      if (!pxReady()) return false;
      try {
        if (frameHostRef.current?.parentNode) return true;
        const scFrame = pxCreateFrame();
        if (!scFrame) return false;
        scFrame.frame.style.cssText =
          "position:absolute;inset:0;width:100%;height:100%;border:none;opacity:0;transition:opacity 0.25s ease;";
        scFrame.frame.src = pxEncode(url);
        scFrame.frame.onload = () => {
          scFrame.frame.style.opacity = "1";
        };
        frameHostRef.current = scFrame.frame;
        wrapper.appendChild(scFrame.frame);
        return true;
      } catch {
        return false;
      }
    };

    if (!tryCreate()) {
      const interval = setInterval(() => {
        if (tryCreate()) clearInterval(interval);
      }, 100);
      return () => {
        clearInterval(interval);
        if (frameHostRef.current?.parentNode) {
          frameHostRef.current.parentNode.removeChild(frameHostRef.current);
        }
        frameHostRef.current = null;
      };
    }

    return () => {
      if (frameHostRef.current?.parentNode) {
        frameHostRef.current.parentNode.removeChild(frameHostRef.current);
      }
      frameHostRef.current = null;
    };
  }, [url, unlocked, useProxy]);

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
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen().catch(() => {});
    }
  };

  const openExternal = () => {
    if (url.includes("/storage/ag/originals/precision/index.html")) {
      openNativeWindow("/storage/ag/originals/Resent-Client-main/index.html");
    } else {
      openNativeWindow(url);
    }
  };

  return (
    <div className="absolute inset-0">
      <div
        ref={containerRef}
        className="relative w-full h-full overflow-hidden"
      >
        <div
          ref={wrapperRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            transformOrigin: "0 0",
            transition: "transform 0.2s ease",
          }}
        >
          {!useProxy && (
            <iframe
              ref={iframeRef}
              src={unlocked ? url : "about:blank"}
              sandbox="allow-scripts allow-pointer-lock allow-forms allow-same-origin allow-downloads allow-popups allow-popups-to-escape-sandbox"
              style={{
                width: "100%",
                height: "100%",
                border: "none",
                display: "block",
              }}
              title={title || "Game"}
            />
          )}
        </div>

        <InterstitialOverlay phase={phase} />

        <AnimatePresence>
          {controlsVisible && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.15 }}
              style={{
                position: "absolute",
                bottom: 20,
                left: 0,
                right: 0,
                display: "flex",
                justifyContent: "center",
                zIndex: 50,
                pointerEvents: "none",
              }}
              className="game-viewer-controls"
            >
              <motion.div
                drag
                dragMomentum={false}
                dragElastic={0}
                whileDrag={{ scale: 1.02 }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "6px 10px",
                  borderRadius: 14,
                  background: "rgba(6, 12, 26, 0.88)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  backdropFilter: "blur(20px)",
                  boxShadow:
                    "0 4px 32px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(255,255,255,0.04) inset",
                  pointerEvents: "auto",
                  cursor: "grab",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "0 4px",
                    color: "rgba(255,255,255,0.2)",
                    cursor: "grab",
                  }}
                >
                  <GripHorizontal size={12} />
                </div>
                <div
                  style={{
                    width: 1,
                    height: 14,
                    background: "rgba(255,255,255,0.08)",
                    margin: "0 2px",
                  }}
                />
                {onBack && (
                  <ControlBtn onClick={onBack} title="Back to games">
                    <span style={{ fontSize: 10, fontWeight: 600 }}>Games</span>
                  </ControlBtn>
                )}
                <ControlBtn onClick={() => applyZoom(zoom - 0.1)} title="Zoom out">
                  <ZoomOut size={13} />
                </ControlBtn>
                <span
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.35)",
                    minWidth: 32,
                    textAlign: "center",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {Math.round(zoom * 100)}%
                </span>
                <ControlBtn onClick={() => applyZoom(zoom + 0.1)} title="Zoom in">
                  <ZoomIn size={13} />
                </ControlBtn>
                <div
                  style={{
                    width: 1,
                    height: 14,
                    background: "rgba(255,255,255,0.08)",
                    margin: "0 2px",
                  }}
                />
                <ControlBtn onClick={handleFullscreen} title="Fullscreen">
                  {isFullscreen ? <Minimize size={13} /> : <Maximize size={13} />}
                </ControlBtn>
                <ControlBtn onClick={openExternal} title="Open in new tab">
                  <ExternalLink size={13} />
                </ControlBtn>
                {isFullscreen && (
                  <ControlBtn
                    onClick={() => setControlsVisible(false)}
                    title="Hide controls"
                  >
                    <EyeOff size={13} />
                  </ControlBtn>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isFullscreen && !controlsVisible && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setControlsVisible(true)}
              style={{
                position: "absolute",
                bottom: 16,
                right: 16,
                zIndex: 50,
                width: 32,
                height: 32,
                borderRadius: 10,
                background: "rgba(6,12,26,0.7)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
              title="Show controls"
            >
              <Eye size={14} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
