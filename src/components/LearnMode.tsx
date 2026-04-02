import { useState, useEffect, useRef, useCallback } from 'react';
import type { Card, View } from '../types';
import { getCard, getSetting } from '../db';

interface Props {
  deckId: string;
  cardId: string;
  navigate: (view: View) => void;
}

// ── Shared grading utilities (duplicated from ReviewSession for independence) ──

function normalize(s: string, hardMode = false): string {
  if (hardMode) return s;
  return s.toLowerCase().replace(/[^a-zA-Z0-9\u00C0-\u024F]/g, '');
}

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

function expandAlternatives(correct: string): string[] {
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

function bestAlternative(typed: string, correct: string, hardMode = false): string {
  const alts = expandAlternatives(correct);
  if (alts.length === 1) return correct;
  const nt = normalize(typed, hardMode);
  let best = alts[0];
  let bestDist = Infinity;
  for (const alt of alts) {
    const dist = editDistance(nt, normalize(alt, hardMode));
    if (dist < bestDist) { bestDist = dist; best = alt; }
  }
  return best;
}

function checkAnswer(typed: string, correct: string, hardMode = false): boolean {
  const alts = expandAlternatives(correct);
  const nt = normalize(typed, hardMode);
  return alts.some((alt) => normalize(alt, hardMode) === nt);
}

type CharColor = 'correct' | 'incorrect' | 'missing';

interface DiffResult {
  typedChars: { char: string; color: CharColor }[];
  correctErrors: boolean[];
}

function dualDiff(typed: string, correct: string, hardMode = false): DiffResult {
  const best = bestAlternative(typed, correct, hardMode);
  const nt = normalize(typed, hardMode);
  const nc = normalize(best, hardMode);
  const m = nt.length;
  const n = nc.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = nt[i - 1] === nc[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const normColors: CharColor[] = Array(m).fill('incorrect');
  const correctErr: boolean[] = Array(n).fill(false);
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (nt[i - 1] === nc[j - 1]) { normColors[i - 1] = 'correct'; i--; j--; }
    else if (dp[i - 1][j - 1] <= dp[i - 1][j] && dp[i - 1][j - 1] <= dp[i][j - 1]) {
      normColors[i - 1] = 'incorrect'; correctErr[j - 1] = true; i--; j--;
    } else if (dp[i - 1][j] <= dp[i][j - 1]) { normColors[i - 1] = 'incorrect'; i--; }
    else { correctErr[j - 1] = true; j--; }
  }
  while (i > 0) { normColors[i - 1] = 'incorrect'; i--; }
  while (j > 0) { correctErr[j - 1] = true; j--; }

  // Map back to original typed chars
  const result: { char: string; color: CharColor }[] = [];
  let normIdx = 0;
  for (const ch of typed) {
    const stripped = hardMode ? ch : ch.toLowerCase().replace(/[^a-zA-Z0-9\u00C0-\u024F]/g, '');
    if (stripped === '') { result.push({ char: ch, color: 'correct' }); }
    else { result.push({ char: ch, color: normColors[normIdx++] }); }
  }

  // Add missing chars as "-" placeholders
  const missingIndices: number[] = [];
  j = 0;
  const ntChars = nt.split('');
  const ncChars = nc.split('');
  // Re-trace to find insertions
  const dp2 = dp;
  i = m; j = n;
  while (i > 0 && j > 0) {
    if (ntChars[i-1] === ncChars[j-1]) { i--; j--; }
    else if (dp2[i-1][j-1] <= dp2[i-1][j] && dp2[i-1][j-1] <= dp2[i][j-1]) { i--; j--; }
    else if (dp2[i-1][j] <= dp2[i][j-1]) { i--; }
    else { missingIndices.unshift(i); j--; }
  }
  while (j > 0) { missingIndices.unshift(0); j--; }

  // Insert missing placeholders
  let offset = 0;
  for (const idx of missingIndices) {
    // Find the position in the result array
    let pos = 0;
    let normCount = 0;
    for (let k = 0; k < result.length + offset; k++) {
      if (k >= result.length) { pos = result.length; break; }
      const c = result[k];
      const s = hardMode ? c.char : c.char.toLowerCase().replace(/[^a-zA-Z0-9\u00C0-\u024F]/g, '');
      if (s !== '') normCount++;
      if (normCount > idx) { pos = k; break; }
      pos = k + 1;
    }
    result.splice(pos, 0, { char: '-', color: 'missing' });
    offset++;
  }

  return { typedChars: result, correctErrors: correctErr };
}

type GradeTier = { label: string; bg: string; text: string };

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

function getAccuracyPercent(typed: string, correct: string, hardMode = false): number {
  if (checkAnswer(typed, correct, hardMode)) return 100;
  const best = bestAlternative(typed, correct, hardMode);
  const nt = normalize(typed, hardMode);
  const nc = normalize(best, hardMode);
  const dist = editDistance(nt, nc);
  const maxLen = Math.max(nt.length, nc.length, 1);
  return Math.max(0, Math.round(((maxLen - dist) / maxLen) * 100));
}

function highlightCorrectAnswer(correct: string, normErrors: boolean[], hardMode = false): { char: string; highlight: boolean }[] {
  const result: { char: string; highlight: boolean }[] = [];
  let normIdx = 0;
  for (const ch of correct) {
    const stripped = hardMode ? ch : ch.toLowerCase().replace(/[^a-zA-Z0-9\u00C0-\u024F]/g, '');
    if (stripped === '') {
      result.push({ char: ch, highlight: false });
    } else {
      result.push({ char: ch, highlight: normIdx < normErrors.length && normErrors[normIdx] });
      normIdx++;
    }
  }
  return result;
}

// ── Component ──

export function LearnMode({ deckId, cardId, navigate }: Props) {
  const [card, setCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAnswer, setShowAnswer] = useState(true);
  const [answer, setAnswer] = useState('');
  const [checked, setChecked] = useState(false);
  const [hardMode, setHardMode] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    (async () => {
      const c = await getCard(cardId);
      setCard(c || null);
      const hm = await getSetting<boolean>(`hardMode:${deckId}`, false);
      setHardMode(hm);
      setLoading(false);
    })();
  }, [cardId, deckId]);

  const handleCheck = useCallback(() => {
    if (!answer.trim()) return;
    setChecked(true);
  }, [answer]);

  const handleReset = useCallback(() => {
    setAnswer('');
    setChecked(false);
    textareaRef.current?.focus();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-screen text-text-muted">Loading...</div>;
  }

  if (!card) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <p className="text-text-muted mb-4">Card not found</p>
        <button
          onClick={() => navigate({ type: 'deck', deckId })}
          className="bg-primary hover:bg-primary-hover text-white px-5 py-2.5 rounded-lg font-medium transition-colors"
        >
          Back to deck
        </button>
      </div>
    );
  }

  const isCorrect = checked ? checkAnswer(answer, card.back, hardMode) : false;
  const diff = checked && !isCorrect ? dualDiff(answer, card.back, hardMode) : null;
  const bestAlt = checked ? bestAlternative(answer, card.back, hardMode) : card.back;
  const highlighted = diff ? highlightCorrectAnswer(bestAlt, diff.correctErrors, hardMode) : null;
  const tier = checked ? getGradeTier(answer, card.back, hardMode) : null;
  const pct = checked ? getAccuracyPercent(answer, card.back, hardMode) : 0;

  return (
    <div className="min-h-screen flex flex-col p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate({ type: 'deck', deckId })}
          className="text-text-muted hover:text-text text-sm inline-flex items-center gap-1 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          Back to deck
        </button>
        <span className="text-sm text-primary font-medium">Learn Mode</span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-5">
        {/* Card */}
        <div className="bg-surface-light rounded-2xl p-8 w-full max-w-lg shadow-md">
          {/* Question */}
          <p className="text-xl text-center leading-relaxed whitespace-pre-wrap mb-6">{card.front}</p>

          {/* Divider */}
          <div className="border-t border-surface-card mb-6" />

          {/* Answer section */}
          {showAnswer && !checked && (
            <p className="text-xl text-center leading-relaxed whitespace-pre-wrap text-text-muted mb-6">{card.back}</p>
          )}

          {/* Checked result — show highlighted answer */}
          {checked && (
            <div className="flex flex-col items-center gap-3 mb-6">
              {isCorrect ? (
                <p className="text-xl text-center leading-relaxed whitespace-pre-wrap text-success">{answer}</p>
              ) : (
                <>
                  {/* Correct answer with highlighting */}
                  {highlighted && (
                    <p className="text-xl text-center leading-relaxed whitespace-pre-wrap">
                      {groupHighlighted(highlighted).map((g, i) => (
                        g.highlight ? (
                          <span key={i} className="bg-surface-light border border-primary text-primary rounded px-1 py-0.5 mx-[1px]">{g.text}</span>
                        ) : (<span key={i}>{g.text}</span>)
                      ))}
                    </p>
                  )}

                  {/* Typed answer diff */}
                  {diff && (() => {
                    const groups: { text: string; color: CharColor }[] = [];
                    for (const c of diff.typedChars) {
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
                </>
              )}

              {/* Grade label */}
              {tier && (
                <div className={`px-6 py-3 rounded-full text-xl font-bold ${tier.bg} ${tier.text}`}>
                  {tier.label}
                </div>
              )}

              {/* Accuracy bar */}
              <div className="w-full flex items-center gap-3">
                <div className="flex-1 h-4 bg-surface-card rounded-full overflow-hidden shadow-inner">
                  <div
                    className={`h-full ${pct === 100 ? 'bg-success' : pct >= 70 ? 'bg-white border-2 border-primary' : 'bg-primary'} rounded-full transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className={`text-sm font-bold ${pct === 100 ? 'text-success' : 'text-primary'} min-w-[3ch] text-right`}>{pct}%</span>
              </div>
            </div>
          )}

          {/* Text input */}
          {!checked && (
            <textarea
              ref={textareaRef}
              autoFocus
              placeholder="Type the answer..."
              value={answer}
              onChange={(e) => { setAnswer(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleCheck();
                }
              }}
              rows={1}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="w-full bg-surface-card rounded-xl px-4 py-3 text-text text-center text-lg outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-text-muted/50 resize-none overflow-hidden"
            />
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-2">
          {!checked ? (
            <>
              <button
                onClick={() => setShowAnswer(!showAnswer)}
                className="bg-surface-light border border-primary text-primary px-5 py-2 rounded-full text-sm font-medium transition-colors shadow-sm hover:bg-primary/10"
              >
                {showAnswer ? 'Hide answer' : 'Show answer'}
              </button>
              <button
                onClick={handleCheck}
                disabled={!answer.trim()}
                className="bg-primary hover:bg-primary-hover disabled:opacity-50 text-white px-5 py-2 rounded-full text-sm font-medium transition-colors shadow-sm"
              >
                Check
              </button>
            </>
          ) : (
            <button
              onClick={handleReset}
              className="bg-primary hover:bg-primary-hover text-white px-5 py-2 rounded-full text-sm font-medium transition-colors shadow-sm"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──

function groupHighlighted(chars: { char: string; highlight: boolean }[]): { text: string; highlight: boolean }[] {
  const groups: { text: string; highlight: boolean }[] = [];
  for (const c of chars) {
    // Don't include leading/trailing spaces in highlighted groups
    const last = groups[groups.length - 1];
    if (last && last.highlight === c.highlight) {
      last.text += c.char;
    } else {
      groups.push({ text: c.char, highlight: c.highlight });
    }
  }
  // Trim spaces from highlighted groups
  return groups.map((g) => {
    if (g.highlight) {
      return { text: g.text.trim(), highlight: true };
    }
    return g;
  }).filter((g) => g.text.length > 0);
}
