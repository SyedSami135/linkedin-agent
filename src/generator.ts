import Groq from 'groq-sdk';
import type { Article, GeneratedPost, PostDefaults, PostStyle } from './types.js';

const MODEL = 'llama-3.3-70b-versatile';
const MAX_TOKENS = 1024;
const RETRY_DELAY_MS = 2000;

// ── Style helpers ────────────────────────────────────────────────────────────

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
      'Format: "Which would you choose?\n1) Option A\n2) Option B\n3) Option C"'
    );
  }
  if (style === 'question') {
    return '\n\nEnd the post with one direct open question addressed to your audience to spark a conversation.';
  }
  return '';
}

// ── Prompt builders ──────────────────────────────────────────────────────────

function buildSystemPrompt(defaults: PostDefaults, style: PostStyle): string {
  const base =
    `You are a LinkedIn content strategist. Generate engaging LinkedIn posts. ` +
    `The post should be ${defaults.tone}, under ${defaults.maxLength} characters, ` +
    `and include exactly ${defaults.hashtagCount} relevant hashtags at the end. ` +
    `Do not fabricate information. Output ONLY the post text, no explanations.`;
  return base + buildStyleTail(style);
}

function buildRssUserPrompt(article: Article, style: PostStyle): string {
  const lines = [
    `Article title: ${article.title}`,
    `Article summary: ${article.summary}`,
    `Article link: ${article.link}`,
    `Topics: ${article.topics.join(', ')}`,
    '',
    'Generate a LinkedIn post.',
  ];
  if (style !== 'standard') lines.push(`Post style: ${style.replace('_', ' ')}`);
  return lines.join('\n');
}

function buildGithubUserPrompt(article: Article, style: PostStyle): string {
  const stats = article.repoStats;
  const lines = [
    `Repository: ${article.title}`,
    `GitHub URL: ${article.link}`,
    `Description: ${article.summary}`,
    `Stars: ${stats?.stars?.toLocaleString() ?? 'unknown'}`,
    `Language: ${stats?.language ?? 'unknown'}`,
    `Topics: ${stats?.topics?.join(', ') ?? article.topics.join(', ')}`,
    '',
    'Generate a LinkedIn post that covers:',
    '1. What this repository does (1-2 sentences)',
    '2. The problem it solves and why developers should care',
    '3. A concrete use case ("Perfect if you\'re building X...")',
    '4. A call to action',
  ];
  if (style !== 'standard') lines.push(`\nPost style: ${style.replace('_', ' ')}`);
  return lines.join('\n');
}

function buildUserPrompt(article: Article, style: PostStyle): string {
  return article.sourceType === 'github'
    ? buildGithubUserPrompt(article, style)
    : buildRssUserPrompt(article, style);
}

// ── Groq API call ────────────────────────────────────────────────────────────

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

const HUMANIZE_SYSTEM_PROMPT =
  `You are an editor who rewrites AI-generated LinkedIn posts to sound like a real human wrote them.\n\n` +
  `Rules:\n` +
  `- Remove buzzwords: "game-changer", "leverage", "synergy", "groundbreaking", "exciting", "delve", "revolutionize", "seamless", "robust"\n` +
  `- Vary sentence length — mix short punchy sentences with longer ones\n` +
  `- Add a conversational opener (a question, a short observation, or a personal take)\n` +
  `- Use contractions naturally (it's, I've, we're, that's)\n` +
  `- Keep one or two minor imperfections (a casual aside, an em dash, an ellipsis)\n` +
  `- Keep all hashtags exactly as-is at the end\n` +
  `- Keep the article/repo link exactly as-is\n` +
  `- For poll_text posts: keep the numbered options exactly as-is at the end\n` +
  `- Do NOT add new information\n` +
  `- Output ONLY the rewritten post, nothing else`;

function ensureLinkIncluded(content: string, link: string): string {
  if (!link || content.includes(link)) return content;
  return `${content}\n\n${link}`;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function generatePost(
  article: Article,
  defaults: PostDefaults,
  apiKey: string
): Promise<GeneratedPost> {
  const client = new Groq({ apiKey });
  const style = pickPostStyle(defaults);
  const systemPrompt = buildSystemPrompt(defaults, style);
  const userPrompt = buildUserPrompt(article, style);

  let content: string;
  try {
    content = await callGroq(client, systemPrompt, userPrompt);
  } catch (err: unknown) {
    const isRateLimit = err instanceof Error && err.message.includes('429');
    if (isRateLimit) {
      console.warn('[generator] Rate limited — retrying in 2s...');
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      content = await callGroq(client, systemPrompt, userPrompt);
    } else {
      throw err;
    }
  }

  if (content.length > defaults.maxLength) {
    const shortenPrompt = userPrompt + `\n\nIMPORTANT: The post MUST be under ${defaults.maxLength} characters. Shorten it.`;
    content = await callGroq(client, systemPrompt, shortenPrompt);
  }

  if (defaults.includeLink) content = ensureLinkIncluded(content, article.link);

  content = await callGroq(client, HUMANIZE_SYSTEM_PROMPT, `Rewrite this LinkedIn post:\n\n${content}`);

  if (defaults.includeLink) content = ensureLinkIncluded(content, article.link);

  return { article, content, generatedAt: new Date().toISOString() };
}
