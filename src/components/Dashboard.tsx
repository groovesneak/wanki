import { useState, useEffect } from 'react';
import type { Deck, View } from '../types';
import { useDecks } from '../hooks/useDecks';
import { DeckStats } from './DeckStats';
import { ImportCSV } from './ImportCSV';
import { getStreak, getSetting, setSetting, type StreakData } from '../db';

interface Props {
  navigate: (view: View) => void;
}

export function Dashboard({ navigate }: Props) {
  const { decks, loading, createDeck, removeDeck, refresh } = useDecks();
  const [newDeckName, setNewDeckName] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [streak, setStreak] = useState<StreakData>({ count: 0, lastDate: '' });
  const [showSettings, setShowSettings] = useState(false);
  const [newDayHour, setNewDayHour] = useState(6);
  const [dailyGoal, setDailyGoal] = useState(10);
  const [defaultCardLimit, setDefaultCardLimit] = useState(30);

  useEffect(() => {
    getStreak().then(setStreak);
    getSetting<number>('newDayStartHour', 6).then(setNewDayHour);
    getSetting<number>('dailyGoal', 10).then(setDailyGoal);
    getSetting<number>('defaultNewCardsPerDay', 30).then(setDefaultCardLimit);
  }, []);

  const handleCreate = async () => {
    const name = newDeckName.trim();
    if (!name) return;
    await createDeck(name);
    setNewDeckName('');
    setShowInput(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen text-text-muted">Loading...</div>;
  }

  return (
    <div className="min-h-screen p-6 max-w-2xl mx-auto">
      {/* Action buttons */}
      <div className="flex items-center mb-4 pt-4">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="text-text-muted hover:text-text p-2 transition-colors"
          title="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
        <div className="flex gap-2 ml-auto">
          <button
            onClick={() => { setShowImport(true); setShowInput(false); }}
            className="bg-surface-light border border-primary text-primary px-4 py-2 rounded-full font-medium transition-colors shadow-sm text-sm hover:bg-primary/10"
          >
            Import CSV
          </button>
          <button
            onClick={() => { setShowInput(true); setShowImport(false); }}
            className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-full font-medium transition-colors shadow-sm text-sm"
          >
            + New Deck
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="bg-surface-light rounded-2xl p-5 mb-3 shadow-sm">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">Settings</h3>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Minimum daily goal (cards complete)</label>
            <div className="flex items-center gap-0 border border-primary rounded-full overflow-hidden">
              <button
                onClick={async () => {
                  const val = Math.max(1, dailyGoal - 1);
                  setDailyGoal(val);
                  await setSetting('dailyGoal', val);
                }}
                className="px-2.5 py-1.5 text-primary hover:bg-primary/10 transition-colors text-sm font-bold"
              >
                −
              </button>
              <input
                type="number"
                min={1}
                value={dailyGoal}
                onChange={async (e) => {
                  const val = Math.max(1, Number(e.target.value) || 1);
                  setDailyGoal(val);
                  await setSetting('dailyGoal', val);
                }}
                className="w-10 text-center text-sm font-medium text-primary bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                onClick={async () => {
                  const val = dailyGoal + 1;
                  setDailyGoal(val);
                  await setSetting('dailyGoal', val);
                }}
                className="px-2.5 py-1.5 text-primary hover:bg-primary/10 transition-colors text-sm font-bold"
              >
                +
              </button>
            </div>
          </div>
          <p className="text-xs text-text-muted mt-1 mb-3">Streak stays alive when you reach your daily goal, or complete all available cards.</p>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium">Default deck new card daily limit</label>
            <div className="flex items-center gap-0 border border-primary rounded-full overflow-hidden">
              <button
                onClick={async () => {
                  const val = Math.max(1, defaultCardLimit - 1);
                  setDefaultCardLimit(val);
                  await setSetting('defaultNewCardsPerDay', val);
                }}
                className="px-2.5 py-1.5 text-primary hover:bg-primary/10 transition-colors text-sm font-bold"
              >
                −
              </button>
              <input
                type="number"
                min={1}
                value={defaultCardLimit}
                onChange={async (e) => {
                  const val = Math.max(1, Number(e.target.value) || 1);
                  setDefaultCardLimit(val);
                  await setSetting('defaultNewCardsPerDay', val);
                }}
                className="w-10 text-center text-sm font-medium text-primary bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                onClick={async () => {
                  const val = defaultCardLimit + 1;
                  setDefaultCardLimit(val);
                  await setSetting('defaultNewCardsPerDay', val);
                }}
                className="px-2.5 py-1.5 text-primary hover:bg-primary/10 transition-colors text-sm font-bold"
              >
                +
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">New day starts at</label>
            <select
              value={newDayHour}
              onChange={async (e) => {
                const val = Number(e.target.value);
                setNewDayHour(val);
                await setSetting('newDayStartHour', val);
              }}
              className="bg-surface-light border border-primary text-primary rounded-full px-4 py-1.5 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/50 appearance-none cursor-pointer"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>
                  {i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Wanki bar */}
      <div className="bg-surface-light rounded-2xl p-5 mb-3 flex items-center justify-between shadow-sm">
        <h1 className="text-5xl font-extrabold tracking-tight text-primary">Wanki</h1>
        <div className="flex items-center gap-2" style={{ marginRight: '46px' }}>
          <span className={`text-3xl ${streak.count > 0 && streak.lastDate === new Date().toISOString().slice(0, 10) ? '' : 'opacity-40 grayscale'}`}>🔥</span>
          <span className="text-3xl font-bold text-primary">{streak.count}</span>
        </div>
      </div>

      {showImport && (
        <ImportCSV
          onClose={() => setShowImport(false)}
          navigate={navigate}
          onDeckCreated={refresh}
        />
      )}

      {showInput && (
        <div className="bg-surface-light rounded-2xl p-4 mb-6 flex gap-3 shadow-sm">
          <input
            autoFocus
            type="text"
            placeholder="Deck name..."
            value={newDeckName}
            onChange={(e) => setNewDeckName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            className="flex-1 bg-surface-card rounded-xl px-4 py-2 text-text outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button
            onClick={handleCreate}
            className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Create
          </button>
          <button
            onClick={() => { setShowInput(false); setNewDeckName(''); }}
            className="text-text-muted hover:text-text px-3 py-2 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {decks.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">📚</div>
          <h2 className="text-xl font-semibold mb-2">No decks yet</h2>
          <p className="text-text-muted">Create your first deck to start learning</p>
        </div>
      ) : (
        <div className="space-y-3">
          {decks.map((deck) => (
            <DeckCard
              key={deck.id}
              deck={deck}
              onOpen={() => navigate({ type: 'deck', deckId: deck.id })}
              onStudy={() => navigate({ type: 'review', deckId: deck.id })}
              onDelete={() => removeDeck(deck.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DeckCard({
  deck,
  onOpen,
  onStudy,
  onDelete,
}: {
  deck: Deck;
  onOpen: () => void;
  onStudy: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="bg-surface-light rounded-2xl p-5 hover:bg-surface-card/60 transition-colors group shadow-sm">
      <div className="flex items-center justify-between">
        <button onClick={onOpen} className="flex-1 text-left">
          <h3 className="text-lg font-semibold">{deck.name}</h3>
          <DeckStats deckId={deck.id} />
        </button>
        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={onStudy}
            className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-full text-sm font-medium transition-colors shadow-sm"
          >
            Study
          </button>
          {confirming ? (
            <div className="flex gap-1">
              <button
                onClick={onDelete}
                className="bg-danger/20 hover:bg-danger/30 text-danger px-3 py-2 rounded-lg text-sm transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="text-text-muted hover:text-text px-2 py-2 text-sm transition-colors"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger p-2 transition-all"
              title="Delete deck"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
