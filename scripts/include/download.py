"""
Downloads only the INCLUDE videos in a plan (scripts/include/plan.mjs) from Zenodo.

INCLUDE is split into large zip files per category. This asks Zenodo which files exist,
downloads the ones for the categories needed one at a time, extracts only the wanted
sign folders, and deletes each zip before the next — so it fits on a GitHub runner.

    python scripts/include/download.py --plan /tmp/plan.json --out /tmp/include-raw
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

RECORD = "4010759"


def zenodo_files() -> list[dict]:
    with urllib.request.urlopen(f"https://zenodo.org/api/records/{RECORD}", timeout=60) as r:
        data = json.load(r)
    files = data.get("files") or data.get("entries") or []
    out = []
    for f in files:
        key = f.get("key") or f.get("filename")
        links = f.get("links", {})
        url = links.get("content") or links.get("self") or links.get("download") or f"https://zenodo.org/records/{RECORD}/files/{key}?download=1"
        out.append({"key": key, "size": f.get("size") or f.get("filesize") or 0, "url": url})
    return out


def norm(s: str) -> str:
    return "".join(ch for ch in s.lower() if ch.isalnum())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--work", default="/tmp/include-zips")
    args = ap.parse_args()

    plan = json.loads(Path(args.plan).read_text())
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    have = sum(1 for _ in out.rglob("*") if _.is_file())
    if have:
        print(f"{have} videos already here (cached) — skipping the download")
        return
    Path(args.work).mkdir(parents=True, exist_ok=True)
    wanted_dirs = {f"{s['category']}/{s['folder']}/": s["gloss"] for s in plan["signs"]}
    wanted_folders = {norm(s["folder"]): s for s in plan["signs"]}

    files = zenodo_files()
    print(f"Zenodo record {RECORD}: {len(files)} files")
    for f in files:
        print(f"  {f['key']}  {f['size'] / 1e9:.2f} GB")
    cats = [norm(c) for c in plan["categories"]]
    chosen = [f for f in files if f["key"].lower().endswith(".zip") and any(norm(f["key"]).startswith(c) for c in cats)]
    if not chosen:
        sys.exit("No zip matched the needed categories — the file names above show what Zenodo has.")
    print(f"downloading {len(chosen)} file(s), {sum(f['size'] for f in chosen) / 1e9:.1f} GB in total")

    def fetch(f: dict) -> Path:
        zpath = Path(args.work) / f["key"]
        t = time.time()
        # Abort and retry a transfer that stalls (Zenodo sometimes does).
        subprocess.run(["curl", "-fL", "--retry", "8", "--retry-delay", "15", "--retry-all-errors",
                        "--speed-limit", "50000", "--speed-time", "90", "-sS", "-o", str(zpath), f["url"]], check=True)
        mb = zpath.stat().st_size / 1e6
        # A workflow "notice" shows up in the run's annotations while it is still going.
        print(f"::notice title=INCLUDE download::{f['key']} {mb:.0f} MB in {time.time() - t:.0f} s", flush=True)
        return zpath

    def extract(zpath: Path) -> int:
        n = 0
        with zipfile.ZipFile(zpath) as z:
            for info in z.infolist():
                if info.is_dir():
                    continue
                parts = info.filename.replace("\\", "/").split("/")
                if len(parts) < 2:
                    continue
                sign = wanted_folders.get(norm(parts[-2]))
                # The folder name alone is ambiguous across categories, so check the category too.
                if not sign or norm(parts[-3] if len(parts) >= 3 else sign["category"]) != norm(sign["category"]):
                    continue
                dest = out / sign["category"] / sign["folder"] / parts[-1]
                dest.parent.mkdir(parents=True, exist_ok=True)
                with z.open(info) as src, open(dest, "wb") as dst:
                    dst.write(src.read())
                n += 1
        os.remove(zpath)
        return n

    found = 0
    # Two downloads at a time; extract each as soon as it lands, then delete it.
    with ThreadPoolExecutor(max_workers=2) as pool:
        for zpath in pool.map(fetch, chosen):
            found += extract(zpath)
            print(f"::notice title=INCLUDE extract::{zpath.name}: {found} videos so far", flush=True)
    print(f"done: {found} videos for {len(wanted_dirs)} signs in {out}")
    if found == 0:
        sys.exit("No videos extracted.")


if __name__ == "__main__":
    main()
