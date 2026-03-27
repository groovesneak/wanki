import { openDB, type IDBPDatabase } from 'idb';
import type { Deck, Card } from './types';

const DB_NAME = 'flashcards';
const DB_VERSION = 3;

let dbPromise: Promise<IDBPDatabase>;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains('decks')) {
          db.createObjectStore('decks', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('cards')) {
          const cardStore = db.createObjectStore('cards', { keyPath: 'id' });
          cardStore.createIndex('deckId', 'deckId');
          cardStore.createIndex('dueDate', 'dueDate');
        }
        // v2: settings + review log for daily new card limit
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains('settings')) {
            db.createObjectStore('settings', { keyPath: 'key' });
          }
          if (!db.objectStoreNames.contains('newCardLog')) {
            const logStore = db.createObjectStore('newCardLog', { keyPath: 'id', autoIncrement: true });
            logStore.createIndex('deckDate', ['deckId', 'date']);
          }
        }
        // v3: difficult words tracker
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains('difficultWords')) {
            const dwStore = db.createObjectStore('difficultWords', { keyPath: 'id', autoIncrement: true });
            dwStore.createIndex('word', 'word');
            dwStore.createIndex('deckId', 'deckId');
            dwStore.createIndex('wordDeck', ['word', 'deckId']);
          }
        }
      },
    });
  }
  return dbPromise;
}

// Deck operations
export async function getAllDecks(): Promise<Deck[]> {
  const db = await getDb();
  return db.getAll('decks');
}

export async function addDeck(deck: Deck): Promise<void> {
  const db = await getDb();
  await db.put('decks', deck);
}

export async function deleteDeck(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['decks', 'cards'], 'readwrite');
  await tx.objectStore('decks').delete(id);
  const cardStore = tx.objectStore('cards');
  const cards = await cardStore.index('deckId').getAllKeys(id);
  for (const key of cards) {
    await cardStore.delete(key);
  }
  await tx.done;
}

export async function updateDeck(deck: Deck): Promise<void> {
  const db = await getDb();
  await db.put('decks', deck);
}

// Card operations
export async function getCardsByDeck(deckId: string): Promise<Card[]> {
  const db = await getDb();
  return db.getAllFromIndex('cards', 'deckId', deckId);
}

export async function getDueCards(deckId: string): Promise<Card[]> {
  const now = Date.now();
  const cards = await getCardsByDeck(deckId);
  return cards.filter((c) => c.dueDate <= now);
}

export async function addCard(card: Card): Promise<void> {
  const db = await getDb();
  await db.put('cards', card);
}

