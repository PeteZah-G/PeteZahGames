import { useEffect, useMemo, useState } from "react";
import { isLiteDevice } from "@/lib/liteDevice";

const YT_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export const SPIRIT_TREE_VIDEO_ID = "DtE5Y5VGkjU";
export const LIGHTNING_VIDEO_ID = "yvE3J8tXTWM";

export function youtubeEmbedSrc(videoId: string): string {
  const id = YT_ID_RE.test(videoId) ? videoId : "";
  if (!id) return "";
  const q = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    controls: "0",
    disablekb: "1",
    fs: "0",
    iv_load_policy: "3",
    loop: "1",
    playlist: id,
    playsinline: "1",
    rel: "0",
    cc_load_policy: "0",
    modestbranding: "1",
    origin: typeof window !== "undefined" ? window.location.origin : "",
  });
  return `https://www.youtube-nocookie.com/embed/${id}?${q.toString()}`;
}

export function youtubeThumb(videoId: string): string {
  if (!YT_ID_RE.test(videoId)) return "";
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

type Props = {
  videoId: string;
  title: string;
  wash?: string;
  fallback?: string;
};

export default function YoutubeWallpaperBackdrop({ videoId, title, wash, fallback }: Props) {
  const lite = isLiteDevice();
  const [visible, setVisible] = useState(() => typeof document !== "undefined" && !document.hidden);
  const [ready, setReady] = useState(false);
  const src = useMemo(() => (visible && !lite ? youtubeEmbedSrc(videoId) : ""), [videoId, visible, lite]);
  const thumb = useMemo(() => youtubeThumb(videoId) || fallback || "", [videoId, fallback]);

  useEffect(() => {
    setReady(false);
  }, [videoId]);

  useEffect(() => {
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        overflow: "hidden",
        background: "#05070c",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: thumb ? `url(${thumb})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "brightness(0.78) saturate(1.05)",
          transform: "scale(1.04)",
        }}
      />
      {src ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            opacity: ready ? 1 : 0,
            transition: "opacity 0.45s ease",
          }}
        >
          <iframe
            key={videoId}
            title={title}
            src={src}
            allow="autoplay; encrypted-media; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            loading="lazy"
            tabIndex={-1}
            aria-hidden
            // @ts-expect-error inert is valid DOM
            inert=""
            sandbox="allow-scripts allow-same-origin allow-presentation"
            onLoad={() => setReady(true)}
            style={{
              position: "absolute",
              inset: "-96px 0",
              width: "100%",
              height: "calc(100% + 192px)",
              border: "none",
              display: "block",
              margin: 0,
              pointerEvents: "none",
              maxWidth: "none",
              maxHeight: "none",
            }}
          />
        </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            wash ||
            "radial-gradient(ellipse 90% 75% at 50% 42%, hsla(220, 38%, 4%, 0.2) 0%, hsla(220, 35%, 3%, 0.45) 55%, hsla(220, 30%, 2%, 0.62) 100%)",
        }}
      />
    </div>
  );
}
