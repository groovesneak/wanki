import { useState, useEffect } from 'react';
import type { View, Deck } from './types';
import { Dashboard } from './components/Dashboard';
import { DeckView } from './components/DeckView';
import { ReviewSession } from './components/ReviewSession';
import { DifficultWords } from './components/DifficultWords';
import * as db from './db';

function App() {
  const [view, setView] = useState<View>({ type: 'dashboard' });
  const [currentDeck, setCurrentDeck] = useState<Deck | null>(null);

  useEffect(() => {
    if (view.type === 'deck' || view.type === 'review') {
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
