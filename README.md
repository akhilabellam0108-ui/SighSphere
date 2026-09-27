# SignSphere

An Indian Sign Language (ISL) learning and communication platform. Camera-based sign
recognition and gloss-driven text-to-sign, running **entirely on-device** in the browser.

> **Scope honesty.** This is bounded-vocabulary *isolated* sign recognition and a
> clip-based text→sign renderer. It is **not** continuous sign-language translation and
> **not** a replacement for a qualified ISL interpreter. Not for medical, legal, or
> emergency-dispatch interpretation. See [PLAN.md](PLAN.md) §0 and §10.

**Read [PLAN.md](PLAN.md) before writing code.** It contains the scope decisions, the
20-week roadmap, the data strategy, and the ethics rules this repo is built around.

---

## Quick start — the full app (app + backend) with one command

Needs [Node.js 22+](https://nodejs.org). No accounts, keys or database install.

```bash
git clone https://github.com/akhilabellam0108-ui/SighSphere.git
cd SighSphere
npm install
npm run dev          # app: http://localhost:5173  (backend server starts with it)
```

The **first login you create becomes the admin** (the Admin tab). Everything is saved by the
built-in SignSphere server in `services/api/data/` (keep that folder; delete it to start over).

Run it for real (one address for app + backend, other devices on your Wi-Fi can open it):

```bash
npm start            # builds, then serves everything at http://localhost:8787
```

Other commands:

```bash
npm run check        # typecheck + unit tests + database security tests + API tests
npm run make-admin -- someone@example.com    # make another login an admin (server stopped)
npm run dev:web      # the app alone, without the server (this-device mode)
```

Camera access needs a secure context: `localhost` counts; other devices need HTTPS (or use
the Android app).

## First 15 minutes — get a working demo

1. `npm run dev`, open the app, go to **Sign → Text**. Grant camera access. You should
   see hand and pose landmarks tracked live.
2. Go to **Record**. Record 5 takes each of 3 different signs.
3. Go back to **Sign → Text**. It now recognizes those 3 signs, using the on-device
   template classifier (cosine similarity to per-class centroids).

That is a genuine working vertical slice with no server, no training run, and no model
file. It is a *baseline*, not the final model — see "Model path" below.

## Backend

SignSphere has **two interchangeable backends** with the same database design and security
rules (`supabase/migrations/`):

1. **Built-in server (default)** — `services/api`: Node.js + embedded Postgres (PGlite), no
   installs or accounts. Logins with scrypt-hashed passwords and signed tokens, the same
   row-level security as below, live updates, and it serves the app itself. `npm run dev` and
   `npm start` use it. Host it anywhere Node runs (Render, Railway, a college server) and set
   `VITE_API_URL` to its address for the web/Android builds. Tested by `npm run test:api`.
2. **Supabase (optional, hosted)** — Postgres with row-level security, email logins (with
   email password reset), file storage and live updates. Set `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_ANON_KEY` and it takes over. Setup below.

With neither, the app runs in clearly labelled this-device mode.

| What | Where |
|---|---|
| Logins (email + password, reset, delete my login) | Supabase Auth |
| Individual / Hospital / Organisation accounts (up to 10 per login, every question compulsory) | `accounts` |
| History of everything signed, typed or spoken, per account; works offline and syncs later | `history` |
| Recorded signs synced across a login's devices (recognition + avatar motion) | `signs` |
| Hospital / organisation verification, reviewed by the SignSphere team | `accounts.verification`, `admins` |
| "Report a problem" (wrong sign, missing sign, bugs) with replies from the team | `feedback` |
| ISL sign pack published once, downloaded by every device | Storage bucket `sign-packs` |
| Live updates on your other devices | Realtime on `history`, `signs` |

Security is enforced by the database, not the app: a login can only ever read or change its
own data; admins can see hospitals and organisations (never individuals' accounts or anyone's
recordings); nobody can verify themselves. `npm run test:db` proves each rule on a real
Postgres engine (36 checks), and `cloudBackend.test.ts` checks every table and column the app
uses exists in the migrations.

### Supabase instead (optional, about 10 minutes)

1. Create a free project at [supabase.com](https://supabase.com) (region: Mumbai for India).
2. **SQL editor** → run `supabase/migrations/0001_signsphere.sql`, then
   `supabase/migrations/0002_backend.sql`. Both are safe to run again.
3. **Make yourself an admin**: sign up in the app once, then in the SQL editor run
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'you@example.com';
   ```
   The **Admin** tab appears in the app for that login.
4. **Authentication → URL configuration**: Site URL
   `https://akhilabellam0108-ui.github.io/SighSphere/`, and add `http://localhost:5173` to the
   redirect URLs for development.
5. **Project Settings → API**: copy the Project URL and the *anon public* key (**never** the
   `service_role` key).
   - Local: copy `.env.example` to `.env` at the repo root and fill in
     `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
   - Hosted: GitHub repo → Settings → Secrets and variables → Actions → **Variables** → add
     `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then re-run "Deploy to GitHub Pages".

Without these the app runs in clearly labelled **device mode**: accounts, history and reports
stay on that device, and the admin panel is unavailable.

### Using it

- **Verification**: a hospital or organisation presses *Request verification* on the Accounts
  screen; an admin checks the registration details under **Admin → Verification** and verifies
  or declines with a note the account can see. Changing the registration number later sends
  the account back for review.
- **Reports**: *Report a problem* (footer, or *Report this sign* under the avatar). Admins
  answer under **Admin → Reports**; the user sees the reply on their Report screen.
- **Sign pack**: build `isl-include.json` on the **ISL dataset** screen, then publish it under
  **Admin → Sign pack**. Every device installs it on its next start — no new release needed.
- **Signs on every device**: anything recorded on **Record** is uploaded to the login and
  installed on the user's other devices (offline recordings upload when back online). *Delete
  all samples* removes them everywhere.

## Android app (APK)

`.github/workflows/android.yml` wraps the same app with [Capacitor](https://capacitorjs.com)
and builds an Android APK on every push to `main`. The newest build is always at
<https://github.com/akhilabellam0108-ui/SighSphere/releases/download/android-latest/SignSphere.apk>
(open it on the phone and allow installing from that source). Tracking models and the sign
pack are inside the app, so it works offline. It is a test build signed with a debug key;
publishing on the Play Store needs a release signing key (Android Studio → Generate Signed
Bundle). Voice input depends on the phone's WebView and may not be available in the app;
it works in the browser version.

Local build (needs Android Studio / the Android SDK): `VITE_NATIVE=1 npm run build`, then
`cd apps/web && npx cap sync android && npx cap open android`.

## Run on any device (GitHub Pages + QR code)

`.github/workflows/pages.yml` publishes the app to
`https://akhilabellam0108-ui.github.io/SighSphere/` on every push to `main` (one-time: repo
Settings → Pages → Source: **GitHub Actions**). The Welcome screen and Settings show a QR code
for that address. It installs like an app and works offline after the first visit.

## The ISL dataset — no recording needed

SignSphere uses **INCLUDE** (AI4Bharat, 263 ISL signs, 4,292 videos, CC BY 4.0,
<https://zenodo.org/records/4010759>). The **ISL dataset** screen (`/dataset`, also linked
from Settings) turns the videos into a *sign pack*, entirely in the browser:

1. Download one or more category zips from Zenodo and unzip them.
2. Open **ISL dataset**, choose the folder, press **Import**. The same hand tracker as the
   live camera runs over every video. It needs no network after the first load.
3. The result is installed right away: **Sign → Text** recognises those signs and the
   **3D avatar** performs them with the real signers' motion.
4. Press **Download pack**, and save it as `apps/web/public/datasets/isl-include.json`
   to ship it with the app. Every user then gets it automatically on first launch.

The emergency set (hospital, doctor, police, medicine, sick, deaf, hello, thank you,
mother, father, telephone, home) can be imported first on its own. Your own recordings
on the **Record** screen still work and take priority over the dataset.

Cite: Sridhar et al., *INCLUDE: A Large Scale Dataset for Indian Sign Language
Recognition*, ACM Multimedia 2020.

## The 3D avatar

Text/voice → sign is performed by a three.js signer driven by captured motion (pose +
both hands, 15 fps). A two-bone arm solver keeps each wrist exactly where the real signer's
was, signs blend into each other in 240 ms, and you can view it from the front or the side,
or zoom in on the hands. Signs with no motion yet show a captioned hold and are listed
under the avatar. Browsers without WebGL fall back to the original clip player.

MediaPipe models and the WASM runtime are copied into `apps/web/public/mediapipe/` by
`npm run dev` / `npm run build` so tracking works offline after the first visit (the
download needs network the first time; the app falls back to the CDN otherwise).

## Layout

```
PLAN.md                    the plan: scope, roadmap, data strategy, ethics, business
docs/
  architecture.md          how the pieces fit, and why web-first
  data-collection-protocol.md   consent + recording protocol (read before recording ANYONE)
  data-inventory.md        template — fill in Week 1
  decisions.md             running decision log
packages/gloss/            English → ISL gloss engine (pure TS, no deps, unit-tested)
apps/web/                  React + Vite PWA — all camera, inference, and UI
services/ml/               Colab training scripts + the TS/Python parity check
models/                    trained artifacts; metrics.json files are committed as evidence
.github/workflows/ci.yml   typecheck, test, build, and cross-language parity on every push
```

### Where things live in the app

| Path | What it owns |
| --- | --- |
| `src/lib/landmarks.ts` | The only file that imports MediaPipe. Swappable. |
| `src/lib/features.ts` | The ML contract. Mirrored in `services/ml/features.py`. |
| `src/lib/classifier.ts` | Template baseline + the ONNX slot for the trained model. |
| `src/lib/storage.ts` | IndexedDB samples, localStorage settings/progress/contacts. |
| `src/lib/speech.ts` | Web Speech STT/TTS, with feature detection. |
| `packages/gloss/src/rules.ts` | ISL ordering rules — written for a linguist to edit. |
| `packages/gloss/lexicon/isl-core.json` | Vocabulary — written for non-programmers to edit. |


## Model path

| Stage | What runs | When |
| --- | --- | --- |
| **Now** | On-device template classifier over your recorded samples. Zero setup. | Week 3 |
| Next | Rung-0 logistic regression trained in Colab on INCLUDE-50 | Week 4 |
| Ship | Rung-1 1D-CNN, exported to ONNX, loaded via `VITE_MODEL_URL` | Week 8+ |

`apps/web/src/lib/features.ts` and `services/ml/features.py` must stay in sync — they are
the same normalization, and a mismatch between them is the single most common cause of
"great in Colab, useless in the browser." There is a parity test for this; run it.

## Non-negotiables

- **Do not record any participant** before reading [docs/data-collection-protocol.md](docs/data-collection-protocol.md).
- **Never commit** participant video or landmark data. `.gitignore` blocks it; don't override.
- **Split by signer, never randomly**, when evaluating. Random splits inflate accuracy by
  30–40 points and will invalidate your results.
- Every gloss rule and every lexicon entry needs fluent-signer review before it ships.
- Emergency features stay free and work offline, forever.

---

## Licence

Copyright © 2026 Akhila Bellam. All rights reserved — see [LICENSE](LICENSE). The INCLUDE dataset keeps its own CC BY 4.0 licence.
