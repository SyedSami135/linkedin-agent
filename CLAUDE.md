# LinkedIn Agent

Automated LinkedIn posting agent: scrapes LinkedIn feed → generates humanized posts via Groq (Llama 3.3) → sends for email approval → publishes via LinkedIn API.

## PM2 Services

| Name | Type | Mode |
|------|------|------|
| linkedin-agent | Node.js / tsx | Cron scheduler |

**Terminal Commands:**
```bash
pm2 start ecosystem.config.cjs   # First time start
pm2 save                         # Save process list (survive reboot)
pm2 startup                      # Register auto-start on boot
pm2 restart linkedin-agent       # Restart
pm2 stop linkedin-agent          # Stop
pm2 logs linkedin-agent          # Live logs
pm2 status                       # Status overview
pm2 monit                        # Real-time monitor
pm2 resurrect                    # Restore saved processes
```

## Key Files

| File | Purpose |
|------|---------|
| `config.json` | Feeds, cron schedule, post tone/length |
| `.env` | All secrets (Groq, LinkedIn, Email) |
| `data/history.json` | Post log (dedup) |
| `data/browser-session.json` | LinkedIn browser session |
| `logs/` | PM2 output + error logs |

## Approval Flow

Agent emails posts to `EMAIL_TO` with a token. Reply `APPROVE` or `SKIP` to that email. Agent polls inbox every 30s for up to 24h.

## Schedule

Default: Mon/Wed/Fri at 9am (`0 9 * * 1,3,5`) — edit in `config.json`.
