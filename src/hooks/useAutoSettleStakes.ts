import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

/**
 * Fires a best-effort settlement pass for the signed-in user's matured stakes.
 * Expired stakes are closed server-side (principal + reward credited) so they
 * stop counting toward staked value.
 */
export function useAutoSettleStakes() {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const res = await fetch("/api/settle-stakes", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({}),
        });
        if (!res.ok) return;
        const json = await res.json().catch(() => null);
        if (cancelled || !json?.settled) return;
        qc.invalidateQueries({ queryKey: ["my-stakes"] });
        qc.invalidateQueries({ queryKey: ["my-active-stakes-usd"] });
        qc.invalidateQueries({ queryKey: ["my-stakes-summary"] });
        qc.invalidateQueries({ queryKey: ["balances"] });
        qc.invalidateQueries({ queryKey: ["fiat-balance"] });
      } catch {
        /* silent */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);
}
