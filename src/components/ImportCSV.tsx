import { useState, useRef, useMemo } from 'react';
import { parseRawCSV, extractCards } from '../csv';
import { createNewCard } from '../srs';
import * as db from '../db';
import type { View } from '../types';

interface Props {
  onClose: () => void;
  navigate: (view: View) => void;
  onDeckCreated: () => void;
}

export function ImportCSV({ onClose, navigate, onDeckCreated }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<string[][]>([]);
  const [columnCount, setColumnCount] = useState(0);
  const [frontCol, setFrontCol] = useState(0);
  const [backCol, setBackCol] = useState(1);
  const [deckName, setDeckName] = useState('');
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState('');

  const cards = useMemo(
    () => (rows.length > 0 ? extractCards(rows, frontCol, backCol) : []),
    [rows, frontCol, backCol],
  );

  const preview = cards.slice(0, 10);

  // Auto-detect best front/back columns (first two columns with data)
  function autoDetectColumns(parsedRows: string[][], colCount: number) {
    const nonEmptyCounts: number[] = Array(colCount).fill(0);
    for (const row of parsedRows.slice(0, 20)) {
      for (let c = 0; c < row.length; c++) {
        if (row[c]?.trim()) nonEmptyCounts[c]++;
      }
    }
    // Pick the two columns with most non-empty values
    const ranked = nonEmptyCounts
      .map((count, idx) => ({ idx, count }))
      .sort((a, b) => b.count - a.count);

    const front = ranked[0]?.idx ?? 0;
    const back = ranked[1]?.idx ?? 1;
    setFrontCol(Math.min(front, back));
    setBackCol(Math.max(front, back));
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setDeckName(file.name.replace(/\.(csv|tsv|txt)$/i, ''));
    setError('');

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const parsed = parseRawCSV(text);
      if (parsed.rows.length === 0) {
        setError('No data found in the file.');
        setRows([]);
        return;
      }
      setRows(parsed.rows);
      setColumnCount(parsed.columnCount);
      autoDetectColumns(parsed.rows, parsed.columnCount);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!deckName.trim() || cards.length === 0) return;
    setImporting(true);
    setError('');

    try {
      const deck = {
        id: crypto.randomUUID(),
        name: deckName.trim(),
        createdAt: Date.now(),
      };
      await db.addDeck(deck);

      const newCards = cards.map((c) => createNewCard(deck.id, c.front, c.back));
      await db.addCardsBatch(newCards);

      onDeckCreated();
      navigate({ type: 'deck', deckId: deck.id });
    } catch (err) {
      setError(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
      setImporting(false);
    }
  };

  const columnOptions = Array.from({ length: columnCount }, (_, i) => i);

  // Show a sample value for each column to help the user identify them
  function getColumnSample(colIdx: number): string {
    for (const row of rows.slice(0, 10)) {
      const val = row[colIdx]?.trim();
      if (val) return val.length > 30 ? val.slice(0, 30) + '...' : val;
    }
    return '(empty)';
  }

  return (
    <div className="bg-surface-light rounded-2xl p-5 mb-6 space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Import from CSV</h3>
        <button onClick={onClose} className="text-text-muted hover:text-text transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>

      <p className="text-sm text-text-muted">
        Supports CSV, TSV, and semicolon-separated files. Header row is optional.
      </p>

      {/* File picker */}
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.tsv,.txt"
        onChange={handleFile}
        className="hidden"
      />
      <button
        onClick={() => fileRef.current?.click()}
        className="w-full border-2 border-dashed border-surface-card rounded-xl p-6 text-center hover:border-primary/50 transition-colors"
      >
        {fileName ? (
          <span className="text-text">{fileName}</span>
        ) : (
          <span className="text-text-muted">Click to choose a file...</span>
        )}
      </button>

      {error && (
        <p className="text-danger text-sm">{error}</p>
      )}

      {/* Column selection + Preview */}
      {rows.length > 0 && (
        <>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Deck name..."
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              className="w-full bg-surface-card rounded-lg px-4 py-2 text-text outline-none focus:ring-2 focus:ring-primary/50"
            />

            {/* Column mapping */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-muted mb-1">Front (question)</label>
                <select
                  value={frontCol}
                  onChange={(e) => setFrontCol(Number(e.target.value))}
                  className="w-full bg-surface-card rounded-lg px-3 py-2 text-text text-sm outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {columnOptions.map((i) => (
                    <option key={i} value={i}>
                      Column {i + 1}: {getColumnSample(i)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Back (answer)</label>
                <select
                  value={backCol}
                  onChange={(e) => setBackCol(Number(e.target.value))}
                  className="w-full bg-surface-card rounded-lg px-3 py-2 text-text text-sm outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {columnOptions.map((i) => (
                    <option key={i} value={i}>
                      Column {i + 1}: {getColumnSample(i)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="text-sm text-text-muted">
              Preview ({cards.length} card{cards.length !== 1 ? 's' : ''} found)
            </div>

            <div className="space-y-1 max-h-60 overflow-y-auto">
              {preview.map((card, i) => (
                <div key={i} className="bg-surface-card rounded-lg px-4 py-2 flex gap-4 text-sm">
                  <span className="flex-1 truncate">{card.front}</span>
                  <span className="text-text-muted flex-shrink-0 mx-2">&rarr;</span>
                  <span className="flex-1 truncate text-text-muted">{card.back}</span>
                </div>
              ))}
              {cards.length > 10 && (
                <p className="text-xs text-text-muted text-center py-1">
                  ...and {cards.length - 10} more
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text px-4 py-2 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={importing || !deckName.trim() || cards.length === 0}
              className="bg-primary hover:bg-primary-hover disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              {importing ? 'Importing...' : `Import ${cards.length} cards`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
