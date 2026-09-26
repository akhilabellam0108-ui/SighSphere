"""
Dataset loading, splitting, and augmentation.

THE ONE RULE: split by signer, never randomly.

A random split puts the same person's takes in both train and test. The model then memorises
that person's idiosyncrasies -- hand size, signing speed, sleeve, background -- and scores
30-40 points higher than it will on a new user. Every sign-recognition project that reports
implausible accuracy made this mistake. `random_split` does not exist in this file on purpose.
"""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

import numpy as np

import features as F


@dataclass
class Sample:
    label: str
    signer_id: str
    vector: np.ndarray  # (WINDOW_FRAMES, FRAME_DIM)
    feature_version: int
    source_frames: int
    device: str = ""
    lighting: str = ""
    dominant_hand: str = "right"


@dataclass
class Dataset:
    x: np.ndarray  # (n, WINDOW_FRAMES, FRAME_DIM) float32
    y: np.ndarray  # (n,) int64
    signers: np.ndarray  # (n,) str
    labels: list[str]  # index -> gloss

    def __len__(self) -> int:
        return len(self.y)

    def summary(self) -> str:
        per_class = Counter(self.labels[i] for i in self.y)
        thin = [gloss for gloss, n in per_class.items() if n < 20]
        lines = [
            f"{len(self)} samples, {len(self.labels)} classes, "
            f"{len(set(self.signers.tolist()))} signers",
            f"  min/median/max per class: "
            f"{min(per_class.values())}/{int(np.median(list(per_class.values())))}/{max(per_class.values())}",
        ]
        if thin:
            lines.append(f"  UNDER 20 EXAMPLES ({len(thin)}): {', '.join(sorted(thin)[:12])}")
        return "\n".join(lines)


def load_jsonl(path: str | Path, expect_version: int = F.FEATURE_VERSION) -> list[Sample]:
    """
    Load samples exported from the app's Record screen.

    Skips rows from a different FEATURE_VERSION rather than silently mixing incompatible
    feature layouts -- and says how many it skipped.
    """
    samples: list[Sample] = []
    skipped_version = 0
    skipped_shape = 0

    with Path(path).open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)

            if row.get("featureVersion") != expect_version:
                skipped_version += 1
                continue

            vector = np.asarray(row["vector"], dtype=np.float32)
            if vector.size != F.WINDOW_DIM:
                skipped_shape += 1
                continue

            samples.append(
                Sample(
                    label=row["label"],
                    signer_id=row.get("signerId", "unknown"),
                    vector=vector.reshape(F.WINDOW_FRAMES, F.FRAME_DIM),
                    feature_version=row["featureVersion"],
                    source_frames=row.get("sourceFrames", 0),
                    device=row.get("device", ""),
                    lighting=row.get("lighting", ""),
                    dominant_hand=row.get("dominantHand", "right"),
                )
            )

    if skipped_version or skipped_shape:
        print(
            f"  loaded {len(samples)}, skipped {skipped_version} (wrong feature version), "
            f"{skipped_shape} (wrong shape)"
        )
    return samples


def build_dataset(samples: list[Sample], min_per_class: int = 3) -> Dataset:
    """Drop classes with too few examples to be learnable, and say which."""
    counts = Counter(s.label for s in samples)
    kept = sorted(gloss for gloss, n in counts.items() if n >= min_per_class)
    dropped = sorted(gloss for gloss, n in counts.items() if n < min_per_class)
    if dropped:
        print(f"  dropped {len(dropped)} class(es) with <{min_per_class} examples: {', '.join(dropped)}")

    index = {gloss: i for i, gloss in enumerate(kept)}
    usable = [s for s in samples if s.label in index]
    if not usable:
        raise ValueError("No usable samples. Record more data before training.")

    return Dataset(
        x=np.stack([s.vector for s in usable]).astype(np.float32),
        y=np.asarray([index[s.label] for s in usable], dtype=np.int64),
        signers=np.asarray([s.signer_id for s in usable]),
        labels=kept,
    )


