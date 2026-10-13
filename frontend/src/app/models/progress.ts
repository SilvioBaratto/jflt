import { SessionResult } from './exam';

/** A weak-area entry (low accuracy topic) surfaced on the dashboard. */
export interface WeakArea {
  skill: string;
  level: number;
  topic: string;
  seen: number;
  accuracy: number;
}

/** A completed session summary for the dashboard history. */
export interface RecentSession {
  id: string;
  mode: string;
  skill?: string | null;
  completedAt?: string | null;
  result?: SessionResult | null;
}

/** The learner dashboard aggregate. */
export interface Dashboard {
  weakAreas: WeakArea[];
  reviewDue: { itemType: string; count: number }[];
  recentSessions: RecentSession[];
  totalCompleted: number;
  bank: { reading: number; listening: number; writing: number; vocab: number };
}
