import { describe, expect, it } from 'vitest';
import type Parser from 'rss-parser';
import type { Article, SourceConfig } from '../types.js';
import { balanceArticlesByLane, parseHtmlToArticles, parseRssItemsToArticles } from '../feeds.js';

const frameworkSource: SourceConfig = {
  kind: 'rss',
  lane: 'frameworks',
  url: 'https://example.com/frameworks.xml',
  label: 'Framework Feed',
  topics: ['nextjs', 'react'],
  maxArticlesPerRun: 2,
  frameworkOrVendor: 'Next.js',
};

const aiSource: SourceConfig = {
  kind: 'html',
  lane: 'ai_automation',
  url: 'https://example.com/ai',
  label: 'AI Vendor',
  topics: ['ai', 'automation'],
  maxArticlesPerRun: 2,
  extractor: 'single_page',
  frameworkOrVendor: 'OpenAI',
};

function makeArticle(id: string, lane: Article['topicLane'], publishedAt: string): Article {
  return {
    id,
    title: `${lane} article ${id}`,
    link: `https://example.com/${id}`,
    summary: 'Summary text',
    publishedAt,
    feedLabel: 'Test Source',
    topics: [],
    sourceType: 'html',
    topicLane: lane,
    frameworkOrVendor: lane === 'frameworks' ? 'Next.js' : 'OpenAI',
    versionOrRelease: lane === 'frameworks' ? '16' : '5.4',
    upgradeHighlights: lane === 'frameworks' ? ['Cache Components improve rendering control.'] : [],
    breakingChanges: ['Migration notes matter.'],
    automationUseCases: lane === 'ai_automation' ? ['Build support workflows on top of the API.'] : [],
    whoShouldCare: ['Engineers'],
  };
}

describe('feed ingestion', () => {
  it('parses RSS items into enriched framework articles', () => {
    const items: Parser.Item[] = [
      {
        title: 'Next.js 16',
        link: 'https://example.com/next16',
        contentSnippet:
          'Next.js 16 adds cache components, better build output, and migration notes for forms.',
        isoDate: '2025-10-21T00:00:00.000Z',
      },
    ];

    const articles = parseRssItemsToArticles(frameworkSource, items);

    expect(articles).toHaveLength(1);
    expect(articles[0]?.topicLane).toBe('frameworks');
    expect(articles[0]?.versionOrRelease).toBe('16');
    expect(articles[0]?.upgradeHighlights.join(' ')).toContain('cache');
  });

  it('parses HTML single pages into enriched AI automation articles', () => {
    const html = `
      <html>
        <head>
          <title>OpenAI launches new automation controls</title>
          <meta name="description" content="Teams can automate review workflows and tool-driven tasks with the latest API update.">
          <meta property="article:published_time" content="2026-04-10T00:00:00.000Z">
        </head>
        <body>
          <main>
            <h1>OpenAI launches new automation controls</h1>
            <p>Teams can automate review workflows and tool-driven tasks with the latest API update.</p>
          </main>
        </body>
      </html>
    `;

    const articles = parseHtmlToArticles(aiSource, html);

    expect(articles).toHaveLength(1);
    expect(articles[0]?.topicLane).toBe('ai_automation');
    expect(articles[0]?.automationUseCases.join(' ')).toContain('workflow');
    expect(articles[0]?.frameworkOrVendor).toBe('OpenAI');
  });

  it('balances articles equally across lanes when both are available', () => {
    const articles = [
      makeArticle('f1', 'frameworks', '2026-04-11T00:00:00.000Z'),
      makeArticle('f2', 'frameworks', '2026-04-10T00:00:00.000Z'),
      makeArticle('a1', 'ai_automation', '2026-04-09T00:00:00.000Z'),
      makeArticle('a2', 'ai_automation', '2026-04-08T00:00:00.000Z'),
      makeArticle('a3', 'ai_automation', '2026-04-07T00:00:00.000Z'),
    ];

    const balanced = balanceArticlesByLane(articles);

    expect(balanced.map((article) => article.id)).toEqual(['f1', 'a1', 'f2', 'a2']);
  });
});
