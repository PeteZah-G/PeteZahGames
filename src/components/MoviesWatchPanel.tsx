import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, Loader2, Star } from "lucide-react";

type Kind = "movie" | "tv";

type Offer = {
  id: number;
  name: string;
  logo: string | null;
  url: string;
  group: "subscription" | "free" | "rent" | "buy";
};

const S = {
  text: "hsla(210, 20%, 96%, 0.95)",
  textSub: "hsla(210, 14%, 70%, 0.78)",
  textMuted: "hsla(210, 12%, 55%, 0.55)",
  border: "hsla(210, 30%, 80%, 0.12)",
  surface: "hsla(220, 28%, 12%, 0.38)",
  accent: "hsla(205, 70%, 62%, 0.95)",
  accentDim: "hsla(210, 40%, 55%, 0.16)",
  gold: "hsl(42 90% 55%)",
};

const TMDB_BACKDROP = "https://image.tmdb.org/t/p/w1280";
const TMDB_LOGO = "https://image.tmdb.org/t/p/w92";
const REGION_KEY = "pz-watch-region";
const REGIONS = ["US", "GB", "CA", "AU", "DE", "FR", "BR", "JP", "IN", "MX"];

function readRegion() {
  try {
    const v = (localStorage.getItem(REGION_KEY) || "US").toUpperCase();
    return REGIONS.includes(v) ? v : "US";
  } catch {
    return "US";
  }
}

export default function MoviesWatchPanel({
  type,
  tmdbId,
  title,
  overview,
  poster,
  backdrop,
  rating,
  onBack,
  onOpenService,
}: {
  type: Kind;
  tmdbId: number;
  title: string;
  overview?: string;
  poster?: string;
  backdrop?: string;
  rating?: number;
  onBack: () => void;
  onOpenService: (url: string, label: string) => void;
}) {
  const [region, setRegion] = useState(readRegion);
  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [justWatch, setJustWatch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let gone = false;
    setLoading(true);
    setError("");
    fetch(`/api/tmdb/${type}/${tmdbId}/watch?region=${encodeURIComponent(region)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Could not load services");
        return d;
      })
      .then((d) => {
        if (gone) return;
        setOffers(Array.isArray(d.offers) ? d.offers : []);
        setJustWatch(typeof d.link === "string" ? d.link : "");
      })
      .catch((e) => {
        if (!gone) setError(e.message || "Could not load services");
      })
      .finally(() => {
        if (!gone) setLoading(false);
      });
    return () => {
      gone = true;
    };
  }, [type, tmdbId, region]);

  const groups = useMemo(() => {
    const order: Offer["group"][] = ["subscription", "free", "rent", "buy"];
    return order
      .map((g) => ({
        id: g,
        label:
          g === "subscription"
            ? "Included with a subscription"
            : g === "free"
              ? "Free with ads"
              : g === "rent"
                ? "Rent"
                : "Buy",
        items: offers.filter((o) => o.group === g),
      }))
      .filter((g) => g.items.length);
  }, [offers]);

  return (
    <div style={{ position: "absolute", inset: 0, overflowY: "auto", scrollbarWidth: "none" }}>
      <div style={{ position: "relative", minHeight: 220 }}>
        {backdrop ? (
          <img
            src={TMDB_BACKDROP + backdrop}
            alt=""
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : null}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to top, hsla(220,35%,4%,0.96) 0%, hsla(220,35%,4%,0.72) 55%, hsla(220,35%,4%,0.4) 100%)",
          }}
        />
        <div style={{ position: "relative", padding: "18px 22px 20px", maxWidth: 720 }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 16,
              padding: "6px 10px",
              borderRadius: 999,
              border: `1px solid ${S.border}`,
              background: S.surface,
              color: S.textSub,
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 650,
            }}
          >
            <ArrowLeft size={12} /> Back
          </button>
          <p style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: S.accent }}>
            Watch with a licensed service
          </p>
          <h1 style={{ margin: "0 0 8px", fontSize: "clamp(1.4rem, 3.4vw, 2.1rem)", fontWeight: 800, color: S.text, letterSpacing: "-0.03em" }}>
            {title}
          </h1>
          {typeof rating === "number" && rating > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <Star size={12} fill={S.gold} color={S.gold} />
              <span style={{ fontSize: 12, fontWeight: 700, color: S.gold }}>{rating.toFixed(1)}</span>
            </div>
          ) : null}
          {overview ? (
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: S.textSub, maxWidth: 560 }}>
              {overview}
            </p>
          ) : null}
        </div>
      </div>

      <div style={{ padding: "8px 22px 40px", maxWidth: 720 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <p style={{ margin: 0, fontSize: 12, color: S.textMuted }}>Availability in</p>
          <select
            value={region}
            onChange={(e) => {
              const v = e.target.value;
              setRegion(v);
              try {
                localStorage.setItem(REGION_KEY, v);
              } catch {}
            }}
            style={{
              background: S.surface,
              border: `1px solid ${S.border}`,
              color: S.text,
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 12,
            }}
          >
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <p style={{ margin: "0 0 16px", fontSize: 12, lineHeight: 1.5, color: S.textSub }}>
          PeteZah does not host movies or TV files. Choose a service you subscribe to. We open that
          official site in this browser so you can sign in and watch under their terms.
        </p>

        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: S.textMuted, fontSize: 12, padding: "20px 0" }}>
            <Loader2 size={14} className="animate-spin" /> Looking up licensed services…
          </div>
        ) : error ? (
          <p style={{ color: "hsl(0 60% 62%)", fontSize: 12 }}>{error}</p>
        ) : !groups.length ? (
          <p style={{ color: S.textMuted, fontSize: 12, lineHeight: 1.5 }}>
            No listed services for this title in {region}. Try another region, or open the
            availability directory.
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.id} style={{ marginBottom: 18 }}>
              <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: S.textMuted }}>
                {g.label}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {g.items.map((o) => (
                  <button
                    key={`${g.id}-${o.id}`}
                    type="button"
                    onClick={() => onOpenService(o.url, o.name)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 12px 8px 8px",
                      borderRadius: 12,
                      border: `1px solid ${S.border}`,
                      background: S.surface,
                      color: S.text,
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 650,
                    }}
                  >
                    {o.logo ? (
                      <img src={TMDB_LOGO + o.logo} alt="" width={28} height={28} style={{ borderRadius: 6, objectFit: "cover" }} />
                    ) : null}
                    {o.name}
                    <ExternalLink size={11} style={{ color: S.textMuted }} />
                  </button>
                ))}
              </div>
            </div>
          ))
        )}

        {justWatch ? (
          <button
            type="button"
            onClick={() => onOpenService(justWatch, "Where to Watch")}
            style={{
              marginTop: 8,
              background: "none",
              border: "none",
              color: S.accent,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 650,
            }}
          >
            More availability details
          </button>
        ) : null}
      </div>
    </div>
  );
}
