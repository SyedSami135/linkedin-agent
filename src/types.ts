export type SourceType = 'rss' | 'github';
export type PostStyle = 'standard' | 'poll_text' | 'question';
export type ReviewAction = 'approve' | 'edit' | 'skip';

export interface RepoStats {
  readonly stars: number;
  readonly language: string | null;
  readonly topics: ReadonlyArray<string>;
  readonly openIssues: number;
}

export interface GithubConfig {
  readonly enabled: boolean;
  readonly query: string;
  readonly maxReposPerRun: number;
  readonly label: string;
  readonly topics: ReadonlyArray<string>;
}

export interface FeedConfig {
  readonly url: string;
  readonly label: string;
  readonly topics: ReadonlyArray<string>;
  readonly maxArticlesPerRun: number;
}

export interface PostDefaults {
  readonly tone: string;
  readonly maxLength: number;
  readonly includeLink: boolean;
  readonly hashtagCount: number;
  readonly postStyle: PostStyle;
  readonly styleWeights?: {
    readonly standard: number;
    readonly poll_text: number;
    readonly question: number;
  };
}

export interface AppConfig {
  readonly feeds: ReadonlyArray<FeedConfig>;
  readonly github?: GithubConfig;
  readonly schedule: string;
  readonly postDefaults: PostDefaults;
}

export interface Article {
  readonly id: string;
  readonly title: string;
  readonly link: string;
  readonly summary: string;
  readonly publishedAt: string;
  readonly feedLabel: string;
  readonly topics: ReadonlyArray<string>;
  readonly sourceType: SourceType;
  readonly repoStats?: RepoStats;
}

export interface GeneratedPost {
  readonly article: Article;
  readonly content: string;
  readonly generatedAt: string;
}

export interface ReviewDecision {
  readonly action: ReviewAction;
  readonly finalContent: string;
}

export interface HistoryEntry {
  readonly articleId: string;
  readonly articleTitle: string;
  readonly articleLink: string;
  readonly postContent: string;
  readonly publishedAt: string;
  readonly linkedInPostUrn: string;
}

export interface PublishResult {
  readonly success: boolean;
  readonly postUrn?: string;
  readonly error?: string;
}

export interface Env {
  readonly GROQ_API_KEY: string;
  readonly LINKEDIN_ACCESS_TOKEN: string;
  readonly LINKEDIN_PERSON_URN: string;
  readonly GITHUB_TOKEN?: string;
}
