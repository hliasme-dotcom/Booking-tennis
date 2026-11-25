#!/usr/bin/env bash
# Εγκατάσταση / ενημέρωση της πλατφόρμας σε server Ubuntu/Debian (π.χ. Hetzner).
# Δεν αγγίζει άλλες εφαρμογές: δική της βάση, δικός της χρήστης, δική της θύρα, δικό της site στο nginx.
#
#   curl -fsSL https://raw.githubusercontent.com/hliasme-dotcom/Booking-tennis/main/deploy/install.sh | sudo bash
#
# Ξανατρέχοντάς το, ενημερώνει την εφαρμογή στην τελευταία έκδοση.
set -euo pipefail

REPO="https://github.com/hliasme-dotcom/Booking-tennis.git"
APP_DIR="/opt/booking-tennis"
APP_USER="tennis"
DB_NAME="tennis"
DB_USER="tennis"
PORT="${PORT:-3100}"
NODE_MIN=20

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mΣΦΑΛΜΑ: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Τρέξε το ως root (ή με sudo)."
command -v apt-get >/dev/null || die "Χρειάζεται Ubuntu ή Debian."

IP="$(curl -fsS -4 https://api.ipify.org || hostname -I | awk '{print $1}')"
DOMAIN="${DOMAIN:-tennis.${IP//./-}.sslip.io}"

say "Βασικά πακέτα"
export DEBIAN_FRONTEND=noninteractive
apt-get -o DPkg::Lock::Timeout=600 update -qq
apt-get -o DPkg::Lock::Timeout=600 install -y -qq git curl ca-certificates openssl nginx >/dev/null

# Node.js: χρησιμοποιούμε το υπάρχον αν είναι αρκετά νέο, αλλιώς βάζουμε δικό μας στο /opt (χωρίς να αλλάξουμε το σύστημα)
NODE_BIN=""
if command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge "$NODE_MIN" ]; then
  NODE_BIN="$(dirname "$(readlink -f "$(command -v node)")")"
else
  say "Εγκατάσταση Node.js 22 στο /opt/node22"
  ARCH="$(uname -m)"; case "$ARCH" in x86_64) ARCH=x64;; aarch64) ARCH=arm64;; esac
  VER="$(curl -fsS https://nodejs.org/dist/index.json | grep -o '"version":"v22\.[0-9.]*"' | head -1 | cut -d'"' -f4)"
  mkdir -p /opt/node22
  curl -fsSL "https://nodejs.org/dist/${VER}/node-${VER}-linux-${ARCH}.tar.xz" | tar -xJ -C /opt/node22 --strip-components=1
  NODE_BIN="/opt/node22/bin"
fi
export PATH="$NODE_BIN:$PATH"
echo "Node $(node -v) από $NODE_BIN"

# PostgreSQL: χρησιμοποιούμε το υπάρχον, αλλιώς το εγκαθιστούμε
if ! command -v psql >/dev/null; then
  say "Εγκατάσταση PostgreSQL"
  apt-get -o DPkg::Lock::Timeout=600 install -y -qq postgresql >/dev/null
fi
systemctl enable --now postgresql >/dev/null 2>&1 || true

id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir "/home/$APP_USER" --shell /usr/sbin/nologin "$APP_USER"

FIRST_INSTALL=0
ENV_FILE="$APP_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  FIRST_INSTALL=1
  if ss -ltn "( sport = :$PORT )" | grep -q LISTEN; then die "Η θύρα $PORT χρησιμοποιείται ήδη. Τρέξε ξανά με PORT=άλλη_θύρα."; fi
  if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
    die "Υπάρχει ήδη βάση '$DB_NAME' χωρίς αρχείο ρυθμίσεων. Σταματάω για να μη χαθούν δεδομένα."
  fi
  say "Δημιουργία βάσης '$DB_NAME'"
  DB_PASS="$(openssl rand -hex 24)"
  sudo -u postgres psql -q -c "CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASS'"
  sudo -u postgres psql -q -c "CREATE DATABASE $DB_NAME OWNER $DB_USER"
fi

say "Λήψη κώδικα"
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch -q --depth 1 origin main
  git -C "$APP_DIR" reset -q --hard origin/main
