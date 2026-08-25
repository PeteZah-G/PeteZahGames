import { PX, getMuxRoot, openMuxConnection, setMuxTransport } from "@/lib/px";
import { armPx } from "@/lib/browserInit";
import { originWsHost } from "@/lib/siteOrigin";

export type VpnRegionDef = {
  id: string;
  label: string;
  sublabel: string;
  relay: string;
  config: string;
  requiresAuth?: boolean;
};

export const VPN_REGION_DEFS: VpnRegionDef[] = [
  {
    id: "default",
    label: "Default",
    sublabel: "International",
    relay: "/api/websocket/",
    config: "config.js",
  },
  {
    id: "1",
    label: "Quebec",
    sublabel: "Canada",
    relay: "/api/websocket-5/",
    config: "/static/alt-config-5.js",
  },
  {
    id: "3",
    label: "Phoenix",
    sublabel: "USA",
    relay: "/api/websocket-2/",
    config: "/static/alt-config-2.js",
  },
  {
    id: "4",
    label: "Virginia",
    sublabel: "USA",
    relay: "/api/websocket-3/",
    config: "/static/alt-config-3.js",
  },
  {
    id: "5",
    label: "Durham",
    sublabel: "UK",
    relay: "/api/websocket-1/",
    config: "/static/alt-config-1.js",
  },
  {
    id: "tor",
    label: "Tor",
    sublabel: "Onion relay",
    relay: "/api/websocket-tor/",
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
        sublabel: "Your relay",
        relay: custom,
        config: "config.js",
      });
    }
  } catch {}
  return list;
}

export function activeRelayUrl(): string {
  try {
    const id = localStorage.getItem("selectedVpnRegion") || "default";
    if (id === "custom") {
      const custom = (localStorage.getItem("proxServer") || "").trim();
      if (/^wss?:\/\//i.test(custom) && custom.endsWith("/")) {
        const u = new URL(custom);
        if (u.protocol === "wss:" || u.protocol === "ws:") return custom;
      }
    }
    const region = VPN_REGION_DEFS.find((r) => r.id === id);
    if (region?.relay?.startsWith("/")) return originWsHost() + region.relay;
  } catch {}
  return originWsHost() + "/api/websocket/";
}

export async function applyVpnRegion(regionId: string) {
  if (regionId === "custom") {
    const custom = (localStorage.getItem("proxServer") || "").trim();
    if (!/^wss?:\/\//i.test(custom) || !custom.endsWith("/")) return;
    try {
      const u = new URL(custom);
      if (u.protocol !== "wss:" && u.protocol !== "ws:") return;
    } catch {
      return;
    }
  }
  const region =
    regionId === "custom"
      ? {
          id: "custom",
          label: "Custom",
          sublabel: "Your relay",
          relay: (localStorage.getItem("proxServer") || "").trim(),
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
    const streamUrl =
      regionId === "custom" ? region.relay : originWsHost() + region.relay;
    if (cfg) cfg.streamurl = streamUrl;
    if (regionId === "custom") {
      try {
        localStorage.setItem("proxServer", region.relay);
      } catch {}
    }

    if (getMuxRoot()) {
      const conn = openMuxConnection(PX.muxWorker);
      await setMuxTransport(conn, PX.tunMod, streamUrl).catch(() => {});
    } else {
      await armPx().catch(() => {});
      if (getMuxRoot()) {
        const conn = openMuxConnection(PX.muxWorker);
        await setMuxTransport(conn, PX.tunMod, streamUrl).catch(() => {});
      }
    }

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "selectedVpnRegion",
        newValue: regionId,
      })
    );
  } catch {}
}

export async function isSignedIn(): Promise<boolean> {
  try {
    const r = await fetch("/api/me", { credentials: "include" });
    return r.ok;
  } catch {
    return false;
  }
}
