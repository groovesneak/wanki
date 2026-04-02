export interface ParsedCard {
  front: string;
  back: string;
}

export interface ParsedCSV {
  rows: string[][];
  separator: string;
  columnCount: number;
}

function detectSeparator(text: string): string {
  // Check first few non-empty lines to determine separator
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 10);

  // For each candidate separator, check consistency of column count across lines.
  // A real separator produces a consistent number of columns.
  // Commas in natural language text produce inconsistent splits.
  const candidates = [';', '\t', ','] as const;

  let bestSep = ',';
  let bestScore = -1;

  for (const sep of candidates) {
    const counts = lines.map((line) => (line.match(new RegExp(sep === '\t' ? '\t' : sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length);
    if (counts.every((c) => c === 0)) continue;

    // Score = how consistent the count is across lines (lower variance = better)
    // If every line has the same number of separators, it's likely the real separator
    const mode = counts.sort((a, b) => a - b)[Math.floor(counts.length / 2)];
    const consistent = counts.filter((c) => c === mode).length;

    // Prefer separators where most lines have the same count
    // Tie-break: prefer semicolons and tabs over commas (commas are common in text)
    const priority = sep === ';' ? 2 : sep === '\t' ? 1 : 0;
    const score = consistent * 10 + priority;

    if (score > bestScore) {
      bestScore = score;
      bestSep = sep;
    }
  }

  return bestSep;
}

function splitRow(line: string, sep: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        // Check if this quote is followed by separator or end of line
        // If so, it's the closing quote. Otherwise treat as literal.
        const next = line[i + 1];
        if (next === undefined || next === sep || next === '\r' || next === '\n') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === sep) {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

export function parseRawCSV(text: string): ParsedCSV {
  const sep = detectSeparator(text);
  const lines = text.split(/\r?\n/);
  const rows: string[][] = [];
  let maxCols = 0;

  for (const line of lines) {
    if (line.trim() === '') continue;
    const fields = splitRow(line, sep);
    // Skip rows where ALL fields are empty
    if (fields.every((f) => f === '')) continue;
    rows.push(fields);
    if (fields.length > maxCols) maxCols = fields.length;
  }

  return { rows, separator: sep, columnCount: maxCols };
}

export function extractCards(
  rows: string[][],
  frontCol: number,
  backCol: number,
): ParsedCard[] {
  const cards: ParsedCard[] = [];
  for (const row of rows) {
    const front = (row[frontCol] || '').trim();
    const back = (row[backCol] || '').trim();
    if (front && back) {
      cards.push({ front, back });
    }
  }
  return cards;
}
