# Putting SignSphere online

SignSphere's backend is one small Node server (`services/api`) with its own embedded
database. It serves the app too, so one address runs everything. You can host it
three ways — pick one.

| Option | Cost | Effort | Good for |
|---|---|---|---|
| **A. Render (recommended)** | ~US$7/month (persistent disk needs a paid plan) | 10 min, one click | Pilots and real users |
| B. Any server with Docker (college server, DigitalOcean, AWS Lightsail) | from ~US$4/month | 20 min | If you already have a machine |
| C. Supabase instead of the built-in server | Free tier | 15 min | Free option; see the README's Supabase section |

> Data matters: the server keeps logins, accounts, history and recorded signs in `/data`.
> It must be on a **persistent disk**, or everything is lost when the server restarts.
> That's why free hosting tiers without disks won't work for option A/B.

## A. Render, one click

1. Sign in at <https://render.com> with GitHub.
2. **New → Blueprint** → choose the **SighSphere** repository. Render reads `render.yaml`:
   a Docker web service in Singapore (closest to India), a 1 GB disk at `/data`, a health check,
   and a generated `SIGNSPHERE_SECRET`.
3. When asked, set **`SIGNSPHERE_ADMINS`** to your email — that login becomes admin.
4. Click **Apply**. After the first build (5–8 min) you get an address like
   `https://signsphere.onrender.com`. Open it: the whole app works there, with real logins.
5. Make the **GitHub Pages site and the Android app** use this server: in GitHub → repository
   **Settings → Secrets and variables → Actions → Variables**, add
   `VITE_API_URL` = `https://signsphere.onrender.com/api`, then re-run the *Deploy to GitHub Pages*
   and *Android app* workflows (or push to `main`).

Every push to `main` redeploys the server automatically.

**Custom domain** (e.g. `app.signsphere.in`): Render → service → Settings → Custom Domains.
Camera access needs HTTPS — Render provides it automatically.

## B. Any machine with Docker

```bash
git clone https://github.com/akhilabellam0108-ui/SighSphere.git && cd SighSphere
docker build -t signsphere .
docker run -d --name signsphere --restart unless-stopped -p 8787:8787 \
  -v signsphere-data:/data -e SIGNSPHERE_ADMINS=you@example.com signsphere
```

Put it behind HTTPS (Caddy is the simplest: `caddy reverse-proxy --from app.example.in --to :8787`),
because the camera only works on HTTPS.

## Operating it

- **Health:** `GET /api/health` → `{"ok":true}`. Render uses it to restart the service if it hangs.
- **Backups:** the whole database is the `/data` folder. On Render, enable disk snapshots
  (Disk → Snapshots, daily). On your own machine: `docker run --rm -v signsphere-data:/data -v $PWD:/b alpine tar czf /b/signsphere-$(date +%F).tgz /data`.
- **Make someone admin later:** add their email to `SIGNSPHERE_ADMINS` and restart.
- **Secret:** `SIGNSPHERE_SECRET` signs login tokens. Changing it signs everyone out.
- **Logs:** Render → service → Logs. The server never logs passwords or sign recordings.
