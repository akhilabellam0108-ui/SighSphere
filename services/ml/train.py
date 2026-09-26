"""
Train the sign classifier and export it for the browser.

Model ladder (PLAN.md 5.2) -- climb only when the rung below plateaus:
    linear  Rung 0: logistic regression on the flattened window. THE BASELINE YOU MUST BEAT.
    cnn     Rung 1: 1D-CNN over time. Ship this in the MVP.
    gru     Rung 2: BiGRU. Better on signs with slow or held movement.

Usage (Colab or any Python 3.11 env):
    python train.py --data samples.jsonl --model cnn --epochs 60 --out ../../models
    python train.py --data samples.jsonl --model linear      # always run this first

Reports leave-signers-out accuracy. That is the only number worth quoting.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

import numpy as np

import dataset as D
import features as F

try:
    import torch
    import torch.nn as nn
except ImportError:  # pragma: no cover
    raise SystemExit(
        "PyTorch is required.\n"
        "  Colab:  already installed\n"
        "  Local:  pip install torch --index-url https://download.pytorch.org/whl/cpu\n"
        "Note: local Python 3.14 may not have torch wheels yet -- use Colab (see README)."
    )


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class LinearBaseline(nn.Module):
    """Rung 0. If a fancier model cannot beat this, the bug is in the data, not the model."""

    def __init__(self, n_classes: int):
        super().__init__()
        self.net = nn.Linear(F.WINDOW_FRAMES * F.FRAME_DIM, n_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x.flatten(1))


class Conv1dClassifier(nn.Module):
    """Rung 1. Small, fast, exports cleanly to ONNX. ~150k params."""

    def __init__(self, n_classes: int, channels: int = 96, dropout: float = 0.3):
        super().__init__()
        self.body = nn.Sequential(
            nn.Conv1d(F.FRAME_DIM, channels, kernel_size=5, padding=2),
            nn.BatchNorm1d(channels),
            nn.ReLU(),
            nn.MaxPool1d(2),
            nn.Conv1d(channels, channels, kernel_size=3, padding=1),
            nn.BatchNorm1d(channels),
            nn.ReLU(),
            nn.MaxPool1d(2),
            nn.Conv1d(channels, channels, kernel_size=3, padding=1),
            nn.BatchNorm1d(channels),
            nn.ReLU(),
            nn.AdaptiveAvgPool1d(1),
        )
        self.head = nn.Sequential(nn.Dropout(dropout), nn.Linear(channels, n_classes))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # (batch, time, features) -> Conv1d wants (batch, features, time)
        return self.head(self.body(x.transpose(1, 2)).squeeze(-1))


class GruClassifier(nn.Module):
    """Rung 2. Better on signs with slow or held movement. ~400k params."""

    def __init__(self, n_classes: int, hidden: int = 128, dropout: float = 0.3):
        super().__init__()
        self.gru = nn.GRU(
            F.FRAME_DIM, hidden, num_layers=2, batch_first=True, bidirectional=True, dropout=dropout
        )
        self.head = nn.Sequential(nn.Dropout(dropout), nn.Linear(hidden * 2, n_classes))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        output, _ = self.gru(x)
        return self.head(output.mean(dim=1))


MODELS = {"linear": LinearBaseline, "cnn": Conv1dClassifier, "gru": GruClassifier}


# ---------------------------------------------------------------------------
# Train / evaluate
# ---------------------------------------------------------------------------


def evaluate(model: nn.Module, x: np.ndarray, y: np.ndarray, device: str) -> dict:
    if len(y) == 0:
        return {"top1": float("nan"), "top3": float("nan"), "per_class": {}, "confusions": []}

    model.eval()
    with torch.no_grad():
        logits = model(torch.from_numpy(x).to(device)).cpu().numpy()

    order = np.argsort(-logits, axis=1)
    top1 = float((order[:, 0] == y).mean())
    k = min(3, logits.shape[1])
    top3 = float(np.mean([y[i] in order[i, :k] for i in range(len(y))]))

    per_class: dict[int, float] = {}
    for cls in np.unique(y):
        mask = y == cls
        per_class[int(cls)] = float((order[mask, 0] == cls).mean())

    # Most frequent confusions -- design lessons around these pairs.
    confusions = Counter(
        (int(y[i]), int(order[i, 0])) for i in range(len(y)) if order[i, 0] != y[i]
    )
    return {
        "top1": top1,
        "top3": top3,
        "per_class": per_class,
        "confusions": confusions.most_common(10),
    }


def train(
    model: nn.Module,
    x_train: np.ndarray,
    y_train: np.ndarray,
    x_val: np.ndarray,
    y_val: np.ndarray,
    epochs: int,
    batch_size: int,
    lr: float,
    device: str,
) -> nn.Module:
    optimiser = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimiser, T_max=epochs)
    # Label smoothing: with few examples per class, hard targets overfit fast.
    loss_fn = nn.CrossEntropyLoss(label_smoothing=0.05)

    xt = torch.from_numpy(x_train)
    yt = torch.from_numpy(y_train)
    best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
    best_val = -1.0

    for epoch in range(1, epochs + 1):
        model.train()
        permutation = torch.randperm(len(yt))
        total = 0.0

        for start in range(0, len(yt), batch_size):
            index = permutation[start : start + batch_size]
            xb = xt[index].to(device)
            yb = yt[index].to(device)
            optimiser.zero_grad()
            loss = loss_fn(model(xb), yb)
            loss.backward()
            optimiser.step()
            total += float(loss) * len(index)

        scheduler.step()

        if epoch % 5 == 0 or epoch == epochs:
            val = evaluate(model, x_val, y_val, device)
            val_top1 = val["top1"]
            status = "(no val set)" if np.isnan(val_top1) else f"val top-1 {val_top1:.3f}"
            print(f"  epoch {epoch:3d}  loss {total / len(yt):.4f}  {status}")
            # Select on validation signers, never on test.
            if not np.isnan(val_top1) and val_top1 > best_val:
                best_val = val_top1
                best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}

    if best_val >= 0:
        model.load_state_dict(best_state)
    return model


def export_onnx(model: nn.Module, labels: list[str], out_dir: Path, name: str) -> None:
    """Export for onnxruntime-web. Load in the app via VITE_MODEL_URL."""
    out_dir.mkdir(parents=True, exist_ok=True)
    model.eval().cpu()
    dummy = torch.zeros(1, F.WINDOW_FRAMES, F.FRAME_DIM)
    path = out_dir / f"{name}.onnx"

    torch.onnx.export(
        model,
        dummy,
        str(path),
        input_names=["input"],
        output_names=["logits"],
        dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=17,
    )

    (out_dir / f"{name}.labels.json").write_text(
        json.dumps(
            {
                "featureVersion": F.FEATURE_VERSION,
                "windowFrames": F.WINDOW_FRAMES,
                "frameDim": F.FRAME_DIM,
                "labels": labels,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    size_kb = path.stat().st_size / 1024
    print(f"  exported {path.name} ({size_kb:.0f} KB) + {name}.labels.json")
    if size_kb > 5120:
        print("  WARNING: over 5 MB. That is a slow first load on 3G -- consider quantising.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", required=True, help="JSONL exported from the Record screen")
    parser.add_argument("--model", choices=list(MODELS), default="cnn")
    parser.add_argument("--epochs", type=int, default=60)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=2e-3)
    parser.add_argument("--augment", type=int, default=4, help="training-set multiplier")
    parser.add_argument("--test-signers", type=int, default=4)
    parser.add_argument("--val-signers", type=int, default=2)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--out", default="../../models")
    args = parser.parse_args()

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"device: {device}\n{F.layout_summary()}\n")

    print("loading data")
    samples = D.load_jsonl(args.data)
    data = D.build_dataset(samples)
    print(data.summary())

    print("\nsplitting by signer (never randomly)")
    train_mask, val_mask, test_mask = D.leave_signers_out(
        data, n_test_signers=args.test_signers, n_val_signers=args.val_signers, seed=args.seed
    )

    x_train, y_train = data.x[train_mask], data.y[train_mask]
    x_val, y_val = data.x[val_mask], data.y[val_mask]
    x_test, y_test = data.x[test_mask], data.y[test_mask]

    if args.augment > 1:
        before = len(y_train)
        x_train, y_train = D.augment_batch(x_train, y_train, args.augment, args.seed)
        print(f"  augmented train {before} -> {len(y_train)}")

    print(f"\ntraining {args.model}")
    model = MODELS[args.model](len(data.labels)).to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"  {n_params:,} parameters")
    model = train(
        model, x_train, y_train, x_val, y_val, args.epochs, args.batch_size, args.lr, device
    )

    print("\nHELD-OUT SIGNER RESULTS (the only number worth quoting)")
    metrics = evaluate(model, x_test, y_test, device)
    print(f"  top-1: {metrics['top1']:.3f}")
    print(f"  top-3: {metrics['top3']:.3f}")

    per_class = metrics["per_class"]
    if per_class:
        worst = sorted(per_class.items(), key=lambda kv: kv[1])[:8]
        print("  worst classes:")
        for cls, accuracy in worst:
            print(f"    {data.labels[cls]:<16} {accuracy:.2f}")
    if metrics["confusions"]:
        print("  most common confusions (true -> predicted):")
        for (true_cls, pred_cls), count in metrics["confusions"]:
            print(f"    {data.labels[true_cls]:<16} -> {data.labels[pred_cls]:<16} x{count}")

    out_dir = Path(args.out)
    export_onnx(model, data.labels, out_dir, f"sign-{args.model}-v{F.FEATURE_VERSION}")

    (out_dir / f"sign-{args.model}-v{F.FEATURE_VERSION}.metrics.json").write_text(
        json.dumps(
            {
                "model": args.model,
                "parameters": n_params,
                "featureVersion": F.FEATURE_VERSION,
                "classes": len(data.labels),
                "labels": data.labels,
                "signers": sorted(set(data.signers.tolist())),
                "test_signers": sorted(set(data.signers[test_mask].tolist())),
                "split": "leave-signers-out",
                "top1": metrics["top1"],
                "top3": metrics["top3"],
                "per_class": {data.labels[int(k)]: v for k, v in per_class.items()},
                "args": vars(args),
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    print(
        f"\nNext: set VITE_MODEL_URL to the exported .onnx, then implement OnnxClassifier "
        f"(apps/web/src/lib/classifier.ts). Put the top-1 number in the report as-is, "
        f"including if it is disappointing."
    )


if __name__ == "__main__":
    main()
