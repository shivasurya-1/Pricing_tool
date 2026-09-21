"""
Django settings for config project.
"""

import os
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
    "rest_framework.authtoken",
    "corsheaders",
    "accounts",
    "formulas",
    "reference",
    "rfq",
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
def build_authentication_classes(debug: bool) -> list[str]:
    """DemoRoleAuthentication trusts a plain header with zero credentials behind it —
    a real security hole if it's reachable in production (confirmed by audit: any
    direct API caller, not just the browser app, could claim X-Demo-Role: Admin).
    Real per-person login (TokenAuthentication, already live via accounts.login_view)
    is always available; the demo bridge is now local-dev-only, so production
    accepts only a real token. A plain function (not inline module-level logic) so
    it's directly unit-testable without needing to reload settings mid-test-run.
    """
    classes = [
        "rest_framework.authentication.TokenAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ]
    if debug:
        classes.insert(0, "accounts.authentication.DemoRoleAuthentication")
    return classes


REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": build_authentication_classes(DEBUG),
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}

# --- Production hardening (no-ops locally, since DEBUG defaults true there) ---
if not DEBUG:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_SSL_REDIRECT = True
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")  # Nginx sets this — see deployment runbook

# --- CORS ---
# Wide open in DEBUG so the Vite dev server can run on whatever port is free that
# session; locked to explicit origins (the deployed Vercel frontend) in production.
CORS_ALLOW_ALL_ORIGINS = DEBUG
CORS_ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
CORS_ALLOW_HEADERS = [*default_headers, "x-demo-role"]
CORS_ALLOW_CREDENTIALS = True
