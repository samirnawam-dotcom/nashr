# Nashr on cPanel shared hosting (Namecheap, nashr.pro)

The demo runs on Namecheap shared hosting with cPanel's **Setup Node.js App** and a cPanel **PostgreSQL** database.
Nothing is installed on the server: the package is ready to run. No terminal is needed.

The package is `release/nashr-cpanel.zip` in the repository. Build a fresh one with
`VITE_SITE_URL=https://nashr.pro node scripts/build-cpanel.mjs`.

Your cPanel user name is the prefix cPanel puts on databases (`nashbjis`), so your home folder is `/home/nashbjis`.
If cPanel shows a different home folder (top of File Manager), use that instead wherever `/home/nashbjis` appears below.

## First install

### 1. Database (done)

- Database `nashbjis_nashr`, user `nashbjis_app`, user added to the database with **ALL PRIVILEGES**.
- Keep the user's password in your password manager. You paste it into step 3 yourself; nobody else needs it.

### 2. Upload the package

1. On GitHub, open `release/nashr-cpanel.zip` on branch `claude/zealous-wright-qlxrhi` and click **Download raw file**.
2. cPanel → **File Manager** → your home folder (`/home/nashbjis`, not `public_html`) → **Upload** → choose the zip.
3. Back in File Manager, right-click `nashr-cpanel.zip` → **Extract** into `/home/nashbjis`. You now have a folder `nashr`.

### 3. Create the Node.js app

cPanel → **Setup Node.js App** → **Create Application**:

| Field | Value |
|---|---|
| Node.js version | **22.23.5** |
| Application mode | **Production** |
| Application root | `nashr` |
| Application URL | `nashr.pro` (leave the path after it empty) |
| Application startup file | `app.js` |

Under **Environment variables**, click **Add variable** for each:

| Name | Value |
|---|---|
| `DATABASE_URL` | `postgres://nashbjis_app@localhost:5432/nashbjis_nashr` |
| `PGPASSWORD` | the database user's password (from your password manager) |
| `NASHR_DEMO` | `1` (a demo server: demo payments, demo data; no real money moves) |
| `SITE_URL` | `https://nashr.pro` |
| `TRUST_PROXY` | `1` |
| `FILES_DIR` | `/home/nashbjis/nashr-files` (uploads live outside the app folder, so updates never touch them) |

Click **Create**. Do **not** click "Run NPM Install": there is nothing to install.

The first start takes about 20 seconds: it creates the tables, adds the demo data, and saves the demo sign-in details.

### 4. Demo sign-in details

File Manager → `/home/nashbjis/nashr/demo-credentials.txt`: one password for the four demo accounts
(`demo@northwind.ae` buyer, `sales@skyline.ae` publisher, `ops@nashr.ae` and `omar@nashr.ae` staff) and the staff
authenticator key (add it to an authenticator app; staff sign in with its 6-digit code). The file is never served on the web.

### 5. Keep the app awake (auctions close on time)

Shared hosting stops an app nobody has visited for a few minutes, and Nashr's minute-by-minute jobs (closing auctions,
reminders, payment checks, emails) only run while it is awake. A cron job visits it every minute.

cPanel → **Cron Jobs** → Common Settings **Once Per Minute** (or the shortest it offers) → Command:

```
curl -fsS -o /dev/null https://nashr.pro/api/health
```

Namecheap allows every 5 minutes at most (`*/5`). Results are exact regardless: bids and bookings are refused from the closing
second. The jobs only announce results, and they also run on any visit (at most every 30 seconds). For announcements within a
minute at quiet times too, add a free outside pinger: cron-job.org, every minute, URL `https://nashr.pro/api/health`.

### 6. HTTPS

cPanel → **SSL/TLS Status** → make sure `nashr.pro` and `www.nashr.pro` have a certificate (AutoSSL). Run AutoSSL if not.

### 7. Check

Open `https://nashr.pro/api/health`: `"ok":true`. Then the home page, and sign in with a demo account.

## Updating

1. Download the new `release/nashr-cpanel.zip`, upload it to `/home/nashbjis` (overwrite).
2. File Manager: right-click the zip → **Extract** into `/home/nashbjis`, overwriting. Your data, uploads and
   `demo-credentials.txt` are not in the zip, so they stay.
3. Setup Node.js App → **Restart**. New database changes are applied on start; the data is kept.

## If it does not start

Open `/home/nashbjis/nashr/stderr.log` in File Manager. The first line of each start reads `Database: PostgreSQL <version>`.
Nashr's tables work on the old PostgreSQL that cPanel hosts run (no `execute function`, and a stand-in for
`gen_random_uuid()` when the `pgcrypto` extension cannot be added).

## What differs from a VPS

- **No nginx**: the app serves the website itself (`server/api/web.ts`), with the same page rules and security policy.
- **Background jobs**: run inside the app while it is awake; the cron visit in step 5 keeps it awake.
- **Live updates**: if the host's web server holds the stream back, pages refresh themselves every 30 seconds instead.
- **Backups**: use cPanel → **Backup** (download the PostgreSQL database and `nashr-files`). The VPS's nightly backup and
  restore drill do not run here.
- **Logs**: if the app does not start, look for `stderr.log` in `/home/nashbjis/nashr` (File Manager), or ask Namecheap support where
  Passenger writes the app's log on your server.

## Going live later

`NASHR_DEMO=1` is for the demo only. Before real customers: remove it, add the Stripe keys (`STRIPE_SECRET_KEY`,
`STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`), and start from an empty database (the app refuses demo data and demo
payments in production without `NASHR_DEMO`).

## Automatic deploys (GitHub Actions)

Every push to `claude/zealous-wright-qlxrhi` runs `.github/workflows/deploy-cpanel.yml`: type checks and unit tests first (a
failure stops everything), then it builds the package, copies it to `~/nashr` over SSH (data, uploads, logs and
`demo-credentials.txt` are kept), restarts the app and waits for `/api/health` to say `"ok":true`.

One-off set-up:

1. **Make a deploy key** on your own computer (Windows PowerShell, macOS or Linux terminal):
   `ssh-keygen -t ed25519 -C nashr-deploy -f nashr_deploy -N ""` (on Windows PowerShell: `-N '""'`).
   This makes two files: `nashr_deploy` (private, keep it secret) and `nashr_deploy.pub` (public).
2. **Allow it on the server**: cPanel → SSH Access → Manage SSH Keys → Import Key. Name `nashr_deploy`, paste the contents of
   `nashr_deploy.pub` into the **Public Key** box only, Import. Back in Manage SSH Keys, click **Manage** next to it → **Authorize**.
3. **Give it to GitHub**: the repository → Settings → Secrets and variables → Actions → New repository secret, three times:
   - `CPANEL_SSH_KEY`: the whole contents of the private file `nashr_deploy` (from `-----BEGIN` to `END ...-----`)
   - `CPANEL_HOST`: `premium82.web-hosting.com`
   - `CPANEL_USER`: `nashbjis`
4. **Run it**: GitHub → Actions → "Deploy to nashr.pro" → Run workflow (or push any change). A green tick means it is live.

The private key opens a shell on the hosting account, so keep it only in GitHub's secrets (and delete the local file after
step 3). To stop automatic deploys, delete the `CPANEL_SSH_KEY` secret or disable the workflow in the Actions tab.
