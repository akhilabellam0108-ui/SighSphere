# Architecture

## The one-sentence version

Every camera frame is processed in the browser; the only thing that ever reaches a server
is a user's lesson progress and — with explicit, revocable consent — a donated clip.

## Why that constraint drives everything

| Benefit | Consequence |
| --- | --- |
| No GPU inference bill | A student team can run this at ₹0/month indefinitely |
| Raw video never leaves the device | The strongest privacy claim in the category, and the easiest ethics review |
| Works offline | Usable in an Indian classroom with unreliable Wi-Fi |
| No cold-start latency | Recognition feels instant; no round trip |
| Model must be small (≤5 MB) | Forces the boring, fast models that actually converge in a semester |

The cost: you are limited to models that run in WASM/WebGL at 30 fps on a mid-range
Android. In practice that is a hard ceiling around ~1M parameters — which is above what
isolated-sign recognition needs, so it is not a real constraint for v1.

## Data flow

```
┌─────────────────────── apps/web (browser) ───────────────────────┐
│                                                                  │
│  getUserMedia ──> <video>                                        │
│        │                                                         │
│        ├──> lib/landmarks.ts                                     │
│        │      MediaPipe Tasks: HandLandmarker + PoseLandmarker   │
│        │      (WASM + WebGL, models from CDN, cached)            │
│        │           │                                             │
│        │           ▼  raw landmarks per frame                    │
│        ├──> lib/features.ts                                      │
│        │      normalize + 32-frame ring buffer ──> Float32Array  │
│        │           │                                             │
│        │           ▼                                             │
│        └──> lib/classifier.ts                                    │
│               ├─ TemplateClassifier  (centroids from localStorage)│
│               └─ OnnxClassifier      (VITE_MODEL_URL, later)     │
│                     │                                            │
│                     ├──> routes/SignToText.tsx                   │
│                     ├──> routes/SignToVoice.tsx ──> lib/speech   │
│                     └──> routes/Learn.tsx  (practice grader)     │
│                                                                  │
│  routes/TextToSign.tsx                                           │
│        text ──> @signsphere/gloss ──> RenderToken[] ──> clip player│
│                                                                  │
│  routes/VoiceToSign.tsx                                          │
│        mic ──> lib/speech (Web Speech) ──> same pipeline as above │
│                                                                  │
│  lib/storage.ts — progress, recorded samples, settings, consent   │
└──────────────────────────────────────────────────────────────────┘
```

## Module contracts

### `lib/landmarks.ts`
Owns MediaPipe. Nothing else in the app imports `@mediapipe/tasks-vision`. Exposes
`createLandmarkTracker()` returning `{ start, stop, onFrame }` where a frame is
`{ hands: Hand[], pose: Landmark[] | null, timestampMs }`. Swappable — if MediaPipe is
replaced, only this file changes.

### `lib/features.ts`
Pure functions, no I/O, no DOM. `normalizeFrame()` and `buildWindow()`. **Mirrored exactly
in `services/ml/features.py`.** Any change here is a breaking change to every trained
model; bump `FEATURE_VERSION` and retrain. The version is stored with each recorded sample
so old samples are detectable rather than silently misinterpreted.

Normalization, in order:
1. Per-hand translation by that hand's wrist → handshape becomes position-invariant.
2. Per-hand scale by wrist→middle-MCP distance → distance-invariant.
3. **Absolute hand position relative to shoulder midpoint is kept as separate features.**
   ISL uses signing-space location meaningfully; normalizing it away destroys information.
   This is the most common mistake in student sign-recognition projects.
4. Handedness canonicalization so left- and right-dominant signers map to one space.
5. Missing hand → zeros plus an explicit presence flag. Never interpolate an absent hand.

### `lib/classifier.ts`
Interface: `predict(window: Float32Array): Promise<Prediction[]>` returning top-k with
confidence. Two implementations behind one interface so the UI never changes when the
model does. `TemplateClassifier` exists so the app is demoable in Week 3, before any
training run — it is a documented baseline, not the shipping model.

### `packages/gloss`
Zero-dependency TypeScript. English text → ISL gloss sequence → render plan. Emits a
`trace` array explaining which rule fired at each step — for debugging, for the report,
and for a fluent signer to review without reading code.

Deliberately rule-based rather than a neural model: it is inspectable, it needs no
training data, it fails predictably, and a linguist can correct it directly in
`src/rules.ts`.

## Feature-version compatibility

`FEATURE_VERSION` in `features.ts` ties together: recorded samples, trained models, and
the live pipeline. On mismatch the app warns instead of producing silent garbage. Bump it
whenever normalization changes.

## What is deliberately NOT here

- **No inference server.** If you find yourself adding one, re-read the tradeoff table.
- **No generative avatar.** Video clips of real signers. See PLAN.md §0.
- **No continuous translation.** Isolated signs only in v1.
- **No custom auth.** Supabase Auth + Row-Level Security, added Week 10.
- **No state-management library.** React state and `localStorage` are sufficient at this
  size; adding Redux/Zustand now is complexity without a payer.

## Deployment

Static build → Vercel or Cloudflare Pages. Requirements: HTTPS (camera), correct
`Cross-Origin-Embedder-Policy`/`Cross-Origin-Opener-Policy` headers if you later enable
WASM threads for MediaPipe, and long-cache headers on the model file.
