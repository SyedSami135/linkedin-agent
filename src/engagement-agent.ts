import { createHash } from 'crypto';
import type { BrowserContext, Locator, Page } from 'playwright';
import { createLinkedInContext, FEED_URL } from './linkedin-browser.js';
import { loadInteractionHistory, saveInteractionEntry } from './engagement-history.js';
import { generateEngagementComment, selectEngagementCandidates } from './engagement-core.js';
import type { EngagementAction, EngagementCandidate, EngagementConfig, InteractionHistoryEntry } from './types.js';

function makeCandidateId(raw: { urn?: string; url: string; text: string }): string {
  return createHash('sha256')
    .update(raw.urn || raw.url || raw.text.slice(0, 120))
    .digest('hex')
    .slice(0, 16);
}

async function scrapeEngagementCandidates(
  context: BrowserContext,
  config: EngagementConfig
): Promise<ReadonlyArray<EngagementCandidate>> {
  const page = await context.newPage();

  try {
    await page.goto(FEED_URL, { waitUntil: 'networkidle', timeout: 25000 });

    for (let i = 0; i < config.scrollRounds; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight * 2);
      });
      await page.waitForTimeout(1800);
    }

    const rawPosts = await page.evaluate(() => {
      const containers = Array.from(
        document.querySelectorAll<HTMLElement>('.feed-shared-update-v2, [data-urn*="urn:li:activity"]')
      );

      return containers.map((container) => {
        const textEl = container.querySelector(
          '.feed-shared-update-v2__description .break-words, ' +
            '.feed-shared-text .break-words, ' +
            '[class*="feed-shared-inline-show-more-text"]'
        );
        const authorEl = container.querySelector(
          '.feed-shared-actor__name, ' +
            '.update-components-actor__name, ' +
            '[class*="actor__name"]'
        );
        const linkEl = container.querySelector('a[href*="/feed/update/"], a[href*="activity"]');
        const likeButton = Array.from(container.querySelectorAll('button')).find((button) => {
          const label = (button.getAttribute('aria-label') ?? button.textContent ?? '').toLowerCase();
          return label.includes('like');
        });

        return {
          urn: container.getAttribute('data-urn') ?? '',
          text: textEl?.textContent?.trim() ?? '',
          authorName: authorEl?.textContent?.trim() ?? 'Unknown',
          url: linkEl instanceof HTMLAnchorElement ? linkEl.href : '',
          hasImage: Boolean(
            container.querySelector(
              '.update-components-image, .feed-shared-image, [data-test-id="feed-images-content"]'
            )
          ),
          hasVideo: Boolean(
            container.querySelector('video, .update-components-linkedin-video, .update-components-video')
          ),
          hasDocument: Boolean(container.querySelector('.update-components-document')),
          hasArticleCard: Boolean(
            container.querySelector(
              '.update-components-article, .update-components-mini-update-v2, .feed-shared-article'
            )
          ),
          isLiked: likeButton?.getAttribute('aria-pressed') === 'true',
        };
      });
    });

    return rawPosts
      .filter((raw) => raw.text.length > 0 && raw.url.length > 0)
      .map((raw) => ({
        id: makeCandidateId({ urn: raw.urn || undefined, url: raw.url, text: raw.text }),
        urn: raw.urn || undefined,
        authorName: raw.authorName,
        text: raw.text.slice(0, config.maxPostLength + 400),
        url: raw.url,
        scrapedAt: new Date().toISOString(),
        hasImage: raw.hasImage,
        hasVideo: raw.hasVideo,
        hasDocument: raw.hasDocument,
        hasArticleCard: raw.hasArticleCard,
        isLiked: raw.isLiked,
      }))
      .slice(0, config.maxPostsPerRun * 6);
  } finally {
    await page.close();
  }
}

async function firstExisting(locators: ReadonlyArray<Locator>): Promise<Locator | null> {
  for (const locator of locators) {
    if ((await locator.count()) > 0) {
      return locator.first();
    }
  }
  return null;
}

async function findActivityRoot(page: Page, candidate: EngagementCandidate): Promise<Locator | null> {
  const candidates: Locator[] = [];

  if (candidate.urn) {
    candidates.push(page.locator(`[data-urn="${candidate.urn}"]`));
  }

  const snippet = candidate.text.slice(0, 80).trim();
  if (snippet.length > 20) {
    candidates.push(
      page
        .locator('.feed-shared-update-v2, [data-urn*="urn:li:activity"]')
        .filter({ hasText: snippet })
    );
  }

  candidates.push(page.locator('.feed-shared-update-v2, [data-urn*="urn:li:activity"]'));
  return firstExisting(candidates);
}

