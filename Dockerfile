# syntax=docker/dockerfile:1
#
# Planly: Laravel + Firestore (gRPC) for Google Cloud Run.
# Build: docker build -t planly .    (or: gcloud run deploy --source .)
# All configuration is runtime env vars; the image is project-agnostic.

# ---------------------------------------------------------------------------
# 1) Frontend assets (Vite)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS assets
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: skips native postinstalls of dev-only tools (firebase-tools).
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY vite.config.js ./
COPY resources ./resources
RUN npm run build

# ---------------------------------------------------------------------------
# 2) PHP dependencies (Composer)
# ---------------------------------------------------------------------------
FROM composer:2 AS vendor
WORKDIR /app
COPY composer.json composer.lock ./
# Extensions (grpc, sodium, ...) live in the runtime image, not this one.
RUN composer install --no-dev --no-interaction --no-progress --prefer-dist \
        --no-scripts --no-autoloader --ignore-platform-reqs
COPY app ./app
COPY bootstrap ./bootstrap
COPY config ./config
COPY database ./database
COPY routes ./routes
RUN composer dump-autoload --no-dev --optimize --no-scripts

# ---------------------------------------------------------------------------
# 3) Runtime: PHP 8.3 + Apache, with grpc + protobuf for Firestore
# ---------------------------------------------------------------------------
FROM php:8.3-apache AS runtime

# install-php-extensions handles build deps and cleanup. grpc compiles from
# source and takes several minutes on the first build.
COPY --from=mlocati/php-extension-installer:2 /usr/bin/install-php-extensions /usr/local/bin/
RUN install-php-extensions grpc protobuf opcache

# Apache: serve /public, enable rewrites, listen on Cloud Run's $PORT.
ENV APACHE_DOCUMENT_ROOT=/var/www/html/public \
    PORT=8080
RUN a2enmod rewrite headers \
 && sed -ri 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf /etc/apache2/apache2.conf \
 && sed -ri 's/^Listen 80$/Listen ${PORT}/' /etc/apache2/ports.conf \
 && sed -ri 's/<VirtualHost \*:80>/<VirtualHost *:${PORT}>/' /etc/apache2/sites-available/000-default.conf
COPY docker/apache.conf /etc/apache2/conf-enabled/zz-planly.conf
COPY docker/php.ini /usr/local/etc/php/conf.d/zz-planly.ini

WORKDIR /var/www/html
COPY --chown=www-data:www-data . .
COPY --from=vendor --chown=www-data:www-data /app/vendor ./vendor
COPY --from=assets --chown=www-data:www-data /app/public/build ./public/build

# Package manifest (composer ran with --no-scripts). No secrets needed here.
RUN php artisan package:discover --ansi \
 && chown -R www-data:www-data bootstrap/cache storage

COPY docker/entrypoint.sh /usr/local/bin/planly-entrypoint
RUN chmod +x /usr/local/bin/planly-entrypoint

EXPOSE 8080
ENTRYPOINT ["planly-entrypoint"]
CMD ["apache2-foreground"]
