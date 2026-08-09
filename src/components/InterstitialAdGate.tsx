import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { requestAdGate, playApplixirAd } from "@/lib/applixir";
import {
  AdBanner320,
  AdBanner728,
  AdNativeBar,
  playLoaderNetworkAds,
  scrubAdsterraLoadingArtifacts,
} from "@/components/ads/Adsterra";

type Context = "game" | "app" | "vm";

const LOADER_AD_MS = 3600;

export function useInterstitialUnlock(context: Context, enabled = true) {
  const [unlocked, setUnlocked] = useState(!enabled);
  const [phase, setPhase] = useState<"checking" | "ad" | "ready">(
    enabled ? "checking" : "ready"
  );
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setUnlocked(true);
      setPhase("ready");
      setShowBanner(false);
      return;
    }

    let cancelled = false;
    setUnlocked(false);
    setPhase("checking");
    setShowBanner(false);

    (async () => {
      try {
        let userId: string | undefined;
        try {
          const me = await fetch("/api/me", { credentials: "include" });
          if (me.ok) {
            const d = await me.json();
            if (d?.user?.id) userId = String(d.user.id);
          }
        } catch {}

        const gate = await requestAdGate(context);
        if (cancelled) return;

        if (gate.show) {
          setPhase("ad");
          setShowBanner(true);
          await playApplixirAd(gate.apiKey, userId);
        } else {
          const reason = gate.reason;
          if (reason === "disabled" || reason === "network" || reason === "skip") {
            setPhase("ad");
            setShowBanner(true);
            await playLoaderNetworkAds(LOADER_AD_MS);
          }
        }
      } catch {
        if (!cancelled) {
          setPhase("ad");
          setShowBanner(true);
          try {
            await playLoaderNetworkAds(LOADER_AD_MS);
          } catch {}
        }
      }

      try {
        scrubAdsterraLoadingArtifacts();
      } catch {}

      if (!cancelled) {
        setUnlocked(true);
        setPhase("ready");
        setShowBanner(false);
      }
    })();

    return () => {
      cancelled = true;
      try {
        scrubAdsterraLoadingArtifacts();
      } catch {}
    };
  }, [context, enabled]);

  return { unlocked, phase, showBanner };
}

export function InterstitialOverlay({
  phase,
  showBanner = false,
}: {
  phase: "checking" | "ad" | "ready";
  showBanner?: boolean;
}) {
  if (phase === "ready") return null;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 80,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        background: "hsla(220, 35%, 5%, 0.94)",
        backdropFilter: "blur(8px)",
        padding: 16,
        overflowY: "auto",
      }}
    >
      <Loader2 size={18} className="animate-spin" style={{ color: "hsla(213,70%,62%,1)" }} />
      <p style={{ margin: 0, fontSize: 12, color: "hsla(0,0%,100%,0.72)" }}>
        {phase === "ad" ? "Loading — thanks for supporting PeteZah" : "Preparing…"}
      </p>
      {showBanner ? (
        <div
          style={{
            width: "100%",
            maxWidth: 760,
            marginTop: 4,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
          }}
        >
          <div style={{ width: "100%", maxWidth: 360 }}>
            <AdBanner320 />
          </div>
          <div className="hidden sm:block" style={{ width: "100%", maxWidth: 728 }}>
            <AdBanner728 />
          </div>
          <div style={{ width: "100%", maxWidth: 520 }}>
            <AdNativeBar />
          </div>
        </div>
      ) : null}
      <p style={{ margin: 0, fontSize: 10, color: "hsla(0,0%,100%,0.4)" }}>
        Starting in a moment
      </p>
    </div>
  );
}

export function InterstitialGate({
  context,
  children,
}: {
  context: Context;
  children: ReactNode;
}) {
  const { unlocked, phase, showBanner } = useInterstitialUnlock(context);
  return (
    <div className="absolute inset-0">
      {unlocked ? children : null}
      <InterstitialOverlay phase={phase} showBanner={showBanner} />
    </div>
  );
}
