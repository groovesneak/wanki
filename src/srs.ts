import type { Card, Rating } from './types';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

const RATING_QUALITY: Record<Rating, number> = {
  again: 0,
  hard: 2,
  good: 4,
  easy: 5,
};

export function reviewCard(card: Card, rating: Rating): Card {
  const quality = RATING_QUALITY[rating];
  let { interval, repetitions, easeFactor } = card;

  // Update ease factor using SM-2 formula
  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  if (quality < 3) {
    // Failed: reset
    repetitions = 0;
    interval = 0;
  } else {
    repetitions += 1;
    if (repetitions === 1) {
      interval = 1;
    } else if (repetitions === 2) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
  }

  // Apply rating-specific modifiers
  let dueDate: number;
  switch (rating) {
    case 'again':
      dueDate = Date.now() + 1 * MINUTE; // Show again in 1 minute
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
      easeFactor += 0.15;
      break;
  }

  return {
    ...card,
    interval,
    repetitions,
    easeFactor,
    dueDate,
    lastReviewed: Date.now(),
  };
}

export function getNextReviewLabel(card: Card): string {
  if (card.repetitions === 0 && card.interval === 0 && card.dueDate <= card.createdAt) return 'Not started';
  const diff = card.dueDate - Date.now();
  if (diff <= 0) return 'Now';
  if (diff < 60 * MINUTE) return `${Math.ceil(diff / MINUTE)}m`;
  // Skip hours — show as "today" or jump to days
  if (diff < DAY) return 'Today';
  const days = Math.round(diff / DAY);
  if (days === 1) return '1d';
  if (days < 7) return `${days}d`;
  const weeks = Math.round(days / 7);
  if (days < 30) return `${weeks}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Math.round(days / 365)}y`;
}

/** Preview what the next interval would be for each rating (without mutating) */
export function previewIntervals(card: Card): Record<Rating, string> {
  const ratings: Rating[] = ['again', 'hard', 'good', 'easy'];
  const result = {} as Record<Rating, string>;
  for (const r of ratings) {
    const preview = reviewCard(card, r);
    const diff = preview.dueDate - Date.now();
    result[r] = formatDuration(diff);
  }
  return result;
}

function formatDuration(ms: number): string {
  if (ms < MINUTE) return '<1 min';
  if (ms < 60 * MINUTE) return `${Math.round(ms / MINUTE)} min`;
  // Skip hours — jump straight to days
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
