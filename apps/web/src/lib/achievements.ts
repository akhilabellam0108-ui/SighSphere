/**
 * Achievements, computed from real local data every time — never stored, never granted for
 * anything the user did not actually do.
 */

import type { HistoryEntry } from './history.js';
import type { Progress } from './storage.js';

export interface AchievementInput {
  progress: Progress;
  masteredCount: number;
  history: HistoryEntry[];
  /** Recorded samples per gloss (from storage.sampleCounts). */
  sampleCounts: Record<string, number>;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: 'star' | 'target' | 'trophy' | 'flame' | 'award' | 'bookmark' | 'conversation' | 'hand' | 'zap';
  unlocked: boolean;
  /** 0..1 progress toward unlocking, for a progress bar. */
  progress: number;
  /** Short "3/5" style label. */
  progressLabel: string;
}

function step(value: number, goal: number) {
  return { progress: Math.min(1, value / goal), progressLabel: `${Math.min(value, goal)}/${goal}`, unlocked: value >= goal };
}

export function computeAchievements({ progress, masteredCount, history, sampleCounts }: AchievementInput): Achievement[] {
  const attempts = Object.values(progress.signs).reduce((sum, sign) => sum + sign.attempts, 0);
  const saved = history.filter((entry) => entry.saved).length;
  const conversations = history.filter((entry) => entry.kind === 'conversation').length;
  const taughtSigns = Object.values(sampleCounts).filter((count) => count >= 5).length;

  return [
    { id: 'first-practice', title: 'First steps', description: 'Practise any sign on camera.', icon: 'star', ...step(attempts, 1) },
    { id: 'first-mastered', title: 'Got it', description: 'Master your first sign (3 correct in a row).', icon: 'target', ...step(masteredCount, 1) },
    { id: 'five-mastered', title: 'Growing vocabulary', description: 'Master 5 signs.', icon: 'trophy', ...step(masteredCount, 5) },
    { id: 'streak-3', title: 'On a roll', description: 'Practise 3 days in a row.', icon: 'flame', ...step(progress.dayStreak, 3) },
    { id: 'streak-7', title: 'Week-long learner', description: 'Practise 7 days in a row.', icon: 'flame', ...step(progress.dayStreak, 7) },
    { id: 'xp-100', title: 'Century', description: 'Earn 100 XP.', icon: 'zap', ...step(progress.xp, 100) },
    { id: 'saved', title: 'Keeper', description: 'Save a translation.', icon: 'bookmark', ...step(saved, 1) },
    { id: 'conversation', title: 'Conversation starter', description: 'Save a live conversation.', icon: 'conversation', ...step(conversations, 1) },
    { id: 'teacher', title: 'Teacher', description: 'Teach SignSphere a sign (5 recordings of one sign).', icon: 'hand', ...step(taughtSigns, 1) },
  ];
}
