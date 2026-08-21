#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-main}"
APP_DIR="${APP_DIR:-/var/www/ssp}"
PM2_APP="${PM2_APP:-ssp}"

cd "$APP_DIR"

if [ ! -f .env.production ]; then
  echo "ERROR: missing .env.production in $APP_DIR"
  exit 1
fi

if ! grep -q '^SUPABASE_SERVICE_ROLE_KEY=.' .env.production; then
  echo "ERROR: SUPABASE_SERVICE_ROLE_KEY is missing in .env.production"
  echo "Add it from Supabase → Project Settings → API → service_role key"
  exit 1
fi

SUPABASE_URL="$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.production | cut -d= -f2- | tr -d '\r\"')"
if [ -n "$SUPABASE_URL" ]; then
  echo "==> check Supabase reachability"
  if ! curl -fsS -m 10 -I "$SUPABASE_URL/rest/v1/" >/dev/null; then
    echo "WARN: cannot reach Supabase from this server ($SUPABASE_URL)"
  fi
fi

echo "==> git pull ($BRANCH)"
if [ "${SKIP_GIT_PULL:-}" != "1" ]; then
  git pull origin "$BRANCH"
else
  echo "SKIP_GIT_PULL=1 — using files already synced to $APP_DIR"
fi

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
