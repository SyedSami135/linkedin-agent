/**
 * Email notifier: sends post for approval and polls inbox for reply.
 * Uses Gmail SMTP (send) + IMAP (read reply).
 * Set up a Gmail App Password at: https://myaccount.google.com/apppasswords
 */

import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { randomBytes } from 'crypto';
import type { GeneratedPost, ReviewDecision } from './types.js';

const POLL_INTERVAL_MS = 30_000;   // check inbox every 30s
const POLL_TIMEOUT_MS = 24 * 60 * 60 * 1000; // give up after 24h

export interface EmailConfig {
  readonly smtpHost: string;
  readonly smtpPort: number;
  readonly user: string;
  readonly pass: string;
  readonly to: string;
}

export function loadEmailConfig(): EmailConfig {
  const required = ['EMAIL_USER', 'EMAIL_PASS', 'EMAIL_TO'] as const;
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing email env vars: ${missing.join(', ')}. See .env.example`);
  }
  return {
    smtpHost: process.env['EMAIL_SMTP_HOST'] ?? 'smtp.gmail.com',
    smtpPort: Number(process.env['EMAIL_SMTP_PORT'] ?? 587),
    user: process.env['EMAIL_USER']!,
    pass: process.env['EMAIL_PASS']!,
    to: process.env['EMAIL_TO']!,
  };
}

function makeToken(): string {
  return randomBytes(6).toString('hex').toUpperCase();
}

function buildEmailBody(post: GeneratedPost, token: string): string {
  return `
LinkedIn Post for Approval [${token}]
${'─'.repeat(50)}

📰 Source: ${post.article.feedLabel}
🔗 Article: ${post.article.link}

${'─'.repeat(50)}
POST CONTENT:
${'─'.repeat(50)}

${post.content}

${'─'.repeat(50)}
Characters: ${post.content.length}

TO APPROVE:  Reply with just: APPROVE
TO SKIP:     Reply with just: SKIP

This request expires in 24 hours.
Token: ${token}
`.trim();
}

async function sendApprovalEmail(
  cfg: EmailConfig,
  post: GeneratedPost,
  token: string
): Promise<string> {
  const transporter = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpPort === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });

  const subject = `[LinkedIn Agent] Approve post? [${token}]`;
  const body = buildEmailBody(post, token);

  const info = await transporter.sendMail({
    from: cfg.user,
    to: cfg.to,
    subject,
    text: body,
  });

  return info.messageId;
}

async function pollForReply(cfg: EmailConfig, token: string): Promise<'approve' | 'skip'> {
  const client = new ImapFlow({
    host: process.env['EMAIL_IMAP_HOST'] ?? 'imap.gmail.com',
    port: Number(process.env['EMAIL_IMAP_PORT'] ?? 993),
    secure: true,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
  });

  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    try {
      await client.connect();
      await client.mailboxOpen('INBOX');

      // Search for messages containing the token in subject or body
      const since = new Date(Date.now() - 25 * 60 * 60 * 1000); // last 25h
      const messages = client.fetch(
        { since, seen: false },
        { source: true, envelope: true }
      );

      for await (const msg of messages) {
        const raw = msg.source?.toString() ?? '';
        const upperRaw = raw.toUpperCase();

        if (!upperRaw.includes(token)) continue;

        if (upperRaw.includes('\nAPPROVE') || upperRaw.match(/^APPROVE\s*$/m)) {
          await client.logout();
          return 'approve';
        }
        if (upperRaw.includes('\nSKIP') || upperRaw.match(/^SKIP\s*$/m)) {
          await client.logout();
          return 'skip';
        }
      }

      await client.logout();
    } catch (err) {
      console.warn(`[notifier] IMAP check failed: ${err}`);
    }
  }

  console.warn(`[notifier] No reply received for token ${token} — skipping post.`);
  return 'skip';
}

export async function requestEmailApproval(
  post: GeneratedPost,
  cfg: EmailConfig
): Promise<ReviewDecision> {
  const token = makeToken();

  console.log(`[notifier] Sending post for approval to ${cfg.to} (token: ${token})`);
  await sendApprovalEmail(cfg, post, token);
  console.log(`[notifier] Email sent. Waiting for reply (APPROVE / SKIP)...`);

  const action = await pollForReply(cfg, token);
  console.log(`[notifier] Received: ${action.toUpperCase()} for token ${token}`);

  return { action: action === 'approve' ? 'approve' : 'skip', finalContent: post.content };
}
