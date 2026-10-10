"""
TEST DATA ONLY -- never train a model you ship on this.

Writes a JSONL file shaped exactly like the Record screen's export, with made-up
"signs" (each class is a different direction of motion over time) from several made-up
signers. CI uses it to prove the training pipeline runs end to end and exports a model
the app can load. It says nothing about real ISL accuracy.

    python synthetic.py --out /tmp/synthetic.jsonl
"""

from __future__ import annotations

import argparse
import json

import numpy as np

import features as F


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True)
    parser.add_argument("--labels", default="HELP,WATER,DOCTOR,PAIN,POLICE")
    parser.add_argument("--signers", type=int, default=8)
    parser.add_argument("--per-signer", type=int, default=6)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    rng = np.random.default_rng(args.seed)
    labels = args.labels.split(",")
    t = np.linspace(0, 1, F.WINDOW_FRAMES, dtype=np.float32)[:, None]
    patterns = [rng.normal(size=(1, F.FRAME_DIM)).astype(np.float32) for _ in labels]

    with open(args.out, "w", encoding="utf-8") as out:
        for s in range(args.signers):
            signer_bias = rng.normal(scale=0.2, size=(1, F.FRAME_DIM)).astype(np.float32)
            for k, label in enumerate(labels):
                for _ in range(args.per_signer):
                    window = t * patterns[k] + signer_bias + rng.normal(scale=0.3, size=(F.WINDOW_FRAMES, F.FRAME_DIM))
                    window[:, 0] = 1.0  # dominant hand present
                    out.write(json.dumps({
                        "label": label, "signerId": f"SYN{s:02d}", "featureVersion": F.FEATURE_VERSION,
                        "sourceFrames": F.WINDOW_FRAMES, "vector": window.astype(np.float32).ravel().round(4).tolist(),
                    }) + "\n")
    print(f"wrote {args.out}: {len(labels)} classes x {args.signers} signers x {args.per_signer}")


if __name__ == "__main__":
    main()
