import 'dotenv/config';
import cron from 'node-cron';
import { loadConfig, loadEnv } from './config.js';
import { fetchAllFeeds, filterNewArticles } from './feeds.js';
import { scrapeLinkedInFeed, feedPostsToArticles } from './scraper.js';
import { generatePost } from './generator.js';
import { reviewBatch } from './reviewer.js';
import { requestEmailApproval, loadEmailConfig } from './notifier.js';
import { publishToLinkedIn, validateToken } from './publisher.js';
import { saveEntry } from './history.js';
import type { GeneratedPost, HistoryEntry, ReviewDecision } from './types.js';

async function runPipeline(source: 'rss' | 'feed', approval: 'cli' | 'email'): Promise<void> {
  console.log(`\n[pipeline] Starting run at ${new Date().toISOString()} (source: ${source})`);

  const config = await loadConfig();
  const env = loadEnv();

  // Validate LinkedIn token
  const tokenValid = await validateToken(env.LINKEDIN_ACCESS_TOKEN);
  if (!tokenValid) {
    console.error(
      '[pipeline] LinkedIn token is invalid or expired. Run `npm run setup` to refresh.'
    );
    return;
  }

  // Fetch articles from chosen source
  let allArticles;
  if (source === 'feed') {
    console.log('[pipeline] Scraping LinkedIn feed...');
    const posts = await scrapeLinkedInFeed();
    allArticles = feedPostsToArticles(posts);
    console.log(`[pipeline] Scraped ${allArticles.length} post(s) from your LinkedIn feed`);
  } else {
    allArticles = await fetchAllFeeds(config.feeds);
    console.log(`[pipeline] Fetched ${allArticles.length} articles from ${config.feeds.length} feed(s)`);
  }

  const newArticles = await filterNewArticles(allArticles);
  console.log(`[pipeline] ${newArticles.length} new item(s) after deduplication`);

  if (newArticles.length === 0) {
    console.log('[pipeline] No new articles found. Nothing to do.');
    return;
  }

  // Generate posts concurrently (max 5 at a time)
  const CONCURRENCY = 5;
  const posts: GeneratedPost[] = [];

  for (let i = 0; i < newArticles.length; i += CONCURRENCY) {
    const batch = newArticles.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((article) => generatePost(article, config.postDefaults, env.GROQ_API_KEY))
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j]!;
      if (result.status === 'rejected') {
        console.warn(
          `[pipeline] Failed to generate post for "${batch[j]!.title}": ${result.reason}`
        );
      } else {
        posts.push(result.value);
      }
    }
  }

  if (posts.length === 0) {
    console.log('[pipeline] All post generations failed. Exiting.');
    return;
  }

  console.log(`[pipeline] Generated ${posts.length} post(s). Starting review...\n`);

  // Human review — CLI or email
  let reviewed: Array<{ post: GeneratedPost; decision: ReviewDecision }>;

  if (approval === 'email') {
    const emailCfg = loadEmailConfig();
    const decisions = await Promise.all(
      posts.map(async (post) => ({
        post,
        decision: await requestEmailApproval(post, emailCfg),
      }))
    );
    reviewed = decisions;
  } else {
    reviewed = [...(await reviewBatch(posts))];
  }

  // Publish approved posts
  let approved = 0;
  let skipped = 0;
  let failed = 0;

  for (const { post, decision } of reviewed) {
    if (decision.action === 'skip') {
      skipped++;
      continue;
    }

    const result = await publishToLinkedIn(
      decision.finalContent,
      env.LINKEDIN_PERSON_URN,
      env.LINKEDIN_ACCESS_TOKEN
    );

    if (result.success) {
      const entry: HistoryEntry = {
        articleId: post.article.id,
        articleTitle: post.article.title,
        articleLink: post.article.link,
        postContent: decision.finalContent,
        publishedAt: new Date().toISOString(),
        linkedInPostUrn: result.postUrn ?? 'unknown',
      };
      await saveEntry(entry);
      approved++;
      console.log(`[pipeline] ✓ Published: "${post.article.title}"`);
    } else {
      failed++;
      console.error(`[pipeline] ✗ Failed to publish "${post.article.title}": ${result.error}`);
    }
  }

  console.log(
    `\n[pipeline] Done — ${approved} published, ${skipped} skipped, ${failed} failed.`
  );
}

/** Pick a random minute+hour in the window 8am–6pm and return a cron expression */
function randomDailyCron(): string {
  const hour = 8 + Math.floor(Math.random() * 10); // 8–17
  const minute = Math.floor(Math.random() * 60);    // 0–59
  return `${minute} ${hour} * * *`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const runNow = args.includes('--now');
  const scheduleOnly = args.includes('--schedule');
  const source: 'rss' | 'feed' = args.includes('--source=feed') ? 'feed' : 'rss';
  const approval: 'cli' | 'email' = args.includes('--approval=email') ? 'email' : 'cli';

  await loadConfig(); // validate config.json on startup

  if (runNow || !scheduleOnly) {
    await runPipeline(source, approval);
  }

  if (!runNow) {
    // Pick a fresh random time each day using a midnight check cron
    let todaysCron = randomDailyCron();
    console.log(`\n[scheduler] Today's post time: ${todaysCron}`);

    // Schedule the daily post at today's random time
    let postTask = cron.schedule(todaysCron, async () => {
      await runPipeline(source, approval);
    });

    // Every midnight, pick a new random time for tomorrow
    const midnightTask = cron.schedule('0 0 * * *', () => {
      postTask.stop();
      todaysCron = randomDailyCron();
      console.log(`[scheduler] New random post time for today: ${todaysCron}`);
      postTask = cron.schedule(todaysCron, async () => {
        await runPipeline(source, approval);
      });
    });

    const task = { stop: () => { postTask.stop(); midnightTask.stop(); } };

    process.on('SIGINT', () => {
      console.log('\n[scheduler] Shutting down...');
      task.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('\n[scheduler] Shutting down...');
      task.stop();
      process.exit(0);
    });

    console.log('[scheduler] Agent is running. Press Ctrl+C to stop.');
  }
}

main().catch((err) => {
  console.error('[main] Fatal error:', err);
  process.exit(1);
});
