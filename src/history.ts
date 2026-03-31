import { readFile, writeFile, mkdir, rename } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { HistoryEntry } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const HISTORY_FILE = join(DATA_DIR, 'history.json');
const HISTORY_BACKUP = join(DATA_DIR, 'history.json.bak');

export async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

export async function loadHistory(): Promise<ReadonlyArray<HistoryEntry>> {
  await ensureDataDir();

  if (!existsSync(HISTORY_FILE)) {
    return [];
  }

  let content: string;
  try {
    content = await readFile(HISTORY_FILE, 'utf-8');
  } catch {
    return [];
  }

  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      throw new Error('Expected an array');
    }
    return parsed as HistoryEntry[];
  } catch (err) {
    console.warn(`[history] Corrupt history.json — backing up and starting fresh. Error: ${err}`);
    await writeFile(HISTORY_BACKUP, content, 'utf-8');
    await writeFile(HISTORY_FILE, '[]', 'utf-8');
    return [];
  }
}

export async function saveEntry(entry: HistoryEntry): Promise<void> {
  await ensureDataDir();

  const existing = await loadHistory();
  const updated = [...existing, entry];

  const tmpFile = HISTORY_FILE + '.tmp';
  await writeFile(tmpFile, JSON.stringify(updated, null, 2), 'utf-8');
  await rename(tmpFile, HISTORY_FILE);
}

export async function isArticlePublished(articleId: string): Promise<boolean> {
  const history = await loadHistory();
  return history.some((entry) => entry.articleId === articleId);
}
