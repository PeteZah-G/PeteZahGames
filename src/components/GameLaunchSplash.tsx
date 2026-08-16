import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";

type Cover = { label: string; imageUrl: string };

let coverCache: Cover[] | null = null;
let coverPromise: Promise<Cover[]> | null = null;

function generateGameId(game: { label: string; url?: string }) {
  return `${game.label || ""}-${game.url || ""}`.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
}

function safeImg(url: string) {
  if (!url || typeof url !== "string") return "";
  const u = url.trim();
  if ((u.startsWith("/storage/") || u.startsWith("/!!/") || u.startsWith("/!cover!/")) && !u.includes("..")) return u;
  if (/^https:\/\//i.test(u)) return u;
  return "";
}

async function loadTopCovers(): Promise<Cover[]> {
  if (coverCache) return coverCache;
  if (coverPromise) return coverPromise;
  coverPromise = (async () => {
    try {
      const [colRes, playsRes] = await Promise.all([
        fetch("/storage/data/collection.json"),
        fetch("/api/games/plays").catch(() => null),
      ]);
      const data = await colRes.json();
      const games: any[] = Array.isArray(data?.games) ? data.games : [];
      let plays: Record<string, number> = {};
      if (playsRes && playsRes.ok) {
        try {
          const p = await playsRes.json();
          plays = p?.plays && typeof p.plays === "object" ? p.plays : p || {};
        } catch {}
      }
      const scored = games
        .map((g) => {
          const imageUrl = safeImg(g.imageUrl || "");
          const label = String(g.label || "").trim();
          if (!imageUrl || !label) return null;
          const id = generateGameId({ label, url: g.url || "" });
          return { label, imageUrl, score: Number(plays[id] || 0) };
        })
        .filter(Boolean) as { label: string; imageUrl: string; score: number }[];
      scored.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
      const pool = scored.length
        ? scored
        : games
            .map((g) => ({
              label: String(g.label || ""),
              imageUrl: safeImg(g.imageUrl || ""),
              score: 0,
            }))
            .filter((g) => g.imageUrl && g.label);
      coverCache = pool.slice(0, 9).map(({ label, imageUrl }) => ({ label, imageUrl }));
      return coverCache;
    } catch {
      coverCache = [];
      return [];
    } finally {
      coverPromise = null;
    }
  })();
  return coverPromise;
}

export function GameLaunchSplash({
  title,
  onDone,
}: {
  title?: string;
  onDone: () => void;
}) {
  const [covers, setCovers] = useState<Cover[]>(coverCache || []);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadTopCovers().then((c) => {
      if (!cancelled) setCovers(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const finish = useCallback(() => {
    setExiting((prev) => {
      if (prev) return prev;
      window.setTimeout(onDone, 420);
      return true;
    });
  }, [onDone]);

  useEffect(() => {
    const t = window.setTimeout(() => finish(), 2400);
    return () => window.clearTimeout(t);
  }, [finish]);

  const rows: Cover[][] = [[], [], []];
  for (let i = 0; i < 9; i++) {
    rows[Math.floor(i / 3)].push(covers[i] || { label: "", imageUrl: "" });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: exiting ? 0 : 1, scale: exiting ? 1.04 : 1 }}
      transition={{ duration: exiting ? 0.4 : 0.35 }}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 90,
        display: "flex",
        overflow: "hidden",
        background: "transparent",
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 30% 50%, hsla(220,40%,12%,0.55), hsla(220,35%,4%,0.28) 55%, transparent 75%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          width: "min(340px, 42vw)",
          minWidth: 200,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "28px 22px",
          background: "hsla(220, 28%, 10%, 0.42)",
          borderRight: "1px solid hsla(210, 30%, 80%, 0.1)",
          backdropFilter: "blur(18px)",
          transform: exiting ? "translateX(-110%)" : "none",
          transition: "transform 0.45s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <img
          src="/logo.png"
          alt=""
          style={{ width: 44, height: 44, objectFit: "contain", opacity: 0.95 }}
        />

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              border: "2px solid hsla(210,30%,80%,0.18)",
              borderTopColor: "hsla(0,0%,96%,0.85)",
              animation: "pz-spin 0.85s linear infinite",
            }}
          />
          <div style={{ textAlign: "center" }}>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 650,
                letterSpacing: "-0.02em",
                color: "hsla(0,0%,96%,0.92)",
              }}
            >
              {title?.trim() || "Game"}
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 11, color: "hsla(210,14%,70%,0.72)" }}>
              Warming up PeteZah
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={finish}
            style={{
              border: "1px solid hsla(210,30%,80%,0.16)",
              background: "hsla(220,28%,14%,0.55)",
              color: "hsla(0,0%,96%,0.88)",
              borderRadius: 999,
              padding: "8px 14px",
              fontSize: 11,
              fontWeight: 650,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Enter game
          </button>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            transform: exiting ? "translateY(18%) rotate(-8deg)" : "rotate(-8deg)",
            opacity: exiting ? 0 : 1,
            transition: "transform 0.5s ease, opacity 0.45s ease",
            width: "120%",
            maxWidth: 920,
            padding: 20,
          }}
        >
          {rows.map((row, ri) => (
            <div
              key={ri}
              style={{
                display: "flex",
                gap: 14,
                justifyContent: "center",
                animation: exiting ? undefined : `pz-row-in 0.55s ease ${ri * 0.08}s both`,
              }}
            >
              {row.map((c, ci) => (
                <div
                  key={`${c.label}-${ci}`}
                  title={c.label}
                  style={{
                    flex: "1 1 0",
                    maxWidth: 180,
                    minWidth: 96,
                    aspectRatio: "3 / 4",
                    borderRadius: 14,
                    overflow: "hidden",
                    border: "1px solid hsla(210,30%,80%,0.12)",
                    background: "hsla(220,28%,12%,0.5)",
                    boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
                  }}
                >
                  {c.imageUrl ? (
                    <img
                      src={c.imageUrl}
                      alt=""
                      loading="lazy"
                      style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.92 }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes pz-spin { to { transform: rotate(360deg); } }
        @keyframes pz-row-in {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </motion.div>
  );
}
