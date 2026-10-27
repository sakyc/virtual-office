# Two-hostname VPS deployment

Prepared configuration only; no VPS, DNS, certificates, or database have been changed.
The Nginx example targets a directly exposed Ubuntu/Debian VPS, not a panel-managed
server or an additional CDN/reverse-proxy layer. Confirm the actual host first.

## Layout

- `https://karyora.vetencode.com`: landing and public `/api/plans` only.
- `https://app.karyora.vetencode.com`: login/register, dashboard, admin, office,
  `/auth/*`, and `/api/*`. `/` redirects to `/login`.
- One checkout, one React build, one Express process, one application database.
- Existing landing CTA links are redirected by Nginx, preserving path/query.
- Sessions stay host-only on the app hostname; do not set a parent-domain cookie
  or enable cross-origin credential sharing. This is routing, not authorization;
  existing backend session/tenant checks still apply.
- Local Vite development remains unchanged.

## Before starting the service

1. Confirm VPS OS/panel, SSH access, domain DNS, available disk/RAM, and existing
   services. Do not replace another site's Nginx configuration.
2. Commit/review the desired source release, excluding secrets and local output.
   Uncommitted/untracked local changes do not arrive through `git pull`.
3. Use a maintained Node release compatible with the locked dependencies.
   Install with `npm ci` (including build dependencies), then `npm run build`.
   Do not run `npm run dev` as the deployed service.
4. Create a server-only `.env` from `.env.example`, with restrictive permissions.
   Set `NODE_ENV=production`, `AUTH_PROVIDER=native`,
   `APP_ORIGIN=https://app.karyora.vetencode.com`, and `PORT=3001`.
   Set the real `DB_*`, provider key and strong legacy `ACCESS_CODE` privately.
   Do not put secrets in `VITE_*` variables (those are public browser code).
5. Provision/restore the deployment database deliberately with a verified backup
   and the correct migration history. Review status/validation before startup.
   Never run local verification scripts against the deployed database.
   **Startup still calls the existing `initDb()`: it executes legacy schema SQL
   and updates interrupted jobs/items. Starting the service is not read-only.**
   This deployment preparation does not change that behavior or apply migrations.

## Nginx and HTTPS

The template is `deploy/nginx/karyora.conf`. It assumes the checkout at
`/srv/karyora`; adjust only to the real path. Nginx needs read/traverse access to
`dist`, not to `.env`. After reviewing conflicts, install as a new site, run
`sudo nginx -t`, then reload Nginx only if validation passes.

Point both A records to the VPS. If AAAA records exist, they must also reach this
server. Obtain certificates and redirect HTTP to HTTPS, for example on an
Ubuntu/Debian server with Nginx Certbot integration already installed:

```sh
sudo certbot --nginx -d karyora.vetencode.com -d app.karyora.vetencode.com --redirect
sudo nginx -t
sudo certbot renew --dry-run
```

The checked-in template is HTTP bootstrap only. **Do not log in over HTTP.**
Keep backend port 3001 unreachable from the public network (IPv4 and IPv6), along
with MySQL port 3306. Permit SSH before enabling firewall restrictions; allow
80/443 publicly. Express currently listens on all interfaces, so network
restriction is required. Run Node as a dedicated non-root account, one instance.
Do not start multiple workers: task execution is still in-process.

After database/HTTPS/firewall readiness, with PM2 installed for the runtime user:

```sh
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup
```

Follow the exact privileged startup command printed by PM2 for that account.
Check both domains, login/logout, registration, tenant denial, office, task review,
and SSE replies. Real AI smoke tests incur provider charges.

## Updating

Do not assume `git pull` alone publishes a release. Review migration requirements,
backup first if needed, and allow running paid tasks to finish before restart.

```sh
git pull --ff-only
npm ci
npm run build
# Stop here on any failed command. Migrations require a separate reviewed step.
pm2 restart karyora --update-env
pm2 status
```

Do not restart if install/build failed. This simple single-checkout workflow has
update downtime risk and is not an atomic/zero-downtime deployment. Keep a tested
previous release and database recovery procedure. Payments remain manual;
WhatsApp automation is not operational. Deployment does not complete those features.
