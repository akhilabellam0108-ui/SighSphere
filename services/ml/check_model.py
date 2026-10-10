"""
Checks an exported model is one the app can load: the right input shape, logits for
every label, and a labels file matching this build's feature layout.

    python check_model.py ../../models/sign-cnn-v1.onnx
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort

import features as F


def main(path: str) -> None:
    model = Path(path)
    labels_file = model.parent / (model.name[: -len(".onnx")] + ".labels.json")
    info = json.loads(labels_file.read_text())
    assert info["featureVersion"] == F.FEATURE_VERSION, "feature version mismatch"
    assert info["windowFrames"] == F.WINDOW_FRAMES and info["frameDim"] == F.FRAME_DIM, "window shape mismatch"
    session = ort.InferenceSession(str(model), providers=["CPUExecutionProvider"])
    inp = session.get_inputs()[0]
    assert inp.name == "input", f"input is called {inp.name!r}, the app expects 'input'"
    x = np.zeros((2, F.WINDOW_FRAMES, F.FRAME_DIM), dtype=np.float32)
    (logits,) = session.run(None, {"input": x})
    assert logits.shape == (2, len(info["labels"])), f"logits shape {logits.shape}"
    print(f"ok: {model.name} — {len(info['labels'])} signs, batch works, {model.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main(sys.argv[1])
