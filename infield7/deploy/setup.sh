#!/usr/bin/env bash
# One-time setup on a fresh Ubuntu 22.04/24.04 VPS. Run from inside the cloned repo:
#   sudo bash infield7/deploy/setup.sh [website-domain] [api-domain]
# Both domains need a DNS A record pointing at this server before running, so HTTPS certificates can be issued.
set -euo pipefail

APP_HOST="${1:-infield.ltabai.in}"
API_HOST="${2:-infieldback.ltabai.in}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN_USER="${SUDO_USER:-$(whoami)}"

echo "==> Packages"
apt-get update
apt-get install -y curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https postgresql ufw
if ! command -v node >/dev/null || [[ "$(node -v)" != v20* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

echo "==> Database"
if [[ ! -f "$ROOT/backend/.env.production" ]]; then
  DB_PASS="$(openssl rand -hex 16)"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE infield7 LOGIN PASSWORD '${DB_PASS}';" || true
  sudo -u postgres psql -c "ALTER ROLE infield7 PASSWORD '${DB_PASS}';"
  sudo -u postgres createdb -O infield7 infield7 2>/dev/null || true
  cat > "$ROOT/backend/.env.production" <<EOF
DATABASE_URL=postgres://infield7:${DB_PASS}@127.0.0.1:5432/infield7
JWT_SECRET=$(openssl rand -hex 32)
PORT=4000
SMS_PROVIDER=stub
EOF
  chown "$RUN_USER" "$ROOT/backend/.env.production"
  chmod 600 "$ROOT/backend/.env.production"
fi
echo "NEXT_PUBLIC_API_URL=https://${API_HOST}" > "$ROOT/frontend/.env.production"
chown "$RUN_USER" "$ROOT/frontend/.env.production"

echo "==> Build"
sudo -u "$RUN_USER" bash -c "cd '$ROOT/backend' && npm ci"
sudo -u "$RUN_USER" bash -c "cd '$ROOT/frontend' && npm ci && npm run build"

echo "==> Services"
for unit in infield7-api infield7-web; do
  sed -e "s#__ROOT__#${ROOT}#g" -e "s#__USER__#${RUN_USER}#g" "$ROOT/deploy/${unit}.service" > "/etc/systemd/system/${unit}.service"
done
systemctl daemon-reload
systemctl enable --now infield7-api infield7-web
systemctl restart infield7-api infield7-web

sed -e "s#__APP_HOST__#${APP_HOST}#g" -e "s#__API_HOST__#${API_HOST}#g" "$ROOT/deploy/Caddyfile" > /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy

ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable

echo
echo "Website: https://${APP_HOST}"
echo "API:     https://${API_HOST}"
echo "Phone:   set EXPO_PUBLIC_API_URL=https://${API_HOST} in mobile/.env on your laptop"
