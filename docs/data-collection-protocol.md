# Data collection protocol

**Read this in full before you record a single participant.** Getting this wrong is both an
ethics failure and a project-ending one: unconsented data cannot be used, published, or
defended, and word travels fast in a community this tightly connected.

This protocol should be reviewed by your institution's ethics committee / IRB if one
exists. If your department has no process, write to the head of department for written
sign-off anyway — it takes a week and it protects you.

---

## 1. Before any session

- [ ] Deaf advisor has reviewed and approved this protocol.
- [ ] Consent form exists in **two forms**: plain-English text *and* an **ISL video
      recording**. A text-only consent form for Deaf participants is not informed consent.
- [ ] A certified interpreter is booked, or the session lead is fluent in ISL.
- [ ] Honorarium is arranged **in advance** and paid on the day. Not "later," not
      "exposure," not a certificate.
- [ ] Recording space: plain background, even light, chair at fixed distance, camera at
      chest height framing head to hips.
- [ ] Storage: local encrypted drive + one backup. Not a public cloud folder. Not a
      WhatsApp group.

## 2. Consent — three separate opt-ins

Participants tick each independently. Any combination is valid; "train only" is common
and must be respected.

| Opt-in | Meaning |
| --- | --- |
| **A — Train** | Landmarks and video may be used to train models. Never published. |
| **B — Publish in app** | This clip may appear in the app as a reference sign for learners. |
| **C — Demo / report** | This clip may appear in presentations, the report, or a paper. |

Also record:
- Right to withdraw at any time, with no reason, and no effect on anything else.
- A named contact and a working process for withdrawal.
- What happens on withdrawal: clip and landmarks deleted within 7 days; already-trained
  models are retrained at the next scheduled retrain (be honest that a model already
  trained cannot be un-trained instantly — do not promise the impossible).
- That data is stored on team-controlled storage and not sold or shared with third
  parties.

**Enforcement in code, not in good intentions:** every clip ID joins to a consent row.
The dataset builder in `services/ml/dataset.py` must **skip any clip without opt-in A**,
and the app must never serve a clip without opt-in B. A clip with no consent row is
un-trainable by construction. Write the test that proves it.

## 3. Session script (~45 min for 100 signs)

1. **Welcome (5 min).** Explain in ISL: what SignSphere is, what today involves, that
   they can stop any time. Answer questions. Then consent — signed, and *recorded on video
   with the participant confirming in ISL* if they agree to that.
2. **Metadata (2 min).** Record in the form, with a pseudonymous signer ID (`S014`) — no
   names in filenames or metadata:
   - handedness (left/right dominant)
   - fluency: native / fluent / learner  *(learners never define ground truth)*
   - age band, and whether they are a member of the Deaf community
   - sleeve length, jewellery, glasses
   - device used, lighting condition, background type
3. **Warm-up (3 min).** Record 3 throwaway signs to get comfortable with the countdown.
   Delete them.
4. **Recording (30 min).** For each of the 100 signs: show the reference clip → 3-2-1
   countdown → they sign → auto-stop. **3 takes per sign.** Break every 25 signs; signing
   fatigue degrades quality measurably.
5. **Review (5 min).** Show the participant any clip on request. Delete anything they ask
   you to delete, immediately, without discussion.
6. **Close.** Pay them. Give them free lifetime app access. Ask if they'd be willing to
   review the app later (many will — this is how you build your advisory group).

## 4. Diversity targets

A model trained on a homogeneous set of signers scores ~99% on a random split and ~55% on
a new person. Deliberately vary — and **track your counts against these targets weekly**,
because unmonitored recruitment always converges on "people like us":

| Dimension | Target |
| --- | --- |
| Distinct signers | ≥20 (never fewer than 14) |
| Native/fluent signers | ≥8 |
| Left-dominant | ≥3 |
| Skin tone range | span the full range of your local population |
| Age bands | ≥3 bands represented |
| Devices | ≥4 distinct cameras (incl. one ₹12k-class Android) |
| Lighting | ≥3 conditions (window / tubelight / dim) |
| Backgrounds | ≥4, including at least one cluttered |
| Sleeve | both short and long sleeves |

## 5. Quality control — same day, every session

- [ ] Landmark tracking present for ≥90% of frames in every kept clip.
- [ ] A fluent signer confirms each clip shows the intended sign. **Mislabeled data is
      worse than missing data** — it teaches the model to be confidently wrong.
- [ ] Hands fully in frame for the whole sign.
- [ ] No other person visible; no identifying documents or house numbers in frame.
- [ ] Metadata complete; consent row exists and is linked.
- [ ] Backed up to two locations.
- [ ] Session log appended to `docs/data-inventory.md`.

Reject rather than salvage. A rejected clip costs 10 seconds to re-record; a bad clip
costs you a percentage point and a week of confused debugging.

## 6. Naming and storage

```
data/recordings/<signerId>/<gloss>__<take>__<featureVersion>.webm
data/recordings/<signerId>/<gloss>__<take>__<featureVersion>.jsonl   # landmarks
data/recordings/<signerId>/session.json                             # metadata + consent ref
data/consent/<signerId>.json                                        # opt-ins A/B/C, date, witness
```

`data/recordings/` and `data/consent/` are gitignored. **Never override that.** If you
need to share data with a teammate, share the landmark `.jsonl` files (far less
identifying) over an access-controlled channel, never the video, never a public link.

## 7. Publishing a dataset slice (Week 19–20)

Only clips with opt-in C. Landmarks only, no video, unless a participant separately and
explicitly agreed to video release. Include a datasheet: how collected, who by, signer
demographics *in aggregate*, known biases, intended and unintended uses, license, and
contact for removal requests.

A well-documented 100-sign × 20-signer consented ISL landmark dataset is a real
contribution to a field that has very little. Do it properly and it outlives the course.
