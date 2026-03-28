export interface Deck {
  id: string;
  name: string;
  createdAt: number;
}

export interface Card {
  id: string;
  deckId: string;
  front: string;
  back: string;
  interval: number;      // days until next review
  repetitions: number;   // consecutive correct reviews
  easeFactor: number;    // starts at 2.5
  dueDate: number;       // timestamp (ms)
  createdAt: number;
  lastReviewed?: number; // timestamp of last review
  completed?: boolean;   // permanently retired (mastered)
}

export type Rating = 'again' | 'hard' | 'good' | 'easy';
export type EaseMode = 'shallow' | 'medium' | 'steep';

export type View =
  | { type: 'dashboard' }
  | { type: 'deck'; deckId: string }
  | { type: 'review'; deckId: string }
  | { type: 'editCard'; deckId: string; cardId?: string }
  | { type: 'difficultWords' }
  | { type: 'difficultWordsReview'; mode: 'words' | 'cards'; cards: Card[] };
