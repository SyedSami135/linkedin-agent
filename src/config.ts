import { readFile } from 'fs/promises';
import { z } from 'zod';
import type { AppConfig, Env } from './types.js';

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

const AppConfigSchema = z.object({
  feeds: z.array(FeedConfigSchema).min(1),
  github: GithubConfigSchema.optional(),
  schedule: z.string().min(1),
  postDefaults: PostDefaultsSchema,
});

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

  return Object.freeze(result.data) as AppConfig;
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
