# SignSphere — Development & Startup Plan

**Target sign language:** Indian Sign Language (ISL), India-first
**Team context:** Student capstone, minimal budget, structured so it can become a real startup
**Plan horizon:** 20 weeks to a defensible demo + pilot letters
**Status:** v1 of the plan. Revise at every phase gate (§8).

---

## 0. Read this first: the scope reality check

The v1.0 concept document describes eight major features (Text→Sign, Sign→Text, Voice→Sign,
Sign→Voice, Live Conversation, Learning Hub, Emergency, Community) plus a generative 3D avatar,
across ISL and future multi-language support.

Built properly, that is **20+ engineer-years of work**, and two of those features
(photorealistic generative signing avatars, and continuous sign-language *translation* of
free-form sentences) are **open research problems** that well-funded labs have not solved.
A student team that tries to build all eight ships eight broken demos.

This plan does not delete your vision. It **sequences** it:

- **Keep the full vision** as the product narrative — it is what makes the pitch compelling.
- **Ship one narrow wedge extremely well** in 20 weeks — that is what makes it real.
- Everything else is explicitly labeled `LATER` with the conditions that unlock it.

Two hard swaps you should accept up front, and why:

| Concept doc says | Build instead | Why |
| --- | --- | --- |
| AI avatar generates sign animation from text | **Video-clip lexicon + gloss sequencer** (real Deaf signers, recorded once, stitched at runtime) | Generative signing avatars are unsolved; even good ones are rated unintelligible by Deaf users. Real signer video is comprehensible on day one and is *more* respected by the community. |
| Computer vision converts sign language into readable text | **Bounded-vocabulary isolated-sign recognition** (start 25 signs → 100 → 250) | Continuous ISL sentence translation has no usable public corpus and no solved model. Isolated recognition at 90%+ is achievable, demoable, and is the exact primitive the Learning Hub needs. |

Say this out loud in your presentation. Examiners and investors both reward a team that knows
where the research frontier is. Claiming you solved sign translation is the fastest way to lose
credibility with anyone who knows the field.

---

## 1. The wedge

> **SignSphere is a camera-based ISL learning and communication app that gives you instant
> feedback on whether you signed it right.**

Positioning: *"Duolingo for Indian Sign Language, with a translator built in."*

Why this wedge and not "the translator":

1. **It is technically reachable.** A learning app needs to recognize *one known sign at a time*
   ("did the user correctly sign MOTHER?"). That is a closed-set classification problem with a
   known label — dramatically easier than open-vocabulary translation, and the *same model*
   powers your Sign→Text demo.
2. **The data problem becomes the product.** Every learner practicing a sign generates a labeled
   training clip (with consent). Your app gets better the more it is used. That is your moat,
   and it is the only realistic way an unfunded team accumulates an ISL corpus.
3. **The buyer is identifiable.** ~450 schools for the Deaf in India, plus special-education
   departments, plus hearing family members of Deaf children — who are the single largest
   underserved group, because a Deaf child's parents usually do not sign.
4. **It degrades gracefully.** If recognition accuracy is 78% instead of 95%, a learning app is
   still useful ("close, watch your handshape"). A medical translator at 78% is dangerous.

Non-goals for v1, stated explicitly: not a certified interpreter replacement, not for medical or
legal settings, not continuous conversation translation, not multi-language.

---

## 2. Product scope by release

### MVP — Week 20 (this is what you build and defend)

| # | Feature | Definition of done |
| --- | --- | --- |
| 1 | **Text → ISL** | Type English → gloss sequencer → plays stitched signer clips. 250-word lexicon. Unknown words fall back to fingerspelling. |
| 2 | **Voice → ISL** | Web Speech API / Whisper → same pipeline as #1. |
| 3 | **Sign → Text** (bounded) | Webcam → MediaPipe hands+pose → classifier over **100 signs**, ≥90% top-1 on held-out *signers*. Shows top-3 with confidence. |
| 4 | **Sign → Voice** | #3 output → browser TTS (English + Hindi voice). |
| 5 | **Learning Hub** | 8 lessons × 6 signs. Watch → practice on camera → auto-graded with specific feedback. Streaks, XP, spaced repetition. |
| 6 | **Emergency card** | Offline-first screen: pre-written ISL/text/audio phrase cards for police/hospital/fire, editable emergency contacts, one-tap SMS with location. **No ML** — pure UI, highest impact-per-hour in the whole app. |
| 7 | **Accessibility shell** | Keyboard-navigable, screen-reader labeled, high-contrast + dark mode, font scaling, captions on every video, reduced-motion mode. |
| 8 | **Data contribution flow** | Opt-in "help teach SignSphere" recorder with explicit, revocable consent. |

