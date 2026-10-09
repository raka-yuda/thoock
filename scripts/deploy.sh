#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_DIR="${1:-/opt/thoock/app}"
DEPLOY_BRANCH="${2:-main}"
EXPECTED_SHA="${3:-}"
THOOCK_APP_PORT="${4:-3000}"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"

fail() {
  printf 'Deployment failed: %s\n' "$1" >&2
  exit 1
}

command -v git >/dev/null || fail "git is not installed."
command -v docker >/dev/null || fail "Docker is not installed."
command -v curl >/dev/null || fail "curl is not installed."
docker compose version >/dev/null || fail "Docker Compose v2 is not installed."

[[ "$DEPLOY_DIR" == /* ]] || fail "DEPLOY_DIR must be an absolute path."
[[ "$DEPLOY_DIR" != "/" ]] || fail "DEPLOY_DIR cannot be the filesystem root."
[[ "$DEPLOY_BRANCH" =~ ^[A-Za-z0-9._/-]+$ ]] || fail "DEPLOY_BRANCH contains unsupported characters."
if [[ -n "$EXPECTED_SHA" && ! "$EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  fail "EXPECTED_SHA must be a full Git commit hash."
fi
[[ "$THOOCK_APP_PORT" =~ ^[0-9]+$ ]] || fail "THOOCK_APP_PORT must be numeric."
((THOOCK_APP_PORT >= 1024 && THOOCK_APP_PORT <= 65535)) ||
  fail "THOOCK_APP_PORT must be between 1024 and 65535."
[[ -d "$DEPLOY_DIR/.git" ]] || fail "$DEPLOY_DIR is not a Git checkout."

export THOOCK_APP_PORT
HEALTH_URL="http://127.0.0.1:$THOOCK_APP_PORT/login"

cd "$DEPLOY_DIR"

[[ -z "$(git status --porcelain --untracked-files=normal)" ]] ||
  fail "the deployment checkout has uncommitted or untracked files."
git fetch --prune origin "+refs/heads/$DEPLOY_BRANCH:refs/remotes/origin/$DEPLOY_BRANCH"
git checkout "$DEPLOY_BRANCH"
git merge --ff-only "origin/$DEPLOY_BRANCH"
[[ -z "$(git status --porcelain --untracked-files=normal)" ]] ||
  fail "the deployment checkout is not clean after updating."

DEPLOYED_SHA="$(git rev-parse HEAD)"
if [[ -n "$EXPECTED_SHA" && "$DEPLOYED_SHA" != "$EXPECTED_SHA" ]]; then
  fail "checked-out revision does not match the verified GitHub revision."
fi

[[ -f "$ENV_FILE" ]] || fail "$DEPLOY_DIR/$ENV_FILE is missing."
chmod 600 "$ENV_FILE"
grep -Eq '^POSTGRES_PASSWORD=[A-Za-z0-9._~-]{16,}$' "$ENV_FILE" ||
  fail "POSTGRES_PASSWORD must be a URL-safe value with at least 16 characters."
grep -Eq '^SESSION_SECRET=.{32,}$' "$ENV_FILE" ||
  fail "SESSION_SECRET must contain at least 32 characters."
if grep -Eq '^(POSTGRES_PASSWORD|SESSION_SECRET)=replace-' "$ENV_FILE"; then
  fail "replace the placeholder production secrets before deploying."
fi
if grep -Eq '^AUTH_BYPASS=true$' "$ENV_FILE"; then
  fail "AUTH_BYPASS cannot be enabled in production."
fi

compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
"${compose[@]}" config --quiet
"${compose[@]}" build app
"${compose[@]}" up -d postgres

database_ready=false
for _ in {1..30}; do
  if "${compose[@]}" exec -T postgres pg_isready -U stocklab -d stocklab >/dev/null 2>&1; then
    database_ready=true
    break
  fi
  sleep 2
done
[[ "$database_ready" == true ]] || fail "PostgreSQL did not become ready."

"${compose[@]}" run --rm --no-deps app node scripts/migrate.mjs
"${compose[@]}" up -d --no-deps app

application_ready=false
for _ in {1..30}; do
  if curl --fail --silent --show-error --max-time 5 "$HEALTH_URL" >/dev/null; then
    application_ready=true
    break
  fi
  sleep 2
done

if [[ "$application_ready" != true ]]; then
  "${compose[@]}" logs --tail=100 app >&2
  fail "Thoock did not pass its login-page health check."
fi

"${compose[@]}" ps
printf 'Thoock deployed successfully at revision %s.\n' "$DEPLOYED_SHA"
