import { useState, useEffect, useCallback } from 'react';
import type { Deck } from '../types';
import * as db from '../db';

export function useDecks() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const all = await db.getAllDecks();
    setDecks(all.sort((a, b) => b.createdAt - a.createdAt));
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createDeck = useCallback(async (name: string) => {
    const deck: Deck = {
      id: crypto.randomUUID(),
      name,
      createdAt: Date.now(),
    };
    await db.addDeck(deck);
    await refresh();
    return deck;
  }, [refresh]);

  const renameDeck = useCallback(async (id: string, name: string) => {
    const deck = decks.find((d) => d.id === id);
    if (deck) {
      await db.updateDeck({ ...deck, name });
      await refresh();
    }
  }, [decks, refresh]);

  const removeDeck = useCallback(async (id: string) => {
    await db.deleteDeck(id);
    await refresh();
  }, [refresh]);

  return { decks, loading, createDeck, renameDeck, removeDeck, refresh };
}
