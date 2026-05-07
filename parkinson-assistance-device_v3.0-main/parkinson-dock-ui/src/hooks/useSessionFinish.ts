'use client';

import { useCallback, useState } from 'react';
import { rehabSessionService, type Difficulty, type FingerMode, type GameType, type RehabSession } from '@/services/rehabSessionService';
import { rewardsService } from '@/services/rewardsService';
import { dailyQuestsService } from '@/services/dailyQuestsService';
import { achievementsService } from '@/services/achievementsService';
import { medalsService } from '@/services/medalsService';
import { cardService } from '@/services/cardService';
import type { SessionCompleteSummary } from '@/components/rewards/SessionCompleteModal';

export interface FinishSessionInput {
  gameType: GameType;
  difficulty: Difficulty;
  fingerMode: FingerMode;
  durationMs: number;
  reps: number;
  score: number;
  accuracy: number;
  bestStreak: number;
  extra?: Record<string, number | string | boolean>;
  /** Minimum durationMs needed to count as a real session (default 5000ms). */
  minDurationMs?: number;
  /** Minimum reps needed alongside duration to count as a real session (default 1). */
  minReps?: number;
}

/**
 * Wires the standard end-of-session flow used by every mini-game:
 *   1) Save the RehabSession.
 *   2) Apply it to today's quests.
 *   3) Award rewards (points, streak, freeze tokens, level).
 *   4) Surface a SessionCompleteSummary the calling page can pass to
 *      <SessionCompleteModal />.
 *
 * Returns `null` from `finish` when the session was too short to count.
 */
export function useSessionFinish() {
  const [summary, setSummary] = useState<SessionCompleteSummary | null>(null);
  const [open, setOpen] = useState(false);

  const finish = useCallback((input: FinishSessionInput): SessionCompleteSummary | null => {
    const minDur = input.minDurationMs ?? 5000;
    const minReps = input.minReps ?? 1;
    if (input.durationMs < minDur || input.reps < minReps) {
      return null;
    }

    // 1) Compute & apply rewards (must run BEFORE saving session so daily-points
    //    state and capping are computed correctly; the session record then stores
    //    the canonical pointsEarned).
    const reward = rewardsService.ingestSession({
      gameType: input.gameType,
      difficulty: input.difficulty,
      fingerMode: input.fingerMode,
      durationMs: input.durationMs,
      reps: input.reps,
      score: input.score,
      accuracy: input.accuracy,
      bestStreak: input.bestStreak,
      extra: input.extra,
    });

    // 2) Persist session record.
    const session: RehabSession = rehabSessionService.saveSession({
      gameType: input.gameType,
      difficulty: input.difficulty,
      fingerMode: input.fingerMode,
      durationMs: input.durationMs,
      reps: input.reps,
      score: input.score,
      accuracy: input.accuracy,
      bestStreak: input.bestStreak,
      pointsEarned: reward.pointsEarned,
      extra: input.extra,
    });

    // 3) Apply quest progress.
    const quest = dailyQuestsService.applySession(session);

    // 4) Evaluate achievements (records unlocks + bonus points).
    const ach = achievementsService.evaluateAll();

    // 5) Evaluate medals for the current week + month.
    const medals = medalsService.evaluateCurrent();

    // 6) Evaluate card drops for this session.
    const cards = cardService.evaluateForSession(session);

    // 7) Bonus card per achievement unlocked, deterministically.
    let extraCardsAwarded = cards.awarded.slice();
    let extraCardsDup = cards.duplicates.slice();
    for (const a of ach.newlyUnlocked) {
      const drop = cardService.awardOneFromSeed(`ach:${a.id}`);
      extraCardsAwarded = extraCardsAwarded.concat(drop.awarded);
      extraCardsDup = extraCardsDup.concat(drop.duplicates);
    }

    const result: SessionCompleteSummary = {
      reward,
      questsCompleted: quest.newlyCompleted,
      questBonusPoints: quest.bonusPoints,
      reps: input.reps,
      durationMs: input.durationMs,
      accuracy: input.accuracy,
      achievementsUnlocked: ach.newlyUnlocked,
      medalsAwarded: medals,
      cardsAwarded: extraCardsAwarded,
      cardDuplicates: extraCardsDup,
    };

    // Apply quest bonus to total points retroactively.
    if (quest.bonusPoints > 0) {
      // We add the bonus directly via a synthetic ingestion-free path: just bump totalPoints.
      // This avoids double-counting the daily cap for quest bonuses (quests are extra).
      addBonusPoints(quest.bonusPoints);
    }

    setSummary(result);
    setOpen(true);
    return result;
  }, []);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const reset = useCallback(() => {
    setOpen(false);
    setSummary(null);
  }, []);

  return { summary, open, finish, close, reset };
}

/** Add a bonus to lifetime totals without going through the daily-cap path. */
function addBonusPoints(bonus: number): void {
  if (typeof window === 'undefined' || bonus <= 0) return;
  try {
    const KEY = 'steadigrip_rewards_state';
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const state = JSON.parse(raw);
    state.totalPoints = (state.totalPoints || 0) + bonus;
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error('useSessionFinish: bonus apply failed', e);
  }
}
