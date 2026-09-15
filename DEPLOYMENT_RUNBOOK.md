# Deployment Runbook — pricing.nxsys.in

Follows the same pattern as **Application 4: E-Commerce** in `vps_server_setup.md` (Django backend + Vite/React frontend, separate folders, Nginx serving the static build and proxying the API) — this is the closest existing template on the box.

- **Domain**: `pricing.nxsys.in`
- **Linux user**: `pricingadmin`
- **Path**: `/var/www/pricing`
- **Internal port**: `8012` (Django/Gunicorn — next free port; 8000–8011 are used by your other 11 apps)
- **Architecture**: Vite static frontend built to `dist/`, served directly by Nginx. Django REST API (formulas + reference data only, per the build plan) on port 8012 via Gunicorn.

---

## Prerequisites

1. **Push this project to GitHub first** (it isn't in a repo yet). Two folders deploy separately, same as E-Commerce:
   - Frontend: the project root (`D:\Pricing tool`)
   - Backend: `D:\Pricing tool\backend`
   You can put both in one repo (recommended, simpler) or two — the commands below assume **one repo** with `backend/` as a subfolder, cloned once.
2. **A PostgreSQL database.** Every other Django app on this box uses an external **Neon** Postgres instance rather than installing Postgres on the VPS itself — do the same: create a free Neon project, grab its connection string (`postgres://user:pass@host/dbname?sslmode=require`).
3. Your own sudo access on the VPS (to create the user, systemd service, and Nginx config).

---

## Fresh Deploy (first time)

```bash
# ─── STEP 1 — Create dedicated user & directory (as your sudo user) ───────────
sudo adduser pricingadmin --disabled-password --gecos ""
sudo mkdir -p /var/www/pricing
sudo chown pricingadmin:pricingadmin /var/www/pricing

# ─── STEP 2 — Switch to pricingadmin, clone the repo ───────────────────────────
sudo su - pricingadmin
cd /var/www/pricing
git clone <your-repo-url> .

# ─── STEP 3 — Backend setup ─────────────────────────────────────────────────────
cd /var/www/pricing/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Create .env (copy .env.example, then fill in real values)
cp .env.example .env
nano .env
```

Fill `.env` with:
```
SECRET_KEY=<generate: python3 -c "import secrets; print(secrets.token_urlsafe(50))">
DEBUG=false
ALLOWED_HOSTS=pricing.nxsys.in,127.0.0.1
CORS_ALLOWED_ORIGINS=https://pricing.nxsys.in
DATABASE_URL=<your Neon connection string>?sslmode=require
```

```bash
# ─── STEP 4 — Migrate, seed, collect static ────────────────────────────────────
python manage.py migrate
python manage.py seed_reference_data
python manage.py seed_formulas
python manage.py collectstatic --noinput
python manage.py createsuperuser      # your real Admin/Controlling login
deactivate

# ─── STEP 5 — Frontend setup ────────────────────────────────────────────────────
cd /var/www/pricing
echo "VITE_API_BASE_URL=https://pricing.nxsys.in/api" > .env.production
npm install
npm run build
exit   # back to your sudo user
```

```bash
# ─── STEP 6 — Gunicorn systemd service ─────────────────────────────────────────
sudo tee /etc/systemd/system/gunicorn-pricing.service << 'EOF'
[Unit]
Description=Pricing Tool Gunicorn (Django)
After=network.target

[Service]
Type=simple
User=pricingadmin
Group=www-data
WorkingDirectory=/var/www/pricing/backend
Environment="PATH=/var/www/pricing/backend/venv/bin"
ExecStart=/var/www/pricing/backend/venv/bin/gunicorn \
    --workers 3 \
    --bind 127.0.0.1:8012 \
    config.wsgi:application
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable gunicorn-pricing.service
sudo systemctl start gunicorn-pricing.service

# ─── STEP 7 — Nginx config ──────────────────────────────────────────────────────
sudo tee /etc/nginx/sites-available/pricing << 'EOF'
server {
    listen 80;
    server_name pricing.nxsys.in;

    location /static/ {
        alias /var/www/pricing/backend/staticfiles/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location /api/ {
        proxy_pass         http://127.0.0.1:8012;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    location /admin/ {
        proxy_pass         http://127.0.0.1:8012;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    location / {
        root /var/www/pricing/dist;
        try_files $uri $uri/ /index.html;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/pricing /etc/nginx/sites-enabled/pricing
sudo nginx -t && sudo systemctl reload nginx

# ─── STEP 8 — SSL certificate ───────────────────────────────────────────────────
sudo certbot --nginx -d pricing.nxsys.in

# ─── STEP 9 — Verify ────────────────────────────────────────────────────────────
sudo systemctl status gunicorn-pricing.service --no-pager
curl -I https://pricing.nxsys.in
curl -I https://pricing.nxsys.in/api/formulas/
```

---

## Routine Update (after pushing changes to GitHub)

**Both backend and frontend changed (most common):**
```bash
sudo su - pricingadmin
cd /var/www/pricing
git pull origin main

# Backend
cd backend
source venv/bin/activate
pip install -r requirements.txt          # only if requirements.txt changed
python manage.py migrate                 # only if new migrations
python manage.py collectstatic --noinput # only if static files changed
deactivate

# Frontend
cd ..
npm install                              # only if package.json changed
npm run build
exit

sudo systemctl restart gunicorn-pricing.service
# No restart needed for the frontend — Nginx serves the new dist/ files immediately.
```

**Backend only:**
```bash
sudo su - pricingadmin
cd /var/www/pricing
git pull origin main
cd backend
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
deactivate
exit
sudo systemctl restart gunicorn-pricing.service
```

**Frontend only:**
```bash
sudo su - pricingadmin
cd /var/www/pricing
git pull origin main
npm install
npm run build
exit
```

---

## Troubleshooting

```bash
# Gunicorn logs
sudo journalctl -u gunicorn-pricing.service -n 50 --no-pager

# Nginx logs
sudo tail -50 /var/log/nginx/error.log

# Check the port is actually listening
sudo ss -tulpn | grep 8012

# Restart everything
sudo systemctl restart gunicorn-pricing.service
sudo systemctl reload nginx
```

**Known gotcha (same as your other Django apps on this box):** use `psycopg2-binary` only — it's already what's pinned in `backend/requirements.txt`. Do not switch to `psycopg2` (source) or `psycopg[binary]`; the server lacks `libpq-dev` to compile it.

**CORS note:** if the frontend can't reach the API in the browser console, double check `CORS_ALLOWED_ORIGINS=https://pricing.nxsys.in` (no trailing slash) is actually set in `backend/.env` and that Gunicorn was restarted after editing it.
