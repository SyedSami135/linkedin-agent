import Parser from 'rss-parser';
import { createHash } from 'crypto';
import type { FeedConfig, Article } from './types.js';
import { isArticlePublished } from './history.js';

const parser = new Parser({ timeout: 10_000 });
const STALE_DAYS = 7;

function makeArticleId(item: Parser.Item): string {
  const source = item.guid ?? item.link ?? item.title ?? String(Date.now());
  return createHash('sha256').update(source).digest('hex').slice(0, 16);
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function isStale(publishedAt: string): boolean {
  const cutoff = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;
  return new Date(publishedAt).getTime() < cutoff;
}

export async function fetchArticles(feedConfig: FeedConfig): Promise<ReadonlyArray<Article>> {
  const feed = await parser.parseURL(feedConfig.url);

  const articles = feed.items
    .slice(0, feedConfig.maxArticlesPerRun * 3) // over-fetch to account for stale/dup filtering
    .map((item): Article => {
      const publishedAt = item.isoDate ?? item.pubDate ?? new Date().toISOString();
      const rawSummary = item.contentSnippet ?? item.content ?? item.summary ?? '';
      return {
        id: makeArticleId(item),
        title: (item.title ?? 'Untitled').trim(),
        link: item.link ?? '',
        summary: stripHtml(rawSummary).slice(0, 500),
        publishedAt,
        feedLabel: feedConfig.label,
        topics: feedConfig.topics,
        sourceType: 'rss' as const,
      };
    })
    .filter((a) => !isStale(a.publishedAt) && a.link.length > 0)
    .slice(0, feedConfig.maxArticlesPerRun);

  return articles;
}

export async function fetchAllFeeds(
  feeds: ReadonlyArray<FeedConfig>
): Promise<ReadonlyArray<Article>> {
  const results = await Promise.allSettled(feeds.map((f) => fetchArticles(f)));

  const articles: Article[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    if (result.status === 'rejected') {
      console.warn(`[feeds] Failed to fetch "${feeds[i]!.label}": ${result.reason}`);
      continue;
    }
    for (const article of result.value) {
      if (!seen.has(article.id)) {
        seen.add(article.id);
        articles.push(article);
      }
    }
  }

  return articles;
}

export async function filterNewArticles(
  articles: ReadonlyArray<Article>
): Promise<ReadonlyArray<Article>> {
  const checks = await Promise.all(
    articles.map(async (a) => ({ article: a, published: await isArticlePublished(a.id) }))
  );
  return checks.filter((c) => !c.published).map((c) => c.article);
}
