import { useState, useEffect, useCallback } from 'react';
import type { Card, Rating } from '../types';
import * as db from '../db';
import { reviewCard, createNewCard } from '../srs';

const FALLBACK_NEW_CARDS_PER_DAY = 30;

export function useCards(deckId: string) {
  const [cards, setCards] = useState<Card[]>([]);
  const [dueCards, setDueCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const all = await db.getCardsByDeck(deckId);
    setCards(all.sort((a, b) => a.createdAt - b.createdAt));

    const due = await db.getDueCards(deckId);
    const allCards = await db.getCardsByDeck(deckId);

    // Enforce daily new-card limit: per-deck override → global default → hardcoded fallback
    const globalDefault = await db.getSetting<number>('defaultNewCardsPerDay', FALLBACK_NEW_CARDS_PER_DAY);
    const limit = await db.getSetting<number>(`newCardsPerDay:${deckId}`, globalDefault);

    // "Review" = cards with real progress (interval > 0), these always show regardless of cap
    // Everything else (unseen + "Again" cards with no progress) is subject to the daily limit
    const isReview = (c: Card) => c.interval > 0;

    // "Complete" = reviewed today AND scheduled for tomorrow or later
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();
    const DAY = 24 * 60 * 60 * 1000;
    const completedToday = allCards.filter((c) => {
      if (!c.lastReviewed || c.lastReviewed < todayMs) return false;
      return c.dueDate > now && (c.dueDate - now) >= DAY * 0.5;
    }).length;

    // The daily limit is reduced by cards completed today
    const remaining = Math.max(0, limit - completedToday);

    const reviewCards = due.filter((c) => isReview(c));
    const newCards = due.filter((c) => !isReview(c));

    // Show all review cards, but reduce new cards so total doesn't exceed the limit
    const newSlots = Math.max(0, remaining - reviewCards.length);
    const cappedNew = newCards.slice(0, newSlots);
    setDueCards([...reviewCards, ...cappedNew]);

    setLoading(false);
  }, [deckId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addNewCard = useCallback(async (front: string, back: string) => {
    const card = createNewCard(deckId, front, back);
    await db.addCard(card);
    await refresh();
    return card;
  }, [deckId, refresh]);

  const editCard = useCallback(async (id: string, front: string, back: string) => {
    const card = await db.getCard(id);
    if (card) {
      await db.updateCard({ ...card, front, back });
      await refresh();
    }
  }, [refresh]);

  const removeCard = useCallback(async (id: string) => {
    await db.deleteCard(id);
    await refresh();
  }, [refresh]);

  const resetCard = useCallback(async (id: string) => {
    const card = await db.getCard(id);
    if (card) {
      await db.updateCard({
        ...card,
        interval: 0,
        repetitions: 0,
        easeFactor: 2.5,
        dueDate: card.createdAt,
      });
      await db.clearNewCardLog(id);
      await refresh();
    }
  }, [refresh]);

  const resetAllCards = useCallback(async () => {
    const all = await db.getCardsByDeck(deckId);
    for (const card of all) {
      await db.updateCard({
        ...card,
        interval: 0,
        repetitions: 0,
        easeFactor: 2.5,
        dueDate: card.createdAt,
      });
    }
    await db.clearDeckNewCardLog(deckId);
    await refresh();
  }, [deckId, refresh]);

  const rateCard = useCallback(async (card: Card, rating: Rating, customDueDays?: number) => {
    const updated = reviewCard(card, rating);
    if (customDueDays !== undefined) {
      updated.dueDate = Date.now() + customDueDays * 24 * 60 * 60 * 1000;
      updated.interval = customDueDays;
    }
    await db.updateCard(updated);

    // No newCardLog needed — we count completions directly

    // Record review and check if streak goal is met
    await db.recordReviewAndCheckStreak();

    return updated;
  }, [deckId]);

  return { cards, dueCards, loading, addNewCard, editCard, removeCard, resetCard, resetAllCards, rateCard, refresh };
}
