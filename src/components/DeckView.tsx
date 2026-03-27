import { useState, useEffect } from 'react';
import type { Card, View } from '../types';
import { useCards } from '../hooks/useCards';
import { getNextReviewLabel } from '../srs';
import { getSetting, setSetting } from '../db';

const FALLBACK_NEW_CARDS_PER_DAY = 30;

interface Props {
  deckId: string;
  deckName: string;
  navigate: (view: View) => void;
}

export function DeckView({ deckId, deckName, navigate }: Props) {
  const { cards, dueCards, loading, addNewCard, editCard, removeCard, resetCard, resetAllCards } = useCards(deckId);
  const [showAdd, setShowAdd] = useState(false);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [confirmResetAll, setConfirmResetAll] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFrontVal, setEditFrontVal] = useState('');
  const [editBackVal, setEditBackVal] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [dailyLimit, setDailyLimit] = useState(FALLBACK_NEW_CARDS_PER_DAY);
  const [sortAlpha, setSortAlpha] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Load the saved daily limit (per-deck → global default → hardcoded fallback)
  useEffect(() => {
    (async () => {
      const globalDefault = await getSetting<number>('defaultNewCardsPerDay', FALLBACK_NEW_CARDS_PER_DAY);
      const perDeck = await getSetting<number>(`newCardsPerDay:${deckId}`, globalDefault);
      setDailyLimit(perDeck);
    })();
  }, [deckId]);

  const handleAdd = async () => {
    if (!front.trim() || !back.trim()) return;
    await addNewCard(front.trim(), back.trim());
    setFront('');
    setBack('');
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen text-text-muted">Loading...</div>;
  }

  return (
    <div className="min-h-screen p-6 max-w-2xl mx-auto">
      <header className="mb-6">
        <button
          onClick={() => navigate({ type: 'dashboard' })}
          className="text-text-muted hover:text-text text-sm mb-3 inline-flex items-center gap-1 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          Back to decks
        </button>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{deckName}</h1>
          <div className="flex gap-2">
            {dueCards.length > 0 && (
              <button
                onClick={() => navigate({ type: 'review', deckId })}
                className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-full font-medium transition-colors shadow-sm"
              >
                Study ({dueCards.length} due)
              </button>
            )}
            <button
              onClick={() => setShowAdd(true)}
              className="bg-surface-light border border-primary text-primary px-4 py-2 rounded-full font-medium transition-colors shadow-sm text-sm hover:bg-primary/10"
            >
              + Add Card
            </button>
            <button
              onClick={() => setShowSettings((s) => !s)}
              className="text-text-muted hover:text-text p-2 transition-colors"
              title="Deck settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
        </div>
      </header>

      {showSettings && (
        <div className="bg-surface-light rounded-2xl shadow-sm p-5 mb-6">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">Deck Settings</h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">New cards per day</p>
              <p className="text-sm text-text-muted">Limit how many unseen cards are introduced each day</p>
            </div>
            <div className="grid grid-cols-[32px_1fr_32px] items-center border border-primary rounded-full w-[130px]">
              <button
                onClick={async () => {
                  const val = Math.max(0, dailyLimit - 1);
                  setDailyLimit(val);

                  await setSetting(`newCardsPerDay:${deckId}`, val);
                }}
                className="py-1.5 text-primary hover:bg-primary/10 transition-colors text-sm font-bold text-center rounded-l-full"
              >
                −
              </button>
              <input
                type="number"
                min={0}
                value={dailyLimit}
                onChange={async (e) => {
                  const val = Math.max(0, Number(e.target.value) || 0);
                  setDailyLimit(val);

                  await setSetting(`newCardsPerDay:${deckId}`, val);
                }}
                className="w-full text-center text-sm font-medium text-primary bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                onClick={async () => {
                  const val = dailyLimit + 1;
                  setDailyLimit(val);

                  await setSetting(`newCardsPerDay:${deckId}`, val);
                }}
                className="py-1.5 text-primary hover:bg-primary/10 transition-colors text-sm font-bold text-center rounded-r-full"
              >
                +
              </button>
            </div>
          </div>
          <div className="border-t border-surface-card/30 mt-4 pt-4 flex items-center justify-between">
            <div>
              <p className="font-medium">Reset spaced repetition</p>
              <p className="text-sm text-text-muted">Reset all cards to unseen - all progress will be cleared</p>
            </div>
            {confirmResetAll ? (
              <div className="relative flex items-center gap-1">
                <span className="absolute -top-4 left-0 right-0 text-center text-xs font-medium text-primary">Reset Deck?</span>
                <button
                  onClick={async () => { await resetAllCards(); setConfirmResetAll(false); }}
                  className="bg-surface-light border border-primary text-primary px-3 py-2 rounded-full text-xs font-medium transition-colors shadow-sm hover:bg-primary hover:text-white"
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirmResetAll(false)}
                  className="bg-surface-light border border-primary text-primary px-3 py-2 rounded-full text-xs font-medium transition-colors shadow-sm hover:bg-primary hover:text-white"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmResetAll(true)}
                className="bg-primary hover:bg-primary-hover text-white py-2 rounded-full font-medium transition-colors shadow-sm text-sm w-[130px] text-center"
              >
                Reset all cards
              </button>
            )}
          </div>
        </div>
      )}

      {showAdd && (
        <div className="bg-surface-light rounded-2xl shadow-sm p-5 mb-6 space-y-3">
          <textarea
            autoFocus
            placeholder="Front (question)..."
            value={front}
            onChange={(e) => setFront(e.target.value)}
            className="w-full bg-surface-card rounded-lg px-4 py-3 text-text outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            rows={2}
          />
          <textarea
            placeholder="Back (answer)..."
            value={back}
            onChange={(e) => setBack(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) handleAdd(); }}
            className="w-full bg-surface-card rounded-lg px-4 py-3 text-text outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            rows={2}
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowAdd(false); setFront(''); setBack(''); }}
              className="text-text-muted hover:text-text px-4 py-2 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Add Card
            </button>
          </div>
        </div>
      )}

      {cards.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🃏</div>
          <h2 className="text-xl font-semibold mb-2">No cards yet</h2>
          <p className="text-text-muted">Add your first card to start learning</p>
        </div>
      ) : (
        <>
        {/* Search and sort toolbar */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 relative">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input
              type="text"
              placeholder="Search cards..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface-light rounded-full pl-9 pr-4 py-2 text-sm text-text outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-text-muted/50 shadow-sm"
            />
          </div>
          <button
            onClick={() => setSortAlpha((s) => !s)}
            className={`px-3 py-2 rounded-full text-sm font-medium transition-colors shadow-sm ${sortAlpha ? 'bg-primary text-white' : 'bg-surface-light border border-primary text-primary hover:bg-primary/10'}`}
            title="Sort alphabetically"
          >
            A→Z
          </button>
        </div>
        <div className="space-y-2">
          {(() => {
            let filtered = cards;
            if (searchQuery.trim()) {
              const q = searchQuery.toLowerCase();
              filtered = filtered.filter((c) => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q));
            }
            if (sortAlpha) {
              filtered = [...filtered].sort((a, b) => a.front.localeCompare(b.front));
            }
            return filtered;
          })().map((card) => (
            <CardRow
              key={card.id}
              card={card}
              deleting={deleting}
              editingId={editingId}
              editFrontVal={editFrontVal}
              editBackVal={editBackVal}
              onStartEdit={() => {
                setEditingId(card.id);
                setEditFrontVal(card.front);
                setEditBackVal(card.back);
              }}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={async () => {
                if (editFrontVal.trim() && editBackVal.trim()) {
                  await editCard(card.id, editFrontVal.trim(), editBackVal.trim());
                  setEditingId(null);
                }
              }}
              onEditFrontChange={setEditFrontVal}
              onEditBackChange={setEditBackVal}
              onSwap={() => {
                const tmp = editFrontVal;
                setEditFrontVal(editBackVal);
                setEditBackVal(tmp);
              }}
              onStartDelete={() => setDeleting(card.id)}
              onConfirmDelete={() => { removeCard(card.id); setDeleting(null); }}
              onCancelDelete={() => setDeleting(null)}
              resetting={resetting}
              onStartReset={() => setResetting(card.id)}
              onConfirmReset={() => { resetCard(card.id); setResetting(null); }}
              onCancelReset={() => setResetting(null)}
            />
          ))}
        </div>
        </>
      )}
    </div>
  );
}

