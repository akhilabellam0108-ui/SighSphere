# Trained models

`train.py` writes here. Model binaries are gitignored; the `.metrics.json` files are **not** —
commit those. They are your evidence trail, and the honest record of what each model actually
scored.

```
sign-cnn-v1.onnx           the model            (gitignored — too big, regenerable)
sign-cnn-v1.labels.json    class order          (COMMIT — the app is wrong without it)
sign-cnn-v1.metrics.json   held-out results     (COMMIT — this is the evidence)
```

To ship a model to the app, copy the `.onnx` and `.labels.json` into
`apps/web/public/models/` and set `VITE_MODEL_URL=/models/sign-cnn-v1.onnx`.

## Model card

Write one of these per released model, in the report and next to any public release. Fill in
every field — "unknown" is an acceptable answer and a much better one than a blank.

- **Model**: architecture, parameter count, feature version
- **Training data**: number of signers, clips per class, collection dates, consent basis
- **Evaluation**: leave-signers-out top-1/top-3, which signers were held out, per-class accuracy
- **Known weaknesses**: worst classes, confusable pairs, and accuracy broken down by skin
  tone / handedness / lighting / device where you have the numbers. Publish these even when
  unflattering — a subgroup failing silently is the standard way accessibility tech harms the
  people it claims to serve (PLAN.md §10 rule 6).
- **Intended use**: bounded-vocabulary isolated ISL recognition for learning and casual
  communication
- **Out of scope**: medical, legal, or emergency interpretation; continuous sentence
  translation; any sign language other than ISL
- **Latency**: p50/p95 on the devices you actually measured, named
