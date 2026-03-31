/**
 * LinkedIn feed scraper using Playwright.
 * Saves browser session so login is only needed once.
 */

import { chromium, type Browser, type BrowserContext } from 'playwright';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import type { Article } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const SESSION_FILE = join(DATA_DIR, 'browser-session.json');

const FEED_URL = 'https://www.linkedin.com/feed/';
const LOGIN_URL = 'https://www.linkedin.com/login';
const SCROLL_ROUNDS = 5;
const SCROLL_DELAY_MS = 2000;
const MAX_POSTS = 20;

export interface FeedPost {
  readonly id: string;
  readonly text: string;
  readonly authorName: string;
  readonly url: string;
  readonly scrapedAt: string;
}

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

  console.log('\n[scraper] Browser opened — please log in to LinkedIn.');
  console.log('[scraper] Waiting for you to complete login...\n');

  // Wait until redirected away from login/checkpoint pages
  await page.waitForURL(
    (url) => !url.href.includes('/login') && !url.href.includes('/checkpoint'),
    { timeout: 120000 }
  );

  console.log('[scraper] Login detected. Saving session...');
  await context.storageState({ path: SESSION_FILE });
  await page.close();
}

async function scrapeFeed(context: BrowserContext): Promise<ReadonlyArray<FeedPost>> {
  const page = await context.newPage();
  const posts: FeedPost[] = [];

  try {
    await page.goto(FEED_URL, { waitUntil: 'networkidle', timeout: 20000 });

    // Scroll to load more posts
    for (let i = 0; i < SCROLL_ROUNDS; i++) {
      await page.evaluate(() => { window.scrollBy(0, window.innerHeight * 2); });
      await page.waitForTimeout(SCROLL_DELAY_MS);
    }

    // Extract post content (runs inside browser context, has DOM access)
    const rawPosts = await page.evaluate((): Array<{ text: string; author: string; url: string }> => {
      const results: Array<{ text: string; author: string; url: string }> = [];

      const containers = document.querySelectorAll(
        '.feed-shared-update-v2, [data-urn*="urn:li:activity"]'
      );

      containers.forEach((container) => {
        const textEl = container.querySelector(
          '.feed-shared-update-v2__description .break-words, ' +
          '.feed-shared-text .break-words, ' +
          '[class*="feed-shared-inline-show-more-text"]'
        );
        const text = textEl?.textContent?.trim() ?? '';

        const authorEl = container.querySelector(
          '.feed-shared-actor__name, ' +
          '.update-components-actor__name, ' +
          '[class*="actor__name"]'
        );
        const author = authorEl?.textContent?.trim() ?? 'Unknown';

        const linkEl = container.querySelector('a[href*="/feed/update/"], a[href*="activity"]');
        const url = linkEl instanceof HTMLAnchorElement ? linkEl.href : '';

        if (text.length > 50) {
          results.push({ text, author, url });
        }
      });

      return results;
    });

    for (const raw of rawPosts.slice(0, MAX_POSTS)) {
      const id = createHash('sha256')
        .update(raw.text.slice(0, 100))
        .digest('hex')
        .slice(0, 16);

      posts.push({
        id,
        text: raw.text.slice(0, 1000),
        authorName: raw.author,
        url: raw.url,
        scrapedAt: new Date().toISOString(),
      });
    }
  } finally {
    await page.close();
  }

  return posts;
}

export async function scrapeLinkedInFeed(): Promise<ReadonlyArray<FeedPost>> {
  await ensureDataDir();

  const hasSession = existsSync(SESSION_FILE);
  const launchOptions = { headless: !hasSession }; // show browser only for login

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch(launchOptions);

    const context = await browser.newContext(
      hasSession ? { storageState: SESSION_FILE } : {}
    );

    const loggedIn = hasSession ? await isLoggedIn(context) : false;

    if (!loggedIn) {
      // Re-launch headed for manual login
      await context.close();
      await browser.close();
      browser = await chromium.launch({ headless: false });
      const headedContext = await browser.newContext();
      await loginManually(headedContext);
      await headedContext.close();
      await browser.close();

      // Re-launch headless with saved session
      browser = await chromium.launch({ headless: true });
      const authedContext = await browser.newContext({ storageState: SESSION_FILE });
      const posts = await scrapeFeed(authedContext);
      await authedContext.close();
      return posts;
    }

    const posts = await scrapeFeed(context);
    await context.close();
    return posts;
  } finally {
    await browser?.close();
  }
}

/** Convert feed posts into Article objects for the generator */
export function feedPostsToArticles(posts: ReadonlyArray<FeedPost>): ReadonlyArray<Article> {
  return posts.map((post) => ({
    id: post.id,
    title: post.text.split('\n')[0]?.slice(0, 100) ?? 'LinkedIn post',
    link: post.url,
    summary: post.text,
    publishedAt: post.scrapedAt,
    feedLabel: `LinkedIn feed (${post.authorName})`,
    topics: [],
  }));
}
