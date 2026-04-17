import { describe, expect, it } from 'vitest';
import { buildContentIdea, deriveArticleMetadata } from '../content-ideas.js';
import type { Article } from '../types.js';

function makeArticle(
  title: string,
  summary: string,
  topicLane: Article['topicLane'],
  frameworkOrVendor?: string
): Article {
  const base = {
    id: title.toLowerCase().replace(/\W+/g, '-'),
    title,
    link: 'https://example.com/post',
    summary,
    publishedAt: '2026-04-16T00:00:00.000Z',
    feedLabel: 'Official Source',
    topics: ['javascript', 'automation'],
    sourceType: 'html' as const,
    topicLane,
    frameworkOrVendor,
  };

  return {
    ...base,
    ...deriveArticleMetadata(base),
  };
}

describe('content idea extraction', () => {
  it('extracts upgrade signals for Next.js 16', () => {
    const article = makeArticle(
      'Next.js 16',
      'Next.js 16 introduces cache components, build pipeline improvements, and migration notes for server forms.',
      'frameworks',
      'Next.js'
    );

    expect(article.versionOrRelease).toBe('16');
    expect(article.upgradeHighlights.join(' ')).toContain('cache');
  });

  it('extracts concrete framework facts for React 19.2', () => {
    const article = makeArticle(
      'React 19.2',
      'React 19.2 ships Activity, useEffectEvent guidance, and more predictable concurrent rendering details.',
      'frameworks',
      'React'
    );

    const idea = buildContentIdea(article);

    expect(idea.frameworkOrVendor).toBe('React');
    expect(idea.versionOrRelease).toBe('19.2');
    expect(idea.keyPoints.join(' ')).toContain('useEffectEvent');
  });

  it('extracts caution points for NestJS migration material', () => {
    const article = makeArticle(
      'Migrating to NestJS 11',
      'The migration guide covers breaking changes, deprecated packages, and upgrade steps for NestJS 11.',
      'frameworks',
      'NestJS'
    );

    expect(article.breakingChanges.join(' ')).toContain('breaking');
    expect(article.whoShouldCare[0]).toContain('NestJS');
  });

  it('extracts runtime release details for Bun 1.3', () => {
    const article = makeArticle(
      'Bun 1.3',
      'Bun 1.3 improves runtime behavior, build speed, and TypeScript handling across common toolchains.',
      'frameworks',
      'Bun'
    );

    expect(article.versionOrRelease).toBe('1.3');
    expect(article.upgradeHighlights.join(' ')).toContain('runtime');
  });

  it('extracts workflow-oriented use cases for AI tooling updates', () => {
    const article = makeArticle(
      'OpenAI expands workflow automation',
      'The API update adds better tool orchestration, workflow automation hooks, and SDK support for agents in production.',
      'ai_automation',
      'OpenAI'
    );

    const idea = buildContentIdea(article);

    expect(idea.keyPoints.join(' ')).toContain('workflow');
    expect(idea.audience.join(' ')).toContain('AI-powered');
    expect(idea.angle).toContain('automation');
  });
});
