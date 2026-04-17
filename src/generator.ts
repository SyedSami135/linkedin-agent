import Groq from 'groq-sdk';
import { buildContentIdea } from './content-ideas.js';
import type { Article, GeneratedPost, PostDefaults, PostStyle } from './types.js';

const MODEL = 'llama-3.3-70b-versatile';
const MAX_TOKENS = 1024;
const RETRY_DELAY_MS = 2000;

function pickPostStyle(defaults: PostDefaults): PostStyle {
  if (!defaults.styleWeights) return defaults.postStyle;
  const { standard, poll_text, question } = defaults.styleWeights;
  const total = standard + poll_text + question;
  const roll = Math.random() * total;
  if (roll < standard) return 'standard';
  if (roll < standard + poll_text) return 'poll_text';
  return 'question';
}

function buildStyleTail(style: PostStyle): string {
  if (style === 'poll_text') {
    return (
      '\n\nEnd the post with a poll-style question and exactly 3 numbered options for readers to pick from in the comments. ' +
      'Format: "Which would you choose?\n1. Option A\n2. Option B\n3. Option C"'
    );
  }
  if (style === 'question') {
    return '\n\nEnd the post with one direct open question addressed to technical readers.';
  }
  return '';
}

function buildLaneInstructions(article: Article): string {
  if (article.topicLane === 'frameworks') {
    return (
      'Focus on upgrade impact, migration risk, developer experience, runtime behavior, and what teams should watch before adopting it. ' +
      'If there are breaking changes or security implications, mention them plainly.'
    );
  }

  return (
    'Focus on practical workflows, automation opportunities, API or SDK implications, and what builders can ship or streamline because of the release. ' +
    'Avoid broad market commentary unless it is directly supported by the source facts.'
  );
}

export function buildSystemPrompt(defaults: PostDefaults, article: Article, style: PostStyle): string {
  return (
    `You are a senior developer and LinkedIn writer producing grounded posts about real software releases. ` +
    `Write in a personal analyst voice: specific, credible, lightly opinionated, and natural. ` +
    `The post should be ${defaults.tone}, under ${defaults.maxLength} characters, and include exactly ${defaults.hashtagCount} targeted hashtags at the end. ` +
    `Use only source facts provided to you. Do not invent personal usage, customer stories, benchmarks, migration pain, adoption claims, timelines, or quotes. ` +
    `Do not use generic hype language such as "game-changer", "revolutionary", "groundbreaking", "exciting", "insane", "delve", "leverage", "synergy", "seamless", or "the future of". ` +
    `${buildLaneInstructions(article)} ` +
    `Prefer short paragraphs, concrete nouns, and direct phrasing. Output ONLY the post text, no explanations.` +
    buildStyleTail(style)
  );
}

function buildFrameworkPrompt(article: Article, style: PostStyle): string {
  const idea = buildContentIdea(article);
  const lines = [
    `Title: ${article.title}`,
    `Published: ${article.publishedAt}`,
    `Link: ${article.link}`,
    `Source: ${article.feedLabel}`,
    `Framework/vendor: ${idea.frameworkOrVendor ?? 'unknown'}`,
    `Release/version: ${idea.versionOrRelease ?? 'not explicitly stated'}`,
    `Source facts: ${idea.sourceFacts.join(' | ')}`,
    `Upgrade highlights: ${article.upgradeHighlights.join(' | ') || article.summary}`,
    `Migration or caution points: ${idea.cautionPoints.join(' | ')}`,
    `Who should care: ${idea.audience.join(' | ')}`,
    '',
    'Write a realistic LinkedIn post that:',
    '- explains what changed in plain English',
    '- gives a grounded take on why it matters in practice',
    '- mentions at least one upgrade tradeoff, migration note, or operational implication',
    '- sounds like an informed engineer reacting to the release, not a content marketer',
  ];

  if (style !== 'standard') lines.push(`- post style: ${style.replace('_', ' ')}`);
  return lines.join('\n');
}

function buildAiPrompt(article: Article, style: PostStyle): string {
  const idea = buildContentIdea(article);
  const lines = [
    `Title: ${article.title}`,
    `Published: ${article.publishedAt}`,
    `Link: ${article.link}`,
    `Source: ${article.feedLabel}`,
    `Vendor: ${idea.frameworkOrVendor ?? 'unknown'}`,
    `Release/version: ${idea.versionOrRelease ?? 'not explicitly stated'}`,
    `Source facts: ${idea.sourceFacts.join(' | ')}`,
    `Workflow angles: ${idea.keyPoints.join(' | ') || article.summary}`,
    `Caution points: ${idea.cautionPoints.join(' | ')}`,
    `Who should care: ${idea.audience.join(' | ')}`,
    '',
    'Write a realistic LinkedIn post that:',
    '- focuses on builder workflows, automation, APIs, or operational leverage',
    '- explains what teams could do differently because of this release',
    '- avoids vague AGI talk or generic industry futurism',
    '- sounds like a developer or operator translating news into practical action',
  ];

  if (style !== 'standard') lines.push(`- post style: ${style.replace('_', ' ')}`);
  return lines.join('\n');
}

