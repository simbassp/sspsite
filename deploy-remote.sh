#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-main}"
APP_DIR="${APP_DIR:-/var/www/ssp}"
PM2_APP="${PM2_APP:-ssp}"

cd "$APP_DIR"

echo "==> git pull ($BRANCH)"
git pull origin "$BRANCH"

echo "==> npm ci"
npm ci

echo "==> build to .next-build (site keeps serving old .next)"
rm -rf .next-build
NEXT_DIST_DIR=.next-build npm run build

echo "==> swap build atomically"
if [ -d .next ]; then
  rm -rf .next-old
  mv .next .next-old
fi
mv .next-build .next

echo "==> pm2 restart"
pm2 restart "$PM2_APP" --update-env

rm -rf .next-old .next-build

echo "==> deploy ok"
