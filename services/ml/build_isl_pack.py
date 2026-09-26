"""
Build an ISL sign pack for the app from the INCLUDE dataset.

    INCLUDE: A Large Scale Dataset for Indian Sign Language Recognition
    Sridhar, Ganesan, Kumar P., Khapra — ACM Multimedia 2020
    https://zenodo.org/records/4010759   License: CC-BY-4.0

The app can only recognise signs it has examples of. This script turns INCLUDE videos into a
pack of example windows that the app installs into its local sample store (Record signs →
"Built-in ISL signs"). After installing, those signs are recognised with no recording and
no network.

Pipeline, per video:
    MediaPipe Tasks HandLandmarker + PoseLandmarker (the SAME models and VIDEO running mode
    the browser uses) → same dominant-hand canonicalisation as landmarks.ts →
    features.encode_frame (parity-tested against features.ts) → trim frames with no hands →
    features.resample_window → one 32 × 213 window.
Per sign, windows are L2-normalised and averaged in `--groups` groups, which is exactly what
the app's template classifier does with them, and keeps the pack small.

Run in Google Colab (Python 3.11), not locally:

    !pip install -q mediapipe==0.10.20 opencv-python-headless numpy
    !git clone https://github.com/akhilabellam0108-ui/SighSphere.git
    %cd SighSphere/services/ml
    # SOS pack (HOSPITAL, DOCTOR, POLICE, MEDICINE, SICK, DEAF). Downloads only the INCLUDE
    # parts it needs, extracts only the needed folders, deletes each zip after use.
    !python build_isl_pack.py --preset sos --download --work /content/include
    # → writes ../../apps/web/public/datasets/isl-include-sos.json

    # Or the larger everyday pack (28 signs):
    !python build_isl_pack.py --preset everyday --download --work /content/include

Then commit the JSON file(s) in apps/web/public/datasets/ and redeploy.

Honest limits: INCLUDE was recorded by a small number of signers at one school, filmed at a
distance, so recognition of these signs for a new person on a laptop webcam will be weaker
than for signs you record yourself. Report what you measure; do not quote INCLUDE's paper
accuracy as the app's accuracy.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

import numpy as np

import features as F

ZENODO = 'https://zenodo.org/records/4010759/files/{name}?download=1'
HAND_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
POSE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

# INCLUDE category → number of zip parts on Zenodo.
PARTS = {
    'Adjectives': 8, 'Animals': 2, 'Clothes': 2, 'Colours': 2, 'Days_and_Time': 3,
    'Electronics': 2, 'Greetings': 2, 'Home': 4, 'Jobs': 2, 'Means_of_Transportation': 2,
    'People': 5, 'Places': 4, 'Pronouns': 2, 'Seasons': 1, 'Society': 3,
}

# App gloss → (INCLUDE category, INCLUDE folder word). Glosses match packages/gloss lexicon.
SIGNS = {
    # SOS
    'HOSPITAL': ('Places', 'Hospital'),
    'DOCTOR': ('Jobs', 'Doctor'),
    'POLICE': ('Jobs', 'Police'),
    'MEDICINE': ('Society', 'Medicine'),
    'SICK': ('Adjectives', 'sick'),
    'DEAF': ('Adjectives', 'Deaf'),
    # everyday
    'HELLO': ('Greetings', 'Hello'),
    'THANK-YOU': ('Greetings', 'Thank you'),
    'GOOD': ('Adjectives', 'good'),
    'BAD': ('Adjectives', 'bad'),
    'HAPPY': ('Adjectives', 'happy'),
    'SAD': ('Adjectives', 'sad'),
    'MOTHER': ('People', 'Mother'),
    'FATHER': ('People', 'Father'),
    'BROTHER': ('People', 'Brother'),
    'SISTER': ('People', 'Sister'),
    'FAMILY': ('People', 'Family'),
    'FRIEND': ('People', 'Friend'),
    'I': ('Pronouns', 'I'),
    'YOU': ('Pronouns', 'you'),
    'WE': ('Pronouns', 'we'),
    'TEACHER': ('Jobs', 'Teacher'),
    'SCHOOL': ('Places', 'School'),
    'HOME': ('Places', 'House'),
    'TODAY': ('Days_and_Time', 'Today'),
    'TOMORROW': ('Days_and_Time', 'Tomorrow'),
    'YESTERDAY': ('Days_and_Time', 'Yesterday'),
    'TIME': ('Days_and_Time', 'Time'),
}

PRESETS = {
    'sos': ['HOSPITAL', 'DOCTOR', 'POLICE', 'MEDICINE', 'SICK', 'DEAF'],
    'everyday': list(SIGNS.keys()),
}

PACK_META = {
    'sos': ('isl-include-sos', 'ISL emergency signs (INCLUDE)', 'Hospital, doctor, police, medicine, sick and deaf — the emergency signs available in INCLUDE.'),
    'everyday': ('isl-include-everyday', 'ISL everyday signs (INCLUDE)', 'Emergency signs plus greetings, family, pronouns, feelings, school and time.'),
}

VIDEO_EXT = ('.mov', '.mp4', '.avi', '.mkv')


def folder_word(folder_name: str) -> str:
    """'30. Hospital' → 'hospital'."""
    return re.sub(r'^\s*\d+\.\s*', '', folder_name).strip().lower()


def find_videos(root: Path, category: str, word: str) -> list[Path]:
    base = root / category
    if not base.is_dir():
        return []
    for child in base.iterdir():
        if child.is_dir() and folder_word(child.name) == word.lower():
            return sorted(p for p in child.iterdir() if p.suffix.lower() in VIDEO_EXT)
    return []


def download(url: str, dest: Path) -> None:
    print(f'  downloading {url.split("/files/")[-1].split("?")[0]} …', flush=True)
    with urllib.request.urlopen(url) as response, open(dest, 'wb') as out:
        shutil.copyfileobj(response, out, length=1 << 20)


def fetch_needed(work: Path, glosses: list[str]) -> Path:
    """Download INCLUDE parts until every requested sign's folder has been extracted."""
    root = work / 'INCLUDE'
    root.mkdir(parents=True, exist_ok=True)
    by_category: dict[str, list[str]] = {}
    for gloss in glosses:
        category, word = SIGNS[gloss]
        by_category.setdefault(category, []).append(word)

    for category, words in by_category.items():
        missing = [w for w in words if not find_videos(root, category, w)]
        for part in range(1, PARTS[category] + 1):
            if not missing:
                break
            name = f'{category}_{part}of{PARTS[category]}.zip'
            zip_path = work / name
            if not zip_path.exists():
                download(ZENODO.format(name=name), zip_path)
            with zipfile.ZipFile(zip_path) as archive:
                for member in archive.namelist():
                    parts = member.replace('\\', '/').split('/')
                    # Accept both "Category/NN. Word/file" and "NN. Word/file" layouts.
                    folder = parts[-2] if len(parts) >= 2 else ''
                    if folder_word(folder) in [m.lower() for m in missing] and member.lower().endswith(VIDEO_EXT):
                        target = root / category / folder / parts[-1]
                        target.parent.mkdir(parents=True, exist_ok=True)
                        with archive.open(member) as src, open(target, 'wb') as dst:
                            shutil.copyfileobj(src, dst)
            zip_path.unlink()  # INCLUDE parts are ~1.3 GB each; keep disk use bounded.
            missing = [w for w in missing if not find_videos(root, category, w)]
            print(f'  {name}: still missing {missing or "nothing"}', flush=True)
        if missing:
            print(f'WARNING: not found in {category}: {missing}', file=sys.stderr)
    return root