export function buildUserPrompt(article: Article, style: PostStyle): string {
  return article.topicLane === 'frameworks'
    ? buildFrameworkPrompt(article, style)
    : buildAiPrompt(article, style);
}

async function callGroq(client: Groq, systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });
  const text = response.choices[0]?.message?.content;
  if (!text) throw new Error('Empty response from Groq API');
  return text.trim();
}

export const HUMANIZE_SYSTEM_PROMPT =
  `You are editing a draft LinkedIn post so it reads like a real developer or operator wrote it.\n\n` +
  `Rules:\n` +
  `- Preserve all factual details, release names, versions, dates, links, and product names exactly\n` +
  `- Preserve any numbered poll options exactly if they exist\n` +
  `- Preserve the final hashtag block exactly as provided\n` +
  `- Remove marketing filler and generic AI tone\n` +
  `- Use natural sentence rhythm with some short sentences\n` +
  `- Keep the tone grounded, specific, and lightly opinionated\n` +
  `- Do NOT add new information, new claims, or fake personal anecdotes\n` +
  `- Output ONLY the rewritten post, nothing else`;

function extractTrailingHashtagBlock(content: string): string {
  const match = content.match(/(?:\n|\r\n){2}((?:#\w[\w.-]*\s*){2,})\s*$/);
  return match?.[1]?.trim() ?? '';
}

function extractPollBlock(content: string): string {
  const match = content.match(/((?:Which would you choose\?|What would you pick\?).*?(?:\n[123]\.\s.*){3})\s*(?:\n{2}#|$)/is);
  return match?.[1]?.trim() ?? '';
}

function removeProtectedSegments(content: string): string {
  let output = content.trim();
  const hashtagBlock = extractTrailingHashtagBlock(output);
  if (hashtagBlock) {
    output = output.slice(0, output.lastIndexOf(hashtagBlock)).trimEnd();
  }

  const pollBlock = extractPollBlock(output);
  if (pollBlock) {
    output = output.replace(pollBlock, '').trimEnd();
  }

  return output.trim();
}

export function restoreProtectedSegments(original: string, rewritten: string): string {
  const hashtagBlock = extractTrailingHashtagBlock(original);
  const pollBlock = extractPollBlock(original);
  let output = removeProtectedSegments(rewritten);

  if (pollBlock) {
    output = `${output}\n\n${pollBlock}`;
  }
  if (hashtagBlock) {
    output = `${output}\n\n${hashtagBlock}`;
  }

  return output.trim();
}

function ensureLinkIncluded(content: string, link: string): string {
  if (!link || content.includes(link)) return content;
  return `${content}\n\n${link}`;
}

export async function generatePost(
  article: Article,
  defaults: PostDefaults,
  apiKey: string
): Promise<GeneratedPost> {
  const client = new Groq({ apiKey });
  const style = pickPostStyle(defaults);
  const systemPrompt = buildSystemPrompt(defaults, article, style);
  const userPrompt = buildUserPrompt(article, style);

  let content: string;
  try {
    content = await callGroq(client, systemPrompt, userPrompt);
  } catch (err: unknown) {
    const isRateLimit = err instanceof Error && err.message.includes('429');
    if (isRateLimit) {
      console.warn('[generator] Rate limited - retrying in 2s...');
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      content = await callGroq(client, systemPrompt, userPrompt);
    } else {
      throw err;
    }
  }

  if (content.length > defaults.maxLength) {
    const shortenPrompt =
      userPrompt + `\n\nIMPORTANT: The post MUST be under ${defaults.maxLength} characters. Shorten it.`;
    content = await callGroq(client, systemPrompt, shortenPrompt);
  }

  if (defaults.includeLink) content = ensureLinkIncluded(content, article.link);

  const humanized = await callGroq(client, HUMANIZE_SYSTEM_PROMPT, `Rewrite this LinkedIn post:\n\n${content}`);
  content = restoreProtectedSegments(content, humanized);

  if (defaults.includeLink) content = ensureLinkIncluded(content, article.link);

  return { article, content, generatedAt: new Date().toISOString() };
}
