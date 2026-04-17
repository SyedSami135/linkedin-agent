export type SourceType = 'rss' | 'github' | 'html';
export type SourceKind = 'rss' | 'html';
export type TopicLane = 'frameworks' | 'ai_automation';
export type HtmlExtractor = 'article_cards' | 'single_page';
export type PostStyle = 'standard' | 'poll_text' | 'question';
export type ReviewAction = 'approve' | 'edit' | 'skip';
export type EngagementAction = 'liked' | 'commented' | 'liked_and_commented' | 'skipped';

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
  readonly lane: TopicLane;
}

export interface SourceConfig {
  readonly kind: SourceKind;
  readonly lane: TopicLane;
  readonly url: string;
  readonly label: string;
  readonly topics: ReadonlyArray<string>;
  readonly maxArticlesPerRun: number;
  readonly extractor?: HtmlExtractor;
  readonly frameworkOrVendor?: string;
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
  readonly sources: ReadonlyArray<SourceConfig>;
  readonly github?: GithubConfig;
  readonly schedule: string;
  readonly postDefaults: PostDefaults;
  readonly engagement?: EngagementConfig;
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
  readonly topicLane: TopicLane;
  readonly frameworkOrVendor?: string;
  readonly versionOrRelease?: string;
  readonly upgradeHighlights: ReadonlyArray<string>;
  readonly breakingChanges: ReadonlyArray<string>;
  readonly automationUseCases: ReadonlyArray<string>;
  readonly whoShouldCare: ReadonlyArray<string>;
  readonly repoStats?: RepoStats;
}

export interface ContentIdea {
  readonly articleId: string;
  readonly title: string;
  readonly link: string;
  readonly lane: TopicLane;
  readonly frameworkOrVendor?: string;
  readonly versionOrRelease?: string;
  readonly sourceFacts: ReadonlyArray<string>;
  readonly keyPoints: ReadonlyArray<string>;
  readonly cautionPoints: ReadonlyArray<string>;
  readonly audience: ReadonlyArray<string>;
  readonly angle: string;
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

export interface EngagementConfig {
  readonly enabled: boolean;
  readonly schedule: string;
  readonly maxPostsPerRun: number;
  readonly maxCommentsPerRun: number;
  readonly likePosts: boolean;
  readonly commentPosts: boolean;
  readonly minPostLength: number;
  readonly maxPostLength: number;
  readonly scrollRounds: number;
  readonly headless: boolean;
}

export interface EngagementCandidate {
  readonly id: string;
  readonly urn?: string;
  readonly authorName: string;
  readonly text: string;
  readonly url: string;
  readonly scrapedAt: string;
  readonly hasImage: boolean;
  readonly hasVideo: boolean;
  readonly hasDocument: boolean;
  readonly hasArticleCard: boolean;
  readonly isLiked: boolean;
}

export interface EngagementDecision {
  readonly shouldEngage: boolean;
  readonly reason: string;
}

export interface InteractionHistoryEntry {
  readonly postId: string;
  readonly postUrl: string;
  readonly authorName: string;
  readonly action: EngagementAction;
  readonly commentText?: string;
  readonly engagedAt: string;
}
