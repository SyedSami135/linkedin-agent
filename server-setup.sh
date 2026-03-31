#!/bin/bash
# Run this ONCE on your AWS EC2 instance to set up the environment
# Amazon Linux 2: bash server-setup.sh
# Ubuntu:         bash server-setup.sh ubuntu

set -e

OS=${1:-"amazon"}

echo "==> Installing Node.js 22"
if [ "$OS" = "ubuntu" ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  # Amazon Linux 2
  curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
  sudo yum install -y nodejs
fi

echo "==> Installing PM2 globally"
sudo npm install -g pm2

echo "==> Installing Playwright system dependencies"
if [ "$OS" = "ubuntu" ]; then
  sudo apt-get install -y \
    libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2
else
  sudo yum install -y \
    nss atk at-spi2-atk libXt libXtst alsa-lib \
    libXrandr libgbm mesa-libgbm cups-libs
fi

echo ""
echo "Server setup complete!"
echo "Now run the deploy script from your local machine:"
echo "  bash deploy.sh ec2-user@<your-ip>"
