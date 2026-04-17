import { describe, expect, it } from 'vitest';
import {
  buildEngagementSystemPrompt,
  buildEngagementUserPrompt,
  decideEngagement,
  isTextOnlyCandidate,
  selectEngagementCandidates,
} from '../engagement-core.js';
import type { EngagementCandidate, EngagementConfig } from '../types.js';

const config: EngagementConfig = {
  enabled: true,
  schedule: '30 14 * * 2,4,6',
  maxPostsPerRun: 3,
  maxCommentsPerRun: 2,
  likePosts: true,
  commentPosts: true,
  minPostLength: 140,
  maxPostLength: 2200,
  scrollRounds: 6,
  headless: true,
};

function makeCandidate(overrides: Partial<EngagementCandidate> = {}): EngagementCandidate {
  return {
    id: 'candidate-1',
    urn: 'urn:li:activity:1',
    authorName: 'A Builder',
    text:
      'How we cut support backlog with a simple AI triage workflow. We mapped the handoff points, added review gates, and kept humans in the loop for the risky cases.',
    url: 'https://www.linkedin.com/feed/update/urn:li:activity:1/',
    scrapedAt: '2026-04-17T00:00:00.000Z',
    hasImage: false,
    hasVideo: false,
    hasDocument: false,
    hasArticleCard: false,
    isLiked: false,
    ...overrides,
  };
}

describe('engagement core', () => {
  it('accepts informative text-only posts', () => {
    const candidate = makeCandidate();

    expect(isTextOnlyCandidate(candidate)).toBe(true);
    expect(decideEngagement(candidate, config)).toEqual({
      shouldEngage: true,
      reason: 'Text-only informative post',
    });
  });

  it('rejects media posts and promotional posts', () => {
    const media = makeCandidate({ hasImage: true });
    const promo = makeCandidate({
      text:
        'We are hiring across engineering and growth. DM me, follow for more updates, and share this with your network.',
    });

    expect(decideEngagement(media, config).shouldEngage).toBe(false);
    expect(decideEngagement(promo, config).reason).toContain('promotional');
  });

  it('filters already-engaged posts out of the selection set', () => {
    const selected = selectEngagementCandidates(
      [
        makeCandidate({ id: '1' }),
        makeCandidate({ id: '2', text: 'How we approached framework migration planning. We documented risks, tested assumptions, and kept rollout notes for the team.' }),
      ],
      new Set(['1']),
      config
    );

    expect(selected).toHaveLength(1);
    expect(selected[0]?.id).toBe('2');
  });

  it('builds a grounded engagement prompt', () => {
    const candidate = makeCandidate();
    const systemPrompt = buildEngagementSystemPrompt();
    const userPrompt = buildEngagementUserPrompt(candidate);

    expect(systemPrompt).toContain('short LinkedIn comments');
    expect(systemPrompt).toContain('No emojis');
    expect(userPrompt).toContain('Post text:');
    expect(userPrompt).toContain('responds to the substance');
  });
});
