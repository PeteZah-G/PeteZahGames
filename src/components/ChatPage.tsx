import { useEffect, useRef } from "react";
import { pxCreateFrame, pxEncode, pxReady } from "@/lib/px";
import { armPx } from "@/lib/browserInit";

export default function ChatPage({ onNavigate }: { onNavigate: (url: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    armPx().catch(() => {});

    const tryCreate = () => {
      if (!pxReady() || cancelled) return false;
      try {
        const scFrame = pxCreateFrame();
        if (!scFrame) return false;
        scFrame.frame.src = pxEncode("https://vtx.coinknowledge.net/embed/petezah");
        scFrame.frame.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border:none;";
        container.appendChild(scFrame.frame);
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
        cancelled = true;
        clearInterval(interval);
      };
    }
  }, []);

  return <div ref={containerRef} className="absolute inset-0 w-full h-full" />;
}
