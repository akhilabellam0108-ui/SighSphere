# SignSphere

An Indian Sign Language (ISL) learning and communication platform. Camera-based sign
recognition and gloss-driven text-to-sign, running **entirely on-device** in the browser.

> **Scope honesty.** This is bounded-vocabulary *isolated* sign recognition and a
> clip-based text→sign renderer. It is **not** continuous sign-language translation and
> **not** a replacement for a qualified ISL interpreter. Not for medical, legal, or
> emergency-dispatch interpretation. See [PLAN.md](PLAN.md) §0 and §10.

The product/design brief for the 14-screen experience is in [docs/design-brief.md](docs/design-brief.md).

**Read [PLAN.md](PLAN.md) before writing code.** It contains the scope decisions, the
20-week roadmap, the data strategy, and the ethics rules this repo is built around.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

Camera access requires a secure context. `localhost` counts, so `npm run dev` works.
Any other host needs HTTPS.

```bash
npm test             # gloss engine, features, history, lessons, auth, and a render test of every screen
npm run typecheck    # all workspaces
npm run check        # typecheck + test
npm run build        # production PWA build
```

Feature parity between the browser and the training code is enforced by a test, not by
convention. Run both halves after touching either features file:

```bash
npm test --workspace @signsphere/web        # regenerates services/ml/fixtures/parity.json
cd services/ml && python check_parity.py    # asserts features.py matches features.ts
```

Currently passes with a maximum difference of exactly 0. `pip install numpy` is all you need
for this; no torch, no MediaPipe.

## First 15 minutes — get a working demo

1. `npm run dev`, open the app, go to **Sign → Text**. Grant camera access. You should
   see hand and pose landmarks tracked live.
2. Go to **Record**. Record 5 takes each of 3 different signs.
3. Go back to **Sign → Text**. It now recognizes those 3 signs, using the on-device
   template classifier (cosine similarity to per-class centroids).

That is a genuine working vertical slice with no server, no training run, and no model
file. It is a *baseline*, not the final model — see "Model path" below.

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

### The app: 14 screens

| Area | Routes | Notes |
| --- | --- | --- |
| Entry | `/welcome`, `/onboarding`, `/auth` | Splash, 3 onboarding slides, sign-in. **Sign-in is a labelled placeholder** (`src/lib/auth.ts`): no server, no passwords, guest mode has every feature. |
| Home | `/home` | Greeting, search, hero, 2×2 translation hub, quick access, recent activity, progress, honest limitations. |
| Translate | `/translate/text-to-sign`, `voice-to-sign`, `sign-to-text`, `sign-to-voice`, `conversation` | Save / share / copy; history recorded locally. Live Conversation joins speech → gloss → signer clips with camera → recognition → speech in one transcript. |
| Learn | `/learn`, `/learn/:lessonId?sign=N` | Beginner / Intermediate / Advanced levels, daily challenge, completion records (not accredited certificates). |
| Community | `/community` | **Demo data only** (`src/data/demo/`), labelled on screen; posting disabled. |
| Emergency | `/emergency` | Reachable without sign-in or onboarding; works offline; sign input only for emergency signs this device has been taught, and every result is confirmed by the user. |
| Accessibility | `/accessibility` | Live captions, speech-to-text, text-to-speech, reading assistant; theme, contrast, text size, motion, haptics. |
| Record | `/record` | The recorder (captures until 32 frames are tracked), built-in ISL sign packs, offline-readiness check, JSONL export. |
| Profile | `/profile`, `/profile/history`, `/profile/settings`, `/profile/help` | Stats, achievements (computed from real local data), saved history with search/filter/delete, settings, help. |

Old URLs (`/text-to-sign`, `/settings`, `/profile/teach`, …) redirect to their new locations.

**Design system:** `src/styles/tokens.css` (colours, type, radii, spacing, motion — light, dark and high-contrast), shared UI components in `src/components/ui/`, SignSphere-specific ones in `src/components/domain/`. No CSS framework, no component library. Icons are Lucide geometry vendored as data (ISC); fonts are self-hosted Inter and Poppins (OFL).

**Built-in ISL signs:** `services/ml/build_isl_pack.py` turns INCLUDE (CC BY 4.0) videos into a sign pack users install from **Record signs**, so emergency signs such as DOCTOR, POLICE and HOSPITAL are recognised without recording. See `services/ml/README.md`.

**Offline:** `apps/web/sw.template.js` is turned into `/sw.js` at build time with the full file list, so every screen opens offline after the first visit. MediaPipe models are cached the first time a camera screen is used. Verify with `npm run build && npm run preview`, load once, stop the server, reload.

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
