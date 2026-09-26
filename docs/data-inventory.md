# Data inventory

**Owner:** Data/Backend Lead · **Due:** end of Week 1 · **Status:** ⬜ not started

Fill this in from primary sources. Every figure in PLAN.md §4.1 was written from memory
and must be verified here before it appears in your report or pitch. Delete a row rather
than guess at it.

---

## Public datasets

| Dataset | Source URL | License (exact) | Signs | Clips | Signers | Resolution / FPS | Landmarks extractable? | Verdict | Verified by / date |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INCLUDE / INCLUDE-50 | https://zenodo.org/records/4010759 | CC BY 4.0 (Zenodo record) | 263 (50) | 4,292 (3,475 train / 817 test) | not stated on record | varies; ~25 fps | Yes — MediaPipe; `services/ml/build_isl_pack.py` | USE-WITH-ATTRIBUTION | Claude, 2026-09-26 (Zenodo record + AI4Bharat/INCLUDE repo) |
| CISLR | | | | | | | | | |
| ISL-CSLTR | | | | | | | | | |
| ISLRTC ISL Dictionary | | | | | | | | | |
| *(other)* | | | | | | | | | |

**Verdict** must be one of: `USE`, `USE-WITH-ATTRIBUTION`, `REFERENCE-ONLY`,
`PERMISSION-PENDING`, `DO-NOT-USE`. If you cannot find the license text, the verdict is
`DO-NOT-USE` until you can. "It was on the internet" is not a license.

### Licensing follow-ups

| Org | Contacted (date) | Asked for | Response | Outcome |
| --- | --- | --- | --- | --- |
| ISLRTC | | written permission to use dictionary clips in a non-commercial student app | | |
| | | | | |

---

## Vocabulary decision

The 100-sign v1 list, locked with the Deaf advisor in Week 2. Chosen for **everyday
utility**, not for how easy each sign is to classify.

| # | Gloss | English | Category | Two-handed? | In INCLUDE? | Recorded takes | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | | | family | | | | |

Categories to cover: family, school, food/drink, feelings, health, time, question words,
numbers, courtesy, emergency.

Advisor sign-off: ⬜  Name: ________________  Date: __________

---

## Our corpus — running log

Update after **every** session, same day.

| Session | Date | Signer ID | Fluency | Handedness | Signs | Takes | Kept | Rejected | Device | Lighting | Consent A/B/C | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 001 | | | | | | | | | | | | |

### Totals vs. targets

| Metric | Target | Current |
| --- | --- | --- |
| Distinct signers | 20 | 0 |
| Native/fluent signers | 8 | 0 |
| Left-dominant signers | 3 | 0 |
| Distinct devices | 4 | 0 |
| Lighting conditions | 3 | 0 |
| Signs with ≥40 examples | 100 | 0 |
| Total kept clips | 6000 | 0 |

### Splits

Record exactly which signers are in which split, so results are reproducible.
**Split by signer. Never randomly.**

| Split version | Train signers | Val signers | Test signers | Date frozen |
| --- | --- | --- | --- | --- |
| v1 | | | | |
