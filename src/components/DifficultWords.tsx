import { useState, useEffect } from 'react';
import type { View } from '../types';
import { getDifficultWords, clearAllDifficultWords, deleteDifficultWord, getAllDecks, type DifficultWordSummary } from '../db';

interface Props {
  navigate: (view: View) => void;
}

/** Highlight whole-word occurrences of `word` in `text` with bold */
function highlightWord(text: string, word: string) {
  if (!word) return <>{text}</>;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
  const parts: (string | React.ReactElement)[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <strong key={match.index} className="text-primary font-bold">{match[0]}</strong>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex === 0) return <>{text}</>;
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <>{parts}</>;
}

/** Deduplicate examples by cardFront+cardBack */
function dedupeExamples(examples: { typed: string; cardFront: string; cardBack: string }[]) {
  const seen = new Set<string>();
  return examples.filter((ex) => {
    const key = ex.cardFront.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function DifficultWords({ navigate }: Props) {
  const [words, setWords] = useState<DifficultWordSummary[]>([]);
  const [deckNames, setDeckNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortAlpha, setSortAlpha] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const [dw, decks] = await Promise.all([getDifficultWords(), getAllDecks()]);
      const names: Record<string, string> = {};
      for (const d of decks) names[d.id] = d.name;
      setDeckNames(names);
      setWords(dw.filter((w) => w.count >= 3));
      setLoading(false);
    })();
  }, []);

  let filtered = words.filter((w) =>
    w.word.toLowerCase().includes(search.toLowerCase())
  );

  if (sortAlpha) {
    filtered = [...filtered].sort((a, b) => a.word.localeCompare(b.word));
  }

  if (loading) {
    return <div className="flex items-center justify-center h-screen text-text-muted">Loading...</div>;
  }

  return (
    <div className="min-h-screen p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate({ type: 'dashboard' })}
          className="text-text-muted hover:text-text text-sm inline-flex items-center gap-1 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          Back to decks
        </button>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Difficult Words</h2>
        {filtered.length > 0 && (
          confirmClear ? (
            <div className="relative flex items-center gap-1">
              <span className="absolute -top-4 left-0 right-0 text-center text-xs font-medium text-primary">Clear all?</span>
              <button
                onClick={async () => {
                  await clearAllDifficultWords();
                  const updated = await getDifficultWords();
                  setWords(updated.filter((w) => w.count >= 3));
                  setConfirmClear(false);
                }}
                className="bg-surface-light border border-primary text-primary px-3 py-2 rounded-full text-xs font-medium transition-colors shadow-sm hover:bg-primary hover:text-white"
              >
                Yes
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                className="bg-surface-light border border-primary text-primary px-3 py-2 rounded-full text-xs font-medium transition-colors shadow-sm hover:bg-primary hover:text-white"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmClear(true)}
              className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-full text-sm font-medium transition-colors shadow-sm"
            >
              Clear List
            </button>
          )
        )}
      </div>

      {/* Search and sort */}
      <div className="flex items-center gap-2 mb-4">
        <input
          type="text"
          placeholder="Search words..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-surface-light rounded-xl px-4 py-2.5 text-text outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-text-muted/50 shadow-sm"
        />
        <button
          onClick={() => setSortAlpha(!sortAlpha)}
          className={`bg-surface-light border ${sortAlpha ? 'border-primary text-primary' : 'border-transparent text-text-muted'} px-3 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm`}
          title="Sort alphabetically"
        >
          A→Z
        </button>
      </div>

      {/* Words list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-text-muted">{search ? 'No words match your search' : 'No difficult words recorded yet'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((dw, i) => {
            const cardKey = `${dw.word}-${dw.deckId}-${i}`;
            const isExpanded = expandedId === cardKey;
            const uniqueExamples = dedupeExamples(dw.examples);

            return (
              <div
                key={cardKey}
                className="bg-surface-light rounded-2xl shadow-sm overflow-hidden"
              >
                {/* Collapsed row — always visible */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : cardKey)}
                  className="w-full p-4 flex items-center justify-between text-left hover:bg-surface-card/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-lg">{dw.word}</span>
                    <span className="text-text-muted text-xs">{deckNames[dw.deckId] || 'Unknown'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded-full">
                      {dw.count}x
                    </span>
                    {confirmingDeleteId === cardKey ? (
                      <div className="relative flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <span className="absolute -top-4 left-0 right-0 text-center text-xs font-medium text-primary">Delete?</span>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            await deleteDifficultWord(dw.word, dw.deckId);
                            const updated = await getDifficultWords();
                            setWords(updated.filter((w) => w.count >= 3));
                            setConfirmingDeleteId(null);
                          }}
                          className="bg-surface-light border border-primary text-primary px-3 py-1.5 rounded-full text-xs font-medium transition-colors shadow-sm hover:bg-primary hover:text-white"
                        >
                          Yes
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmingDeleteId(null); }}
                          className="bg-surface-light border border-primary text-primary px-3 py-1.5 rounded-full text-xs font-medium transition-colors shadow-sm hover:bg-primary hover:text-white"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmingDeleteId(cardKey); }}
                        className="text-text-muted hover:text-danger p-1 transition-colors"
                        title="Delete word"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                      </button>
                    )}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`text-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    >
                      <path d="m6 9 6 6 6-6"/>
                    </svg>
                  </div>
                </button>

                {/* Expanded examples */}
                {isExpanded && uniqueExamples.length > 0 && (
                  <div className="px-4 pb-4 space-y-2">
                    <div className="border-t border-surface-card pt-3">
                      {uniqueExamples.map((ex, j) => (
                        <div key={j} className="text-sm py-2">
                          <div className="text-text-muted">{ex.cardFront}</div>
                          <div className="text-text mt-0.5">{highlightWord(ex.cardBack, dw.word)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
