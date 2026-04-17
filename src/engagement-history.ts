import { readFile, writeFile, mkdir, rename } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { InteractionHistoryEntry } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const HISTORY_FILE = join(DATA_DIR, 'engagement-history.json');

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

export async function loadInteractionHistory(): Promise<ReadonlyArray<InteractionHistoryEntry>> {
  await ensureDataDir();

  if (!existsSync(HISTORY_FILE)) {
    return [];
  }

  try {
    const content = await readFile(HISTORY_FILE, 'utf-8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? (parsed as InteractionHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export async function saveInteractionEntry(entry: InteractionHistoryEntry): Promise<void> {
  await ensureDataDir();
  const existing = await loadInteractionHistory();
  const updated = [...existing, entry];
  const tmpFile = HISTORY_FILE + '.tmp';

  await writeFile(tmpFile, JSON.stringify(updated, null, 2), 'utf-8');
  await rename(tmpFile, HISTORY_FILE);
}
