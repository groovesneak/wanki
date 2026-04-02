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
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 5);
  let totalSemicolons = 0;
  let totalTabs = 0;
  let totalCommas = 0;

  for (const line of lines) {
    totalSemicolons += (line.match(/;/g) || []).length;
    totalTabs += (line.match(/\t/g) || []).length;
    totalCommas += (line.match(/,/g) || []).length;
  }

  if (totalSemicolons >= totalTabs && totalSemicolons >= totalCommas && totalSemicolons > 0) return ';';
  if (totalTabs >= totalCommas && totalTabs > 0) return '\t';
  return ',';
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
