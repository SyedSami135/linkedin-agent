import { describe, expect, it } from 'vitest';
import {
  buildSystemPrompt,
  buildUserPrompt,
  HUMANIZE_SYSTEM_PROMPT,
  restoreProtectedSegments,
} from '../generator.js';
import type { Article, PostDefaults } from '../types.js';

const defaults: PostDefaults = {
  tone: 'professional yet conversational',
  maxLength: 1300,
  includeLink: true,
  hashtagCount: 6,
  postStyle: 'standard',
  styleWeights: {
    standard: 1,
    poll_text: 0,
    question: 0,
  },
};

function makeArticle(topicLane: Article['topicLane']): Article {
  return {
    id: `id-${topicLane}`,
    title: topicLane === 'frameworks' ? 'Next.js 16' : 'OpenAI workflow update',
    link: 'https://example.com/post',
    summary:
      topicLane === 'frameworks'
        ? 'Next.js 16 improves cache components and ships migration notes for forms.'
        : 'The API update improves workflow automation, agent tooling, and SDK integration.',
    publishedAt: '2026-04-16T00:00:00.000Z',
    feedLabel: 'Official Source',
    topics: topicLane === 'frameworks' ? ['nextjs'] : ['ai', 'automation'],
    sourceType: 'html',
    topicLane,
    frameworkOrVendor: topicLane === 'frameworks' ? 'Next.js' : 'OpenAI',
    versionOrRelease: topicLane === 'frameworks' ? '16' : '5.4',
    upgradeHighlights:
      topicLane === 'frameworks' ? ['Cache Components change rendering defaults.'] : [],
    breakingChanges: ['Migration notes need a careful read.'],
    automationUseCases:
      topicLane === 'ai_automation' ? ['Automate review flows and tool-calling workflows.'] : [],
    whoShouldCare: ['Engineers shipping production changes'],
  };
}

describe('generator prompts', () => {
  it('builds a framework prompt centered on upgrades and migration impact', () => {
    const article = makeArticle('frameworks');
    const systemPrompt = buildSystemPrompt(defaults, article, 'standard');
    const userPrompt = buildUserPrompt(article, 'standard');

    expect(systemPrompt).toContain('Do not invent personal usage');
    expect(systemPrompt).toContain('exactly 6 targeted hashtags');
    expect(systemPrompt).toContain('migration risk');
    expect(userPrompt).toContain('Upgrade highlights');
    expect(userPrompt).toContain('upgrade tradeoff');
  });

  it('builds an AI prompt centered on workflows and automation', () => {
    const article = makeArticle('ai_automation');
    const systemPrompt = buildSystemPrompt(defaults, article, 'question');
    const userPrompt = buildUserPrompt(article, 'question');

    expect(systemPrompt).toContain('automation opportunities');
    expect(userPrompt).toContain('Workflow angles');
    expect(userPrompt).toContain('practical action');
  });

  it('restores protected hashtag and poll endings after humanization', () => {
    const original = `Plain-language body.\n\nWhich would you choose?\n1. Faster builds\n2. Safer upgrades\n3. Better DX\n\n#Nextjs #React #JavaScript #WebDev #DX #Frontend`;
    const rewritten = 'Cleaner body copy that accidentally dropped the ending.';

    const restored = restoreProtectedSegments(original, rewritten);

    expect(restored).toContain('Which would you choose?');
    expect(restored.endsWith('#Nextjs #React #JavaScript #WebDev #DX #Frontend')).toBe(true);
  });

  it('locks the humanizer onto facts and final hashtags', () => {
    expect(HUMANIZE_SYSTEM_PROMPT).toContain('Preserve all factual details');
    expect(HUMANIZE_SYSTEM_PROMPT).toContain('Preserve the final hashtag block exactly');
    expect(HUMANIZE_SYSTEM_PROMPT).toContain('Do NOT add new information');
  });
});