async function findButton(root: Locator, pattern: RegExp): Promise<Locator | null> {
  const roleButton = root.getByRole('button', { name: pattern });
  if ((await roleButton.count()) > 0) return roleButton.first();

  const textButton = root.locator('button').filter({ hasText: pattern });
  if ((await textButton.count()) > 0) return textButton.first();

  return null;
}

async function findVisibleTextbox(page: Page): Promise<Locator | null> {
  const textboxes = page.locator('div[role="textbox"][contenteditable="true"]');
  const count = await textboxes.count();

  for (let index = count - 1; index >= 0; index--) {
    const locator = textboxes.nth(index);
    if (await locator.isVisible()) return locator;
  }

  return null;
}

async function interactWithCandidate(
  context: BrowserContext,
  candidate: EngagementCandidate,
  commentText: string | null,
  config: EngagementConfig
): Promise<EngagementAction> {
  const page = await context.newPage();

  try {
    await page.goto(candidate.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(1500);

    const root = await findActivityRoot(page, candidate);
    if (!root) {
      throw new Error('Could not find activity root on post page');
    }

    const mediaCount = await root
      .locator(
        '.update-components-image, .feed-shared-image, video, .update-components-video, .update-components-linkedin-video, .update-components-document, .update-components-article, .update-components-mini-update-v2, .feed-shared-article'
      )
      .count();

    if (mediaCount > 0) {
      return 'skipped';
    }

    let liked = false;
    let commented = false;

    if (config.likePosts && !candidate.isLiked) {
      const likeButton = await findButton(root, /like/i);
      if (likeButton) {
        const pressed = await likeButton.getAttribute('aria-pressed');
        if (pressed !== 'true') {
          await likeButton.click({ timeout: 5000 });
          liked = true;
          await page.waitForTimeout(800);
        }
      }
    }

    if (config.commentPosts && commentText) {
      const commentButton = await findButton(root, /comment/i);
      if (commentButton) {
        await commentButton.click({ timeout: 5000 });
        await page.waitForTimeout(1200);

        const textbox = await findVisibleTextbox(page);
        if (textbox) {
          await textbox.click();
          await textbox.fill(commentText);

          const submitButton = await firstExisting([
            page.getByRole('button', { name: /post comment/i }),
            page.getByRole('button', { name: /^post$/i }),
          ]);

          if (submitButton) {
            await submitButton.click({ timeout: 5000 });
            commented = true;
            await page.waitForTimeout(1200);
          }
        }
      }
    }

    if (liked && commented) return 'liked_and_commented';
    if (commented) return 'commented';
    if (liked) return 'liked';
    return 'skipped';
  } finally {
    await page.close();
  }
}

export async function runEngagementAgent(config: EngagementConfig, apiKey: string): Promise<void> {
  if (!config.enabled) {
    console.log('[engagement] Disabled in config. Exiting.');
    return;
  }

  const history = await loadInteractionHistory();
  const historyIds = new Set(history.map((entry) => entry.postId));

  let browser = null;
  let context: BrowserContext | null = null;

  try {
    const linkedIn = await createLinkedInContext(config.headless);
    browser = linkedIn.browser;
    context = linkedIn.context;

    const scraped = await scrapeEngagementCandidates(context, config);
    const selected = selectEngagementCandidates(scraped, historyIds, config);
    console.log(
      `[engagement] Scraped ${scraped.length} candidate(s), selected ${selected.length} informative text-only post(s)`
    );

    let commentsUsed = 0;

    for (const candidate of selected) {
      const shouldComment = config.commentPosts && commentsUsed < config.maxCommentsPerRun;
      const commentText = shouldComment ? await generateEngagementComment(candidate, apiKey) : null;
      const action = await interactWithCandidate(context, candidate, commentText, config);

      if (action === 'skipped') {
        console.log(`[engagement] Skipped "${candidate.authorName}" - could not complete action safely`);
        continue;
      }

      if (action === 'commented' || action === 'liked_and_commented') {
        commentsUsed++;
      }

      const entry: InteractionHistoryEntry = {
        postId: candidate.id,
        postUrl: candidate.url,
        authorName: candidate.authorName,
        action,
        commentText: commentText ?? undefined,
        engagedAt: new Date().toISOString(),
      };
      await saveInteractionEntry(entry);
      console.log(`[engagement] ${action} on post by ${candidate.authorName}`);
    }
  } finally {
    await context?.close();
    await browser?.close();
  }
}
