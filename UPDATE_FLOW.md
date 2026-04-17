# Update Flow

## Overview

This repo now runs two separate LinkedIn agents:

- `linkedin-agent`: generates and publishes source-based LinkedIn posts
- `linkedin-engagement-agent`: likes and comments on informative text-only LinkedIn feed posts

Both agents share the same Playwright LinkedIn browser session stored in `data/browser-session.json`.

## 1. Content Posting Flow

Entry point:

- `src/index.ts`

Main flow:

1. Load config from `config.json`
2. Load required env vars for Groq and LinkedIn publishing
3. Fetch source content from curated `sources`
4. Normalize each item into enriched article metadata
5. Balance selection across:
   - `frameworks`
   - `ai_automation`
6. Generate LinkedIn posts with lane-specific prompts
7. Humanize output while preserving:
   - links
   - facts
   - versions
   - hashtags
8. Review via CLI or email
9. Publish approved posts through the LinkedIn API
10. Save publish history in `data/history.json`

Key files:

- `src/config.ts`
- `src/feeds.ts`
- `src/content-ideas.ts`
- `src/generator.ts`
- `src/index.ts`
- `src/publisher.ts`

## 2. Engagement Flow

Entry point:

- `src/engagement-index.ts`

Main flow:

1. Load config from `config.json`
2. Load Groq env only
3. Open LinkedIn using the shared browser session
4. Scrape feed candidates from the LinkedIn home feed
5. Filter candidates to keep only posts that are:
   - text-only
   - informative
   - within preferred text length
   - not already engaged before
6. Reject posts with:
   - images
   - video
   - documents
   - article/link cards
   - obvious promotional wording
7. Generate a short, polite, human comment
8. Open each post permalink
9. Re-check the post before interacting
10. Like and/or comment based on config limits
11. Save interaction history in `data/engagement-history.json`

Key files:

- `src/linkedin-browser.ts`
- `src/engagement-core.ts`
- `src/engagement-agent.ts`
- `src/engagement-history.ts`
- `src/engagement-index.ts`

## 3. Shared Session Flow

Shared login/session handling lives in:

- `src/linkedin-browser.ts`

Behavior:

1. Check for existing `data/browser-session.json`
2. Validate that the saved session is still logged in
3. If invalid or missing:
   - open LinkedIn login page in headed mode
   - wait for manual login
   - save updated session
4. Reuse the saved session for both agents

## 4. Config Flow

Main config file:

- `config.json`

Important blocks:

- `sources`: curated source list for content generation
- `postDefaults`: tone, max length, hashtag count, style weights
- `engagement`: engagement-agent schedule and interaction limits

Current engagement controls:

- `enabled`
- `schedule`
- `maxPostsPerRun`
- `maxCommentsPerRun`
- `likePosts`
- `commentPosts`
- `minPostLength`
- `maxPostLength`
- `scrollRounds`
- `headless`

## 5. Runtime Commands

Post generation agent:

```bash
npm run dev
```

Engagement agent:

```bash
npm run engage
```

Run engagement once immediately:

```bash
npm run engage:now
```

Build:

```bash
npm run build
```

## 6. PM2 Flow

PM2 config:

- `ecosystem.config.cjs`

Processes:

- `linkedin-agent`
- `linkedin-engagement-agent`

## 7. Safety Notes

- Engagement only targets text-only posts
- Engagement skips media-heavy or promotional posts
- Interaction history prevents repeat engagement on the same post
- Posting and engagement are separated so one pipeline does not block the other
