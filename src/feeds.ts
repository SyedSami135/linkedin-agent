import axios from 'axios';
import Parser from 'rss-parser';
import { createHash } from 'crypto';
import type { Article, SourceConfig } from './types.js';
import { isArticlePublished } from './history.js';
import { deriveArticleMetadata } from './content-ideas.js';

const parser = new Parser({ timeout: 10_000 });
const STALE_DAYS = 30;

interface ParsedHtmlItem {
  readonly title: string;
  readonly link: string;
  readonly summary: string;
  readonly publishedAt?: string;
}

function makeArticleId(sourceLabel: string, title: string, link: string): string {
  const seed = [sourceLabel, title, link].filter(Boolean).join('::');
  return createHash('sha256').update(seed).digest('hex').slice(0, 16);
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function isStale(publishedAt: string): boolean {
  const cutoff = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;
  return new Date(publishedAt).getTime() < cutoff;
}

function absolutizeLink(baseUrl: string, maybeRelative: string): string {
  try {
    return new URL(maybeRelative, baseUrl).toString();
  } catch {
    return maybeRelative;
  }
}

function limitSummary(summary: string): string {
  return summary.replace(/\s+/g, ' ').trim().slice(0, 500);
}

function makeArticle(
  source: SourceConfig,
  item: { title: string; link: string; summary: string; publishedAt: string }
): Article {
  const base = {
    id: makeArticleId(source.label, item.title, item.link),
    title: item.title.trim(),
    link: item.link,
    summary: limitSummary(item.summary),
    publishedAt: item.publishedAt,
    feedLabel: source.label,
    topics: source.topics,
    sourceType: source.kind,
    topicLane: source.lane,
    frameworkOrVendor: source.frameworkOrVendor,
  } as const;

  return {
    ...base,
    ...deriveArticleMetadata(base),
  };
}

export function parseRssItemsToArticles(
  source: SourceConfig,
  items: ReadonlyArray<Parser.Item>
): ReadonlyArray<Article> {
  return items
    .slice(0, source.maxArticlesPerRun * 3)
    .map((item) => {
      const publishedAt = item.isoDate ?? item.pubDate ?? new Date().toISOString();
      const rawSummary = item.contentSnippet ?? item.content ?? item.summary ?? '';
      return makeArticle(source, {
        title: (item.title ?? 'Untitled').trim(),
        link: item.link ?? '',
        summary: stripHtml(rawSummary),
        publishedAt,
      });
    })
    .filter((article) => article.link.length > 0 && !isStale(article.publishedAt))
    .slice(0, source.maxArticlesPerRun);
}

function extractMetaTag(html: string, attr: 'name' | 'property', value: string): string | undefined {
  const pattern = new RegExp(
    `<meta[^>]+${attr}=["']${value}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    'i'
  );
  const reversePattern = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${value}["'][^>]*>`,
    'i'
  );
  const match = html.match(pattern) ?? html.match(reversePattern);
  return match?.[1] ? decodeHtmlEntities(match[1]) : undefined;
}

function extractTagText(html: string, tag: string): string | undefined {
  const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return match?.[1] ? stripHtml(match[1]) : undefined;
}

function extractTimeValue(html: string): string | undefined {
  const datetimeMatch = html.match(/<time[^>]+datetime=["']([^"']+)["'][^>]*>/i);
  if (datetimeMatch?.[1]) return datetimeMatch[1];

  const published =
    extractMetaTag(html, 'property', 'article:published_time') ??
    extractMetaTag(html, 'name', 'article:published_time');
  return published;
}

function extractAnchor(block: string, baseUrl: string): { title: string; link: string } | undefined {
  const anchorMatch = block.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
  if (!anchorMatch?.[1] || !anchorMatch[2]) return undefined;

  const title = stripHtml(anchorMatch[2]);
  if (title.length < 8) return undefined;

  return {
    title,
    link: absolutizeLink(baseUrl, anchorMatch[1]),
  };
}

function parseArticleCards(html: string, source: SourceConfig): ReadonlyArray<ParsedHtmlItem> {
  const articleBlocks = html.match(/<article\b[\s\S]*?<\/article>/gi) ?? [];
  const blocks = articleBlocks.length > 0 ? articleBlocks : html.match(/<li\b[\s\S]*?<\/li>/gi) ?? [];

  const parsed = blocks
    .map((block): ParsedHtmlItem | null => {
      const anchor = extractAnchor(block, source.url);
      if (!anchor) return null;

      const paragraphMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      const summary = paragraphMatch?.[1] ? stripHtml(paragraphMatch[1]) : anchor.title;
      const publishedAt = extractTimeValue(block);

      return {
        title: anchor.title,
        link: anchor.link,
        summary,
        publishedAt,
      };
    })
    .filter((item): item is ParsedHtmlItem => Boolean(item))
    .filter((item) => item.link !== source.url);

  return parsed.slice(0, source.maxArticlesPerRun);
}

function parseSinglePage(html: string, source: SourceConfig): ReadonlyArray<ParsedHtmlItem> {
  const title =
    extractTagText(html, 'h1') ??
    extractMetaTag(html, 'property', 'og:title') ??
    extractTagText(html, 'title') ??
    source.label;
  const summary =
    extractMetaTag(html, 'name', 'description') ??
    extractMetaTag(html, 'property', 'og:description') ??
    extractTagText(html, 'p') ??
    title;
  const publishedAt = extractTimeValue(html) ?? new Date().toISOString();

  return [
    {
      title,
      link: source.url,
      summary,
      publishedAt,
    },
  ];
}

export function parseHtmlToArticles(source: SourceConfig, html: string): ReadonlyArray<Article> {
  const items =
    source.extractor === 'single_page' ? parseSinglePage(html, source) : parseArticleCards(html, source);

  return items
    .map((item) =>
      makeArticle(source, {
        title: item.title,
        link: item.link,
        summary: item.summary,
        publishedAt: item.publishedAt ?? new Date().toISOString(),
      })
    )
    .filter((article) => article.link.length > 0 && !isStale(article.publishedAt));
}

async function fetchRssSource(source: SourceConfig): Promise<ReadonlyArray<Article>> {
  const feed = await parser.parseURL(source.url);
  return parseRssItemsToArticles(source, feed.items);
}

async function fetchHtmlSource(source: SourceConfig): Promise<ReadonlyArray<Article>> {
  const response = await axios.get<string>(source.url, {
    responseType: 'text',
    timeout: 10_000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; LinkedInAgent/1.0)',
    },
  });

  return parseHtmlToArticles(source, response.data);
}