### v1.1 — Months 6–9
Live Conversation Mode (split-screen, alternating turns), 250→600 sign vocabulary, Hindi text
support, native mobile wrapper, offline model caching, teacher dashboard (assign lessons, see
class progress) — **the teacher dashboard is what a school actually pays for.**

### v2 — Months 9–18
Continuous/phrase-level recognition research track, community forum + mentorship, ISL→Hindi
translation, Marathi/Tamil/Bengali text, third-party captioning API, wearable + AR exploration.

### Cut from v1 and why
- **Community forum** — lowest value-per-engineering-hour; WhatsApp groups already win here. Build
  it only after you have users to put in it.
- **Generative 3D avatar** — see §0. Revisit only if a signing-avatar model good enough for Deaf
  comprehension becomes available off the shelf.
- **Multi-language sign support** — you have not proven one yet.

---

## 3. Architecture

**Principle: on-device first.** Every camera frame is processed in the browser. Raw video never
touches a server unless a user explicitly donates a clip. This is simultaneously the cheapest
architecture (no GPU bill), the most private, the most compelling ethically, and the only one
that works in an Indian classroom with bad Wi-Fi.

```
┌──────────────────────── CLIENT (browser / PWA, installable) ─────────────────────────┐
│                                                                                      │
│  Camera ──> MediaPipe Tasks (WASM/WebGL)                                             │
│              HandLandmarker (2×21 pts) + PoseLandmarker (33 pts)                     │
│                     │                                                                │
│                     ▼                                                                │
│              Feature normalizer  (wrist-relative, scale-invariant, 32-frame window)  │
│                     │                                                                │
│                     ▼                                                                │
│              Sign classifier  (TF.js / ONNX Runtime Web, ~2–5 MB, cached offline)    │
│                     │                                                                │
│                     ├──> Sign→Text UI  ──> Web Speech TTS  (Sign→Voice)              │
│                     └──> Practice grader (Learning Hub)                              │
│                                                                                      │
│  Text input ──> Gloss engine (@signsphere/gloss, pure TS) ──> Render plan            │
│                     │                                                                │
│  Mic ──> Web Speech / Whisper ──┘                                                    │
│                     ▼                                                                │
│              Clip player: signer videos + fingerspelling, from CDN + Cache API       │
│                                                                                      │
│  IndexedDB: lexicon cache, lesson progress, offline emergency cards, pending uploads │
└──────────────────────────────────────────────────────────────────────────────────────┘
                                     │ (only: auth, progress sync, consented clip upload)
                                     ▼
┌──────────────────── BACKEND (Supabase free tier — no servers to run) ────────────────┐
│  Postgres: users, lexicon metadata, lessons, progress, contributions, consent log    │
│  Auth: email + Google + anonymous-guest mode                                         │
│  Storage: signer clips (public read), donated clips (private)                        │
│  Row-Level Security: a user can only ever read/write their own rows                  │
└──────────────────────────────────────────────────────────────────────────────────────┘
                                     │ (offline batch, not a live service)
                                     ▼
┌──────────────────── ML TRAINING (Google Colab free tier) ────────────────────────────┐
│  Donated + recorded landmark JSONL ──> augment ──> train (PyTorch)                   │
│  ──> evaluate by *signer-held-out* split ──> export ONNX/TF.js ──> ship to client    │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

**Why web-first, not Flutter/React Native (the concept doc's suggestion):**
MediaPipe Tasks for Web + TF.js gives you real-time landmark tracking with *zero* native
toolchain pain, and a URL you can open in a viva, on a reviewer's laptop, or on a school
principal's phone with no install and no Play Store review. You get an installable PWA with
offline support for free. When you genuinely need a native app (v1.1), wrap it with Capacitor —
your gloss engine, lexicon, and model all carry over unchanged. **Only** go native early if
your course explicitly mandates Flutter; in that case keep `packages/gloss` and the model
artifacts as-is and rebuild only the UI layer.

**Note on your local machine:** Python 3.14 is ahead of MediaPipe/TensorFlow wheel support.
Do not fight it — all vision runs in JS, all training runs in Colab (Python 3.11). You need no
local Python for the MVP.

### Stack decisions (locked for v1)

| Layer | Choice | Rationale |
| --- | --- | --- |
| App | React 19 + TypeScript + Vite, PWA | Fast, zero native toolchain, demoable anywhere |
| Vision | MediaPipe Tasks for Web (`@mediapipe/tasks-vision`) | Best-in-class hand/pose landmarks, runs in-browser |
| Inference | ONNX Runtime Web (fallback TF.js) | Small models, WASM+WebGL, offline-cacheable |
| Gloss engine | Pure TypeScript package, no deps | Portable to any future frontend; unit-testable |
| Backend | Supabase (Postgres + Auth + Storage + RLS) | Free tier covers a capstone; real SQL, not lock-in |
| Training | Colab free tier + PyTorch | Free GPU, correct Python version |
| Speech | Web Speech API → Whisper-small later | Free, no key, works today; Whisper for Indian-accent robustness |
| Hosting | Vercel or Cloudflare Pages | Free, HTTPS (required for camera), global CDN |
| Analytics | PostHog free / self-hosted Umami | Needed for §11 metrics; privacy-respecting |

**Total recurring infra cost for the MVP: ₹0.** Only spend is data collection (§4) and a
domain (~₹900/yr).

---

## 4. The ISL data strategy — this is the real project

Everything else is engineering you already know how to do. **This section is where the project
is won or lost.** ISL has almost no usable public data, so treat data as a first-class workstream
with its own owner, not as a task inside "ML."

### 4.1 Inventory what already exists (Week 1–2, before writing model code)

| Source | What it is | Action |
| --- | --- | --- |
| **INCLUDE / INCLUDE-50** (AI4Bharat) | Isolated ISL word videos, ~260 signs, ~4.3k clips. The standard ISL benchmark. | **Primary training source.** Get it Week 1, verify license terms yourself. |
| **CISLR** (AI4Bharat) | Large ISL word corpus, thousands of words, few examples each — built for one-shot recognition. | Use for vocabulary coverage + few-shot experiments. |
| **ISL-CSLTR** | Sentence-level ISL corpus (continuous). | Park for v2 research track only. |
| **ISLRTC ISL Dictionary** | Government (Indian Sign Language Research & Training Centre) dictionary, ~10,000 terms with videos. | Your lexicon *reference*. **Verify reuse/licensing in writing before shipping any clip.** Best outcome: an MoU or written permission — also a credibility asset. |
| YouTube ISL channels | Highly variable quality/consent. | Do **not** scrape. Reach out and ask; unlicensed scraping of Deaf creators' work will end your community relationships. |

Deliverable: `docs/data-inventory.md` — per source: license, clip count, signer count, resolution,
whether landmarks are extractable, and a yes/no verdict on use.

> Every number in the table above is from memory and **must be re-verified against the primary
> source in Week 1.** Do not put an unverified figure in your report or pitch.

### 4.2 Record your own corpus (Weeks 3–10, runs in parallel with everything)

Public data will not cover your 100-sign lesson vocabulary, and it will not have your users'
cameras, lighting, or backgrounds. You must record.

**Target: 100 signs × 20 signers × 3 takes = 6,000 clips.**
Recording one sign takes ~10 seconds. One signer's full 100-sign session ≈ 45 minutes including
setup and breaks. That is ~15 hours of recording across 20 people — achievable by a student team
in 8 weeks, and honestly the most fun part of the project.

**Signer diversity is not optional — it is the whole ballgame.** A model trained on 4 signers
gets ~99% on a random split and ~55% on a new person. Vary deliberately:
skin tone, hand size, sleeve length, left/right dominance, signing speed, age, background
clutter, lighting (window / tubelight / dim), camera (laptop webcam / cheap Android / good phone),
distance and framing. Log all of it as metadata per session.

**Recruitment, in priority order:**
1. **The nearest school for the Deaf / NGO** — the only source of *native, fluent* signers, and
   the start of your pilot relationship. Approach with a letter, an offer of free lifetime access,
   and a named faculty sponsor. Bring the app, not a slide deck.
2. Your university's ISL club, disability office, or a hired certified interpreter (₹1,500–3,000
   for a 2-hour session — worth every rupee for label correctness).
3. Hearing students who have learned the 100 signs — **only** for background/lighting/camera
   diversity, and only after a fluent signer has validated the reference. Never let hearing
   learners define ground truth.

**Consent protocol (non-negotiable, and an examiner will ask):**
Plain-language consent form **presented in ISL video, not just English text** — a text-only
consent form for Deaf participants is a contradiction. Separate opt-ins for: (a) train the model,
(b) publish the clip in the app, (c) use in the demo/report. Right to withdraw with a working
deletion path. Store the signed consent record joined to every clip ID; a clip with no consent row
must be un-trainable by construction. See `docs/data-collection-protocol.md`.

**Store landmarks, not just video.** Extract MediaPipe landmarks at record time and store the
`.jsonl` alongside the video. Landmarks are ~1000× smaller, are what the model actually consumes,
are far less privacy-sensitive, and can be shared/published even when video cannot. This one
decision is what lets an unfunded team have a shareable dataset.

### 4.3 Grow the corpus through the product (Month 4 onward)

The Learning Hub practice loop already asks the user to sign a *known* target. With opt-in
consent, that is a free labeled example. Ship the recorder in the MVP, gate it behind explicit
consent, review a sample by hand, and retrain monthly. Track corpus growth as a headline metric —
it is the clearest evidence of a compounding advantage in your pitch.

### 4.4 Publish a slice

Releasing a clean, consented, landmark-only ISL dataset (even 100 signs × 20 signers) would be a
genuine contribution to a field that has almost nothing, and is worth more for credibility,
partnerships, and paper acceptance than any feature you could build in the same time. Plan it as
the Week 19–20 stretch deliverable.

---

## 5. ML approach

Deliberately unfashionable and boring. Boring converges in a semester.

### 5.1 Representation
Per frame: 2 hands × 21 landmarks × (x, y, z) = 126 dims, plus 25 upper-body pose landmarks × 3
= 75 dims, plus 12 dims of signing-space position and inter-hand geometry → **213 dims/frame**.
Sample/pad to **T = 32 frames** (≈1.1 s at 30 fps), so one window is 6,816 floats.
`FRAME_DIM` in `features.ts` is the source of truth for this number, not this document.

Normalization (in `apps/web/src/lib/features.ts`, shared with training so there is exactly one
implementation):
1. Translate each hand by its own wrist → position-invariant handshape.
2. Scale by hand span (wrist→middle-MCP distance) → distance-invariant.
3. Keep a *separate* small vector of absolute hand position relative to torso/face — **critical
   for ISL**, where location carries meaning; do not normalize it away.
4. Canonicalize handedness so left- and right-dominant signers map to the same space.
5. Missing hand → zeros + an explicit presence flag (never interpolate a hand that isn't there).

ISL-specific: two-handed signs are far more common than in ASL, and many signs use contact
between hands. Always model both hands; add inter-hand distance/relative-position features.

### 5.2 Model ladder — climb only when the rung below plateaus

| Rung | Model | Params | Purpose |
| --- | --- | --- | --- |
| 0 | Logistic regression on mean+std of frames | ~26k | **Baseline you must beat.** Ready in a day. If your fancy model can't beat this, the bug is in your data. |
| 1 | 1D-CNN over time (3 conv blocks + GAP) | ~150k | Fast, tiny, surprisingly strong. **Ship this in the MVP.** |
| 2 | BiGRU (2 layers, 128 hidden) | ~400k | Better on signs with slow/held movement. |
| 3 | Small Transformer encoder (4 layers, d=128) | ~800k | Best ceiling; needs the most data. |
| 4 | ST-GCN / graph conv over the skeleton | ~1M | Literature SOTA for isolated sign; v2 territory. |

Augmentation (cheap, huge payoff): time warp ±20%, random temporal crop, per-frame Gaussian
landmark jitter, small 3D rotation, mirror + handedness swap, random frame drop (simulates
tracking loss), scale jitter.

### 5.3 Evaluation — the rule that saves your project

**Split by signer, never randomly.** Random splits on sign data leak the signer's idiosyncrasies
across train and test and inflate accuracy by 30–40 points. Report:

- Top-1 and top-3 accuracy, **leave-signers-out** (hold out 4 of 20 signers entirely)
- Per-class accuracy + confusion matrix (find the confusable pairs and design lessons around them)
- Accuracy vs. signer count in training (this curve tells you how much more data to collect)
- Latency p50/p95 on a ₹12,000 Android phone and a mid-range laptop — **if it isn't ≤300 ms it
  isn't real-time and users will hate it**
- Rejection quality: performance on an explicit "not a sign / unclear" class. A model that must
  guess is a model that lies confidently.

Gate to ship: **≥90% top-1 leave-signers-out on 100 signs, ≤300 ms p95 client-side.** If you
miss it, cut vocabulary (100→60) rather than shipping a liar. Publish the number you actually
got, including if it is 76%.

### 5.4 The gloss engine (Text→Sign)
Rule-based, transparent, debuggable — and honestly better than an LLM here, because you can
show an examiner exactly why it produced a given output.

Pipeline: tokenize → drop function words (articles, copula, most auxiliaries) → light lemmatize →
reorder toward ISL structure (`TIME → TOPIC/SUBJECT → OBJECT → VERB → NEGATION → QUESTION-WORD`)
→ map to lexicon glosses → unknowns become fingerspelling → emit a render plan of clips with
durations and transitions.

ISL is **not** signed English: no articles, no copula, question words go last, time markers go
first, negation follows the verb, topic-comment ordering is common. Every rule in the engine gets
a comment citing the ISL grammar source it came from, and **every rule gets validated by a fluent
signer** — a plausible-looking rule invented by a hearing developer is how you produce fluent
nonsense. `packages/gloss/src/rules.ts` is designed so a linguist can read and correct it without
touching TypeScript.

---

## 6. Team — 4 people, named owners

Ownership matters more than skill level. Every workstream has exactly one throat to choke.

| Role | Owns | Skills to build |
| --- | --- | --- |
| **Product / Community Lead** | Deaf-community relationships, consent, signer recruitment, lesson design, pilot letters, the pitch | Interviewing, ISL basics, writing |
| **ML Lead** | Features, training, eval harness, model export, the accuracy number | PyTorch, MediaPipe, Colab |
| **Frontend Lead** | React app, camera pipeline, accessibility, PWA/offline | React, TS, WebGL/WASM basics |
| **Data / Backend Lead** | Recording rig, dataset pipeline, Supabase schema + RLS, clip CDN, lexicon | SQL, Python, video tooling |

Everyone: learn ~50 ISL signs by Week 6. You cannot design for a language you cannot read. Put
it in the schedule.

**Advisors to recruit in Month 1** (ask by email; a surprising number say yes):
1. A **Deaf ISL user** — paid, on the team, with veto power over anything that misrepresents ISL.
   Not a "consultant you check with at the end." This is the single highest-leverage hire.
2. A certified ISL interpreter — label validation and gloss-rule review.
3. A faculty member in CV/ML — eval rigour and paper co-authorship.
4. A special-education teacher or school-for-the-Deaf principal — your first pilot and your
   distribution channel.

---

## 7. Budget (student reality)

| Item | Cost (₹) | Notes |
| --- | --- | --- |
| Interpreter/signer honoraria | 25,000 | 20 signers × ~₹1,200. **Pay people. Do not extract unpaid labor from a marginalized community for your grade.** |
| Deaf advisor stipend | 20,000 | ₹5,000/mo × 4 months. The best money you will spend. |
| Recording kit | 8,000 | Tripod, ₹1,500 ring light, plain backdrop cloth, borrowed phones |
| Colab Pro (2 months, optional) | 2,000 | Only if free tier times out during final training |
| Domain + email | 2,000 | |
| Travel to school/NGO | 5,000 | |
| Printing (consent forms, posters) | 2,000 | |
| Buffer | 8,000 | |
| **Total** | **~₹72,000** | ≈ $850 |

Infra is ₹0 (all free tiers). If ₹72k is out of reach: cut to 12 signers (₹15k), drop Colab Pro,
and apply for a departmental project grant, a university innovation cell fund, or an accessibility
CSR micro-grant — this project reads *extremely* well on those applications.

---

## 8. Step-by-step 20-week roadmap

Five phases, each ending in a **gate** with a written go/no-go. If a gate fails, cut scope — never
slip the gate. Weekly rhythm: Monday 30-min plan, Friday 45-min demo (working software only, no
slides), a running decision log in `docs/decisions.md`.

---

### PHASE 0 — Foundations (Weeks 1–2)
*Goal: know what exists, whom you're building for, and have a repo that runs.*

**Week 1**
1. Repo scaffold running locally; CI (typecheck + tests) green on push.
2. Write `docs/data-inventory.md`: download INCLUDE + CISLR, read the licenses yourself, count
   signers and clips, confirm you can extract landmarks. Verify every claim in §4.1.
3. Email 10 organizations: schools for the Deaf, ISL NGOs, ISLRTC, university disability office.
   Expect 2 replies. Send 10 more in Week 2.
4. Competitive teardown: install and actually use every ISL/ASL app you can find. One page each:
   what it does, what it does badly, what it charges, who reviews it and why they're unhappy.

**Week 2**
5. **Talk to 10 people** — ≥5 Deaf or hard-of-hearing (via an interpreter), ≥3 parents/teachers of
   Deaf children, ≥2 interpreters. Ask what actually breaks in their day. **Do not pitch. Do not
   demo.** Write up verbatim quotes.
6. Rewrite §1's wedge based on what you heard. If the interviews contradict this plan, the plan is
   wrong — that's the plan working.
7. Sign the Deaf advisor. Draft consent forms; record the ISL-video version of them.
8. Lock the 100-sign vocabulary **with your advisor** — chosen for everyday utility (family,
   school, food, feelings, emergency, time, questions), not for what's easy to classify.

> **GATE 0:** Data inventory written · advisor signed · 10 interviews done · 100-sign list locked ·
> repo CI green. *No model code before this gate.*

---

### PHASE 1 — Vertical slice (Weeks 3–6)
*Goal: one end-to-end path working badly, rather than three components working perfectly alone.
This is the single most important architectural discipline in the whole plan.*

**Week 3**
9. Camera + MediaPipe hand/pose landmarks rendering live at ≥20 fps in the browser.
10. `features.ts`: normalization + 32-frame windowing, with unit tests on synthetic input.
11. Recorder screen: prompt a sign → 3-2-1 countdown → capture → save video + landmark JSONL →
    metadata form (signer ID, lighting, device, handedness).

**Week 4**
12. Train Rung-0 logistic regression on INCLUDE-50 in Colab. **Write the number down.** Every
    later model is judged against it.
13. Eval harness: leave-signers-out splits, confusion matrix, per-class accuracy, latency bench.
    Build this *before* the good model, or you will fool yourself.
14. Export → ONNX → run in-browser → live prediction on screen. **Vertical slice closed.**

**Week 5**
15. Gloss engine v1 + tests: 60 hand-picked sentences with advisor-approved expected glosses.
16. Lexicon schema + 40 seed clips recorded with your advisor. Clip player with smooth stitching.
17. Text→Sign screen end-to-end: type → gloss → clips play.

**Week 6**
18. Voice→Sign (Web Speech) and Sign→Voice (TTS) — both are thin adapters over what exists now.
19. App shell: routing, nav, dark mode, keyboard nav, ARIA labels, focus management.
20. **Deploy to a public URL.** From here on, `main` is always demoable to a stranger.

> **GATE 1:** A stranger can open a URL, type a sentence and see ISL, and sign one of 10 words and
> see it recognized. Rung-0 baseline recorded. Accessibility audit passes keyboard-only + one
> screen reader.

---

### PHASE 2 — Data engine + real model (Weeks 7–12)
*Goal: your own corpus, and a model that generalizes to people it has never seen.*

**Weeks 7–10 (recording sprint, in parallel with everything below)**
21. Recording sessions: **2 signers/week minimum**, 100 signs × 3 takes each. Ruthless about
    diversity (§4.2). After every session: QC pass (bad tracking, wrong sign, cut-off hands),
    log metadata, back up twice.
22. Dataset builder: raw clips → landmark JSONL → versioned splits (`v1`, `v2`, …) with a manifest
    recording exactly which clips and which signers are in each split. Reproducibility is a
    grading criterion and a research necessity.

**Week 8**
23. Climb to Rung 1 (1D-CNN) + full augmentation. Retrain weekly as data lands; plot the
    accuracy-vs-signer-count curve and put it in the report.

**Week 9**
24. Learning Hub: 8 lessons × 6 signs. Watch → practice → graded. Feedback must be *specific*
    ("your non-dominant hand is too low"), which means deriving simple geometric checks from
    landmarks, not just showing a class probability.
25. Spaced repetition (SM-2 is plenty), streaks, XP, progress persistence.

**Week 10**
26. Supabase: schema, RLS policies, auth, progress sync, guest mode. Verify RLS with an actual
    hostile test — try to read another user's rows from the client.
27. Emergency Assistance: offline phrase cards, contacts, one-tap SMS + location. Test it in
    airplane mode. Test it with a real Deaf user and ask if they'd trust it.

**Weeks 11–12**
28. Rungs 2–3 (BiGRU, small Transformer). Pick by leave-signers-out, not by training loss.
29. Add an "unclear/not-a-sign" rejection class + confidence thresholding. Refusing to answer is
    a feature.
30. Optimize: quantize to int8, target ≤300 ms p95 on a mid-range Android. Measure on the real
    device, not your laptop.
31. Opt-in contribution flow shipped with consent UI and a working deletion path.

> **GATE 2:** ≥85% top-1 leave-signers-out on ≥60 signs · ≥14 signers recorded · Learning Hub
> usable end to end · emergency screen works offline. *If accuracy misses, cut vocabulary, not the
> gate.*

---

### PHASE 3 — Pilot + polish (Weeks 13–17)
*Goal: real users, real evidence. A capstone with 30 real users beats one with a perfect UI.*

**Week 13**
32. Usability testing with **5 Deaf users + 5 hearing learners**, moderated, via an interpreter.
    Watch silently; log every stumble. Expect the results to hurt.
33. Fix the top 10 issues before touching any new feature.

**Weeks 14–15**
34. **Pilot with one school or NGO: 20–40 learners, 3 weeks.** Weekly check-in with the teacher.
    Instrument: sign-recognition accuracy in the wild, lesson completion, retention D1/D7/D14,
    signs mastered, session length, crash/failure rate.
35. Teacher view: class progress, assign a lesson. Crude is fine; this is the paid-feature probe.
36. Push vocabulary to 100 signs, lexicon to 250 words.

**Week 16**
37. Accessibility audit against WCAG 2.2 AA. Fix everything Level A, document any AA gaps.
38. Performance: cold start <3 s on 3G, model cached offline, works after airplane-mode reload.
39. Robustness: no camera, denied permission, bad lighting, tab backgrounded, mid-sign tab switch.
    Every failure gets a human-readable message, never a stack trace.

**Week 17**
40. Pilot results written up honestly, including what failed. Ask the teacher/principal for a
    **letter of support** — this is the single most valuable artifact for both grading and funding.

> **GATE 3:** Pilot complete with ≥20 real users · quantitative results written up · ≥1 letter of
> support · WCAG 2.2 AA (Level A clean) · zero P0 bugs.

---

### PHASE 4 — Ship, write, pitch (Weeks 18–20)

**Week 18**
41. Public launch: PWA live, landing page, 90-second demo video **with captions and ISL** (a
    caption-less accessibility-app demo is an own goal reviewers will notice).
42. Optional Play Store build via Capacitor.

**Week 19**
43. Capstone report: problem, related work, data (incl. the honest limitations), method, results,
    ablations, ethics, failure analysis, future work. Lead with the leave-signers-out number.
44. Publish the landmark dataset slice + model card + eval code (§4.4).

**Week 20**
45. Pitch deck (§9) + financial model + 3-year roadmap.
46. Apply: Smart India Hackathon, university incubator, NIDHI-PRAYAS, accessibility CSR programs,
    Google/Microsoft accessibility grants, disability-tech competitions.
47. Retro + a written handoff so the project survives you graduating.

> **GATE 4:** Live public app · report submitted · dataset published · deck + model ready · ≥3
> funding/incubator applications submitted.

---

## 9. Startup track

### Market (verify every number before it goes in a deck)
- India's 2011 Census recorded ~5M people with hearing disability; disability-sector estimates run
  far higher (~18M often cited). **Get the primary source; the gap between those figures is itself
  a useful slide.**
- Certified ISL interpreters in India are commonly cited in the *low hundreds* — an
  interpreter-to-Deaf-person ratio so extreme that human interpreting can never scale. This is the
  core argument for why software has to exist.
- ~450 schools for the Deaf; ISL is recognized in the RPwD Act 2016 and NEP 2020, which creates
  budgeted institutional demand.
- The larger, less obvious market: **hearing family members**. Most Deaf children in India are
  born to hearing parents who never learn to sign. That is the single largest population of
  motivated ISL learners in the country, and nobody serves them.

### Business model (in the order you should try them)
1. **B2B2C — schools & NGOs.** ₹15,000–50,000/yr per institution for the teacher dashboard,
   class progress, and offline classroom mode. Slow sales, sticky revenue, real budgets.
2. **Freemium consumer.** Free: translator + 3 lessons + emergency cards (always free, forever —
   never paywall emergency access). ₹149/mo or ₹999/yr for full curriculum, offline, certificates.
3. **CSR / grants.** Accessibility is a fundable CSR line item in India. Realistically your first
   ₹10–50 lakh, and it is non-dilutive.
4. **Government / public-sector.** Slowest, largest. Needs the pilot letters from Phase 3.
5. **LATER: API licensing.** ISL captioning for ed-tech, OTT, and government portals — highest
   margin, but only once accuracy is genuinely good.

Never charge for: emergency features, or the basic translator for a verified Deaf user.

### Moat, honestly assessed
Not the model — anyone can train a 1D-CNN. Your defensible assets, in order:
1. **A consented, signer-diverse ISL corpus** that grows with usage. Nobody else in India has one,
   and it takes 18 months of relationship-building to start.
2. **Deaf community trust and institutional relationships.** Cannot be bought or rushed.
3. **The compounding practice-data loop.** Every lesson makes the model better.
4. Distribution through schools.

### Competition framing
Global ASL apps (Lingvano, ASL Bloom, SignAll) don't do ISL. Google/Apple accessibility features
don't do sign language recognition. Indian efforts are mostly research prototypes or unmaintained
dictionary apps. **Your risk is not competition — it is that the technical problem is genuinely
hard and the market is used to being disappointed.** Plan around that, not around rivals.

### Pitch deck outline (12 slides)
1. Open with the interpreter ratio. Let it sit.
2. A single Deaf child + hearing parent story from your interviews.
3. Why one-directional tools fail.
4. Demo (video, captioned, 60 s).
5. The wedge — learn ISL with instant feedback.
6. Traction: pilot numbers, users, letters of support.
7. Technology: on-device, private, offline, ISL-specific — with the honest accuracy number.
8. Data moat and how it compounds.
9. Market and business model.
10. Team + Deaf advisors.
11. Roadmap to v2.
12. Ask: ₹X for Y months to Z milestone.

Put the real accuracy number on slide 7. Every technical investor will ask; being the team that
volunteers it is worth more than two extra points of accuracy.

---

## 10. Ethics and community — not an appendix

Sign-language tech has a bad history of hearing engineers building signing gloves and avatars that
Deaf people find useless or insulting, then presenting them as gifts to a community that was never
consulted. **Search "signing gloves criticism" and read the Deaf community's responses before you
build anything.** It will change your design decisions.

Rules for this project:
1. **"Nothing about us without us."** A paid Deaf advisor with real veto power, from Week 2.
2. ISL is a **complete natural language** with its own grammar — not gestural English. Never call
   sign language "gestures" in your report or UI.
3. **Position as augmentation, never replacement.** Say in the app: "SignSphere is not a
   replacement for a qualified interpreter."
4. **Pay contributors.** Money, not "exposure."
5. **Consent in ISL video**, granular, revocable, with a deletion path that actually works.
6. **Publish real accuracy per signer group.** If the model is worse on darker skin tones or
   left-dominant signers — and it probably will be at first — publish that and fix it. Silent
   failure on a subgroup is the standard way accessibility tech harms the people it claims to help.
7. **Refuse unsafe deployment.** Medical/legal/emergency-dispatch interpretation is out of scope.
   State it in the UI, not just the report.
8. **Accessibility of your own app** is a correctness requirement, not a feature.

---

## 11. Metrics

**Weekly (team dashboard):**
- Corpus: clips, distinct signers, signs with ≥40 examples
- Model: top-1 leave-signers-out, worst-class accuracy, p95 latency
- Product: WAU, D7 retention, lessons completed, signs mastered/user
- Quality: recognition attempts ending in success, crash-free sessions

**Phase gates:** the accuracy + latency thresholds in §8.

**North-star metric:** **signs mastered per active learner per week.** It's the only number that
simultaneously reflects model quality, lesson design, and real user value.

Vanity metrics to consciously ignore: total downloads, lexicon size, Instagram followers.

---

## 12. Risks

| # | Risk | Severity | Mitigation |
| --- | --- | --- | --- |
| 1 | Model doesn't generalize to new signers | **Critical** | Signer-diverse recording (§4.2); leave-signers-out from Week 4; cut vocabulary before shipping a liar |
| 2 | Not enough data by Week 12 | **Critical** | Start recording Week 3, not Week 8; pretrain on INCLUDE; few-shot from CISLR; scope down to 60 signs |
| 3 | No Deaf-community partner | **Critical** | Email 20 orgs in Week 1; paid advisor; university disability office as fallback |
| 4 | Overscoping to all 8 features | **Critical** | This plan. Enforce gates. Every "let's also add…" gets written to a v2 list, not the sprint |
| 5 | Browser perf too slow on cheap Android | High | Measure on a real ₹12k phone by Week 6; int8 quantize; drop to hands-only; reduce fps |
| 6 | ISLRTC clip licensing blocked | High | Record your own lexicon with your advisor from Week 5; treat ISLRTC as reference only |
| 7 | Gloss rules are hearing-invented nonsense | High | Every rule advisor-reviewed; 60-sentence golden test set |
| 8 | Team member drops / exams | Medium | Documented ownership, no single-person knowledge, buffer weeks, `docs/decisions.md` |
| 9 | Accessibility of your own app is bad | Medium | Audit at Gate 1 *and* Gate 3; test with a real screen-reader user |
| 10 | Someone deploys it in a hospital | Medium | Explicit in-app scope limits; refuse the use case in writing |
| 11 | Web Speech fails on Indian-accented English | Medium | Whisper-small fallback; always allow typed input |
| 12 | Project dies at graduation | Medium | Week 20 handoff doc; recruit juniors in Phase 3 |

---

## 13. Capstone deliverables → startup assets

| Course deliverable | Doubles as |
| --- | --- |
| Working prototype | The product demo |
| Technical report | Whitepaper + paper submission |
| Dataset + model card | The data moat, publicly staked |
| Pilot study | Traction slide + letters of support |
| Architecture docs | Engineering onboarding |
| This plan | Investor roadmap |

---

## 14. Do these five things this week

1. **Email 10 Deaf schools/NGOs today.** Longest lead time of anything in this plan; everything
   else is blocked on it. Do it before you write a line of code.
2. **Download INCLUDE and read its license yourself.** Verify every number in §4.1.
3. **Recruit and pay a Deaf advisor.** Highest-leverage decision in the project.
4. **Run the scaffold** (`README.md`) and get the camera + landmarks demo working — that's your
   vertical slice starting point.
5. **Lock the 100-sign vocabulary with your advisor**, chosen for daily utility, not for ML
   convenience.

Then hold Gate 0 in two weeks and be honest about what you missed.
