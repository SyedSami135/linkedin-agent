import axios from 'axios';
import { createHash } from 'crypto';
import type { Article, GithubConfig } from './types.js';
import { deriveArticleMetadata } from './content-ideas.js';

interface GithubApiRepo {
  readonly id: number;
  readonly full_name: string;
  readonly html_url: string;
  readonly description: string | null;
  readonly stargazers_count: number;
  readonly language: string | null;
  readonly topics: ReadonlyArray<string>;
  readonly open_issues_count: number;
  readonly pushed_at: string;
}

interface GithubSearchResponse {
  readonly items: ReadonlyArray<GithubApiRepo>;
}

function makeHeaders(token?: string): Record<string, string> {
  const base: Record<string, string> = { Accept: 'application/vnd.github+json' };
  return token ? { ...base, Authorization: `Bearer ${token}` } : base;
}

function buildSearchUrl(query: string, maxReposPerRun: number): string {
  const encoded = encodeURIComponent(query);
  return `https://api.github.com/search/repositories?q=${encoded}&sort=stars&order=desc&per_page=${maxReposPerRun}`;
}

function repoToArticle(repo: GithubApiRepo, config: GithubConfig): Article {
  const id = createHash('sha256').update(String(repo.id)).digest('hex').slice(0, 16);
  const description = repo.description ?? 'No description provided.';
  const topicsList = repo.topics.length > 0 ? `Topics: ${repo.topics.join(', ')}` : '';
  const summary = `${description} ${topicsList}`.trim().slice(0, 500);
  const mergedTopics = [...config.topics, ...repo.topics].slice(0, 8);

  const base = {
    id,
    title: repo.full_name,
    link: repo.html_url,
    summary,
    publishedAt: repo.pushed_at,
    feedLabel: config.label,
    topics: mergedTopics,
    sourceType: 'github',
    topicLane: config.lane,
    repoStats: {
      stars: repo.stargazers_count,
      language: repo.language,
      topics: repo.topics,
      openIssues: repo.open_issues_count,
    },
  } as const;

  return {
    ...base,
    ...deriveArticleMetadata(base),
  };
}

export async function fetchGithubRepos(
  config: GithubConfig,
  token?: string
): Promise<ReadonlyArray<Article>> {
  const url = buildSearchUrl(config.query, config.maxReposPerRun);

  try {
    const response = await axios.get<GithubSearchResponse>(url, {
      headers: makeHeaders(token),
      timeout: 10_000,
    });

    const remaining = response.headers['x-ratelimit-remaining'];
    if (remaining !== undefined && Number(remaining) < 5) {
      console.warn(`[github] Rate limit low: ${remaining} requests remaining`);
    }

    return response.data.items.map((repo) => repoToArticle(repo, config));
  } catch (err) {
    console.warn(`[github] Failed to fetch repos: ${err}`);
    return [];
  }
}
