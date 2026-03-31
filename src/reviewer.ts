import { select, editor, confirm } from '@inquirer/prompts';
import type { GeneratedPost, ReviewDecision } from './types.js';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const SEPARATOR = '─'.repeat(60);

function printPost(post: GeneratedPost, index: number, total: number): void {
  console.log(`\n${SEPARATOR}`);
  console.log(`${DIM}Post ${index + 1} of ${total} | Feed: ${post.article.feedLabel}${RESET}`);
  console.log(`${BOLD}${CYAN}${post.article.title}${RESET}`);
  console.log(`${DIM}${post.article.link}${RESET}`);
  console.log(`${SEPARATOR}`);
  console.log(post.content);
  console.log(`\n${DIM}Length: ${post.content.length} chars${RESET}`);
}

export async function reviewPost(
  post: GeneratedPost,
  index: number,
  total: number
): Promise<ReviewDecision> {
  printPost(post, index, total);

  const action = await select({
    message: `${YELLOW}What would you like to do with this post?${RESET}`,
    choices: [
      { name: `${GREEN}Approve${RESET} — publish as-is`, value: 'approve' as const },
      { name: 'Edit — modify before publishing', value: 'edit' as const },
      { name: 'Skip — discard this post', value: 'skip' as const },
    ],
  });

  if (action === 'edit') {
    const edited = await editor({
      message: 'Edit the post content:',
      default: post.content,
      waitForUserInput: false,
    });
    const finalContent = edited.trim();

    console.log(`\n${SEPARATOR}`);
    console.log(finalContent);
    console.log(`${DIM}Length: ${finalContent.length} chars${RESET}`);

    const confirmed = await confirm({ message: 'Publish this edited version?' });
    if (confirmed) {
      return { action: 'approve', finalContent };
    }
    return { action: 'skip', finalContent: post.content };
  }

  return { action, finalContent: post.content };
}

export interface ReviewedPost {
  readonly post: GeneratedPost;
  readonly decision: ReviewDecision;
}

export async function reviewBatch(
  posts: ReadonlyArray<GeneratedPost>
): Promise<ReadonlyArray<ReviewedPost>> {
  const results: ReviewedPost[] = [];

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i]!;
    const decision = await reviewPost(post, i, posts.length);
    results.push({ post, decision });

    if (decision.action === 'skip' && i < posts.length - 1) {
      const skipRest = await confirm({
        message: `Skip all remaining ${posts.length - i - 1} post(s)?`,
        default: false,
      });
      if (skipRest) {
        for (let j = i + 1; j < posts.length; j++) {
          results.push({ post: posts[j]!, decision: { action: 'skip', finalContent: posts[j]!.content } });
        }
        break;
      }
    }
  }

  return results;
}
