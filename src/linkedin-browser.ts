import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chromium, type Browser, type BrowserContext } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
export const SESSION_FILE = join(DATA_DIR, 'browser-session.json');
export const FEED_URL = 'https://www.linkedin.com/feed/';
const LOGIN_URL = 'https://www.linkedin.com/login';

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

async function isLoggedIn(context: BrowserContext): Promise<boolean> {
  const page = await context.newPage();
  try {
    await page.goto(FEED_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const url = page.url();
    return url.includes('/feed') || url.includes('/mynetwork');
  } catch {
    return false;
  } finally {
    await page.close();
  }
}

async function loginManually(context: BrowserContext): Promise<void> {
  const page = await context.newPage();
  await page.goto(LOGIN_URL);

  console.log('\n[linkedin] Browser opened - please log in to LinkedIn.');
  console.log('[linkedin] Waiting for you to complete login...\n');

  await page.waitForURL(
    (url) => !url.href.includes('/login') && !url.href.includes('/checkpoint'),
    { timeout: 120000 }
  );

  console.log('[linkedin] Login detected. Saving session...');
  await context.storageState({ path: SESSION_FILE });
  await page.close();
}

export async function createLinkedInContext(headless = true): Promise<{
  browser: Browser;
  context: BrowserContext;
}> {
  await ensureDataDir();

  const hasSession = existsSync(SESSION_FILE);
  const preferredHeadless = hasSession ? headless : false;

  let browser = await chromium.launch({ headless: preferredHeadless });
  let context = await browser.newContext(hasSession ? { storageState: SESSION_FILE } : {});

  const loggedIn = hasSession ? await isLoggedIn(context) : false;
  if (hasSession && loggedIn) {
    return { browser, context };
  }

  await context.close();
  await browser.close();

  browser = await chromium.launch({ headless: false });
  context = await browser.newContext();
  await loginManually(context);
  await context.close();
  await browser.close();

  browser = await chromium.launch({ headless });
  context = await browser.newContext({ storageState: SESSION_FILE });
  return { browser, context };
}
