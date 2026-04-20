import { useState, useEffect } from 'react';
import type { View, Deck } from './types';
import { Dashboard } from './components/Dashboard';
import { DeckView } from './components/DeckView';
import { ReviewSession } from './components/ReviewSession';
import { DifficultWords } from './components/DifficultWords';
import { LearnMode } from './components/LearnMode';
import * as db from './db';

function App() {
  const [view, setView] = useState<View>({ type: 'dashboard' });
  const [currentDeck, setCurrentDeck] = useState<Deck | null>(null);

  useEffect(() => {
    async function handleStatsRequest(event: MessageEvent) {
      if (event.data?.type !== 'WANKI_GET_STATS') return;
      try {
        const [decks, streak, reviewedToday, dailyGoal, defaultNewPerDay] = await Promise.all([
          db.getAllDecks(),
          db.getStreak(),
          db.getReviewedToday(),
          db.getSetting<number>('dailyGoal', 10),
          db.getSetting<number>('defaultNewCardsPerDay', 30),
        ]);

        const now = Date.now();
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayMs = todayStart.getTime();
        const DAY = 86_400_000;

        const deckStats = await Promise.all(decks.map(async (deck) => {
          const [cards, dueCards, limit] = await Promise.all([
            db.getCardsByDeck(deck.id),
            db.getDueCards(deck.id),
            db.getSetting<number>(`newCardsPerDay:${deck.id}`, defaultNewPerDay),
          ]);
          const completedToday = cards.filter(c =>
            c.lastReviewed != null && c.lastReviewed >= todayMs &&
            c.dueDate > now && (c.dueDate - now) >= DAY * 0.5
          ).length;
          const remaining = Math.max(0, limit - completedToday);
          const reviewCount = dueCards.filter(c => c.interval > 0).length;
          const newCount = dueCards.filter(c => c.interval === 0).length;
          const newSlots = Math.max(0, remaining - reviewCount);
          return {
            id: deck.id,
            name: deck.name,
            totalCards: cards.length,
            dueToday: reviewCount + Math.min(newCount, newSlots),
            completedToday,
          };
        }));

        const stats = {
          streak,
          reviewedToday,
          dailyGoal,
          decks: deckStats,
          totalDueToday: deckStats.reduce((s, d) => s + d.dueToday, 0),
          totalCards: deckStats.reduce((s, d) => s + d.totalCards, 0),
        };

        (event.source as Window).postMessage({ type: 'WANKI_STATS', stats }, event.origin || '*');
      } catch (_err) {
        // Widget shows its own error state
      }
    }
    window.addEventListener('message', handleStatsRequest);
    return () => window.removeEventListener('message', handleStatsRequest);
  }, []);

  useEffect(() => {
    if (view.type === 'deck' || view.type === 'review' || view.type === 'learn') {
      db.getAllDecks().then((decks) => {
        const deck = decks.find((d) => d.id === view.deckId);
        setCurrentDeck(deck ?? null);
      });
    }
  }, [view]);

  switch (view.type) {
    case 'dashboard':
      return <Dashboard navigate={setView} />;
    case 'deck':
      return (
        <DeckView
          deckId={view.deckId}
          deckName={currentDeck?.name ?? 'Deck'}
          navigate={setView}
        />
      );
    case 'review':
      return (
        <ReviewSession
          deckId={view.deckId}
          deckName={currentDeck?.name ?? 'Deck'}
          navigate={setView}
        />
      );
    case 'learn':
      return (
        <LearnMode
          deckId={view.deckId}
          cardId={view.cardId}
          navigate={setView}
        />
      );
    case 'difficultWords':
      return <DifficultWords navigate={setView} />;
    case 'difficultWordsReview':
      return (
        <ReviewSession
          deckId="difficult-words"
          deckName="Difficult Words"
          navigate={setView}
          preloadedCards={view.cards}
        />
      );
    default:
      return <Dashboard navigate={setView} />;
  }
}

export default App;
