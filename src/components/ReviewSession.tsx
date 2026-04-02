import { useState, useEffect, useCallback, useRef } from 'react';
import type { Card, Rating, View, EaseMode } from '../types';
import { useCards } from '../hooks/useCards';
import { previewIntervals, reviewCard, isEligibleForCompletion } from '../srs';
import { getSetting, setSetting, logDifficultWords } from '../db';

interface Props {
  deckId: string;
  deckName: string;
  navigate: (view: View) => void;
  preloadedCards?: Card[];
}

/** Strip everything except letters and digits, then lowercase (easy mode) or keep as-is (hard mode) */
function normalize(s: string, hardMode = false): string {
  if (hardMode) return s;
  return s.toLowerCase().replace(/[^a-zA-Z0-9\u00C0-\u024F]/g, '');
}

/**
 * Expand alternatives in correct answer. "deg/dere" means either "deg" or "dere".
 * Returns all possible correct answer strings.
 * E.g. "å spare deg/dere for tid" → ["å spare deg for tid", "å spare dere for tid"]
 */
function expandAlternatives(correct: string): string[] {
  // Find all word/word patterns (supports chaining like a/b/c)
  const altPattern = /(\S+(?:\/\S+)+)/g;
  const matches = correct.match(altPattern);
  if (!matches) return [correct];

  let results = [correct];
  for (const match of matches) {
    const options = match.split('/');
    const expanded: string[] = [];
    for (const result of results) {
      for (const option of options) {
        expanded.push(result.replace(match, option));
      }
    }
    results = expanded;
  }
  return [...new Set(results)];
}

/** Find the best matching alternative (lowest edit distance) */
function bestAlternative(typed: string, correct: string, hardMode = false): string {
  const alts = expandAlternatives(correct);
  if (alts.length === 1) return correct;
  const nt = normalize(typed, hardMode);
  let best = alts[0];
  let bestDist = Infinity;
  for (const alt of alts) {
    const dist = editDistance(nt, normalize(alt, hardMode));
    if (dist < bestDist) {
      bestDist = dist;
      best = alt;
    }
  }
  return best;
}

function checkAnswer(typed: string, correct: string, hardMode = false): boolean {
  const alts = expandAlternatives(correct);
  const nt = normalize(typed, hardMode);
  return alts.some((alt) => normalize(alt, hardMode) === nt);
}

// ── Grading tiers ───────────────────────────────────────────────────

type GradeTier = { label: string; bg: string; text: string };

function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

function getGradeTier(typed: string, correct: string, hardMode = false): GradeTier {
  if (checkAnswer(typed, correct, hardMode)) return { label: 'Correct!', bg: 'bg-success', text: 'text-white' };
  const best = bestAlternative(typed, correct, hardMode);
  const nt = normalize(typed, hardMode);
  const nc = normalize(best, hardMode);
  const dist = editDistance(nt, nc);
  const maxLen = Math.max(nt.length, nc.length, 1);
  const pct = Math.round(((maxLen - dist) / maxLen) * 100);
  if (pct >= 90) return { label: 'Almost!', bg: 'bg-surface-light border border-primary', text: 'text-primary' };
  if (pct >= 80) return { label: 'Close!', bg: 'bg-surface-light border border-primary', text: 'text-primary' };
  if (pct >= 70) return { label: 'Not bad', bg: 'bg-surface-light border border-primary', text: 'text-primary' };
  return { label: 'Incorrect', bg: 'bg-primary', text: 'text-white' };
}

// ── Dual diff: colours for typed string AND error flags for correct string ──

type CharColor = 'correct' | 'incorrect' | 'missing';

interface DiffResult {
  typedChars: { char: string; color: CharColor }[];
  /** For each normalised char in the correct answer: true = error zone */
  correctErrors: boolean[];
}