else
  git clone -q --depth 1 "$REPO" "$APP_DIR"
fi
if [ "$FIRST_INSTALL" -eq 1 ]; then
  umask 077
  cat > "$ENV_FILE" <<EOF
DATABASE_URL=postgres://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME
NODE_ENV=production
PORT=$PORT
EOF
  umask 022
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chmod 600 "$ENV_FILE"

say "Εγκατάσταση και build (2-3 λεπτά)"
sudo -u "$APP_USER" env PATH="$PATH" HOME="/home/$APP_USER" bash -c "cd $APP_DIR && npm ci --no-audit --no-fund --loglevel=error && npm run build >/dev/null"
sudo -u "$APP_USER" env PATH="$PATH" bash -c "cd $APP_DIR && node --env-file=.env scripts/migrate.mjs"

ADMIN_PASS=""
if [ "$FIRST_INSTALL" -eq 1 ]; then
  # FIRST_USER_ADMIN=1: δεν φτιάχνουμε admin, γίνεται admin όποιος εγγραφεί πρώτος (για εγκατάσταση χωρίς κονσόλα)
  if [ "${FIRST_USER_ADMIN:-0}" != "1" ]; then
    ADMIN_PASS="$(openssl rand -base64 12 | tr -d '/+=' | cut -c1-12)"
    sudo -u "$APP_USER" env PATH="$PATH" bash -c "cd $APP_DIR && node --env-file=.env scripts/create-admin.mjs admin@tennis.local 'Διαχειριστής' '$ADMIN_PASS'"
  fi
  DEMO_PASS="${DEMO_PASSWORD:-$(openssl rand -base64 9 | tr -d '/+=' | cut -c1-10)}"
  sudo -u "$APP_USER" env PATH="$PATH" DEMO_PASSWORD="$DEMO_PASS" bash -c "cd $APP_DIR && node --env-file=.env scripts/seed.mjs"
fi

say "Υπηρεσία systemd"
cat > /etc/systemd/system/booking-tennis.service <<EOF
[Unit]
Description=Booking tennis (last-minute)
After=network.target postgresql.service

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$NODE_BIN/node $APP_DIR/node_modules/next/dist/bin/next start -p $PORT -H 127.0.0.1
Restart=always
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable booking-tennis >/dev/null 2>&1
systemctl restart booking-tennis

say "nginx για $DOMAIN"
SITE=/etc/nginx/sites-available/booking-tennis
if [ ! -f "$SITE" ]; then
  cat > "$SITE" <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
  ln -sf "$SITE" /etc/nginx/sites-enabled/booking-tennis
fi
nginx -t >/dev/null 2>&1 || { rm -f /etc/nginx/sites-enabled/booking-tennis; die "Το nginx δεν δέχτηκε τη ρύθμιση. Δεν άλλαξε τίποτα στα υπάρχοντα sites."; }
systemctl reload nginx

say "Πιστοποιητικό HTTPS"
command -v certbot >/dev/null || apt-get -o DPkg::Lock::Timeout=600 install -y -qq certbot python3-certbot-nginx >/dev/null
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect >/dev/null 2>&1 \
  || echo "Το HTTPS δεν στήθηκε ακόμα (μπορεί να φταίει το firewall στη θύρα 80). Το site δουλεύει στο http://$DOMAIN"

sleep 3
if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/login"; then STATUS="Τρέχει"; else STATUS="ΔΕΝ απαντά: δες 'journalctl -u booking-tennis -n 50'"; fi

echo
echo "=================================================================="
echo " Κατάσταση:   $STATUS"
echo " Διεύθυνση:   https://$DOMAIN"
if [ -n "$ADMIN_PASS" ]; then
  echo " Admin:       admin@tennis.local"
  echo " Κωδικός:     $ADMIN_PASS"
  echo " Demo παίκτες: maria@demo.gr, nikos@demo.gr, eleni@demo.gr / $DEMO_PASS"
  echo " ΣΗΜΕΙΩΣΕ τους κωδικούς τώρα: δεν θα ξαναεμφανιστούν."
elif [ "$FIRST_INSTALL" -eq 1 ]; then
  echo " Admin:       όποιος κάνει πρώτος εγγραφή στο site"
fi
echo "=================================================================="