class Tracker:
    """Python twin of apps/web/src/lib/landmarks.ts (same models, VIDEO mode, 2 hands)."""

    def __init__(self, work: Path, dominant_hand: str = 'right', mirrored: bool = True):
        import mediapipe as mp
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision

        hand_path = work / 'hand_landmarker.task'
        pose_path = work / 'pose_landmarker_lite.task'
        if not hand_path.exists():
            urllib.request.urlretrieve(HAND_MODEL_URL, hand_path)
        if not pose_path.exists():
            urllib.request.urlretrieve(POSE_MODEL_URL, pose_path)

        self.mp = mp
        self.vision = vision
        self.hand = vision.HandLandmarker.create_from_options(
            vision.HandLandmarkerOptions(
                base_options=mp_python.BaseOptions(model_asset_path=str(hand_path)),
                running_mode=vision.RunningMode.VIDEO,
                num_hands=2,
                min_hand_detection_confidence=0.5,
                min_tracking_confidence=0.5,
            )
        )
        self.pose = vision.PoseLandmarker.create_from_options(
            vision.PoseLandmarkerOptions(
                base_options=mp_python.BaseOptions(model_asset_path=str(pose_path)),
                running_mode=vision.RunningMode.VIDEO,
                num_poses=1,
            )
        )
        self.dominant_hand = dominant_hand
        self.mirrored = mirrored

    def frame(self, rgb: np.ndarray, timestamp_ms: int):
        image = self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=rgb)
        hands = self.hand.detect_for_video(image, timestamp_ms)
        pose = self.pose.detect_for_video(image, timestamp_ms)

        dominant = non_dominant = None
        for points, handedness in zip(hands.hand_landmarks, hands.handedness):
            label = handedness[0].category_name if handedness else 'Unknown'
            is_users_right = (label == 'Left') if self.mirrored else (label == 'Right')
            is_dominant = is_users_right if self.dominant_hand == 'right' else not is_users_right
            pts = [(p.x, p.y, p.z) for p in points]
            if is_dominant and dominant is None:
                dominant = pts
            elif non_dominant is None:
                non_dominant = pts
        pose_pts = [(p.x, p.y, p.z) for p in pose.pose_landmarks[0]] if pose.pose_landmarks else None
        return dominant, non_dominant, pose_pts