function dualDiff(typed: string, correct: string, hardMode = false): DiffResult {
  const best = bestAlternative(typed, correct, hardMode);
  const nt = normalize(typed, hardMode);
  const nc = normalize(best, hardMode);
  const m = nt.length;
  const n = nc.length;

  // Build DP table
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (nt[i - 1] === nc[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrace → build aligned sequence with colors and missing char placeholders
  const typedNormColors: CharColor[] = Array(m).fill('incorrect');
  const correctNormErrors: boolean[] = Array(n).fill(false);
  // Track where missing chars should be inserted (keyed by typed norm index)
  // missingAfter[i] = chars missing after typed norm index i (-1 = before start)
  const missingAfter = new Map<number, string[]>();

  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (nt[i - 1] === nc[j - 1]) {
      typedNormColors[i - 1] = 'correct';
      i--; j--;
    } else if (dp[i - 1][j - 1] <= dp[i - 1][j] && dp[i - 1][j - 1] <= dp[i][j - 1]) {
      typedNormColors[i - 1] = 'incorrect';
      correctNormErrors[j - 1] = true;
      i--; j--;
    } else if (dp[i - 1][j] <= dp[i][j - 1]) {
      typedNormColors[i - 1] = 'incorrect';
      i--;
    } else {
      // Missing char in typed — record it to insert as "-" placeholder
      correctNormErrors[j - 1] = true;
      const insertPos = i - 1; // insert after this typed norm index (-1 if at start)
      if (!missingAfter.has(insertPos)) missingAfter.set(insertPos, []);
      missingAfter.get(insertPos)!.unshift(nc[j - 1]);
      j--;
    }
  }
  while (i > 0) { typedNormColors[--i] = 'incorrect'; }
  while (j > 0) {
    correctNormErrors[j - 1] = true;
    const insertPos = -1;
    if (!missingAfter.has(insertPos)) missingAfter.set(insertPos, []);
    missingAfter.get(insertPos)!.unshift(nc[j - 1]);
    j--;
  }

  // Map typed colours back to original typed string, inserting "-" for missing chars
  const typedChars: { char: string; color: CharColor }[] = [];

  // Insert any missing chars before the first character
  if (missingAfter.has(-1)) {
    for (const _ of missingAfter.get(-1)!) {
      typedChars.push({ char: '-', color: 'missing' as CharColor });
    }
  }

  if (hardMode) {
    for (let idx = 0; idx < typed.length; idx++) {
      typedChars.push({ char: typed[idx], color: typedNormColors[idx] || 'incorrect' });
      if (missingAfter.has(idx)) {
        for (const _ of missingAfter.get(idx)!) {
          typedChars.push({ char: '-', color: 'missing' as CharColor });
        }
      }
    }
  } else {
    let ni = 0;
    for (const ch of typed) {
      const isAlpha = ch.toLowerCase().replace(/[^a-zA-Z0-9\u00C0-\u024F]/g, '') !== '';
      if (!isAlpha) {
        typedChars.push({ char: ch, color: 'correct' });
      } else {
        typedChars.push({ char: ch, color: typedNormColors[ni] });
        if (missingAfter.has(ni)) {
          for (const _ of missingAfter.get(ni)!) {
            typedChars.push({ char: '-', color: 'missing' as CharColor });
          }
        }
        ni++;
      }
    }
  }

  return { typedChars, correctErrors: correctNormErrors };
}

/**
 * Map normalised error flags → word-level highlights on the original correct string.
 * A word is highlighted if ANY of its normalised letters are in an error zone.
 */
function highlightCorrectAnswer(
  correct: string,
  normErrors: boolean[],
  hardMode = false,
): { char: string; highlight: boolean }[] {
  // First, map each original char to its normalised index (or -1 for non-alpha)
  const charToNormIdx: number[] = [];
  if (hardMode) {
    // In hard mode every char is significant — 1:1 mapping
    for (let i = 0; i < correct.length; i++) charToNormIdx.push(i);
  } else {
    let ni = 0;
    for (const ch of correct) {
      const isAlpha = ch.toLowerCase().replace(/[^a-zA-Z0-9\u00C0-\u024F]/g, '') !== '';
      charToNormIdx.push(isAlpha ? ni++ : -1);
    }
  }

  // Split into words (sequences of chars separated by spaces)
  // Determine which words have errors
  const chars = [...correct];
  const wordIndices: number[] = new Array(chars.length).fill(0);
  let wordIdx = 0;
  for (let c = 0; c < chars.length; c++) {
    if (chars[c] === ' ' && c > 0 && chars[c - 1] !== ' ') wordIdx++;
    wordIndices[c] = wordIdx;
  }

  const wordHasError = new Set<number>();
  for (let c = 0; c < chars.length; c++) {
    const nIdx = charToNormIdx[c];
    if (nIdx >= 0 && normErrors[nIdx]) {
      wordHasError.add(wordIndices[c]);
    }
  }

  // Highlight non-space chars in error words; spaces are never highlighted
  return chars.map((ch, c) => ({
    char: ch,
    highlight: ch !== ' ' && wordHasError.has(wordIndices[c]),
  }));
}

/** Extract the highlighted (missed) words from the correct answer */
function extractHighlightedWords(chars: { char: string; highlight: boolean }[]): string[] {
  const words: string[] = [];
  let currentWord = '';
  let inHighlight = false;

  for (const c of chars) {
    if (c.char === ' ') {
      if (inHighlight && currentWord.trim()) {
        words.push(currentWord.trim());
        currentWord = '';
      }
      inHighlight = false;
    } else if (c.highlight) {
      inHighlight = true;
      currentWord += c.char;
    } else {
      if (inHighlight && currentWord.trim()) {
        words.push(currentWord.trim());
        currentWord = '';
      }
      inHighlight = false;
    }
  }
  if (inHighlight && currentWord.trim()) {
    words.push(currentWord.trim());
  }
  return words;
}

/** Group consecutive chars with the same highlight state into runs */
function groupHighlighted(
  chars: { char: string; highlight: boolean }[],
): { text: string; highlight: boolean }[] {
  const groups: { text: string; highlight: boolean }[] = [];
  for (const c of chars) {
    const last = groups[groups.length - 1];
    if (last && last.highlight === c.highlight) {
      last.text += c.char;
    } else {
      groups.push({ text: c.char, highlight: c.highlight });
    }
  }
  return groups;
}

// ── Accuracy percentage ──────────────────────────────────────────────

function getAccuracyPercent(typed: string, correct: string, hardMode = false): number {
  if (checkAnswer(typed, correct, hardMode)) return 100;
  const best = bestAlternative(typed, correct, hardMode);
  const nt = normalize(typed, hardMode);
  const nc = normalize(best, hardMode);
  const dist = editDistance(nt, nc);
  const maxLen = Math.max(nt.length, nc.length, 1);
  return Math.max(0, Math.round(((maxLen - dist) / maxLen) * 100));
}

// ── Recommended rating based on accuracy ────────────────────────────

function getRecommendedRating(typed: string, correct: string, hardMode = false): Rating {
  if (checkAnswer(typed, correct, hardMode)) return 'good';
  const best = bestAlternative(typed, correct, hardMode);
  const nt = normalize(typed, hardMode);
  const nc = normalize(best, hardMode);
  const dist = editDistance(nt, nc);
  const maxLen = Math.max(nt.length, nc.length, 1);
  const pct = Math.round(((maxLen - dist) / maxLen) * 100);
  if (pct >= 80) return 'hard';
  return 'again';
}

// ── Component ───────────────────────────────────────────────────────

export function ReviewSession({ deckId, deckName, navigate, preloadedCards }: Props) {
  const { dueCards, loading, rateCard, editCard, removeCard, completeCard } = useCards(deckId);
  const isPreloaded = !!preloadedCards;
  const [queue, setQueue] = useState<Card[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [initialized, setInitialized] = useState(false);

  // Answer input state
  const [answer, setAnswer] = useState('');
  const [peeked, setPeeked] = useState(false);
  const [practiceAnswer, setPracticeAnswer] = useState('');
  const [practiceResult, setPracticeResult] = useState<'correct' | 'incorrect' | null>(null);
  const practiceRef = useRef<HTMLTextAreaElement>(null);
  const [gradeResult, setGradeResult] = useState<'correct' | 'incorrect' | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Inline edit state
  const [editing, setEditing] = useState(false);
  const [editFront, setEditFront] = useState('');
  const [editBack, setEditBack] = useState('');

  // Delete confirm state
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Hard mode
  const [hardMode, setHardMode] = useState(false);
  // Ease mode
  const [easeMode, setEaseMode] = useState<EaseMode>('medium');
  // Settings panel & percentage toggle
  const [showStudySettings, setShowStudySettings] = useState(false);
  const [showPercentage, setShowPercentage] = useState(true);
  // Completed count (cards scheduled for tomorrow+)
  const [completed, setCompleted] = useState(0);
  // Initial session size (constant)
  const [sessionTotal, setSessionTotal] = useState(0);

  useEffect(() => {
    getSetting<boolean>(`hardMode:${deckId}`, false).then(setHardMode);
    getSetting<boolean>('showPercentage', true).then(setShowPercentage);
    getSetting<EaseMode>(`easeMode:${deckId}`, 'medium').then(setEaseMode);
  }, [deckId]);

  const toggleHardMode = async () => {
    const newVal = !hardMode;
    setHardMode(newVal);
    await setSetting(`hardMode:${deckId}`, newVal);
  };

  const togglePercentage = async () => {
    const newVal = !showPercentage;
    setShowPercentage(newVal);
    await setSetting('showPercentage', newVal);
  };

  // Custom days for the "Custom" button
  const [customDays, setCustomDays] = useState<number>(4);

  // Initialize queue once when due cards load (or from preloaded cards)
  useEffect(() => {
    if (!initialized) {
      if (isPreloaded) {
        setQueue([...preloadedCards]);
        setSessionTotal(preloadedCards.length);
        setInitialized(true);
      } else if (!loading) {
        setQueue([...dueCards]);
        setSessionTotal(dueCards.length);
        setInitialized(true);
      }
    }
  }, [loading, dueCards, initialized, isPreloaded, preloadedCards]);

  const currentCard = queue[currentIndex];
  const totalCards = queue.length;
  const done = initialized && currentIndex >= totalCards;

  const handleReveal = useCallback(() => {
    if (flipped) return;
    const isCorrect = checkAnswer(answer, currentCard.back, hardMode);
    setGradeResult(isCorrect ? 'correct' : 'incorrect');
    setFlipped(true);
    // Set default custom days from the Easy preview
    const easyMs = reviewCard(currentCard, 'easy', easeMode).dueDate - Date.now();
    const days = Math.max(1, Math.round(easyMs / (24 * 60 * 60 * 1000)));
    setCustomDays(days);
  }, [answer, currentCard, flipped]);

  const handlePeek = useCallback(() => {
    if (flipped) return;
    setPeeked(true);
    setFlipped(true);
    setGradeResult(null);
    setPracticeAnswer('');
    setPracticeResult(null);
    setTimeout(() => practiceRef.current?.focus(), 50);
  }, [flipped]);

  const handleReflip = useCallback(() => {
    setFlipped(false);
    setPeeked(false);
    setAnswer('');
    setPracticeAnswer('');
    setPracticeResult(null);
    setGradeResult(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleRate = useCallback(async (rating: Rating) => {
    if (!currentCard) return;

    if (isPreloaded) {
      // Preloaded (difficult words) — don't persist to DB, just advance
      if (rating === 'again') {
        setQueue((q) => [...q, currentCard]);
      } else {
        setCompleted((c) => c + 1);
      }
    } else {
      const overrideDays = rating === 'easy' ? customDays : undefined;
      const updated = await rateCard(currentCard, rating, overrideDays, easeMode);

      // Log difficult words for any non-perfect answer
      if (gradeResult && gradeResult !== 'correct' && answer) {
        try {
          const diff = dualDiff(answer, currentCard.back, hardMode);
          const bestAltForLog = bestAlternative(answer, currentCard.back, hardMode);
          const highlighted = highlightCorrectAnswer(bestAltForLog, diff.correctErrors, hardMode);
          const missedWords = extractHighlightedWords(highlighted);
          if (missedWords.length > 0) {
            const now = Date.now();
            await logDifficultWords(missedWords.map((word) => ({
              word,
              typed: answer,
              cardId: currentCard.id,
              deckId,
              cardFront: currentCard.front,
              cardBack: currentCard.back,
              timestamp: now,
            })));
          }
        } catch {
          // Don't block the review flow if logging fails
        }
      }

      // Check if card is "completed" (scheduled for tomorrow or later)
      const DAY = 24 * 60 * 60 * 1000;
      const isCompleted = updated.dueDate - Date.now() >= DAY * 0.5;

      if (isCompleted) {
        setCompleted((c) => c + 1);
      } else {
        // Card is coming back soon (Again = 1min, Hard = 10min) — re-add to queue
        setQueue((q) => [...q, updated]);
      }
    }

    setReviewed((r) => r + 1);
    setFlipped(false);
    setAnswer('');
    setPeeked(false);
    setGradeResult(null);
    setEditing(false);
    setConfirmDelete(false);
    setCurrentIndex((i) => i + 1);

    setTimeout(() => inputRef.current?.focus(), 50);
  }, [currentCard, rateCard, customDays, gradeResult, answer, hardMode, deckId]);

  const handleEditSave = useCallback(async () => {
    if (!currentCard || !editFront.trim() || !editBack.trim()) return;
    await editCard(currentCard.id, editFront.trim(), editBack.trim());
    // Update the card in the local queue
    setQueue((q) => q.map((c) =>
      c.id === currentCard.id ? { ...c, front: editFront.trim(), back: editBack.trim() } : c
    ));
    setEditing(false);
  }, [currentCard, editFront, editBack, editCard]);

  const handleDelete = useCallback(async () => {
    if (!currentCard) return;
    await removeCard(currentCard.id);
    // Remove from queue and don't increment index
    setQueue((q) => q.filter((_, idx) => idx !== currentIndex));
    setFlipped(false);
    setAnswer('');
    setPeeked(false);
    setGradeResult(null);
    setConfirmDelete(false);
    setEditing(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [currentCard, currentIndex, removeCard]);

  const startEdit = useCallback(() => {
    if (!currentCard) return;
    setEditFront(currentCard.front);
    setEditBack(currentCard.back);
    setEditing(true);
    setConfirmDelete(false);
  }, [currentCard]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Allow edit textareas to work normally, but not our answer/practice textareas
      if (e.target instanceof HTMLTextAreaElement && e.target !== inputRef.current && e.target !== practiceRef.current) return;
      if (editing) return; // Don't intercept while editing

      if (flipped && !peeked && !(e.target instanceof HTMLInputElement) && e.target !== practiceRef.current) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handleReflip();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          const rec = getRecommendedRating(answer, currentCard.back, hardMode);
          handleRate(rec);
          return;
        }
        switch (e.key) {
          case '1': handleRate('again'); break;
          case '2': handleRate('hard'); break;
          case '3': handleRate('good'); break;
          case '4': handleRate('easy'); break;
          case '5': if (!isPreloaded && currentCard && isEligibleForCompletion(currentCard, easeMode)) {
            completeCard(currentCard.id).then(() => {
              setCompleted((c) => c + 1);
              setReviewed((r) => r + 1);
              setFlipped(false);
              setAnswer('');
              setPeeked(false);
              setGradeResult(null);
              setCurrentIndex((i) => i + 1);
              setTimeout(() => inputRef.current?.focus(), 50);
            });
          } break;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [flipped, editing, handleRate, handleReveal, answer, currentCard]);

  // Auto-focus input
  useEffect(() => {
    if (!flipped && !done && initialized && !editing) {
      inputRef.current?.focus();
    }
  }, [currentIndex, flipped, done, initialized, editing]);

  if (loading || !initialized) {
    return <div className="flex items-center justify-center h-screen text-text-muted">Loading...</div>;
  }

  if (totalCards === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="text-5xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold mb-2">No cards due!</h2>
        <p className="text-text-muted mb-6">All caught up. Come back later for more reviews.</p>
        <button
          onClick={() => navigate(isPreloaded ? { type: 'difficultWords' } : { type: 'deck', deckId })}
          className="bg-surface-card hover:bg-primary/10 text-text px-5 py-2.5 rounded-full shadow-sm font-medium transition-colors"
        >
          Back to deck
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <h2 className="text-2xl font-bold mb-2">Session complete!</h2>
        <p className="text-text-muted mb-6">You reviewed {reviewed} card{reviewed !== 1 ? 's' : ''}</p>
        <div className="flex gap-3">
          <button
            onClick={() => navigate(isPreloaded ? { type: 'difficultWords' } : { type: 'deck', deckId })}
            className="bg-surface-card hover:bg-primary/10 text-text px-5 py-2.5 rounded-full shadow-sm font-medium transition-colors"
          >
            Back to deck
          </button>
          <button
            onClick={() => navigate({ type: 'dashboard' })}
            className="bg-primary hover:bg-primary-hover text-white px-5 py-2.5 rounded-full font-medium transition-colors shadow-sm"
          >
            Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate(isPreloaded ? { type: 'difficultWords' } : { type: 'deck', deckId })}
          className="text-text-muted hover:text-text text-sm inline-flex items-center gap-1 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          {deckName}
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm">
            <span className={`font-bold ${completed > 0 ? 'text-success' : 'text-text-muted'}`}>{completed}</span>
            <span className="text-text-muted">/{sessionTotal}</span>
          </span>
          <button
            onClick={() => setShowStudySettings((s) => !s)}
            className="text-text-muted hover:text-text p-1 transition-colors"
            title="Study settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
      </div>

      {/* Study settings dropdown */}
      {showStudySettings && (
        <div className="bg-surface-light rounded-2xl p-4 mb-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Hard Mode</span>
            <div className="flex flex-col items-center gap-0.5">
              <button
                onClick={toggleHardMode}
                className={`relative w-10 h-5 rounded-full transition-colors ${hardMode ? 'bg-primary' : 'bg-surface-card'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${hardMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Percentage</span>
            <div className="flex flex-col items-center gap-0.5">
              <button
                onClick={togglePercentage}
                className={`relative w-10 h-5 rounded-full transition-colors ${showPercentage ? 'bg-primary' : 'bg-surface-card'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${showPercentage ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-surface-card rounded-full mb-8 overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300"
          style={{ width: `${(currentIndex / totalCards) * 100}%` }}
        />
      </div>

      {/* Card */}
      <div className="flex-1 flex flex-col items-center justify-center gap-5">
        {/* Inline editor overlay */}
        {editing ? (
          <div className="w-full max-w-lg bg-surface-light rounded-2xl p-6 space-y-3 shadow-md">
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">Edit Card</h3>
            <textarea
              autoFocus
              value={editFront}
              onChange={(e) => setEditFront(e.target.value)}
              placeholder="Front..."
              className="w-full bg-surface-card rounded-lg px-4 py-3 text-text outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              rows={2}
            />
            <textarea
              value={editBack}
              onChange={(e) => setEditBack(e.target.value)}
              placeholder="Back..."
              className="w-full bg-surface-card rounded-lg px-4 py-3 text-text outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              rows={2}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditing(false)}
                className="text-text-muted hover:text-text px-4 py-2 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <div className="card-flip w-full max-w-lg">
            <div className={`card-flip-inner relative ${flipped ? 'flipped' : ''}`}>
              {/* Front */}
              <div className="card-face bg-surface-light rounded-2xl p-8 min-h-[200px] flex flex-col items-center justify-center w-full shadow-md">
                <p className="text-xl text-center leading-relaxed whitespace-pre-wrap">{currentCard.front}</p>
              </div>

              {/* Back */}
              <div className="card-face card-back bg-surface-light rounded-2xl p-8 min-h-[200px] flex flex-col items-center justify-center absolute inset-0 w-full overflow-visible shadow-md">
                {/* Question at top of revealed card */}
                <p className="text-sm text-text-muted text-center mb-4 pb-3 border-b border-surface-card w-full">{currentCard.front}</p>
                {/* Peek mode — show answer + practice input */}
                {peeked && !gradeResult && (() => {
                  const practiceBest = bestAlternative(practiceAnswer, currentCard.back, hardMode);
                  const practiceDiff = practiceResult && practiceResult !== 'correct'
                    ? dualDiff(practiceAnswer, currentCard.back, hardMode) : null;
                  const practiceHighlighted = practiceDiff
                    ? highlightCorrectAnswer(practiceBest, practiceDiff.correctErrors, hardMode) : null;
                  const practiceTier = practiceResult
                    ? getGradeTier(practiceAnswer, currentCard.back, hardMode) : null;
                  const practiceExact = practiceResult === 'correct';

                  return (
                    <div className="w-full flex flex-col items-center gap-3">
                      {/* Show correct answer — highlighted if practice was wrong */}
                      {practiceResult && !practiceExact && practiceHighlighted ? (
                        <p className="text-xl text-center leading-relaxed whitespace-pre-wrap">
                          {groupHighlighted(practiceHighlighted).map((g, i) => (
                            g.highlight ? (
                              <span key={i} className="bg-surface-light border border-primary text-primary rounded px-1 py-0.5 mx-[1px]">{g.text}</span>
                            ) : (<span key={i}>{g.text}</span>)
                          ))}
                        </p>
                      ) : practiceExact ? (
                        <p className="text-xl text-center leading-relaxed whitespace-pre-wrap text-success">{practiceAnswer}</p>
                      ) : (
                        <p className="text-xl text-center leading-relaxed whitespace-pre-wrap">{currentCard.back}</p>
                      )}

                      {/* Practice diff of typed answer */}
                      {practiceDiff && (() => {
                        const groups: { text: string; color: CharColor }[] = [];
                        for (const c of practiceDiff.typedChars) {
                          const last = groups[groups.length - 1];
                          if (last && last.color === c.color) { last.text += c.char; }
                          else { groups.push({ text: c.char, color: c.color }); }
                        }
                        return (
                          <p className="text-xl text-center leading-relaxed whitespace-pre-wrap">
                            {groups.map((g, i) => (
                              <span key={i} className={
                                g.color === 'correct' ? 'text-success'
                                : 'bg-primary text-white rounded px-1 py-0.5 mx-[1px]'
                              }>{g.text}</span>
                            ))}
                          </p>
                        );
                      })()}

                      {/* Practice grade label */}
                      {practiceTier && (
                        <div className={`px-6 py-3 rounded-full text-xl font-bold ${practiceTier.bg} ${practiceTier.text}`}>
                          {practiceTier.label}
                        </div>
                      )}

                      {/* Practice input */}
                      <textarea
                        ref={practiceRef}
                        placeholder="Practice typing the answer..."
                        value={practiceAnswer}
                        onChange={(e) => { setPracticeAnswer(e.target.value); setPracticeResult(null); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            const isCorrect = checkAnswer(practiceAnswer, currentCard.back, hardMode);
                            setPracticeResult(isCorrect ? 'correct' : 'incorrect');
                          }
                        }}
                        rows={1}
                        className="w-full bg-surface-card rounded-xl px-4 py-3 text-text text-center text-lg outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-text-muted/50 resize-none overflow-hidden"
                      />
                      <button
                        onClick={() => {
                          const isCorrect = checkAnswer(practiceAnswer, currentCard.back, hardMode);
                          setPracticeResult(isCorrect ? 'correct' : 'incorrect');
                        }}
                        className="bg-surface-light border border-primary text-primary px-5 py-2 rounded-full text-sm font-medium transition-colors shadow-sm hover:bg-primary/10"
                      >
                        Test submit
                      </button>
                    </div>
                  );
                })()}
                {gradeResult && (() => {
                  const tier = getGradeTier(answer, currentCard.back, hardMode);
                  const isExact = gradeResult === 'correct';
                  const bestAlt = bestAlternative(answer, currentCard.back, hardMode);
                  const diff = !isExact ? dualDiff(answer, currentCard.back, hardMode) : null;
                  const highlighted = diff ? highlightCorrectAnswer(bestAlt, diff.correctErrors, hardMode) : null;

                  return (
                    <>
                      {/* If 100% correct, just show typed answer in green */}
                      {isExact ? (
                        <p className="text-xl text-center leading-relaxed whitespace-pre-wrap text-success">
                          {answer}
                        </p>
                      ) : (
                        <>
                          {/* Correct answer — with word-level highlighting */}
                          {highlighted && (
                            <p className="text-xl text-center leading-relaxed whitespace-pre-wrap">
                              {groupHighlighted(highlighted).map((g, i) => (
                                g.highlight ? (
                                  <span
                                    key={i}
                                    className="bg-surface-light border border-primary text-primary rounded px-1 py-0.5 mx-[1px]"
                                  >
                                    {g.text}
                                  </span>
                                ) : (
                                  <span key={i}>{g.text}</span>
                                )
                              ))}
                            </p>
                          )}
                        </>
                      )}

                      {/* Coloured diff of typed answer */}
                      {diff && (() => {
                        // Group consecutive chars by color
                        const groups: { text: string; color: CharColor }[] = [];
                        for (const c of diff.typedChars) {
                          const last = groups[groups.length - 1];
                          if (last && last.color === c.color) {
                            last.text += c.char;
                          } else {
                            groups.push({ text: c.char, color: c.color });
                          }
                        }
                        return (
                          <p className="mt-4 text-xl text-center leading-relaxed whitespace-pre-wrap">
                            {groups.map((g, i) => (
                              <span key={i} className={
                                g.color === 'correct' ? 'text-success'
                                : g.color === 'missing' ? 'bg-primary text-white rounded px-1 py-0.5 mx-[1px]'
                                : 'bg-primary text-white rounded px-1 py-0.5 mx-[1px]'
                              }>
                                {g.text}
                              </span>
                            ))}
                          </p>
                        );
                      })()}

                      <div className={`${isExact ? 'mt-4' : 'mt-3'} px-6 py-3 rounded-full text-xl font-bold ${tier.bg} ${tier.text}`}>
                        {tier.label}
                      </div>
                    </>
                  );
                })()}

                {/* Re-flip / Edit / Delete buttons on revealed card */}
                {flipped && !editing && (
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={handleReflip}
                      className="text-text-muted hover:text-text text-xs px-3 py-1.5 rounded-lg bg-surface-light/50 hover:bg-surface-light transition-colors inline-flex items-center gap-1"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
                      Re-flip
                    </button>
                    <button
                      onClick={startEdit}
                      className="text-text-muted hover:text-text text-xs px-3 py-1.5 rounded-lg bg-surface-light/50 hover:bg-surface-light transition-colors inline-flex items-center gap-1"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                      Edit
                    </button>
                    {confirmDelete ? (
                      <div className="flex gap-1">
                        <button
                          onClick={handleDelete}
                          className="text-primary text-xs px-3 py-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 transition-colors"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmDelete(false)}
                          className="text-text-muted text-xs px-2 py-1.5 transition-colors"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(true)}
                        className="text-text-muted hover:text-primary text-xs px-3 py-1.5 rounded-lg bg-surface-light/50 hover:bg-surface-light transition-colors inline-flex items-center gap-1"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Accuracy bar — hidden when peeking */}
        {flipped && !editing && !peeked && showPercentage && (() => {
          const pct = getAccuracyPercent(answer, currentCard.back, hardMode);
          const barColor = pct === 100 ? 'bg-success' : pct >= 70 ? 'bg-white border-2 border-primary' : 'bg-primary';
          const textColor = pct === 100 ? 'text-success' : 'text-primary';
          return (
            <div className="w-full max-w-lg flex items-center gap-3">
              <div className="flex-1 h-4 bg-surface-card rounded-full overflow-hidden shadow-inner">
                <div
                  className={`h-full ${barColor} rounded-full transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={`text-sm font-bold ${textColor} min-w-[3ch] text-right`}>{pct}%</span>
            </div>
          );
        })()}

        {/* Answer input */}
        {!flipped && !editing && (
          <div className="w-full max-w-lg">
            <textarea
              ref={inputRef}
              placeholder="Type your answer..."
              value={answer}
              onChange={(e) => { setAnswer(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleReveal();
                }
              }}
              rows={1}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="w-full bg-surface-light rounded-2xl px-5 py-3.5 text-text text-center text-lg outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-text-muted/50 shadow-sm resize-none overflow-hidden"
            />
            <div className="flex justify-center gap-2 mt-3">
              <button
                onClick={handlePeek}
                className="bg-surface-light border border-primary text-primary px-5 py-2 rounded-full text-sm font-medium transition-colors shadow-sm hover:bg-primary/10"
              >
                Reveal
              </button>
              <button
                onClick={handleReveal}
                className="bg-primary hover:bg-primary-hover text-white px-5 py-2 rounded-full text-sm font-medium transition-colors shadow-sm"
              >
                Check answer &middot; <kbd className="bg-black/20 rounded px-1.5 py-0.5 text-[10px]">Enter</kbd>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Rating buttons — hidden when peeking */}
      {flipped && !editing && !peeked && (() => {
        const intervals = previewIntervals(currentCard, easeMode);
        const recommended = getRecommendedRating(answer, currentCard.back, hardMode);
        const canComplete = !isPreloaded && isEligibleForCompletion(currentCard, easeMode);
        return (
          <div className="mt-8 mb-4">
            <p className="text-center text-text-muted text-sm mb-3">How well did you know this?</p>
            <div className={`grid ${canComplete ? 'grid-cols-5' : 'grid-cols-4'} gap-2`}>
              <RatingButton rating="again" label="Again" sublabel={intervals.again} color="primary" shortcut="1" recommended={recommended === 'again'} onClick={() => handleRate('again')} />
              <RatingButton rating="hard" label="Hard" sublabel={intervals.hard} color="primary" shortcut="2" recommended={recommended === 'hard'} onClick={() => handleRate('hard')} />
              <RatingButton rating="good" label="Good" sublabel={intervals.good} color="success" shortcut="3" recommended={recommended === 'good'} onClick={() => handleRate('good')} />
              {/* Custom button with editable stepper */}
              <button
                onClick={() => handleRate('easy')}
                className={`bg-surface-light border-success ${recommended === 'easy' ? 'border-3' : 'border'} rounded-2xl py-2 px-2 text-center transition-colors hover:bg-surface-card shadow-sm text-success`}
              >
                <div className="font-semibold text-sm">Custom</div>
                <div className="flex items-center justify-center gap-0 mt-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); setCustomDays(Math.max(1, customDays - 1)); }}
                    className="text-success hover:bg-success/10 rounded px-1 text-xs font-bold"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={customDays}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setCustomDays(Math.max(1, Number(e.target.value) || 1))}
                    className="w-8 text-center text-xs font-medium text-success bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); setCustomDays(customDays + 1); }}
                    className="text-success hover:bg-success/10 rounded px-1 text-xs font-bold"
                  >
                    +
                  </button>
                </div>
                <div className="text-[10px] opacity-70">{customDays === 1 ? 'day' : 'days'}</div>
                <kbd className="inline-block bg-surface-card rounded px-1.5 py-0.5 text-[10px] mt-1 text-text-muted">4</kbd>
              </button>
              {canComplete && (
                <button
                  onClick={async () => {
                    await completeCard(currentCard.id);
                    setCompleted((c) => c + 1);
                    setReviewed((r) => r + 1);
                    setFlipped(false);
                    setAnswer('');
                    setGradeResult(null);
                    setCurrentIndex((i) => i + 1);
                    setTimeout(() => inputRef.current?.focus(), 50);
                  }}
                  className="bg-alldone hover:bg-alldone/80 rounded-2xl py-2 px-2 text-center transition-colors shadow-sm text-white"
                >
                  <div className="font-semibold text-sm">Mastered</div>
                  <div className="text-[10px] opacity-80 mt-1">Retire card</div>
                  <kbd className="inline-block bg-white/20 rounded px-1.5 py-0.5 text-[10px] mt-1">5</kbd>
                </button>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function RatingButton({
  label,
  sublabel,
  color,
  shortcut,
  recommended,
  onClick,
}: {
  rating: Rating;
  label: string;
  sublabel: string;
  color: string;
  shortcut: string;
  recommended: boolean;
  onClick: () => void;
}) {
  const borderColor: Record<string, string> = {
    primary: 'border-primary text-primary',
    success: 'border-success text-success',
    accent: 'border-primary text-primary',
  };

  return (
    <button
      onClick={onClick}
      className={`bg-surface-light ${borderColor[color]} ${recommended ? 'border-3' : 'border'} rounded-2xl py-3 px-2 text-center transition-colors hover:bg-surface-card shadow-sm`}
    >
      <div className="font-semibold text-sm">{label}</div>
      <div className="text-xs opacity-70 mt-0.5">{sublabel}</div>
      <kbd className="inline-block bg-surface-card rounded px-1.5 py-0.5 text-[10px] mt-1 text-text-muted">
        {recommended ? '↵' : shortcut}
      </kbd>
    </button>
  );
}
