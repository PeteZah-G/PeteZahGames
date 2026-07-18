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
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/me", { credentials: "include" });
      if (r.status === 401) {
        setUser(null);
        return;
      }
      const data = await r.json();
      setUser(data.user || null);
      if (data.user) await reconcileSettings();
    } catch {
      setUser(null);
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

  return { user, setUser, loading, refresh };
}

export function notifyAuthChanged() {
  window.dispatchEvent(new CustomEvent("petezah-auth-changed"));
}
