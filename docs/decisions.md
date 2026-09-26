# Decision log

One entry per non-obvious decision. Append only — never edit or delete a past entry; if
you change your mind, write a new entry that supersedes the old one. This file is why
your Week 19 report can explain *why* the system looks the way it does, and it settles
"didn't we already decide this?" arguments in ten seconds.

Format: date · decision · alternatives considered · why · who decided · how we'd know we
were wrong.

---

## 2026-08-25 — Ship a video-clip lexicon, not a generative signing avatar

**Alternatives:** 3D avatar with generated animation (as in the v1.0 concept doc);
motion-capture-driven avatar; recorded clips of real signers.
**Why:** Generative signing avatars are an open research problem and existing ones are
widely rated unintelligible by Deaf users. Recorded signer clips are comprehensible on day
one, cost recording time instead of research time, and are better received by the
community.
**Decided by:** team, Phase 0.
**Wrong if:** an off-the-shelf signing-avatar model appears that fluent signers rate as
comprehensible, *and* clip stitching proves too rigid for connected signing.

## 2026-08-25 — Bounded-vocabulary isolated recognition, not continuous translation

**Alternatives:** continuous sign-language translation (concept doc); phrase-level;
isolated signs.
**Why:** No usable public ISL continuous corpus, no solved model, and a semester timeline.
Isolated recognition at ≥90% is achievable and is the exact primitive the Learning Hub
needs, so it does double duty.
**Decided by:** team, Phase 0.
**Wrong if:** we hit 95%+ on 250 isolated signs well before Week 12 and have corpus
headroom to try phrases.

## 2026-08-25 — Web PWA first, not Flutter/React Native

**Alternatives:** Flutter (concept doc), React Native, web PWA + Capacitor later.
**Why:** MediaPipe Tasks for Web gives real-time landmarks with no native toolchain; a URL
is demoable in a viva or on a principal's phone with no install; PWA gives offline for
free. The gloss engine and model artifacts port unchanged if we go native in v1.1.
**Decided by:** team, Phase 0.
**Wrong if:** the course mandates a native app, or browser perf on a ₹12k Android proves
unfixable (measure by Week 6).

## 2026-08-25 — All inference on-device; no inference server

**Alternatives:** Python/FastAPI inference service; cloud vision API; on-device.
**Why:** ₹0 infra, raw video never leaves the device (strongest privacy claim in the
category), works offline in classrooms with bad Wi-Fi, no round-trip latency. Costs us a
~1M-parameter ceiling, which is above what isolated-sign recognition needs.
**Decided by:** team, Phase 0.
**Wrong if:** accuracy plateaus below the ship gate and only a model too large for the
browser clears it.

## 2026-08-25 — Rule-based gloss engine, not a seq2seq model

**Alternatives:** fine-tuned seq2seq English→gloss; LLM API; rule-based.
**Why:** No English→ISL-gloss parallel corpus to train on. Rules are inspectable, fail
predictably, need no data, and can be read and corrected directly by a fluent signer or
linguist. Also produces a `trace` we can put in the report.
**Decided by:** team, Phase 0.
**Wrong if:** rule count exceeds ~150 and maintenance dominates, or an ISL parallel corpus
becomes available.

## 2026-08-25 — Training in Google Colab, not locally

**Alternatives:** local training; Colab; university cluster.
**Why:** Local Python is 3.14, ahead of MediaPipe/TensorFlow wheel support. Colab is free,
has a GPU, and runs Python 3.11. All vision runs in JS anyway, so no local Python is
needed for the MVP.
**Decided by:** team, Phase 0.
**Wrong if:** free-tier Colab timeouts block final training runs (mitigation: Colab Pro,
₹2,000 budgeted).

---

<!-- Append new decisions above this line as they happen. Do not batch them up; write the
     entry the day you decide, while you still remember the alternatives you rejected. -->
