#!/bin/sh
# Container start-up for Cloud Run. Config is cached here (not at build time)
# because it comes from runtime environment variables.
set -e
cd /var/www/html

if [ -z "$APP_KEY" ]; then
    echo "planly: APP_KEY is not set. Generate one with: php artisan key:generate --show" >&2
    exit 1
fi

# Cloud Run's filesystem is in-memory and per instance; make sure Laravel's
# writable directories exist.
mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache
chown -R www-data:www-data storage bootstrap/cache

# Fails fast (non-zero exit) if production is misconfigured, e.g. emulator
# variables set: see App\Support\ProductionGuard.
su -s /bin/sh www-data -c "php artisan config:cache && php artisan route:cache && php artisan view:cache"

exec "$@"
