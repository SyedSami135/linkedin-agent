import Groq from 'groq-sdk';
import type { Article, GeneratedPost, PostDefaults } from './types.js';

const MODEL = 'llama-3.3-70b-versatile';
const MAX_TOKENS = 1024;
const RETRY_DELAY_MS = 2000;

const HUMANIZE_SYSTEM_PROMPT = `You are an editor who rewrites AI-generated LinkedIn posts to sound like a real human wrote them.

Rules:
- Remove buzzwords: "game-changer", "leverage", "synergy", "groundbreaking", "exciting", "delve", "revolutionize", "seamless", "robust"
- Vary sentence length — mix short punchy sentences with longer ones
- Add a conversational opener (a question, a short observation, or a personal take)
- Use contractions naturally (it's, I've, we're, that's)
- Keep one or two minor imperfections (a casual aside, an em dash, an ellipsis)
- Keep all hashtags exactly as-is at the end
- Keep the article link exactly as-is
- Do NOT add new information
- Output ONLY the rewritten post, nothing else`;

function buildSystemPrompt(defaults: PostDefaults): string {
  return (
    `You are a LinkedIn content strategist. Generate engaging LinkedIn posts from article summaries. ` +
    `The post should be ${defaults.tone}, under ${defaults.maxLength} characters, ` +
    `and include exactly ${defaults.hashtagCount} relevant hashtags at the end. ` +
    `Do not fabricate information beyond what the article provides. ` +
    `Output ONLY the post text, no explanations, no quotes around the post.`
  );
}

function buildUserPrompt(article: Article): string {
  return [
    `Article title: ${article.title}`,
    `Article summary: ${article.summary}`,
    `Article link: ${article.link}`,
    `Topics: ${article.topics.join(', ')}`,
    '',
    'Generate a LinkedIn post.',
  ].join('\n');
}

function ensureLinkIncluded(content: string, link: string): string {
  if (content.includes(link)) return content;
  return `${content}\n\n${link}`;
}

async function callGroq(
  client: Groq,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
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

export async function generatePost(
  article: Article,
  defaults: PostDefaults,
  apiKey: string
): Promise<GeneratedPost> {
  const client = new Groq({ apiKey });
  const systemPrompt = buildSystemPrompt(defaults);
  const userPrompt = buildUserPrompt(article);

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
    const shortenPrompt =
      userPrompt +
      `\n\nIMPORTANT: The post MUST be under ${defaults.maxLength} characters. Shorten it.`;
    content = await callGroq(client, systemPrompt, shortenPrompt);
  }

  if (defaults.includeLink) {
    content = ensureLinkIncluded(content, article.link);
  }

  // Humanize pass — rewrite to sound less AI-generated
  content = await callGroq(client, HUMANIZE_SYSTEM_PROMPT, `Rewrite this LinkedIn post:\n\n${content}`);

  if (defaults.includeLink) {
    content = ensureLinkIncluded(content, article.link);
  }

  return { article, content, generatedAt: new Date().toISOString() };
}
