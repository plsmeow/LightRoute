/**
 * Gamification event emitter — called from chat pipeline.
 *
 * @module lib/gamification/events
 */

import { logger } from "../../../open-sse/utils/logger.ts";
import { calculateLevel, XP_REWARDS } from "./xp";

const log = logger("GAMIFICATION");

/** Leaderboard scopes every XP award credits. token_share also credits tokens_shared. */
const REWARD_SCOPES = ["global", "weekly", "monthly"] as const;
const TOKEN_SHARE_SCOPES = [...REWARD_SCOPES, "tokens_shared"] as const;

function scopesForAction(action: string): readonly string[] {
  return action === "token_share" ? TOKEN_SHARE_SCOPES : REWARD_SCOPES;
}

/**
 * Emit a gamification event. All gamification updates happen here.
 * Called from chatCore.ts after successful requests.
 *
 * This function is fire-and-forget — never blocks the request pipeline.
 * All errors are caught and logged, never thrown.
 */
export async function emitGamificationEvent(params: {
  apiKeyId: string;
  action:
    | "request"
    | "provider_switch"
    | "model_switch"
    | "combo_create"
    | "combo_use"
    | "token_share"
    | "invite_redeem"
    | "daily_login"
    | "radar_supporter";
  metadata?: Record<string, unknown>;
}): Promise<void> {
  // Gamification disabled in LightRoute
  return;
}

/**
 * Recompute the level from total XP and persist it when it changed.
 * Runs after every award so bonus XP (streaks, badges) also counts toward level-ups.
 */
async function syncLevel(apiKeyId: string): Promise<void> {
  const { getXp, updateLevel } = await import("../db/gamification");
  const xp = getXp(apiKeyId);
  if (!xp) return;
  const newLevel = calculateLevel(xp.totalXp);
  if (newLevel !== xp.currentLevel) {
    updateLevel(apiKeyId, newLevel);
    log.info("events.level_up", { apiKeyId, oldLevel: xp.currentLevel, newLevel });
  }
}

/**
 * Award a bonus reward (`streak_bonus`, `badge_unlock`) through the same path as action XP:
 * `xp_audit_log` + `user_levels` via addXp, level sync, and the global/weekly/monthly
 * leaderboard scopes. Idempotency is the caller's responsibility.
 */
async function awardBonusXp(
  apiKeyId: string,
  action: "streak_bonus" | "badge_unlock",
  amount: number,
  metadata: Record<string, unknown>
): Promise<void> {
  const { awardXp } = await import("../db/gamification");
  awardXp(apiKeyId, action, amount, JSON.stringify(metadata), REWARD_SCOPES);
  await syncLevel(apiKeyId);
  log.info("events.bonus_awarded", { apiKeyId, action, amount, ...metadata });
}

/**
 * Pay `streak_bonus × streak` once per UTC day. The `xp_audit_log` same-day check and the
 * insert run synchronously with no await in between, so two requests racing at the day
 * boundary cannot both pay.
 */
async function awardStreakBonus(apiKeyId: string, streak: number): Promise<void> {
  const { hasXpActionToday } = await import("../db/gamification");
  if (hasXpActionToday(apiKeyId, "streak_bonus")) return;
  await awardBonusXp(apiKeyId, "streak_bonus", XP_REWARDS.streak_bonus * streak, { streak });
}

/**
 * Get XP amount for an action.
 */
function getXpForAction(action: string): number {
  const rewards: Record<string, number> = {
    request: 1,
    provider_switch: 5,
    model_switch: 3,
    combo_create: 10,
    combo_use: 2,
    token_share: 1,
    invite_redeem: 50,
    daily_login: 5,
  };
  return rewards[action] || 0;
}

/**
 * Check and unlock a specific badge, paying the documented `badge_unlock` XP once per badge.
 *
 * @param rewardable - `false` for recognition-only unlocks (Radar supporter): the caller
 *   supplies a one-way identity, so the unlock neither earns XP nor logs the identity.
 */
async function checkAndUnlockBadge(
  apiKeyId: string,
  badgeId: string,
  rewardable = true
): Promise<void> {
  const { unlockBadge, hasBadge } = await import("../db/gamification");
  // #3472: dedup via user_badges directly. getBadges() INNER-JOINs badge_definitions, which is
  // empty until seeded, so it falsely reported "not earned" and re-emitted the unlock event on
  // every request.
  if (!hasBadge(apiKeyId, badgeId)) {
    // unlockBadge is INSERT OR IGNORE on the (api_key_id, badge_id) primary key; only the call
    // that actually inserts the row pays, so concurrent unlocks cannot double-pay.
    const inserted = unlockBadge(apiKeyId, badgeId);
    log.info("events.badge_unlocked", rewardable ? { apiKeyId, badgeId } : { badgeId });
    if (inserted && rewardable) {
      await awardBonusXp(apiKeyId, "badge_unlock", XP_REWARDS.badge_unlock, { badgeId });
    }

    // Look up badge details from badge_definitions
    const { getDbInstance } = await import("../db/core");
    const badgeRow = getDbInstance()
      .prepare("SELECT name, description, icon, rarity FROM badge_definitions WHERE id = ?")
      .get(badgeId) as
      { name: string; description: string | null; icon: string | null; rarity: string } | undefined;

    // Record notification for SSE toast
    const { recordBadgeUnlock } = await import("./notifications");
    recordBadgeUnlock(apiKeyId, {
      badgeId,
      badgeName: badgeRow?.name ?? badgeId,
      badgeDescription: badgeRow?.description ?? "",
      badgeIcon: badgeRow?.icon ?? "award",
      badgeRarity: badgeRow?.rarity ?? "common",
      unlockedAt: new Date().toISOString(),
    });
  }
}

/**
 * Check action count badges after an action.
 */
async function checkActionCountBadges(apiKeyId: string, action: string): Promise<void> {
  const { getDbInstance } = await import("../db/core");
  const db = getDbInstance();

  // Read the durable per-key/per-action counter (#12546), the same source
  // getActionCount() (badges.ts) reads. Counting xp_audit_log directly here
  // undercounted every "lifetime" milestone once the retention prune
  // (cleanupXpAuditLog, default 30 days) aged the rows out. The counter is
  // maintained in addXp() alongside the audit insert and survives the prune.
  const row = db
    .prepare(
      "SELECT COALESCE(count, 0) AS count FROM xp_action_counts WHERE api_key_id = ? AND action = ?"
    )
    .get(apiKeyId, action) as { count: number } | undefined;

  const count = row?.count ?? 0;

  // Badge thresholds
  const thresholds: Record<string, Array<{ id: string; threshold: number }>> = {
    request: [
      { id: "first-token", threshold: 1 },
      { id: "token-consumer", threshold: 1000 },
      { id: "token-machine", threshold: 10000 },
      { id: "token-whale", threshold: 100000 },
    ],
    token_share: [
      { id: "generous", threshold: 1000 },
      { id: "philanthropist", threshold: 10000 },
      { id: "token-santa", threshold: 100000 },
      { id: "community-hero", threshold: 1000000 },
    ],
  };

  const badges = thresholds[action];
  if (!badges) return;

  for (const badge of badges) {
    if (count >= badge.threshold) {
      await checkAndUnlockBadge(apiKeyId, badge.id);
    }
  }
}
