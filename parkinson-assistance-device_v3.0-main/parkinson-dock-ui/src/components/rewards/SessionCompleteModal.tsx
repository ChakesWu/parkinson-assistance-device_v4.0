'use client';

import { Award, Flame, Medal, Sparkles, Star, Target, Trophy, X, Zap } from 'lucide-react';
import Link from 'next/link';
import type { QuestDefinition } from '@/services/dailyQuestsService';
import type { SessionRewardResult } from '@/services/rewardsService';
import type { AchievementDefinition } from '@/services/achievementsService';
import { medalsService, type MedalAward } from '@/services/medalsService';
import type { PlantCardDefinition } from '@/services/cardService';

export interface SessionCompleteSummary {
  reward: SessionRewardResult;
  questsCompleted: QuestDefinition[];
  questBonusPoints: number;
  reps: number;
  durationMs: number;
  accuracy: number;
  achievementsUnlocked: AchievementDefinition[];
  medalsAwarded: MedalAward[];
  cardsAwarded: PlantCardDefinition[];
  cardDuplicates: PlantCardDefinition[];
}

interface Props {
  open: boolean;
  summary: SessionCompleteSummary | null;
  onClose: () => void;
  onPlayAgain?: () => void;
}

export default function SessionCompleteModal({ open, summary, onClose, onPlayAgain }: Props) {
  if (!open || !summary) return null;
  const {
    reward,
    questsCompleted,
    questBonusPoints,
    reps,
    durationMs,
    accuracy,
    achievementsUnlocked,
    medalsAwarded,
    cardsAwarded,
    cardDuplicates,
  } = summary;
  const totalPoints = reward.pointsEarned + questBonusPoints;
  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.floor((durationMs % 60000) / 1000);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white shadow-2xl ring-1 ring-white/10">
        <button
          onClick={onClose}
          aria-label="Close summary"
          className="absolute right-3 top-3 z-10 rounded-full p-2 text-slate-300 hover:bg-white/10 hover:text-white"
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div className="bg-[#004E80]/30 px-6 pb-4 pt-6 text-center">
          <div className="mx-auto mb-3 inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#004E80] shadow-lg">
            <Sparkles size={32} className="text-white" />
          </div>
          <h2 className="text-2xl font-bold">Great work!</h2>
          <p className="mt-1 text-sm text-slate-300">Your session has been saved.</p>
        </div>

        {/* Big points pill */}
        <div className="px-6 pt-5">
          <div className="rounded-2xl bg-gradient-to-r from-amber-400/20 to-amber-300/10 p-4 text-center ring-1 ring-amber-400/30">
            <div className="text-xs uppercase tracking-wider text-amber-300">Points earned</div>
            <div className="mt-1 flex items-center justify-center gap-2">
              <Star size={28} className="text-amber-300" />
              <span className="text-4xl font-extrabold text-amber-200">+{totalPoints}</span>
            </div>
            {questBonusPoints > 0 && (
              <div className="mt-1 text-xs text-amber-300/80">
                Includes <span className="font-semibold">+{questBonusPoints}</span> from quests
              </div>
            )}
            {reward.pointsCappedAt !== null && (
              <div className="mt-1 text-xs text-amber-300/70">Daily cap of {reward.pointsCappedAt} reached</div>
            )}
          </div>
        </div>

        {/* Streak + level */}
        <div className="grid grid-cols-2 gap-3 px-6 pt-3">
          <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
            <div className="flex items-center gap-2 text-orange-300">
              <Flame size={16} />
              <span className="text-xs">Streak</span>
            </div>
            <div className="mt-1 text-2xl font-bold">
              {reward.newStreak} {reward.newStreak === 1 ? 'day' : 'days'}
            </div>
            {reward.streakIncreased && reward.newStreak > 1 && (
              <div className="text-[11px] text-orange-300/80">+1 today!</div>
            )}
            {reward.newLongestStreak && (
              <div className="text-[11px] text-orange-300/80">New personal best</div>
            )}
          </div>
          <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
            <div className="flex items-center gap-2 text-purple-300">
              <Trophy size={16} />
              <span className="text-xs">Level</span>
            </div>
            <div className="mt-1 text-2xl font-bold">Lv {reward.newLevel}</div>
            {reward.leveledUp && <div className="text-[11px] text-purple-300/90">Levelled up!</div>}
          </div>
        </div>

        {/* Session stats */}
        <div className="px-6 pt-3">
          <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat icon={<Zap size={14} />} label="Reps" value={String(reps)} />
              <Stat
                icon={<Target size={14} />}
                label="Accuracy"
                value={`${accuracy}%`}
              />
              <Stat
                icon={<Sparkles size={14} />}
                label="Time"
                value={`${minutes}:${String(seconds).padStart(2, '0')}`}
              />
            </div>
          </div>
        </div>

        {/* Quests completed */}
        {questsCompleted.length > 0 && (
          <div className="px-6 pt-4">
            <div className="mb-2 flex items-center gap-2 text-sm text-emerald-300">
              <Award size={16} />
              <span className="font-semibold">
                Quest{questsCompleted.length > 1 ? 's' : ''} completed
              </span>
            </div>
            <ul className="space-y-1.5">
              {questsCompleted.map((q) => (
                <li
                  key={q.id}
                  className="flex items-center justify-between rounded-xl bg-emerald-500/10 px-3 py-2 text-sm ring-1 ring-emerald-400/30"
                >
                  <span>{q.title}</span>
                  <span className="font-semibold text-emerald-300">+{q.pointsReward}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Achievements unlocked */}
        {achievementsUnlocked.length > 0 && (
          <div className="px-6 pt-4">
            <div className="mb-2 flex items-center gap-2 text-sm text-amber-300">
              <Trophy size={16} />
              <span className="font-semibold">
                Achievement{achievementsUnlocked.length > 1 ? 's' : ''} unlocked
              </span>
            </div>
            <ul className="space-y-1.5">
              {achievementsUnlocked.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-3 rounded-xl bg-amber-500/10 px-3 py-2 text-sm ring-1 ring-amber-400/30"
                >
                  <span className="text-2xl">{a.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-amber-100">{a.title}</div>
                    <div className="truncate text-xs text-amber-200/80">{a.description}</div>
                  </div>
                  <span className="font-semibold text-amber-300">+{a.pointsReward}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Medals awarded */}
        {medalsAwarded.length > 0 && (
          <div className="px-6 pt-4">
            <div className="mb-2 flex items-center gap-2 text-sm text-rose-300">
              <Medal size={16} />
              <span className="font-semibold">
                Medal{medalsAwarded.length > 1 ? 's' : ''} earned
              </span>
            </div>
            <ul className="space-y-1.5">
              {medalsAwarded.map((m) => {
                const def = medalsService.getDefinitions().find((d) => d.id === m.id);
                return (
                  <li
                    key={`${m.periodKey}::${m.id}`}
                    className="flex items-center gap-3 rounded-xl bg-rose-500/10 px-3 py-2 text-sm ring-1 ring-rose-400/30"
                  >
                    <span className="text-2xl">{def?.icon ?? '🏅'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-rose-100">{def?.title ?? m.id}</div>
                      <div className="truncate text-xs text-rose-200/80">
                        {m.period === 'week' ? 'This week' : 'This month'}
                      </div>
                    </div>
                    <span className="font-semibold text-rose-200">+{m.pointsReward}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Plant cards awarded */}
        {(cardsAwarded.length > 0 || cardDuplicates.length > 0) && (
          <div className="px-6 pt-4">
            <div className="mb-2 flex items-center gap-2 text-sm text-emerald-300">
              <Sparkles size={16} />
              <span className="font-semibold">
                Plant card{cardsAwarded.length + cardDuplicates.length > 1 ? 's' : ''} found
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {cardsAwarded.map((c) => (
                <div
                  key={`new-${c.id}`}
                  className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-1.5 text-sm ring-1 ring-emerald-400/30"
                  title={c.description}
                >
                  <span className="text-xl">{c.emoji}</span>
                  <span className="font-semibold text-emerald-100">{c.name}</span>
                  <span className="text-[10px] uppercase tracking-wider text-emerald-300">new</span>
                </div>
              ))}
              {cardDuplicates.map((c, i) => (
                <div
                  key={`dup-${c.id}-${i}`}
                  className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-1.5 text-sm ring-1 ring-white/10"
                  title={c.description}
                >
                  <span className="text-xl">{c.emoji}</span>
                  <span className="text-slate-200">{c.name}</span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400">dup</span>
                </div>
              ))}
            </div>
            <Link
              href="/garden"
              className="mt-3 inline-flex items-center text-xs font-medium text-emerald-300 hover:underline"
            >
              Plant in your garden →
            </Link>
          </div>
        )}

        {/* Freeze tokens */}
        {reward.freezeTokensEarned > 0 && (
          <div className="px-6 pt-3">
            <div className="rounded-xl bg-cyan-500/10 px-3 py-2 text-center text-xs text-cyan-200 ring-1 ring-cyan-400/30">
              Earned {reward.freezeTokensEarned} streak freeze
              {reward.freezeTokensEarned > 1 ? 's' : ''} for a perfect week!
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3 p-6">
          {onPlayAgain ? (
            <button
              onClick={onPlayAgain}
              className="rounded-xl bg-[#004E80] px-4 py-3 font-semibold text-white transition hover:bg-[#003a61]"
            >
              Play again
            </button>
          ) : (
            <button
              onClick={onClose}
              className="rounded-xl bg-[#004E80] px-4 py-3 font-semibold text-white transition hover:bg-[#003a61]"
            >
              Done
            </button>
          )}
          <Link
            href="/"
            className="flex items-center justify-center rounded-xl bg-slate-700 px-4 py-3 font-semibold text-white transition hover:bg-slate-600"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center justify-center gap-1 text-slate-300">
        {icon}
        <span className="text-[11px]">{label}</span>
      </div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}
