import { readFile } from 'fs/promises';
import { z } from 'zod';
import type { AppConfig, Env, SourceConfig } from './types.js';

const FeedConfigSchema = z.object({
  url: z.string().url(),
  label: z.string().min(1),
  topics: z.array(z.string()).min(1),
  maxArticlesPerRun: z.number().int().min(1).max(20).default(3),
});

const GithubConfigSchema = z.object({
  enabled: z.boolean().default(true),
  query: z.string().min(1).default('stars:>500+pushed:>2026-01-01'),
  maxReposPerRun: z.number().int().min(1).max(20).default(3),
  label: z.string().min(1).default('GitHub Trending'),
  topics: z.array(z.string()).default(['open-source', 'developer-tools', 'github']),
  lane: z.enum(['frameworks', 'ai_automation']).default('frameworks'),
});

const SourceConfigSchema = z.object({
  kind: z.enum(['rss', 'html']),
  lane: z.enum(['frameworks', 'ai_automation']),
  url: z.string().url(),
  label: z.string().min(1),
  topics: z.array(z.string()).min(1),
  maxArticlesPerRun: z.number().int().min(1).max(20).default(3),
  extractor: z.enum(['article_cards', 'single_page']).optional(),
  frameworkOrVendor: z.string().min(1).optional(),
}).superRefine((value, ctx) => {
  if (value.kind === 'html' && !value.extractor) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['extractor'],
      message: 'extractor is required for html sources',
    });
  }
});

const PostDefaultsSchema = z.object({
  tone: z.string().min(1).default('professional yet conversational'),
  maxLength: z.number().int().min(100).max(3000).default(1300),
  includeLink: z.boolean().default(true),
  hashtagCount: z.number().int().min(0).max(10).default(3),
  postStyle: z.enum(['standard', 'poll_text', 'question']).default('standard'),
  styleWeights: z.object({
    standard: z.number().min(0),
    poll_text: z.number().min(0),
    question: z.number().min(0),
  }).optional(),
});

const EngagementConfigSchema = z.object({
  enabled: z.boolean().default(true),
  schedule: z.string().min(1).default('30 14 * * 2,4,6'),
  maxPostsPerRun: z.number().int().min(1).max(20).default(3),
  maxCommentsPerRun: z.number().int().min(1).max(20).default(2),
  likePosts: z.boolean().default(true),
  commentPosts: z.boolean().default(true),
  minPostLength: z.number().int().min(50).max(5000).default(140),
  maxPostLength: z.number().int().min(100).max(5000).default(2200),
  scrollRounds: z.number().int().min(1).max(20).default(6),
  headless: z.boolean().default(true),
});

const AppConfigSchema = z.object({
  sources: z.array(SourceConfigSchema).min(1).optional(),
  feeds: z.array(FeedConfigSchema).min(1).optional(),
  github: GithubConfigSchema.optional(),
  schedule: z.string().min(1),
  postDefaults: PostDefaultsSchema,
  engagement: EngagementConfigSchema.optional(),
}).superRefine((value, ctx) => {
  if (!value.sources && !value.feeds) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sources'],
      message: 'Either sources or feeds must be configured',
    });
  }
});

function normalizeLegacyFeeds(feeds: ReadonlyArray<z.infer<typeof FeedConfigSchema>>): ReadonlyArray<SourceConfig> {
  return feeds.map((feed) => ({
    kind: 'rss',
    lane: 'frameworks',
    url: feed.url,
    label: feed.label,
    topics: feed.topics,
    maxArticlesPerRun: feed.maxArticlesPerRun,
  }));
}

export async function loadConfig(): Promise<AppConfig> {
  const configPath = new URL('../config.json', import.meta.url);

  let raw: unknown;
  try {
    const content = await readFile(configPath, 'utf-8');
    raw = JSON.parse(content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to load config.json: ${msg}`);
  }

  const result = AppConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid config.json:\n${issues}`);
  }

  const normalized: AppConfig = {
    schedule: result.data.schedule,
    postDefaults: result.data.postDefaults,
    github: result.data.github,
    engagement: result.data.engagement,
    sources: Object.freeze(
      (result.data.sources ?? normalizeLegacyFeeds(result.data.feeds ?? [])).map((source) =>
        Object.freeze(source)
      )
    ),
  };

  return Object.freeze(normalized);
}

export function loadEnv(): Env {
  const required = ['GROQ_API_KEY', 'LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_PERSON_URN'] as const;
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
        'Copy .env.example to .env and fill in the values.\n' +
        'Run `npm run setup` to generate LinkedIn credentials.'
    );
  }

  return Object.freeze({
    GROQ_API_KEY: process.env['GROQ_API_KEY']!,
    LINKEDIN_ACCESS_TOKEN: process.env['LINKEDIN_ACCESS_TOKEN']!,
    LINKEDIN_PERSON_URN: process.env['LINKEDIN_PERSON_URN']!,
    GITHUB_TOKEN: process.env['GITHUB_TOKEN'],
  });
}

export function loadEngagementEnv(): Pick<Env, 'GROQ_API_KEY'> {
  if (!process.env['GROQ_API_KEY']) {
    throw new Error(
      'Missing required environment variable: GROQ_API_KEY\n' +
        'Copy .env.example to .env and fill in the values.'
    );
  }

  return Object.freeze({
    GROQ_API_KEY: process.env['GROQ_API_KEY']!,
  });
}
