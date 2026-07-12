export const MASTERED_LEVEL = 5;

const REVIEW_INTERVAL_DAYS = [0, 1, 3, 7, 15, 30, 60, 120];
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReviewCardState {
  level: number;
  correct: number;
  incorrect: number;
  isStarred: boolean;
}

export interface ReviewResult extends ReviewCardState {
  lastReview: string;
  nextReview: string;
}

function startOfUtcDay(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function isCardDue(nextReview?: string | null, now = new Date()) {
  if (!nextReview) return true;
  return new Date(nextReview).getTime() <= now.getTime();
}

export function reviewCard(card: ReviewCardState, quality: number, now = new Date()): ReviewResult {
  const currentDayStart = startOfUtcDay(now);

  if (quality === 0) {
    return {
      ...card,
      level: Math.max(0, card.level - 1),
      correct: card.correct,
      incorrect: card.incorrect + 1,
      lastReview: now.toISOString(),
      nextReview: new Date(currentDayStart + DAY_MS).toISOString(),
    };
  }

  const newLevel = card.level + 1;
  const intervalIndex = Math.min(newLevel, REVIEW_INTERVAL_DAYS.length - 1);

  return {
    ...card,
    level: newLevel,
    correct: card.correct + 1,
    incorrect: card.incorrect,
    lastReview: now.toISOString(),
    nextReview: new Date(currentDayStart + REVIEW_INTERVAL_DAYS[intervalIndex] * DAY_MS).toISOString(),
  };
}
