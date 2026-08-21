/**
 * Settlement of matured (expired) stakes.
 *
 * A stake is settled when `ends_at` has passed and it is still `active`:
 *  - full-term reward = amount * (apy/100) / 365 * lock days
 *  - the locked principal is released back to `available` (only the part that
 *    was actually locked in `wallet_balances.staked`, so nothing is minted for
 *    legacy rows that never locked anything)
 *  - reward is credited to `available`
 *  - the stake row becomes `completed`, so it stops counting as staked value
 *
 * Must be run with a service-role client (RLS bypass).
 */

export type SettleResult = {
  settled: number;
  skipped: number;
  errors: string[];
};

function daysBetween(a: string, b: string) {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

export function fullTermReward(s: {
  amount: number | string;
  apy: number | string;
  started_at: string;
  ends_at: string;
}) {
  const days = daysBetween(s.started_at, s.ends_at);
  return (Number(s.amount) * (Number(s.apy) / 100)) / 365 * days;
}

export async function settleExpiredStakes(
  admin: any,
  opts: { userId?: string } = {}
): Promise<SettleResult> {
  const nowIso = new Date().toISOString();
  const result: SettleResult = { settled: 0, skipped: 0, errors: [] };

  let q = admin
    .from("user_stakes")
    .select("id,user_id,coin,amount,apy,is_usd,started_at,ends_at,status")
    .eq("status", "active")
    .lt("ends_at", nowIso);
  if (opts.userId) q = q.eq("user_id", opts.userId);

  const { data: stakes, error } = await q;
  if (error) {
    result.errors.push(error.message);
    return result;
  }

  // Orphaned seed rows (user_id with no profile) can't be settled: the DB
  // triggers on user_stakes write an audit row that FK-references profiles.
  const userIds = [...new Set((stakes ?? []).map((s: any) => s.user_id))];
  const { data: profiles } = await admin.from("profiles").select("id").in("id", userIds);
  const realUsers = new Set((profiles ?? []).map((p: any) => p.id));

  for (const s of (stakes ?? []).filter((s: any) => realUsers.has(s.user_id))) {
    try {
      const amount = Number(s.amount);
      const reward = fullTermReward(s);
      const asset = s.is_usd ? "USD" : s.coin;

      let walletId: string | null = null;

      if (!s.is_usd) {
        // A DB trigger releases the locked principal (staked -> available)
        // when the stake flips to `completed`, so the principal must be
        // reserved in `staked` first — legacy rows never locked it.
        const { data: wallet } = await admin
          .from("wallet_balances")
          .select("id,available,staked")
          .eq("user_id", s.user_id)
          .eq("coin", s.coin)
          .maybeSingle();

        if (wallet) {
          walletId = wallet.id;
          if (Number(wallet.staked) < amount) {
            const { error: resErr } = await admin
              .from("wallet_balances")
              .update({ staked: amount, updated_at: nowIso })
              .eq("id", wallet.id);
            if (resErr) throw resErr;
          }
        } else {
          const { data: created, error: insErr } = await admin
            .from("wallet_balances")
            .insert({ user_id: s.user_id, coin: s.coin, available: 0, staked: amount })
            .select("id")
            .single();
          if (insErr) throw insErr;
          walletId = created.id;
        }
      }

      // Close the stake (guarded) — the trigger returns the principal.
      const { data: closed, error: upErr } = await admin
        .from("user_stakes")
        .update({ status: "completed", reward_earned: reward })
        .eq("id", s.id)
        .eq("status", "active")
        .select("id");
      if (upErr) throw upErr;
      if (!closed || closed.length === 0) {
        result.skipped++;
        continue;
      }

      // Credit the profit on top of the returned principal.
      if (s.is_usd) {
        const { data: fiat } = await admin
          .from("fiat_balances")
          .select("id,available")
          .eq("user_id", s.user_id)
          .eq("currency", "USD")
          .maybeSingle();
        const next = Number(fiat?.available ?? 0) + amount + reward;
        if (fiat) {
          await admin.from("fiat_balances").update({ available: next, updated_at: nowIso }).eq("id", fiat.id);
        } else {
          await admin.from("fiat_balances").insert({ user_id: s.user_id, currency: "USD", available: next });
        }
      } else if (walletId && reward > 0) {
        const { data: after } = await admin
          .from("wallet_balances")
          .select("available")
          .eq("id", walletId)
          .single();
        await admin
          .from("wallet_balances")
          .update({ available: Number(after?.available ?? 0) + reward, updated_at: nowIso })
          .eq("id", walletId);
      }

      // Best-effort notification (never blocks settlement).
      await admin.from("notifications").insert({
        user_id: s.user_id,
        title: "Stake completed",
        body: `Your ${asset} stake of ${amount} has matured. Principal and ${reward.toFixed(
          8
        )} ${asset} reward are back in your wallet.`,
      });

      result.settled++;

    } catch (e: any) {
      result.skipped++;
      result.errors.push(`${s.id}: ${e?.message ?? String(e)}`);
    }
  }


  return result;
}
