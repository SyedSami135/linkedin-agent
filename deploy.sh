#!/bin/bash
# Deploy LinkedIn agent to AWS EC2 (Amazon Linux 2 / Ubuntu)
# Run this on your LOCAL machine: bash deploy.sh <your-ec2-ip>
# Usage: bash deploy.sh ec2-user@<ip>  OR  bash deploy.sh ubuntu@<ip>

set -e

SERVER=${1:?"Usage: bash deploy.sh <user@server-ip>"}
REMOTE_DIR="/home/$(echo $SERVER | cut -d@ -f1)/linkedin-agent"

echo "==> Syncing project to $SERVER:$REMOTE_DIR"
rsync -avz --exclude 'node_modules/' \
           --exclude '.git/' \
           --exclude 'dist/' \
           --exclude 'logs/' \
           --exclude 'data/history.json' \
           . "$SERVER:$REMOTE_DIR"

echo "==> Copying .env (secrets)"
rsync -avz .env "$SERVER:$REMOTE_DIR/.env"

echo "==> Copying browser session (so server can scrape LinkedIn feed headlessly)"
rsync -avz data/browser-session.json "$SERVER:$REMOTE_DIR/data/browser-session.json" 2>/dev/null || \
  echo "    [warn] No browser-session.json found — run locally first: npm run dev -- --now --source=feed"

echo "==> Installing dependencies on server"
ssh "$SERVER" "cd $REMOTE_DIR && npm install --omit=dev"

echo "==> Installing Playwright browsers on server"
ssh "$SERVER" "cd $REMOTE_DIR && npx playwright install chromium --with-deps"

echo "==> Starting PM2"
ssh "$SERVER" "cd $REMOTE_DIR && pm2 start ecosystem.config.cjs && pm2 save"

echo "==> Setting up PM2 auto-start on reboot"
ssh "$SERVER" "pm2 startup | tail -1 | bash" 2>/dev/null || \
  echo "    [info] Run 'pm2 startup' manually on the server and follow the instructions"

echo ""
echo "Done! Agent is running on $SERVER"
echo "Check status: ssh $SERVER 'pm2 status'"
echo "View logs:    ssh $SERVER 'pm2 logs linkedin-agent'"
