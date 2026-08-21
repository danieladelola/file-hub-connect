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

  for (const s of stakes ?? []) {
    try {
      const amount = Number(s.amount);
      const reward = fullTermReward(s);

      // 1. Close the stake first (guarded), so a later failure can never
      //    credit a balance twice on a retry.
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

      // 2. Return principal + reward.
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
      } else {
        const { data: wallet } = await admin
          .from("wallet_balances")
          .select("id,available,staked")
          .eq("user_id", s.user_id)
          .eq("coin", s.coin)
          .maybeSingle();

        // Only release principal that was actually locked.
        const lockedNow = Number(wallet?.staked ?? 0);
        const principalBack = Math.min(amount, lockedNow);

        if (wallet) {
          await admin
            .from("wallet_balances")
            .update({
              available: Number(wallet.available) + principalBack + reward,
              staked: Math.max(0, lockedNow - principalBack),
              updated_at: nowIso,
            })
            .eq("id", wallet.id);
        } else {
          await admin.from("wallet_balances").insert({
            user_id: s.user_id,
            coin: s.coin,
            available: reward,
            staked: 0,
          });
        }
      }

      // 3. Best-effort audit trail (never blocks settlement).
      await admin.from("notifications").insert({
        user_id: s.user_id,
        title: "Stake completed",
        body: `Your ${s.is_usd ? "USD" : s.coin} stake of ${amount} has matured. Principal and ${reward.toFixed(
          8
        )} ${s.is_usd ? "USD" : s.coin} reward are back in your wallet.`,
      });

      result.settled++;
    } catch (e: any) {
      result.skipped++;
      result.errors.push(`${s.id}: ${e?.message ?? String(e)}`);
    }
  }


  return result;
}
