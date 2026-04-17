import Groq from 'groq-sdk';
import type { EngagementCandidate, EngagementConfig, EngagementDecision } from './types.js';

const MODEL = 'llama-3.3-70b-versatile';
const MAX_TOKENS = 220;

const PROMO_SIGNALS = [
  'we are hiring',
  'hiring',
  'open to work',
  'dm me',
  'link in comments',
  'follow me',
  'follow for more',
  'subscribe',
  'sale',
  'discount',
  'giveaway',
  'proud to announce',
  'excited to announce',
];

const INFORMATIVE_SIGNALS = [
  'how',
  'why',
  'guide',
  'lesson',
  'lessons',
  'learned',
  'tips',
  'pattern',
  'architecture',
  'api',
  'automation',
  'agent',
  'ai',
  'framework',
  'migration',
  'release',
  'performance',
  'system',
  'build',
  'debug',
  'stack',
  'workflow',
  'benchmark',
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function countSentences(text: string): number {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 20).length;
}

export function isTextOnlyCandidate(candidate: EngagementCandidate): boolean {
  return !candidate.hasImage && !candidate.hasVideo && !candidate.hasDocument && !candidate.hasArticleCard;
}

export function decideEngagement(candidate: EngagementCandidate, config: EngagementConfig): EngagementDecision {
  if (!isTextOnlyCandidate(candidate)) {
    return { shouldEngage: false, reason: 'Has media or article attachments' };
  }

  if (!candidate.url) {
    return { shouldEngage: false, reason: 'Missing permalink' };
  }

  if (candidate.text.length < config.minPostLength || candidate.text.length > config.maxPostLength) {
    return { shouldEngage: false, reason: 'Outside preferred text length' };
  }

  const text = normalize(candidate.text);
  if (PROMO_SIGNALS.some((signal) => text.includes(signal))) {
    return { shouldEngage: false, reason: 'Looks promotional rather than informative' };
  }

  const sentenceCount = countSentences(candidate.text);
  const informativeHits = INFORMATIVE_SIGNALS.filter((signal) => text.includes(signal)).length;
  const hasStructuredText = /\d+\./.test(candidate.text) || candidate.text.includes(':') || candidate.text.includes('•');

  if (sentenceCount < 2 && !hasStructuredText) {
    return { shouldEngage: false, reason: 'Too short or unstructured to be informative' };
  }

  if (informativeHits === 0 && !hasStructuredText) {
    return { shouldEngage: false, reason: 'No strong informative signals found' };
  }

  return { shouldEngage: true, reason: 'Text-only informative post' };
}

export function selectEngagementCandidates(
  candidates: ReadonlyArray<EngagementCandidate>,
  historyIds: ReadonlySet<string>,
  config: EngagementConfig
): ReadonlyArray<EngagementCandidate> {
  const selected: EngagementCandidate[] = [];

  for (const candidate of candidates) {
    if (selected.length >= config.maxPostsPerRun) break;
    if (historyIds.has(candidate.id)) continue;
    if (!decideEngagement(candidate, config).shouldEngage) continue;
    selected.push(candidate);
  }

  return selected;
}

export function buildEngagementSystemPrompt(): string {
  return (
    'You write short LinkedIn comments that sound like a thoughtful human professional. ' +
    'Keep comments polite, real, and specific. No emojis, no hashtags, no AI-sounding hype, no fake personal claims, no excessive praise. ' +
    'Add one concrete observation or one follow-up question based only on the post text. ' +
    'Output only the comment text.'
  );
}

export function buildEngagementUserPrompt(candidate: EngagementCandidate): string {
  return [
    `Author: ${candidate.authorName}`,
    `Post text: ${candidate.text}`,
    '',
    'Write one LinkedIn comment that:',
    '- is 1 or 2 sentences',
    '- sounds natural and respectful',
    '- responds to the substance of the post',
    '- avoids generic praise like "great post" unless it adds a real observation',
  ].join('\n');
}

export async function generateEngagementComment(
  candidate: EngagementCandidate,
  apiKey: string
): Promise<string> {
  const client = new Groq({ apiKey });
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [
      { role: 'system', content: buildEngagementSystemPrompt() },
      { role: 'user', content: buildEngagementUserPrompt(candidate) },
    ],
  });

  const text = response.choices[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty response while generating engagement comment');
  return text.replace(/\s+/g, ' ').trim();
}
