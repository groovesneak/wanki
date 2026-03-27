import { useState, useEffect } from 'react';
import type { View } from '../types';
import { getDifficultWords, clearDifficultWords, getAllDecks, type DifficultWordSummary } from '../db';

interface Props {
  navigate: (view: View) => void;
}

export function DifficultWords({ navigate }: Props) {
  const [words, setWords] = useState<DifficultWordSummary[]>([]);
  const [deckNames, setDeckNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortAlpha, setSortAlpha] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

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

  const handleClearAll = async () => {
    const deckIds = [...new Set(words.map((w) => w.deckId))];
    for (const id of deckIds) {
      await clearDifficultWords(id);
    }
    setWords([]);
    setConfirmClear(false);
  };

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
        <div className="flex items-center gap-2">
          {confirmClear ? (
            <div className="relative flex items-center gap-1">
              <span className="absolute -top-4 left-0 right-0 text-center text-xs font-medium text-primary">Clear all?</span>
              <button
                onClick={handleClearAll}
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
              className="text-text-muted hover:text-danger p-2 transition-all"
              title="Clear all difficult words"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
          )}
        </div>
      </div>

      <h2 className="text-2xl font-bold mb-4">Difficult Words</h2>

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
          {filtered.map((dw, i) => (
            <div
              key={`${dw.word}-${dw.deckId}-${i}`}
              className="bg-surface-light rounded-2xl p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-lg">{dw.word}</span>
                  <span className="text-text-muted text-xs ml-2">{deckNames[dw.deckId] || 'Unknown deck'}</span>
                </div>
                <span className="bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded-full">
                  {dw.count}x
                </span>
              </div>
              <div className="mt-2 space-y-1">
                {dw.examples.map((ex, j) => (
                  <div key={j} className="text-xs text-text-muted">
                    <span className="text-text">{ex.cardFront}</span>
                    <span className="mx-1.5">→</span>
                    <span className="text-text">{ex.cardBack}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
