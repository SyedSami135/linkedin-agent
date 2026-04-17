import type { Article, ContentIdea, TopicLane } from './types.js';

const VERSION_PATTERNS = [
  /\b(?:v(?:ersion)?\s*)?(\d+\.\d+\.\d+)\b/i,
  /\b(?:v(?:ersion)?\s*)?(\d+\.\d+)\b/i,
  /\b(?:next\.js|react|nestjs|express|bun|gpt|claude|gemini|ai sdk)\s+(\d+)\b/i,
];

const VENDOR_KEYWORDS: Array<{ keyword: string; vendor: string }> = [
  { keyword: 'next.js', vendor: 'Next.js' },
  { keyword: 'react', vendor: 'React' },
  { keyword: 'nestjs', vendor: 'NestJS' },
  { keyword: 'express', vendor: 'Express' },
  { keyword: 'bun', vendor: 'Bun' },
  { keyword: 'openai', vendor: 'OpenAI' },
  { keyword: 'anthropic', vendor: 'Anthropic' },
  { keyword: 'vercel', vendor: 'Vercel' },
  { keyword: 'gemini', vendor: 'Google Gemini' },
];

const BREAKING_CHANGE_HINTS = [
  'breaking',
  'migration',
  'deprecated',
  'deprecate',
  'remove',
  'removed',
  'drop',
  'upgrade',
  'security',
  'compat',
];

const AI_WORKFLOW_HINTS = [
  'agent',
  'workflow',
  'automation',
  'tool',
  'sdk',
  'api',
  'eval',
  'deploy',
  'ops',
  'integration',
  'orchestr',
  'assistant',
];

const FRAMEWORK_HIGHLIGHT_HINTS = [
  'cache',
  'compiler',
  'runtime',
  'forms',
  'routing',
  'render',
  'server',
  'build',
  'performance',
  'typescript',
  'bundl',
  'devx',
];

function unique(items: ReadonlyArray<string>, limit = 4): ReadonlyArray<string> {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const raw of items) {
    const item = raw.trim().replace(/\s+/g, ' ');
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
    if (output.length >= limit) break;
  }

  return output;
}

function splitSentences(text: string): ReadonlyArray<string> {
  return text
    .split(/[\n\r]+|(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 20);
}

export function detectFrameworkOrVendor(text: string, fallback?: string): string | undefined {
  const lower = text.toLowerCase();
  for (const entry of VENDOR_KEYWORDS) {
    if (lower.includes(entry.keyword)) return entry.vendor;
  }
  return fallback;
}

export function extractVersionOrRelease(text: string): string | undefined {
  for (const pattern of VERSION_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }

  const releaseMatch = text.match(/\b([A-Z][A-Za-z0-9.+/-]{2,}\s(?:release|update|launch))\b/);
  return releaseMatch?.[1];
}

function extractHighlights(
  text: string,
  hints: ReadonlyArray<string>,
  fallbackPrefix: string
): ReadonlyArray<string> {
  const sentences = splitSentences(text);
  const hinted = sentences.filter((sentence) =>
    hints.some((hint) => sentence.toLowerCase().includes(hint))
  );

  if (hinted.length > 0) return unique(hinted, 3);

  return unique(
    sentences.slice(0, 2).map((sentence) => `${fallbackPrefix}: ${sentence}`),
    2
  );
}

function buildAudience(lane: TopicLane, vendor?: string): ReadonlyArray<string> {
  if (lane === 'frameworks') {
    return unique([
      vendor ? `${vendor} teams planning an upgrade` : '',
      'Full-stack JavaScript engineers',
      'Platform teams maintaining web apps',
      'Developers watching DX and runtime tradeoffs',
    ]);
  }

  return unique([
    vendor ? `Builders evaluating ${vendor} for production workflows` : '',
    'Engineers shipping AI-powered features',
    'Ops and support teams automating repetitive work',
    'Product teams integrating APIs into real workflows',
  ]);
}

export function deriveArticleMetadata(article: Omit<Article, 'frameworkOrVendor' | 'versionOrRelease' | 'upgradeHighlights' | 'breakingChanges' | 'automationUseCases' | 'whoShouldCare'> & {
  frameworkOrVendor?: string;
}): Pick<
  Article,
  | 'frameworkOrVendor'
  | 'versionOrRelease'
  | 'upgradeHighlights'
  | 'breakingChanges'
  | 'automationUseCases'
  | 'whoShouldCare'
> {
  const text = `${article.title}. ${article.summary}. ${article.feedLabel}. ${article.topics.join(' ')}`;
  const frameworkOrVendor = detectFrameworkOrVendor(text, article.frameworkOrVendor);
  const versionOrRelease = extractVersionOrRelease(text);
  const upgradeHighlights =
    article.topicLane === 'frameworks'
      ? extractHighlights(text, FRAMEWORK_HIGHLIGHT_HINTS, 'Upgrade signal')
      : [];
  const breakingChanges = extractHighlights(text, BREAKING_CHANGE_HINTS, 'Risk to watch');
  const automationUseCases =
    article.topicLane === 'ai_automation'
      ? extractHighlights(text, AI_WORKFLOW_HINTS, 'Workflow angle')
      : [];
  const whoShouldCare = buildAudience(article.topicLane, frameworkOrVendor);

  return {
    frameworkOrVendor,
    versionOrRelease,
    upgradeHighlights,
    breakingChanges,
    automationUseCases,
    whoShouldCare,
  };
}

function buildSourceFacts(article: Article): ReadonlyArray<string> {
  const facts = [
    article.frameworkOrVendor ? `Vendor/framework: ${article.frameworkOrVendor}` : '',
    article.versionOrRelease ? `Release/version: ${article.versionOrRelease}` : '',
    article.publishedAt ? `Published: ${article.publishedAt}` : '',
    `Source: ${article.feedLabel}`,
  ];

  return unique(facts, 4);
}

export function buildContentIdea(article: Article): ContentIdea {
  const keyPoints =
    article.topicLane === 'frameworks'
      ? article.upgradeHighlights
      : article.automationUseCases.length > 0
      ? article.automationUseCases
      : unique(splitSentences(article.summary), 3);

  const cautionPoints =
    article.breakingChanges.length > 0
      ? article.breakingChanges
      : article.topicLane === 'frameworks'
      ? ['Check migration notes before treating the upgrade as a drop-in change.']
      : ['Translate the release into a concrete workflow before calling it a win.'];

  return {
    articleId: article.id,
    title: article.title,
    link: article.link,
    lane: article.topicLane,
    frameworkOrVendor: article.frameworkOrVendor,
    versionOrRelease: article.versionOrRelease,
    sourceFacts: buildSourceFacts(article),
    keyPoints,
    cautionPoints,
    audience: article.whoShouldCare,
    angle:
      article.topicLane === 'frameworks'
        ? 'upgrade / migration / DX impact'
        : 'practical workflows / automation / shipping impact',
  };
}
