# RFQ Pricing — Backend (Formulas & Reference Data)

Django + Django REST Framework + PostgreSQL backend for the dynamic Formula engine and
reference/master data (Cost Rate Tables, Raw Forging Prices, component catalogs). See
the build plan for full context on scope and architecture.

## Local setup

```
cd backend
python -m venv venv
venv\Scripts\pip install -r requirements.txt
copy .env.example .env
venv\Scripts\python manage.py migrate
venv\Scripts\python manage.py seed_reference_data   # loads cost rates, raw forging rates, catalogs
venv\Scripts\python manage.py seed_formulas          # loads the full formula registry
venv\Scripts\python manage.py createsuperuser
venv\Scripts\python manage.py runserver 8000
```

Uses SQLite locally by default (zero setup). Set `DATABASE_URL` in `.env` to point at a
real PostgreSQL instance — required for production.

## Key pieces

- `formulas/evaluator.py` — the safe expression evaluator (`simpleeval`, restricted
  function whitelist, no code execution). This is the security-critical file; see its
  module docstring before changing the allowed function set.
- `formulas/models.py` — `FormulaDefinition` (current expression) + `FormulaVersion`
  (immutable audit trail of every edit).
- `formulas/management/commands/seed_formulas.py` — the full Formula Registry, ported
  from the frontend's `src/lib/pulleyTechDataCalc.ts` / `pulleyPricingCalc.ts`. This is
  the source of truth for which variable names each formula expects.
- `reference/management/commands/seed_reference_data.py` — parses the frontend's
  `src/data/pulleyCatalogs.ts` directly (regex over the TS object literals) so the ~270
  catalog rows are never hand-retyped, plus hand-seeded Cost Rate Tables / Raw Forging
  Prices values.

## API

- `POST /api/auth/login/` — `{username, password}` → `{access, user}` plus the refresh token as an httpOnly cookie (`pt_refresh`, path `/api/auth/`, SameSite=Strict, Secure when `DEBUG=false`). The access token (15 min, `JWT_ACCESS_MINUTES`) goes in `Authorization: Bearer <access>` and is kept in memory by the frontend; the refresh token (7 days from last use, `JWT_REFRESH_DAYS`) renews it and is never readable by page scripts. Each sign-in gets its own pair. The frontend and API must be on the same site for the cookie to be sent
- `POST /api/auth/refresh/` — refresh cookie → `{access}` and a new refresh cookie; the refresh token sent is retired (works once). 401 if missing, expired, used, signed out or the account is inactive (a body `{refresh}` is also accepted for non-browser clients)
- `POST /api/auth/logout/` — refresh cookie → 204 and the cookie cleared; signs out this browser only (no access token needed)
- `GET /api/auth/me/`
- `POST /api/auth/forgot-password/` — `{email}` → always 200 for a well-formed address (never says whether an account exists); emails a one-time link to `{FRONTEND_URL}/reset-password?uid=…&token=…`
- `POST /api/auth/reset-password/check/` — `{uid, token}` → 200 if the link is still good, else 400
- `POST /api/auth/reset-password/` — `{uid, token, password}` → sets the new password and signs the account out everywhere; 400 with `errors[]` if the password is too weak

- `POST /api/auth/change-password/` — signed-in users only; `{current_password, new_password}` → `{access}` plus a new refresh cookie. A wrong current password is a 400 (not a 401); other devices are signed out (their refresh tokens are retired) and this browser gets a fresh pair (`PASSWORD_CHANGE_RATE`, default 10/hour)

The three password-reset endpoints need no login, are rate limited (`PASSWORD_RESET_RATE`, default 10/hour per client IP), and the link lasts `PASSWORD_RESET_TIMEOUT` seconds (default 1 hour; the forgot-password reply returns it as `valid_minutes`). Set `FRONTEND_URL` in `.env` for production; without SMTP credentials the email prints to the server log instead of sending. The reset email is sent from a background thread so the reply time doesn't reveal whether an account exists.

New users (`POST /api/auth/users/`, Admin only) get a random temporary password, emailed with their username and role and a "Reset password" button to `{FRONTEND_URL}/reset-temporary-password?username=…`. The temporary password can't sign in (`must_change_password`; login answers 403 with `code: password_change_required`): `POST /api/auth/initial-password/` — `{username, current_password, new_password}` — replaces it and clears the flag. If the email fails, the create response includes `temporary_password` and `reset_url` so the Admin can pass them on. User changes and role-permission changes are written to the Audit Log (module "Users & Roles", Admins only).

Rate-limit counters live in a database cache table (`django_cache`, created by `migrate`), shared by all workers. Behind a proxy the client IP is read from the last `X-Forwarded-For` entry; `NUM_PROXIES` (default 1 with `DEBUG=false`, 0 with `DEBUG=true`) must match the number of proxies in front of Django.

- `GET /api/formulas/` · `GET/PATCH /api/formulas/{key}/` · `POST /api/formulas/{key}/preview/` · `GET /api/formulas/{key}/history/`
- `GET/PATCH /api/reference/cost-rates/`
- `GET/POST/PATCH/DELETE /api/reference/raw-forging/{shaft-bands|shell-bands}/` — Raw Forging Prices page
- `GET/PATCH/POST/DELETE /api/reference/catalogs/{bearings|sleeves|lag-data|lcd-data|housings|locking-devices}/`

All endpoints require an `Authorization: Bearer <access token>` header. Reads: any authenticated user.
Writes: `Controlling` or `Admin` role only (`accounts/permissions.py`).

## Formula expression syntax

Plain arithmetic + named variables + a small whitelist: `min`, `max`, `round`, `abs`,
`sqrt`, `pow(x, y)`, `iff(cond, a, b)` (ternary substitute), and the constant `PI`.
Use `pow(x, y)` and `iff(...)` rather than `**`/`^`/native ternary — this keeps one
formula string valid, unmodified, on both this Python evaluator and the frontend's
JS evaluator once that's wired up (see build plan step 6).

## Tests

```
venv\Scripts\python manage.py test
```

Covers the evaluator's arithmetic correctness, the sandbox's rejection of attribute
access / imports / undefined functions, and the formula save → version → preview API
flow including role-based permission enforcement.

## Deployment (not yet done)

Intended target: Railway or Render (either gives a one-command Django + managed
PostgreSQL deploy). Set `DATABASE_URL`, `SECRET_KEY`, `DEBUG=false`, `ALLOWED_HOSTS`,
and `CORS_ALLOWED_ORIGINS` (the deployed Vercel frontend's origin) as environment
variables on whichever platform is chosen.
