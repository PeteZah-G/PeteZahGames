import { useState, useEffect, useCallback } from "react";
import { reconcileSettings } from "@/lib/settingsSync";

export interface AuthUser {
  id: string;
  email: string;
  username?: string;
  bio?: string;
  avatar_url?: string;
  is_admin?: number;
  is_owner?: boolean;
  isAdmin?: boolean;
  must_setup_2fa?: boolean;
  totp_enabled?: boolean;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [requires2fa, setRequires2fa] = useState(false);
  const [mustSetup2fa, setMustSetup2fa] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/me", { credentials: "include" });
      const data = await r.json().catch(() => ({}));
      if (r.status === 401 && data.code === "REQUIRES_2FA") {
        setUser(null);
        setRequires2fa(true);
        setMustSetup2fa(false);
        return;
      }
      if (r.status === 401) {
        setUser(null);
        setRequires2fa(false);
        setMustSetup2fa(false);
        return;
      }
      const u = data.user || null;
      setUser(u);
      setRequires2fa(false);
      setMustSetup2fa(!!u?.must_setup_2fa);
      if (u && !u.must_setup_2fa) await reconcileSettings();
    } catch {
      setUser(null);
      setRequires2fa(false);
      setMustSetup2fa(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onAuth = () => { refresh(); };
    window.addEventListener("petezah-auth-changed", onAuth);
    return () => window.removeEventListener("petezah-auth-changed", onAuth);
  }, [refresh]);

  return { user, setUser, loading, refresh, requires2fa, mustSetup2fa };
}

export function notifyAuthChanged() {
  window.dispatchEvent(new CustomEvent("petezah-auth-changed"));
}
