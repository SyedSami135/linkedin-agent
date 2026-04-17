/**
 * LinkedIn feed scraper using Playwright.
 */

import type { BrowserContext } from 'playwright';
import { createHash } from 'crypto';
import type { Article } from './types.js';
import { deriveArticleMetadata } from './content-ideas.js';
import { createLinkedInContext, FEED_URL } from './linkedin-browser.js';

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

async function scrapeFeed(context: BrowserContext): Promise<ReadonlyArray<FeedPost>> {
  const page = await context.newPage();
  const posts: FeedPost[] = [];

  try {
    await page.goto(FEED_URL, { waitUntil: 'networkidle', timeout: 20000 });

    for (let i = 0; i < SCROLL_ROUNDS; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight * 2);
      });
      await page.waitForTimeout(SCROLL_DELAY_MS);
    }

    const rawPosts = await page.evaluate((): Array<{ text: string; author: string; url: string }> => {
      const results: Array<{ text: string; author: string; url: string }> = [];

      const containers = document.querySelectorAll('.feed-shared-update-v2, [data-urn*="urn:li:activity"]');

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
      const id = createHash('sha256').update(raw.text.slice(0, 100)).digest('hex').slice(0, 16);

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
  let browser = null;
  let context: BrowserContext | null = null;

  try {
    const linkedIn = await createLinkedInContext(true);
    browser = linkedIn.browser;
    context = linkedIn.context;
    return await scrapeFeed(context);
  } finally {
    await context?.close();
    await browser?.close();
  }
}

export function feedPostsToArticles(posts: ReadonlyArray<FeedPost>): ReadonlyArray<Article> {
  return posts.map((post) => {
    const base = {
      id: post.id,
      title: post.text.split('\n')[0]?.slice(0, 100) ?? 'LinkedIn post',
      link: post.url,
      summary: post.text,
      publishedAt: post.scrapedAt,
      feedLabel: `LinkedIn feed (${post.authorName})`,
      topics: [],
      sourceType: 'rss' as const,
      topicLane: 'frameworks' as const,
    };

    return {
      ...base,
      ...deriveArticleMetadata(base),
    };
  });
}
