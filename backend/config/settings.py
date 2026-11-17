"""
Django settings for config project.
"""

import os
from datetime import timedelta
from pathlib import Path

import dj_database_url
from corsheaders.defaults import default_headers
from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

_INSECURE_DEFAULT_SECRET_KEY = "django-insecure-dev-only-change-me"
SECRET_KEY = os.environ.get("SECRET_KEY", _INSECURE_DEFAULT_SECRET_KEY)
DEBUG = os.environ.get("DEBUG", "true").lower() == "true"
ALLOWED_HOSTS = [h.strip() for h in os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if h.strip()]

# Fail loudly instead of silently serving production traffic with a guessable,
# repo-visible key — this can only happen if a deployment's .env is missing
# SECRET_KEY entirely, but "insecure key + DEBUG=False" is exactly the state that
# looks fine until someone forges a session/signed cookie.
if not DEBUG and SECRET_KEY == _INSECURE_DEFAULT_SECRET_KEY:
    raise ImproperlyConfigured(
        "SECRET_KEY is missing from the environment and DEBUG=False — refusing to "
        "start with the insecure default key in production. Set SECRET_KEY in .env."
    )

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework.authtoken",  # old never-expiring login tokens; no longer accepted, table kept
    "rest_framework_simplejwt.token_blacklist",  # signed-out / used refresh tokens
    "corsheaders",
    "accounts",
    "formulas",
    "reference",
    "rfq",
    "delivery",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# Database — SQLite for zero-friction local dev; set DATABASE_URL (postgres://...)
# in production (Railway/Render inject this automatically for a managed Postgres).
DATABASES = {
    "default": dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        conn_max_age=600,
    )
}

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# Uploaded RFQ attachments — deliberately private (no MEDIA_URL, no Nginx serving).
# All access goes through RFQViewSet's authenticated upload/download/delete actions,
# same as every other piece of data in this app — see rfq/views.py.
MEDIA_ROOT = BASE_DIR / "media"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- DRF ---
# Real per-person login only (username + password → access + refresh token,
# accounts.login_view), in dev and production alike. The old X-Demo-Role header login, which
# needed no password at all, has been removed, and so has the old never-expiring
# "Authorization: Token ..." login: calls now send "Authorization: Bearer <access token>".
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    # Forgot/reset password: limits how fast one client IP can request or try reset links
    # (password_reset) and how often one user can try to change their password (password_change).
    "DEFAULT_THROTTLE_RATES": {
        "password_reset": os.environ.get("PASSWORD_RESET_RATE", "10/hour"),
        "password_change": os.environ.get("PASSWORD_CHANGE_RATE", "10/hour"),
    },
    # How many proxies sit in front of Django. The rate limits key on the client IP; with a
    # proxy, that IP is the one the proxy adds at the END of X-Forwarded-For, so DRF must be
    # told to take it from there. Left unset, DRF trusts the whole header, which any client can
    # forge to get round the limits. 0 = no proxy (use the connection's own address).
    "NUM_PROXIES": int(os.environ.get("NUM_PROXIES", "0" if DEBUG else "1")),
}

# Sign-in tokens (accounts/tokens.py). The access token goes with every call and lasts
# 15 minutes; the refresh token gets a new access token from POST /api/auth/refresh/ and lasts
# 7 days. Each refresh hands out a new refresh token and retires the old one, so the 7 days
# count from the last time the app was used: someone using it at least weekly stays signed in.
# Both lifetimes can be changed in .env (minutes / days).
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=int(os.environ.get("JWT_ACCESS_MINUTES", "15"))),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=int(os.environ.get("JWT_REFRESH_DAYS", "7"))),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": False,  # login_view records it itself
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# --- Cache ---
# Holds the rate-limit counters. A database table (created by accounts migration 0004) so every
# worker process shares one count and restarts don't reset it; Django's default in-memory cache
# would give each worker its own count.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.db.DatabaseCache",
        "LOCATION": "django_cache",
    }
}

# --- Production hardening (no-ops locally, since DEBUG defaults true there) ---
if not DEBUG:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_SSL_REDIRECT = True
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")  # Nginx sets this — see deployment runbook

# --- Email ---
# No SMTP credentials configured anywhere yet (dev or prod) — outbound email uses
# Django's own console backend, which renders the email to the server log instead of
# actually sending it. Setting EMAIL_HOST_USER/PASSWORD in .env flips this to real
# SMTP sending with no code changes.
EMAIL_HOST = os.environ.get("EMAIL_HOST", "")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = os.environ.get("EMAIL_USE_TLS", "true").lower() == "true"
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "noreply@example.com")

# Where the React app lives. Used for the "Sign in" link in new-account emails and for the
# link in password-reset emails ({FRONTEND_URL}/reset-password?uid=...&token=...). Defaults
# to the Vite dev server only when DEBUG is on; in production it must be set in .env.
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173" if DEBUG else "").rstrip("/")
# How long a password-reset link works, in seconds (Django's own setting; 1 hour here).
PASSWORD_RESET_TIMEOUT = int(os.environ.get("PASSWORD_RESET_TIMEOUT", "3600"))
# Send password-reset emails from a background thread, so the forgot-password reply takes the
# same time whether or not the address has an account (waiting for the mail server would give
# that away). Tests switch it off to check the email synchronously.
PASSWORD_RESET_EMAIL_IN_BACKGROUND = True
EMAIL_BACKEND = (
    "django.core.mail.backends.smtp.EmailBackend"
    if EMAIL_HOST_USER
    else "django.core.mail.backends.console.EmailBackend"
)

# --- CORS ---
# Wide open in DEBUG so the Vite dev server can run on whatever port is free that
# session; locked to explicit origins (the deployed Vercel frontend) in production.
CORS_ALLOW_ALL_ORIGINS = DEBUG
CORS_ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
CORS_ALLOW_HEADERS = [*default_headers]
CORS_ALLOW_CREDENTIALS = True
