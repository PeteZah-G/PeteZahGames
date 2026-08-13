import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { requestAdGate, playVideoAd, stopVideoAd } from "@/lib/adcash";
import {
  AdBanner320,
  AdBanner728,
  AdNativeBar,
  playLoaderNetworkAds,
  scrubAdsterraLoadingArtifacts,
} from "@/components/ads/Adsterra";
import { GameLaunchSplash } from "@/components/GameLaunchSplash";

type Context = "game" | "app" | "vm";
export type InterstitialPhase = "checking" | "ad" | "loading" | "ready";

const LOADER_AD_MS = 3600;

export function useInterstitialUnlock(context: Context, enabled = true) {
  const [unlocked, setUnlocked] = useState(!enabled);
  const [phase, setPhase] = useState<InterstitialPhase>(enabled ? "checking" : "ready");
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
        const gate = await requestAdGate(context);
        if (cancelled) return;

        if (gate.show) {
          setPhase("ad");
          setShowBanner(true);
          await playVideoAd(context);
        } else {
          const reason = gate.reason;
          if (reason === "disabled" || reason === "network") {
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

      if (cancelled) return;

      if (context === "game") {
        setShowBanner(false);
        setPhase("loading");
        return;
      }

      setUnlocked(true);
      setPhase("ready");
      setShowBanner(false);
    })();

    return () => {
      cancelled = true;
      try {
        stopVideoAd();
      } catch {}
      try {
        scrubAdsterraLoadingArtifacts();
      } catch {}
    };
  }, [context, enabled]);

  const finishLoading = () => {
    setUnlocked(true);
    setPhase("ready");
    setShowBanner(false);
  };

  return { unlocked, phase, showBanner, finishLoading };
}

export function InterstitialOverlay({
  phase,
  showBanner = false,
  title,
  onLoadingDone,
}: {
  phase: InterstitialPhase;
  showBanner?: boolean;
  title?: string;
  onLoadingDone?: () => void;
}) {
  if (phase === "ready") return null;

  if (phase === "loading") {
    return (
      <GameLaunchSplash
        title={title}
        onDone={() => {
          onLoadingDone?.();
        }}
      />
    );
  }

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
        background: "hsla(220, 35%, 5%, 0.55)",
        backdropFilter: "blur(6px)",
        padding: 16,
        overflowY: "auto",
      }}
    >
      <Loader2 size={18} className="animate-spin" style={{ color: "hsla(0,0%,96%,0.85)" }} />
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
  title,
}: {
  context: Context;
  children: ReactNode;
  title?: string;
}) {
  const { unlocked, phase, showBanner, finishLoading } = useInterstitialUnlock(context);
  return (
    <div className="absolute inset-0">
      {unlocked ? children : null}
      <InterstitialOverlay
        phase={phase}
        showBanner={showBanner}
        title={title}
        onLoadingDone={finishLoading}
      />
    </div>
  );
}
