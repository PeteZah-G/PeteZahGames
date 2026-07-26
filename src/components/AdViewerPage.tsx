import { useEffect, useState } from "react";
import { ExternalLink, Megaphone } from "lucide-react";

export default function AdViewerPage({
  url,
}: {
  url: string;
  onClose?: () => void;
}) {
  const [ready, setReady] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    setReady(false);
    setEntered(false);
    const enter = window.setTimeout(() => setEntered(true), 16);
    return () => window.clearTimeout(enter);
  }, [url]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "hsl(216 30% 6%)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(120% 80% at 50% 0%, hsla(213, 55%, 28%, 0.22), transparent 55%)",
          opacity: entered ? 1 : 0,
          transition: "opacity 0.5s ease",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 5,
          display: "flex",
          alignItems: "center",
          gap: 8,
          pointerEvents: "auto",
          opacity: entered ? 1 : 0,
          transform: entered ? "translateY(0)" : "translateY(-6px)",
          transition: "opacity 0.4s ease, transform 0.4s ease",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 10px",
            borderRadius: 999,
            background: "hsla(216, 28%, 9%, 0.92)",
            border: "1px solid hsla(210, 40%, 80%, 0.16)",
            color: "hsla(210, 30%, 88%, 0.88)",
            fontSize: 11,
            fontWeight: 650,
            backdropFilter: "blur(10px)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          }}
        >
          <Megaphone size={12} style={{ color: "hsl(213 75% 68%)" }} />
          Sponsored · this is an ad
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open externally"
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "hsla(216, 28%, 9%, 0.92)",
            border: "1px solid hsla(210, 40%, 80%, 0.16)",
            color: "hsla(210, 30%, 88%, 0.8)",
            textDecoration: "none",
          }}
        >
          <ExternalLink size={13} />
        </a>
      </div>

      <iframe
        title="Sponsored content"
        src={url}
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals allow-presentation"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        onLoad={() => setReady(true)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          border: "none",
          opacity: ready ? 1 : 0,
          transform: ready ? "scale(1)" : "scale(0.985)",
          transition: "opacity 0.55s cubic-bezier(0.22, 1, 0.36, 1), transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)",
          background: "#0a1018",
        }}
      />
    </div>
  );
}