def video_window(tracker: Tracker, path: Path, clock: list[int], max_side: int = 640) -> tuple[np.ndarray, int] | None:
    import cv2

    cap = cv2.VideoCapture(str(path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    encoded: list[np.ndarray] = []
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        h, w = frame.shape[:2]
        scale = max_side / max(h, w)
        if scale < 1:
            frame = cv2.resize(frame, (int(w * scale), int(h * scale)))
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        clock[0] += int(1000 / fps)  # strictly increasing across all videos
        dominant, non_dominant, pose = tracker.frame(rgb, clock[0])
        encoded.append(F.encode_frame(dominant, non_dominant, pose))
    cap.release()
    if not encoded:
        return None

    # Trim the rest pose before and after signing, like the in-app recorder's capture window.
    stack = np.stack(encoded)
    present = np.where(
        (stack[:, F.OFFSET_DOMINANT_PRESENT] > 0) | (stack[:, F.OFFSET_NON_DOMINANT_PRESENT] > 0)
    )[0]
    if len(present) < 6:
        return None
    start = max(0, int(present[0]) - 2)
    end = min(len(stack), int(present[-1]) + 3)
    trimmed = stack[start:end]
    return F.resample_window(trimmed), len(trimmed)


def l2(v: np.ndarray) -> np.ndarray:
    n = float(np.linalg.norm(v))
    return v / n if n > 0 else v


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--preset', choices=sorted(PRESETS), default='sos')
    parser.add_argument('--signs', nargs='*', help='Explicit glosses instead of a preset.')
    parser.add_argument('--include-dir', type=Path, help='Existing extracted INCLUDE root (Category/NN. Word/*.MOV).')
    parser.add_argument('--download', action='store_true', help='Download only the needed INCLUDE parts from Zenodo.')
    parser.add_argument('--work', type=Path, default=Path('/content/include'))
    parser.add_argument('--groups', type=int, default=5, help='Averaged example windows kept per sign.')
    parser.add_argument('--dominant-hand', choices=['right', 'left'], default='right')
    parser.add_argument('--out', type=Path, help='Output JSON (default: apps/web/public/datasets/<pack id>.json).')
    args = parser.parse_args()

    glosses = [g.upper() for g in (args.signs or PRESETS[args.preset])]
    unknown = [g for g in glosses if g not in SIGNS]
    if unknown:
        parser.error(f'Not in INCLUDE mapping: {unknown}. Known: {sorted(SIGNS)}')

    args.work.mkdir(parents=True, exist_ok=True)
    if args.download:
        root = fetch_needed(args.work, glosses)
    elif args.include_dir:
        root = args.include_dir
    else:
        parser.error('Pass --download or --include-dir.')

    tracker = Tracker(args.work, dominant_hand=args.dominant_hand)
    clock = [0]
    samples = []
    signs_meta = {}
    rng = np.random.default_rng(7)

    for gloss in glosses:
        category, word = SIGNS[gloss]
        videos = find_videos(root, category, word)
        windows, frame_counts = [], []
        for video in videos:
            result = video_window(tracker, video, clock)
            if result is None:
                print(f'  skip {video.name}: hands not tracked', flush=True)
                continue
            window, n = result
            windows.append(l2(window.reshape(-1).astype(np.float64)))
            frame_counts.append(n)
        print(f'{gloss}: {len(windows)}/{len(videos)} videos usable', flush=True)
        if not windows:
            continue

        order = rng.permutation(len(windows))
        groups = [order[i :: args.groups] for i in range(min(args.groups, len(windows)))]
        for group in groups:
            mean = l2(np.mean([windows[i] for i in group], axis=0))
            samples.append(
                {
                    'label': gloss,
                    'sourceFrames': int(np.mean([frame_counts[i] for i in group])),
                    'videos': int(len(group)),
                    'vector': [round(float(x), 4) for x in mean.astype(np.float32)],
                }
            )
        signs_meta[gloss] = {'include': f'{category}/{word}', 'videos': len(windows)}

    pack_id, name, description = PACK_META['everyday' if args.signs else args.preset]
    if args.signs:
        pack_id, name, description = 'isl-include-custom', 'ISL signs (INCLUDE)', f'{len(signs_meta)} signs from INCLUDE.'

    pack = {
        'format': 'signsphere-sign-pack',
        'formatVersion': 1,
        'id': pack_id,
        'name': name,
        'description': description,
        'language': 'isl',
        'featureVersion': F.FEATURE_VERSION,
        'windowFrames': F.WINDOW_FRAMES,
        'frameDim': F.FRAME_DIM,
        'source': 'INCLUDE: A Large Scale Dataset for Indian Sign Language Recognition (Sridhar et al., ACM MM 2020)',
        'sourceUrl': 'https://zenodo.org/records/4010759',
        'license': 'CC-BY-4.0',
        'attribution': 'Sign examples derived from the INCLUDE dataset by AI4Bharat (Sridhar, Ganesan, Kumar P., Khapra), CC BY 4.0. Landmarks extracted and averaged by SignSphere.',
        'signs': signs_meta,
        'samples': samples,
    }

    out = args.out or (Path(__file__).resolve().parents[2] / 'apps' / 'web' / 'public' / 'datasets' / f'{pack_id}.json')
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(pack, separators=(',', ':')))
    print(f'\nWrote {out} — {len(signs_meta)} signs, {len(samples)} example windows, {os.path.getsize(out) / 1e6:.1f} MB')


if __name__ == '__main__':
    main()
