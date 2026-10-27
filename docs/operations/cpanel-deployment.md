# Apache/cPanel deployment for Karyora

Target: cPanel account `vetencode`, existing HTTP/HTTPS vhosts for
`karyora.vetencode.com` and `app.karyora.vetencode.com`. Both A records and valid
TLS must exist. No Nginx configuration is used. Existing port 3001 belongs to a
different application; Karyora uses loopback port 3101 and one PM2 worker.

Prerequisites: rotated private credentials, completed 001–016 migration history
and successful `bootstrap-deployment.mjs --validate`, current build, and modules
`proxy_module`, `proxy_http_module`, `rewrite_module`, `headers_module`, `alias_module`.
Review npm audit findings before public launch. Model catalog seeding/activation,
platform admin, and initial subscriptions are separate verified steps; a valid
schema alone does not make AI billing operational.

As the cPanel user, pull and build before starting:

```sh
cd /home/vetencode/apps/karyora
git pull --ff-only origin main
npm ci
npm run build
pm2 list
```

Stop on failure or an unrelated existing PM2 app named karyora. As this same user:

```sh
pm2 start deploy/ecosystem.config.cjs
pm2 save
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3101/login
curl -sS http://127.0.0.1:3101/auth/status
```

Startup calls existing `initDb()` (legacy schema statements and interrupted-job
updates); do not start against any other database. Check PM2 logs privately for
DB readiness, don't paste secrets/provider request data. Confirm with `ss -ltnp`
that 3101 is listening only on 127.0.0.1. Never run Node/PM2 as root.

## Install the per-domain includes as root

Use cPanel's userdata include locations below (each file named `karyora.conf`):

| Repository file in deploy/apache/ | Include directory in /etc/apache2/conf.d/userdata/ |
| --- | --- |
| landing-http.conf | std/2_4/vetencode/karyora.vetencode.com/ |
| app-http.conf | std/2_4/vetencode/app.karyora.vetencode.com/ |
| landing-https.conf | ssl/2_4/vetencode/karyora.vetencode.com/ |
| app-https.conf | ssl/2_4/vetencode/app.karyora.vetencode.com/ |

First inspect existing includes; never overwrite a user's existing file. Keep
copies of generated httpd.conf and any include being intentionally replaced in a
unique root-private backup directory. Use `install -d` for the four directories
and `install -m 644 SOURCE DESTINATION/karyora.conf` for reviewed new files.
Do not copy the whole checkout, .env or node_modules into public_html.

After installation, run as root, stopping at any error:

```sh
/usr/local/cpanel/scripts/ensure_vhost_includes --user=vetencode
/usr/local/cpanel/scripts/rebuildhttpdconf
/usr/sbin/httpd -t
/usr/local/cpanel/scripts/restartsrv_httpd --graceful
```

These cPanel commands regenerate the server configuration; they are not limited
to a process-local check. Do not reload if validation fails. Rollback by removing
only the four newly installed files (preserve backup copies), then regenerate,
validate and gracefully reload again. Never edit generated httpd.conf manually.

## Verify

- Landing root returns HTML and public `/api/plans` returns JSON.
- Landing `/login` redirects to app hostname, and `/api/dashboard` is 404.
- App root redirects to `/login`; login page and direct dashboard reload work.
- App `/auth/me` without cookie is 401. Authenticated session cookies are Secure,
  HttpOnly and host-only; login/logout and cross-tenant denials still work.
- Office iframe assets and AI SSE replies work; paid smoke tests cost money.
- HTTP redirects to HTTPS for both domains. Check existing unrelated sites.
- PM2 startup persistence: run `pm2 startup` as vetencode and follow the exact
  root command printed for that account, then `pm2 save` as vetencode.

The old Nginx template is not applicable to this host. Future restarts use the
ecosystem file (`pm2 restart deploy/ecosystem.config.cjs --update-env`) so port and
loopback binding stay consistent. Finish running paid tasks before restarting.
