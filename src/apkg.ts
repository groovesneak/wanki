import JSZip from 'jszip';
import initSqlJs, { type Database } from 'sql.js';

export interface ApkgCard {
  front: string;
  back: string;
}

/** Strip basic HTML tags from Anki fields */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<div>/gi, '\n')
    .replace(/<\/div>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export async function parseApkg(file: File): Promise<{ cards: ApkgCard[]; deckName: string }> {
  // Load the zip
  const zip = await JSZip.loadAsync(file);

  // Find the SQLite database (collection.anki21 or collection.anki2)
  const dbFile = zip.file('collection.anki21') || zip.file('collection.anki2');
  if (!dbFile) {
    throw new Error('No Anki database found in the .apkg file');
  }

  const dbData = await dbFile.async('uint8array');

  // Initialize sql.js with local wasm file
  const basePath = import.meta.env.BASE_URL || '/';
  const SQL = await initSqlJs({
    locateFile: () => `${basePath}sql-wasm.wasm`,
  });

  const db: Database = new SQL.Database(dbData);

  // Extract deck name from col table
  let deckName = file.name.replace(/\.apkg$/i, '');
  try {
    const colResult = db.exec('SELECT decks FROM col LIMIT 1');
    if (colResult.length > 0 && colResult[0].values.length > 0) {
      const decksJson = JSON.parse(colResult[0].values[0][0] as string);
      // Get the first non-default deck name
      for (const key of Object.keys(decksJson)) {
        if (key !== '1' && decksJson[key].name) {
          deckName = decksJson[key].name;
          break;
        }
      }
    }
  } catch {
    // Fall back to filename
  }

  // Extract cards from notes table
  const result = db.exec('SELECT flds FROM notes');
  if (result.length === 0) {
    db.close();
    throw new Error('No cards found in the .apkg file');
  }

  const cards: ApkgCard[] = [];
  for (const row of result[0].values) {
    const flds = row[0] as string;
    // Fields are separated by \x1f (unit separator)
    const fields = flds.split('\x1f');
    if (fields.length >= 2) {
      const front = stripHtml(fields[0]);
      const back = stripHtml(fields[1]);
      if (front && back) {
        cards.push({ front, back });
      }
    }
  }

  db.close();
  return { cards, deckName };
}
