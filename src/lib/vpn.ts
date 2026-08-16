import { PX, getMuxRoot, openMuxConnection, setMuxTransport } from "@/lib/px";
import { ensureProxyEngine } from "@/lib/browserInit";
import { originWsHost } from "@/lib/siteOrigin";

export type VpnRegionDef = {
  id: string;
  label: string;
  sublabel: string;
  wisp: string;
  config: string;
  requiresAuth?: boolean;
};

export const VPN_REGION_DEFS: VpnRegionDef[] = [
  {
    id: "default",
    label: "Default",
    sublabel: "International",
    wisp: "/wisp/",
    config: "config.js",
  },
  {
    id: "1",
    label: "Quebec",
    sublabel: "Canada",
    wisp: "/api/alt-wisp-5/",
    config: "/static/alt-config-5.js",
  },
  {
    id: "3",
    label: "Phoenix",
    sublabel: "USA",
    wisp: "/api/alt-wisp-2/",
    config: "/static/alt-config-2.js",
  },
  {
    id: "4",
    label: "Virginia",
    sublabel: "USA",
    wisp: "/api/alt-wisp-3/",
    config: "/static/alt-config-3.js",
  },
  {
    id: "5",
    label: "Durham",
    sublabel: "UK",
    wisp: "/api/alt-wisp-1/",
    config: "/static/alt-config-1.js",
  },
  {
    id: "tor",
    label: "Tor",
    sublabel: "Onion relay",
    wisp: "/api/wisp-tor/",
    config: "/static/tor-config.js",
    requiresAuth: true,
  },
];

export function getVpnRegions(): VpnRegionDef[] {
  const list = [...VPN_REGION_DEFS];
  try {
    const custom = (localStorage.getItem("proxServer") || "").trim();
    if (/^wss?:\/\//i.test(custom) && custom.endsWith("/")) {
      list.unshift({
        id: "custom",
        label: "Custom",
        sublabel: "Your Wisp",
        wisp: custom,
        config: "config.js",
      });
    }
  } catch {}
  return list;
}

export async function applyVpnRegion(regionId: string) {
  if (regionId === "custom") {
    const custom = (localStorage.getItem("proxServer") || "").trim();
    if (!/^wss?:\/\//i.test(custom) || !custom.endsWith("/")) return;
  }
  const region =
    regionId === "custom"
      ? {
          id: "custom",
          label: "Custom",
          sublabel: "Your Wisp",
          wisp: (localStorage.getItem("proxServer") || "").trim(),
          config: "config.js",
        }
      : VPN_REGION_DEFS.find((r) => r.id === regionId);
  if (!region) return;

  try {
    localStorage.setItem("selectedVpnRegion", regionId);

    const old = document.getElementById("config-script");
    if (old) old.remove();
    await new Promise<void>((resolve) => {
      const s = document.createElement("script");
      s.id = "config-script";
      s.src = region.config.startsWith("/") || region.config.startsWith("http") ? region.config : `./${region.config}`;
      s.onload = () => resolve();
      s.onerror = () => resolve();
      document.body.appendChild(s);
    });

    const cfg = (window as any)._CONFIG;
    const wispUrl =
      regionId === "custom"
        ? region.wisp
        : cfg?.wispurl ?? originWsHost() + region.wisp;
    if (regionId === "custom") {
      try {
        localStorage.setItem("proxServer", region.wisp);
        if ((window as any)._CONFIG) (window as any)._CONFIG.wispurl = region.wisp;
      } catch {}
    }

    if (getMuxRoot()) {
      const conn = openMuxConnection(PX.muxWorker);
      await setMuxTransport(conn, PX.epoxyMod, wispUrl).catch(() => {});
    } else {
      await ensureProxyEngine().catch(() => {});
      if (getMuxRoot()) {
        const conn = openMuxConnection(PX.muxWorker);
        await setMuxTransport(conn, PX.epoxyMod, wispUrl).catch(() => {});
      }
    }

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "selectedVpnRegion",
        newValue: regionId,
      })
    );
  } catch (e) {
    console.error("[vpn] region switch failed", e);
  }
}

export async function isSignedIn(): Promise<boolean> {
  try {
    const r = await fetch("/api/me", { credentials: "include" });
    return r.ok;
  } catch {
    return false;
  }
}