function CardRow({
  card,
  deleting,
  editingId,
  editFrontVal,
  editBackVal,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditFrontChange,
  onEditBackChange,
  onSwap,
  onStartDelete,
  onConfirmDelete,
  onCancelDelete,
  resetting,
  onStartReset,
  onConfirmReset,
  onCancelReset,
}: {
  card: Card;
  deleting: string | null;
  editingId: string | null;
  editFrontVal: string;
  editBackVal: string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onEditFrontChange: (v: string) => void;
  onEditBackChange: (v: string) => void;
  onSwap: () => void;
  onStartDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  resetting: string | null;
  onStartReset: () => void;
  onConfirmReset: () => void;
  onCancelReset: () => void;
}) {
  const isEditing = editingId === card.id;

  if (isEditing) {
    return (
      <div className="bg-surface-light rounded-2xl shadow-sm p-4 space-y-2">
        <input
          autoFocus
          value={editFrontVal}
          onChange={(e) => onEditFrontChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSaveEdit(); if (e.key === 'Escape') onCancelEdit(); }}
          className="w-full bg-surface-card rounded-lg px-3 py-2 text-text text-sm outline-none focus:ring-2 focus:ring-primary/50"
          placeholder="Front..."
        />
        <input
          value={editBackVal}
          onChange={(e) => onEditBackChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSaveEdit(); if (e.key === 'Escape') onCancelEdit(); }}
          className="w-full bg-surface-card rounded-lg px-3 py-2 text-text text-sm outline-none focus:ring-2 focus:ring-primary/50"
          placeholder="Back..."
        />
        <div className="flex gap-2 justify-between">
          <button
            onClick={onSwap}
            className="bg-surface-light border border-primary text-primary px-3 py-1.5 rounded-full text-xs font-medium transition-colors shadow-sm hover:bg-primary/10 flex items-center gap-1"
            title="Swap front and back"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 16V4m0 0L3 8m4-4l4 4"/><path d="M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>
            Swap
          </button>
          <div className="flex gap-2">
            <button onClick={onCancelEdit} className="text-text-muted hover:text-text text-xs px-3 py-1.5 transition-colors">
              Cancel
            </button>
            <button onClick={onSaveEdit} className="bg-primary hover:bg-primary-hover text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors">
              Save
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-light rounded-2xl shadow-sm p-4 flex items-center justify-between group">
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{card.front}</p>
        <p className="text-sm text-text-muted truncate">{card.back}</p>
      </div>
      <div className="flex items-center gap-2 ml-4">
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all">
        <button
          onClick={onStartEdit}
          className="text-text-muted hover:text-primary p-1 transition-all"
          title="Edit card"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
        </button>
        {card.repetitions > 0 && (
          resetting === card.id ? (
            <div className="flex gap-1">
              <button
                onClick={onConfirmReset}
                className="text-warning text-xs px-2 py-1 rounded bg-warning/20 hover:bg-warning/30 transition-colors"
              >
                Reset
              </button>
              <button
                onClick={onCancelReset}
                className="text-text-muted text-xs px-2 py-1 transition-colors"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={onStartReset}
              className="text-text-muted hover:text-warning p-1 transition-all"
              title="Reset spaced repetition"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            </button>
          )
        )}
        {deleting === card.id ? (
          <div className="flex gap-1">
            <button
              onClick={onConfirmDelete}
              className="text-danger text-xs px-2 py-1 rounded bg-danger/20 hover:bg-danger/30 transition-colors"
            >
              Delete
            </button>
            <button
              onClick={onCancelDelete}
              className="text-text-muted text-xs px-2 py-1 transition-colors"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={onStartDelete}
            className="text-text-muted hover:text-danger p-1 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          </button>
        )}
        </div>
        <span className={`text-xs font-medium py-1 rounded-full text-center w-[80px] shrink-0 ${
          card.repetitions === 0 && card.interval === 0 && card.dueDate <= card.createdAt
            ? 'bg-surface-light border border-text-muted text-text-muted'
            : 'bg-surface-light border border-primary text-primary'
        }`}>
          {getNextReviewLabel(card)}
        </span>
      </div>
    </div>
  );
}
