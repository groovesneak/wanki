import { useState, useEffect, useRef, useCallback } from 'react';
import type { Deck, View } from '../types';
import { useDecks } from '../hooks/useDecks';
import { DeckStats } from './DeckStats';
import { ImportCSV } from './ImportCSV';
import { getStreak, getSetting, setSetting, getDifficultWords, addDeck, addCardsBatch, type StreakData } from '../db';
import { parseApkg } from '../apkg';
import { createNewCard } from '../srs';

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
  const [difficultWordCount, setDifficultWordCount] = useState(0);
  const [apkgImporting, setApkgImporting] = useState(false);
  const [apkgError, setApkgError] = useState('');
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [deckDoneMap, setDeckDoneMap] = useState<Record<string, boolean>>({});
  const apkgInputRef = useRef<HTMLInputElement>(null);

  const allDone = decks.length > 0 && decks.every((d) => deckDoneMap[d.id]);

  const handleDeckDone = useCallback((deckId: string, done: boolean) => {
    setDeckDoneMap((prev) => ({ ...prev, [deckId]: done }));
  }, []);

  useEffect(() => {
    getStreak().then(setStreak);
    getSetting<number>('newDayStartHour', 6).then(setNewDayHour);
    getSetting<number>('dailyGoal', 10).then(setDailyGoal);
    getSetting<number>('defaultNewCardsPerDay', 30).then(setDefaultCardLimit);
    getDifficultWords().then((dw) => setDifficultWordCount(dw.filter((w) => w.count >= 3).length));
  }, []);

  const handleCreate = async () => {
    const name = newDeckName.trim();
    if (!name) return;
    await createDeck(name);
    setNewDeckName('');
    setShowInput(false);
  };

  const handleApkgImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setApkgImporting(true);
    setApkgError('');
    try {
      const { cards, deckName } = await parseApkg(file);
      if (cards.length === 0) {
        setApkgError('No cards found in the .apkg file');
        setApkgImporting(false);
        return;
      }
      const deck: Deck = {
        id: crypto.randomUUID(),
        name: deckName,
        createdAt: Date.now(),
      };
      await addDeck(deck);
      const newCards = cards.map((c) => createNewCard(deck.id, c.front, c.back));
      await addCardsBatch(newCards);
      refresh();
      navigate({ type: 'deck', deckId: deck.id });
    } catch (err) {
      setApkgError(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    setApkgImporting(false);
    if (apkgInputRef.current) apkgInputRef.current.value = '';
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
          <div className="relative">
            <button
              onClick={() => setShowImportMenu(!showImportMenu)}
              disabled={apkgImporting}
              className={`bg-surface-light border ${allDone ? 'border-success text-success hover:bg-success/10' : 'border-primary text-primary hover:bg-primary/10'} px-4 py-2 rounded-full font-medium transition-colors shadow-sm text-sm disabled:opacity-50`}
            >
              {apkgImporting ? 'Importing...' : 'Import'}
            </button>
            {showImportMenu && (
              <div className="absolute right-0 mt-2 bg-surface-light border border-surface-card rounded-xl shadow-lg overflow-hidden z-10 min-w-[140px]">
                <button
                  onClick={() => { setShowImport(true); setShowInput(false); setShowImportMenu(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-text hover:bg-primary hover:text-white transition-colors"
                >
                  Import CSV
                </button>
                <button
                  onClick={() => { apkgInputRef.current?.click(); setShowImportMenu(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-text hover:bg-primary hover:text-white transition-colors"
                >
                  Import .apkg
                </button>
              </div>
            )}
          </div>
          <input
            ref={apkgInputRef}
            type="file"
            accept=".apkg"
            onChange={handleApkgImport}
            className="hidden"
          />
          <button
            onClick={() => { setShowInput(true); setShowImport(false); }}
            className={`${allDone ? 'bg-success hover:bg-success/80' : 'bg-primary hover:bg-primary-hover'} text-white px-4 py-2 rounded-full font-medium transition-colors shadow-sm text-sm`}
          >
            + New Deck
          </button>
        </div>
      </div>

      {apkgError && (
        <div className="bg-danger/10 text-danger text-sm rounded-xl px-4 py-2 mb-3">{apkgError}</div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div className="bg-surface-light rounded-2xl p-5 mb-3 shadow-sm">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">Settings</h3>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Minimum daily goal (cards complete)</label>
            <div className={`flex items-center gap-0 border ${allDone ? 'border-success' : 'border-primary'} rounded-full overflow-hidden`}>
              <button
                onClick={async () => {
                  const val = Math.max(1, dailyGoal - 1);
                  setDailyGoal(val);
                  await setSetting('dailyGoal', val);
                }}
                className={`px-2.5 py-1.5 ${allDone ? 'text-success hover:bg-success/10' : 'text-primary hover:bg-primary/10'} transition-colors text-sm font-bold`}
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
                className={`w-10 text-center text-sm font-medium ${allDone ? 'text-success' : 'text-primary'} bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
              />
              <button
                onClick={async () => {
                  const val = dailyGoal + 1;
                  setDailyGoal(val);
                  await setSetting('dailyGoal', val);
                }}
                className={`px-2.5 py-1.5 ${allDone ? 'text-success hover:bg-success/10' : 'text-primary hover:bg-primary/10'} transition-colors text-sm font-bold`}
              >
                +
              </button>
            </div>
          </div>
          <p className="text-xs text-text-muted mt-1 mb-3">Streak stays alive when you reach your daily goal, or complete all available cards.</p>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium">Default deck new card daily limit</label>
            <div className={`flex items-center gap-0 border ${allDone ? 'border-success' : 'border-primary'} rounded-full overflow-hidden`}>
              <button
                onClick={async () => {
                  const val = Math.max(1, defaultCardLimit - 1);
                  setDefaultCardLimit(val);
                  await setSetting('defaultNewCardsPerDay', val);
                }}
                className={`px-2.5 py-1.5 ${allDone ? 'text-success hover:bg-success/10' : 'text-primary hover:bg-primary/10'} transition-colors text-sm font-bold`}
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
                className={`w-10 text-center text-sm font-medium ${allDone ? 'text-success' : 'text-primary'} bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
              />
              <button
                onClick={async () => {
                  const val = defaultCardLimit + 1;
                  setDefaultCardLimit(val);
                  await setSetting('defaultNewCardsPerDay', val);
                }}
                className={`px-2.5 py-1.5 ${allDone ? 'text-success hover:bg-success/10' : 'text-primary hover:bg-primary/10'} transition-colors text-sm font-bold`}
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
              className={`bg-surface-light border ${allDone ? 'border-success text-success focus:ring-success/50' : 'border-primary text-primary focus:ring-primary/50'} rounded-full px-4 py-1.5 text-sm font-medium outline-none focus:ring-2 appearance-none cursor-pointer`}
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
        <h1 className={`text-5xl font-extrabold tracking-tight ${allDone ? 'text-alldone' : 'text-primary'}`}>Wanki</h1>
        <div className="flex items-center gap-2" style={{ marginRight: '46px' }}>
          <span className={`text-4xl ${streak.count > 0 && streak.lastDate === new Date().toISOString().slice(0, 10) ? '' : 'opacity-40 grayscale'}`}>{allDone ? '🥦' : '🔥'}</span>
          <span className={`text-4xl font-bold ${allDone ? 'text-success' : 'text-primary'}`}>{streak.count}</span>
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
          <h2 className="text-xl font-semibold mb-2">No decks yet</h2>
          <p className="text-text-muted">Create one and have your first Wanki</p>
        </div>
      ) : (
        <div className="space-y-3">
          {decks.map((deck) => (
            <DeckCard
              key={deck.id}
              deck={deck}
              allDone={allDone}
              onOpen={() => navigate({ type: 'deck', deckId: deck.id })}
              onStudy={() => navigate({ type: 'review', deckId: deck.id })}
              onDelete={() => removeDeck(deck.id)}
              onDoneChange={(done) => handleDeckDone(deck.id, done)}
            />
          ))}
        </div>
      )}

      {/* Difficult Words deck card */}
      {difficultWordCount > 0 && (
        <div className="mt-3">
          <div className="bg-surface-light rounded-2xl p-5 hover:bg-surface-card/60 transition-colors shadow-sm cursor-pointer"
            onClick={() => navigate({ type: 'difficultWords' })}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Difficult Words</h3>
                <p className="text-sm text-text-muted mt-1">
                  <span className="text-primary font-medium">{difficultWordCount} word{difficultWordCount !== 1 ? 's' : ''}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DeckCard({
  deck,
  allDone,
  onOpen,
  onStudy,
  onDelete,
  onDoneChange,
}: {
  deck: Deck;
  allDone: boolean;
  onOpen: () => void;
  onStudy: () => void;
  onDelete: () => void;
  onDoneChange: (done: boolean) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [hardMode, setHardMode] = useState(false);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    getSetting<boolean>(`hardMode:${deck.id}`, false).then(setHardMode);
  }, [deck.id]);

  const toggleHardMode = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const newVal = !hardMode;
    setHardMode(newVal);
    await setSetting(`hardMode:${deck.id}`, newVal);
  };

  return (
    <div className={`bg-surface-light rounded-2xl p-5 hover:bg-surface-card/60 transition-colors group shadow-sm ${isDone ? (allDone ? 'border-2 border-alldone' : 'border-2 border-success') : ''}`}>
      <div className="flex items-center justify-between">
        <button onClick={onOpen} className="flex-1 text-left">
          <h3 className="text-lg font-semibold">{deck.name}</h3>
          <DeckStats deckId={deck.id} onDoneChange={(done) => { setIsDone(done); onDoneChange(done); }} />
        </button>
        <div className="flex items-center gap-2 ml-4">
          <div className="flex flex-col items-center gap-0.5" title="Hard Mode: exact match including capitals, spaces & punctuation">
            <span className={`text-[10px] font-semibold leading-none ${hardMode ? (isDone ? (allDone ? 'text-alldone' : 'text-success') : 'text-primary') : 'text-text-muted'}`}>Hard</span>
            <button
              onClick={toggleHardMode}
              className={`relative w-10 h-5 rounded-full transition-colors ${hardMode ? (isDone ? (allDone ? 'bg-alldone' : 'bg-success') : 'bg-primary') : 'bg-surface-card'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${hardMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
            <span className={`text-[10px] font-semibold leading-none ${hardMode ? (isDone ? (allDone ? 'text-alldone' : 'text-success') : 'text-primary') : 'text-text-muted'}`}>Mode</span>
          </div>
          <button
            onClick={onStudy}
            className={`${isDone ? (allDone ? 'bg-alldone hover:bg-alldone/80' : 'bg-success hover:bg-success/80') : 'bg-primary hover:bg-primary-hover'} text-white px-4 py-2 rounded-full text-sm font-medium transition-colors shadow-sm`}
          >
            {isDone ? 'Done' : 'Study'}
          </button>
          {confirming ? (
            <div className="relative flex items-center gap-1">
              <span className="absolute -top-4 left-0 right-0 text-center text-xs font-medium text-primary">Delete?</span>
              <button
                onClick={onDelete}
                className="bg-surface-light border border-primary text-primary px-3 py-2 rounded-full text-xs font-medium transition-colors shadow-sm hover:bg-primary hover:text-white"
              >
                Yes
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="bg-surface-light border border-primary text-primary px-3 py-2 rounded-full text-xs font-medium transition-colors shadow-sm hover:bg-primary hover:text-white"
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
