export interface AppConfig {
  readonly feeds: ReadonlyArray<FeedConfig>;
  readonly schedule: string;
  readonly postDefaults: PostDefaults;
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
}

export interface Article {
  readonly id: string;
  readonly title: string;
  readonly link: string;
  readonly summary: string;
  readonly publishedAt: string;
  readonly feedLabel: string;
  readonly topics: ReadonlyArray<string>;
}

export interface GeneratedPost {
  readonly article: Article;
  readonly content: string;
  readonly generatedAt: string;
}

export type ReviewAction = 'approve' | 'edit' | 'skip';

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
}
