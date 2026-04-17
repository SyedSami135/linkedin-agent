import 'dotenv/config';
import cron from 'node-cron';
import { loadConfig, loadEngagementEnv } from './config.js';
import { runEngagementAgent } from './engagement-agent.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const runNow = args.includes('--now');
  const scheduleOnly = args.includes('--schedule');

  const config = await loadConfig();
  const env = loadEngagementEnv();

  if (!config.engagement?.enabled) {
    console.log('[engagement] Engagement agent is disabled in config.json');
    return;
  }

  if (runNow || !scheduleOnly) {
    await runEngagementAgent(config.engagement, env.GROQ_API_KEY);
  }

  if (!runNow) {
    cron.schedule(config.engagement.schedule, async () => {
      await runEngagementAgent(config.engagement!, env.GROQ_API_KEY);
    });

    console.log(`[engagement] Scheduler active on cron: ${config.engagement.schedule}`);
    process.on('SIGINT', () => process.exit(0));
    process.on('SIGTERM', () => process.exit(0));
  }
}

main().catch((err) => {
  console.error('[engagement] Fatal error:', err);
  process.exit(1);
});
