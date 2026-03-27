import { useState, useEffect, useRef } from 'react';
import type { Card } from '../types';
import * as db from '../db';

const FALLBACK_NEW_CARDS_PER_DAY = 30;
const DAY = 24 * 60 * 60 * 1000;

interface Props {
  deckId: string;
  onDoneChange?: (done: boolean) => void;
}

function isReviewCard(c: Card): boolean {
  return c.interval > 0;
}

export function DeckStats({ deckId, onDoneChange }: Props) {
  const [total, setTotal] = useState(0);
  const [studyCount, setStudyCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const onDoneRef = useRef(onDoneChange);
  onDoneRef.current = onDoneChange;

  useEffect(() => {
    (async () => {
      const cards = await db.getCardsByDeck(deckId);
      const dueCards = await db.getDueCards(deckId);

      const now = Date.now();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayMs = todayStart.getTime();

      // "Complete" today = reviewed today AND scheduled for tomorrow or later
      const completedToday = cards.filter((c) => {
        if (!c.lastReviewed || c.lastReviewed < todayMs) return false;
        if (c.dueDate <= now) return false;
        return (c.dueDate - now) >= DAY * 0.5;
      });

      // Daily new card limit, reduced by completions today
      const globalDefault = await db.getSetting<number>('defaultNewCardsPerDay', FALLBACK_NEW_CARDS_PER_DAY);
      const limit = await db.getSetting<number>(`newCardsPerDay:${deckId}`, globalDefault);
      const remaining = Math.max(0, limit - completedToday.length);

      const reviewCards = dueCards.filter((c) => isReviewCard(c));
      const newCards = dueCards.filter((c) => !isReviewCard(c));

      // Cap new cards so total doesn't exceed limit
      const newSlots = Math.max(0, remaining - reviewCards.length);
      const cappedNew = Math.min(newCards.length, newSlots);

      const due = reviewCards.length + cappedNew;
      setTotal(cards.length);
      setStudyCount(due);
      setCompletedCount(completedToday.length);
      const isDone = cards.length > 0 && due === 0;
      onDoneRef.current?.(isDone);
    })();
  }, [deckId]);

  return (
    <p className="text-sm text-text-muted mt-1">
      {total} card{total !== 1 ? 's' : ''}
      {studyCount > 0 && (
        <span className="text-primary ml-2 font-medium">
          {studyCount} due
        </span>
      )}
      {completedCount > 0 && studyCount > 0 && (
        <span className="text-success ml-2 font-medium">
          {completedCount} complete
        </span>
      )}
      {studyCount === 0 && completedCount === 0 && total > 0 && (
        <span className="text-success ml-2 font-medium">
          All caught up!
        </span>
      )}
    </p>
  );
}