export async function addCardsBatch(cards: Card[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('cards', 'readwrite');
  for (const card of cards) {
    tx.store.put(card);
  }
  await tx.done;
}

export async function updateCard(card: Card): Promise<void> {
  const db = await getDb();
  await db.put('cards', card);
}

export async function deleteCard(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('cards', id);
}

export async function getCard(id: string): Promise<Card | undefined> {
  const db = await getDb();
  return db.get('cards', id);
}

// ── Settings ────────────────────────────────────────────────────────

export interface Setting {
  key: string;
  value: unknown;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await getDb();
  const row = await db.get('settings', key);
  return row ? (row.value as T) : fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.put('settings', { key, value });
}

// ── Daily new-card log ──────────────────────────────────────────────

function todayString(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

/** Count how many unique new cards have been introduced today for a deck */
export async function getNewCardsToday(deckId: string): Promise<number> {
  const db = await getDb();
  const date = todayString();
  const entries = await db.getAllFromIndex('newCardLog', 'deckDate', [deckId, date]);
  // Deduplicate by cardId in case of old duplicate entries
  const uniqueCards = new Set(entries.map(e => e.cardId));
  return uniqueCards.size;
}

/** Record that a new card was introduced today (only once per card per day) */
export async function logNewCard(deckId: string, cardId: string): Promise<void> {
  const db = await getDb();
  const date = todayString();
  // Check if this card was already logged today to prevent duplicates
  const entries = await db.getAllFromIndex('newCardLog', 'deckDate', [deckId, date]);
  if (entries.some(e => e.cardId === cardId)) return;
  await db.add('newCardLog', { deckId, cardId, date });
}

// ── Streak tracking ─────────────────────────────────────────────────

function yesterdayString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface StreakData {
  count: number;
  lastDate: string; // "YYYY-MM-DD"
}

export async function getStreak(): Promise<StreakData> {
  return getSetting<StreakData>('streak', { count: 0, lastDate: '' });
}

/** Increment the count of cards reviewed today and check if streak goal is met. */
export async function recordReviewAndCheckStreak(): Promise<number> {
  const today = todayString();

  // Increment today's review count
  const reviewedToday = await getSetting<number>(`reviewedToday:${today}`, 0);
  await setSetting(`reviewedToday:${today}`, reviewedToday + 1);

  const streak = await getStreak();
  if (streak.lastDate === today) {
    // Already earned streak today
    return streak.count;
  }

  // Check if goal is met
  const dailyGoal = await getSetting<number>('dailyGoal', 10);
  const newReviewCount = reviewedToday + 1;

  // Count total due cards and total cards across all decks
  const allDecks = await getAllDecks();
  let totalDue = 0;
  let totalCards = 0;
  for (const deck of allDecks) {
    const due = await getDueCards(deck.id);
    const cards = await getCardsByDeck(deck.id);
    totalDue += due.length;
    totalCards += cards.length;
  }

  // "All completed" = no cards due AND reviewed at least as many as existed
  // (prevents false trigger when cards are briefly not-yet-due after rating Again)
  const goalMet = newReviewCount >= dailyGoal;
  const allCompleted = totalDue === 0 && totalCards > 0 && newReviewCount >= Math.min(dailyGoal, totalCards);

  if (!goalMet && !allCompleted) {
    return streak.count;
  }

  // Update streak
  let newCount: number;
  if (streak.lastDate === yesterdayString()) {
    newCount = streak.count + 1;
  } else {
    newCount = 1;
  }

  await setSetting('streak', { count: newCount, lastDate: today });
  return newCount;
}

/** Get how many cards have been reviewed today */
export async function getReviewedToday(): Promise<number> {
  return getSetting<number>(`reviewedToday:${todayString()}`, 0);
}

/** Clear all new-card log entries for a specific card (used when resetting SRS) */
export async function clearNewCardLog(cardId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('newCardLog', 'readwrite');
  const store = tx.objectStore('newCardLog');
  let cursor = await store.openCursor();
  while (cursor) {
    if (cursor.value.cardId === cardId) {
      await cursor.delete();
    }
    cursor = await cursor.continue();
  }
  await tx.done;
}

// ── Difficult words tracker ──────────────────────────────────────────

export interface DifficultWord {
  id?: number;
  word: string;         // the correct word
  typed: string;        // what the user typed
  cardId: string;
  deckId: string;
  cardFront: string;
  cardBack: string;
  timestamp: number;
}

export interface DifficultWordSummary {
  word: string;
  deckId: string;
  count: number;
  lastSeen: number;
  examples: { typed: string; cardFront: string; cardBack: string }[];
}

/** Log a missed word */
export async function logDifficultWord(entry: Omit<DifficultWord, 'id'>): Promise<void> {
  const db = await getDb();
  await db.add('difficultWords', entry);
}

/** Log multiple missed words at once */
export async function logDifficultWords(entries: Omit<DifficultWord, 'id'>[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('difficultWords', 'readwrite');
  for (const entry of entries) {
    tx.store.add(entry);
  }
  await tx.done;
}

/** Get all difficult words for a deck, summarized by word */
export async function getDifficultWords(deckId?: string): Promise<DifficultWordSummary[]> {
  const db = await getDb();
  const all: DifficultWord[] = deckId
    ? await db.getAllFromIndex('difficultWords', 'deckId', deckId)
    : await db.getAll('difficultWords');

  // Group by word + deckId
  const map = new Map<string, DifficultWordSummary>();
  for (const entry of all) {
    const key = `${entry.word}::${entry.deckId}`;
    const existing = map.get(key);
    if (existing) {
      existing.count++;
      if (entry.timestamp > existing.lastSeen) existing.lastSeen = entry.timestamp;
      const exKey = entry.cardFront.toLowerCase().trim();
      const alreadyHas = existing.examples.some(
        (ex) => ex.cardFront.toLowerCase().trim() === exKey
      );
      if (!alreadyHas && existing.examples.length < 20) {
        existing.examples.push({ typed: entry.typed, cardFront: entry.cardFront, cardBack: entry.cardBack });
      }
    } else {
      map.set(key, {
        word: entry.word,
        deckId: entry.deckId,
        count: 1,
        lastSeen: entry.timestamp,
        examples: [{ typed: entry.typed, cardFront: entry.cardFront, cardBack: entry.cardBack }],
      });
    }
  }

  // Sort by count (most missed first)
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

/** Clear all difficult word entries for a deck */
export async function clearDifficultWords(deckId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('difficultWords', 'readwrite');
  const store = tx.objectStore('difficultWords');
  const all = await store.index('deckId').getAllKeys(deckId);
  for (const key of all) {
    await store.delete(key);
  }
  await tx.done;
}

/** Clear all new-card log entries for a deck (used when resetting all cards) */
export async function clearDeckNewCardLog(deckId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('newCardLog', 'readwrite');
  const store = tx.objectStore('newCardLog');
  let cursor = await store.openCursor();
  while (cursor) {
    if (cursor.value.deckId === deckId) {
      await cursor.delete();
    }
    cursor = await cursor.continue();
  }
  await tx.done;
}
