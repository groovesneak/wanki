import type { Card, Rating, EaseMode } from './types';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

const EASE_FACTORS: Record<EaseMode, number> = {
  shallow: 1.3,
  medium: 1.5,
  steep: 2.0,
};

// Ramp sequences before ease factor kicks in
const RAMPS: Record<EaseMode, number[]> = {
  shallow: [1, 2, 3, 4], // 1→2→3→4 then ×1.3
  medium:  [1, 2, 4],    // 1→2→4 then ×1.5
  steep:   [1, 2, 4],    // 1→2→4 then ×2.0
};

export function reviewCard(card: Card, rating: Rating, easeMode: EaseMode = 'medium'): Card {
  const easeFactor = EASE_FACTORS[easeMode];
  const ramp = RAMPS[easeMode];
  let { interval, repetitions } = card;

  if (rating === 'again' || rating === 'hard') {
    // Failed or struggled: reset
    repetitions = 0;
    interval = 0;
  } else {
    // Good or Easy: advance
    repetitions += 1;
    if (repetitions <= ramp.length) {
      interval = ramp[repetitions - 1];
    } else {
      interval = Math.round(interval * easeFactor);
    }
  }

  // Apply rating-specific due dates
  let dueDate: number;
  switch (rating) {
    case 'again':
      dueDate = Date.now() + 1 * MINUTE;
      break;
    case 'hard':
      dueDate = interval === 0
        ? Date.now() + 10 * MINUTE
        : Date.now() + Math.max(interval * 1.2, 1) * DAY * 0.5;
      break;
    case 'good':
      dueDate = Date.now() + interval * DAY;
      break;
    case 'easy':
      interval = Math.max(Math.round(interval * 1.3), 4);
      dueDate = Date.now() + interval * DAY;
      break;
  }

  return {
    ...card,
    interval,
    repetitions,
    easeFactor: card.easeFactor, // preserve original (no longer mutated)
    dueDate,
    lastReviewed: Date.now(),
  };
}

export function getNextReviewLabel(card: Card): string {
  if (card.completed) return 'Mastered';
  if (card.repetitions === 0 && card.interval === 0 && card.dueDate <= card.createdAt) return 'Not started';
  const diff = card.dueDate - Date.now();
  if (diff <= 0) return 'Now';
  if (diff < 60 * MINUTE) return `${Math.ceil(diff / MINUTE)}m`;
  if (diff < DAY) return 'Today';
  const days = Math.round(diff / DAY);
  if (days === 1) return '1d';
  if (days < 7) return `${days}d`;
  const weeks = Math.round(days / 7);
  if (days < 30) return `${weeks}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Math.round(days / 365)}y`;
}

/** Preview what the next interval would be for each rating */
export function previewIntervals(card: Card, easeMode: EaseMode = 'medium'): Record<Rating, string> {
  const ratings: Rating[] = ['again', 'hard', 'good', 'easy'];
  const result = {} as Record<Rating, string>;
  for (const r of ratings) {
    const preview = reviewCard(card, r, easeMode);
    const diff = preview.dueDate - Date.now();
    result[r] = formatDuration(diff);
  }
  return result;
}

/** Check if a card's Good interval is >= 100 days (eligible for completion) */
export function isEligibleForCompletion(card: Card, easeMode: EaseMode = 'medium'): boolean {
  const preview = reviewCard(card, 'good', easeMode);
  const diff = preview.dueDate - Date.now();
  return diff >= 100 * DAY;
}

function formatDuration(ms: number): string {
  if (ms < MINUTE) return '<1 min';
  if (ms < 60 * MINUTE) return `${Math.round(ms / MINUTE)} min`;
  const days = Math.max(1, Math.round(ms / DAY));
  if (days === 1) return '1 day';
  if (days < 7) return `${days} days`;
  const weeks = Math.round(days / 7);
  if (weeks === 1) return '1 week';
  if (days < 30) return `${weeks} weeks`;
  const months = Math.round(days / 30);
  if (months === 1) return '1 mo';
  if (months < 12) return `${months} mo`;
  const years = Math.round(days / 365);
  return years === 1 ? '1 yr' : `${years} yr`;
}

export function createNewCard(deckId: string, front: string, back: string): Card {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    deckId,
    front,
    back,
    interval: 0,
    repetitions: 0,
    easeFactor: 2.5,
    dueDate: now,
    createdAt: now,
  };
}