def leave_signers_out(
    dataset: Dataset, n_test_signers: int = 4, n_val_signers: int = 2, seed: int = 0
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Split by signer. Returns boolean masks (train, val, test).

    Signers are assigned by ascending sample count, so the *smallest* contributors are held
    out -- keeping the most training data while still testing on genuinely unseen people.
    Record the chosen signers in docs/data-inventory.md so results are reproducible.
    """
    per_signer: dict[str, int] = defaultdict(int)
    for signer in dataset.signers:
        per_signer[str(signer)] += 1

    ordered = sorted(per_signer.items(), key=lambda kv: (kv[1], kv[0]))
    signers = [name for name, _ in ordered]

    if len(signers) < n_test_signers + n_val_signers + 1:
        print(
            f"  WARNING: only {len(signers)} signer(s). Leave-signers-out is not meaningful "
            f"below ~6. Any accuracy number from this split is not trustworthy -- "
            f"record more people before quoting it."
        )
        n_test_signers = max(1, len(signers) // 4)
        n_val_signers = 1 if len(signers) > 2 else 0

    rng = np.random.default_rng(seed)
    test_signers = set(signers[:n_test_signers])
    remaining = [s for s in signers if s not in test_signers]
    val_signers = set(rng.permutation(remaining)[:n_val_signers].tolist()) if n_val_signers else set()

    signer_array = np.asarray([str(s) for s in dataset.signers])
    test_mask = np.isin(signer_array, list(test_signers))
    val_mask = np.isin(signer_array, list(val_signers))
    train_mask = ~(test_mask | val_mask)

    print(f"  train signers: {sorted(set(signer_array[train_mask].tolist()))}")
    print(f"  val   signers: {sorted(val_signers)}")
    print(f"  test  signers: {sorted(test_signers)}")
    print(f"  sizes: train={int(train_mask.sum())} val={int(val_mask.sum())} test={int(test_mask.sum())}")

    return train_mask, val_mask, test_mask


# ---------------------------------------------------------------------------
# Augmentation
# ---------------------------------------------------------------------------
# Cheap, and the highest-leverage thing you can do with a small corpus. Each transform
# simulates a real source of variation: different speeds, tracking dropout, camera distance,
# left-dominant signers.


def time_warp(window: np.ndarray, factor: float) -> np.ndarray:
    """Resample along time to simulate a faster or slower signer."""
    n = len(window)
    target_positions = np.clip(np.arange(n) * factor, 0, n - 1)
    indices = np.floor(target_positions + 0.5).astype(int)
    return window[indices]


def jitter(window: np.ndarray, sigma: float, rng: np.random.Generator) -> np.ndarray:
    """Per-landmark Gaussian noise, simulating tracker imprecision."""
    noise = rng.normal(0.0, sigma, size=window.shape).astype(np.float32)
    # Never perturb the presence flags -- they are categorical, not continuous.
    noise[:, F.OFFSET_DOMINANT_PRESENT] = 0
    noise[:, F.OFFSET_NON_DOMINANT_PRESENT] = 0
    return window + noise


def drop_frames(window: np.ndarray, rate: float, rng: np.random.Generator) -> np.ndarray:
    """Zero random frames, simulating tracking loss mid-sign."""
    out = window.copy()
    mask = rng.random(len(window)) < rate
    out[mask] = 0.0
    return out


def scale_jitter(window: np.ndarray, factor: float) -> np.ndarray:
    """Scale the hand blocks, simulating a different hand size or camera distance."""
    out = window.copy()
    out[:, F.OFFSET_DOMINANT_HAND : F.OFFSET_NON_DOMINANT_PRESENT] *= factor
    out[:, F.OFFSET_NON_DOMINANT_HAND : F.OFFSET_DOMINANT_ABS] *= factor
    return out


def swap_hands(window: np.ndarray) -> np.ndarray:
    """
    Swap dominant and non-dominant blocks: a left-dominant version of the same sign.

    Only valid for symmetric two-handed signs and one-handed signs. For asymmetric
    two-handed signs (dominant hand acts on a static non-dominant base) this produces an
    ill-formed sign. Gate it on the lexicon's twoHanded/symmetry metadata once you have it
    -- as written, it is applied indiscriminately, which is a known approximation.
    """
    out = window.copy()
    dom = window[:, F.OFFSET_DOMINANT_HAND : F.OFFSET_NON_DOMINANT_PRESENT].copy()
    non = window[:, F.OFFSET_NON_DOMINANT_HAND : F.OFFSET_DOMINANT_ABS].copy()
    out[:, F.OFFSET_DOMINANT_HAND : F.OFFSET_NON_DOMINANT_PRESENT] = non
    out[:, F.OFFSET_NON_DOMINANT_HAND : F.OFFSET_DOMINANT_ABS] = dom

    out[:, F.OFFSET_DOMINANT_PRESENT] = window[:, F.OFFSET_NON_DOMINANT_PRESENT]
    out[:, F.OFFSET_NON_DOMINANT_PRESENT] = window[:, F.OFFSET_DOMINANT_PRESENT]

    dom_abs = window[:, F.OFFSET_DOMINANT_ABS : F.OFFSET_DOMINANT_ABS + 3].copy()
    non_abs = window[:, F.OFFSET_NON_DOMINANT_ABS : F.OFFSET_NON_DOMINANT_ABS + 3].copy()
    out[:, F.OFFSET_DOMINANT_ABS : F.OFFSET_DOMINANT_ABS + 3] = non_abs
    out[:, F.OFFSET_NON_DOMINANT_ABS : F.OFFSET_NON_DOMINANT_ABS + 3] = dom_abs

    # The inter-hand vector points dominant <- non-dominant, so it flips sign.
    out[:, F.OFFSET_INTER_HAND_VECTOR : F.OFFSET_INTER_HAND_VECTOR + 3] *= -1
    return out


def augment_batch(
    x: np.ndarray, y: np.ndarray, multiplier: int = 4, seed: int = 0
) -> tuple[np.ndarray, np.ndarray]:
    """Expand the training set. Apply to TRAIN ONLY -- never to val or test."""
    rng = np.random.default_rng(seed)
    xs = [x]
    ys = [y]

    for _ in range(max(0, multiplier - 1)):
        out = np.empty_like(x)
        for i, window in enumerate(x):
            augmented = window
            if rng.random() < 0.7:
                augmented = time_warp(augmented, float(rng.uniform(0.8, 1.25)))
            if rng.random() < 0.8:
                augmented = jitter(augmented, float(rng.uniform(0.002, 0.02)), rng)
            if rng.random() < 0.3:
                augmented = drop_frames(augmented, float(rng.uniform(0.05, 0.2)), rng)
            if rng.random() < 0.5:
                augmented = scale_jitter(augmented, float(rng.uniform(0.85, 1.15)))
            if rng.random() < 0.25:
                augmented = swap_hands(augmented)
            out[i] = augmented
        xs.append(out)
        ys.append(y)

    return np.concatenate(xs).astype(np.float32), np.concatenate(ys)
