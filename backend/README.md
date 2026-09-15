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

- `POST /api/auth/login/` — `{username, password}` → `{token, user}`
- `GET /api/auth/me/`
- `GET /api/formulas/` · `GET/PATCH /api/formulas/{key}/` · `POST /api/formulas/{key}/preview/` · `GET /api/formulas/{key}/history/`
- `GET/PATCH /api/reference/cost-rates/`, `/raw-forging-rates/`
- `GET/PATCH/POST/DELETE /api/reference/catalogs/{bearings|sleeves|housings|lagging|locking-devices}/`

All endpoints require a `Token <key>` auth header. Reads: any authenticated user.
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