export async function fetchArticles(source: SourceConfig): Promise<ReadonlyArray<Article>> {
  return source.kind === 'html' ? fetchHtmlSource(source) : fetchRssSource(source);
}

export async function fetchAllSources(
  sources: ReadonlyArray<SourceConfig>
): Promise<ReadonlyArray<Article>> {
  const results = await Promise.allSettled(sources.map((source) => fetchArticles(source)));

  const articles: Article[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    if (result.status === 'rejected') {
      console.warn(`[feeds] Failed to fetch "${sources[i]!.label}": ${result.reason}`);
      continue;
    }

    for (const article of result.value) {
      if (seen.has(article.id)) continue;
      seen.add(article.id);
      articles.push(article);
    }
  }

  return articles;
}

export function balanceArticlesByLane(articles: ReadonlyArray<Article>): ReadonlyArray<Article> {
  const frameworks = [...articles]
    .filter((article) => article.topicLane === 'frameworks')
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const ai = [...articles]
    .filter((article) => article.topicLane === 'ai_automation')
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  if (frameworks.length === 0 || ai.length === 0) {
    return [...frameworks, ...ai];
  }

  const balancedCount = Math.min(frameworks.length, ai.length);
  const selected: Article[] = [];

  for (let index = 0; index < balancedCount; index++) {
    selected.push(frameworks[index]!, ai[index]!);
  }

  return selected;
}

export async function filterNewArticles(
  articles: ReadonlyArray<Article>
): Promise<ReadonlyArray<Article>> {
  const checks = await Promise.all(
    articles.map(async (article) => ({
      article,
      published: await isArticlePublished(article.id),
    }))
  );

  return checks.filter((entry) => !entry.published).map((entry) => entry.article);
}
