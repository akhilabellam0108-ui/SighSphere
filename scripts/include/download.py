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
import urllib.request
import zipfile
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

    found = 0
    for f in chosen:
        zpath = Path(args.work) / f["key"]
        print(f"→ {f['key']}", flush=True)
        subprocess.run(["curl", "-fL", "--retry", "5", "--retry-delay", "10", "-sS", "-o", str(zpath), f["url"]], check=True)
        with zipfile.ZipFile(zpath) as z:
            for info in z.infolist():
                if info.is_dir():
                    continue
                parts = info.filename.replace("\\", "/").split("/")
                if len(parts) < 2:
                    continue
                folder = parts[-2]
                sign = wanted_folders.get(norm(folder))
                # The folder name alone is ambiguous across categories ("7. Deaf" vs another "7. ..."), so check both.
                if not sign or norm(parts[-3] if len(parts) >= 3 else sign["category"]) != norm(sign["category"]):
                    continue
                dest = out / sign["category"] / sign["folder"] / parts[-1]
                dest.parent.mkdir(parents=True, exist_ok=True)
                with z.open(info) as src, open(dest, "wb") as dst:
                    dst.write(src.read())
                found += 1
        os.remove(zpath)
        print(f"   videos so far: {found}", flush=True)
    print(f"done: {found} videos for {len(wanted_dirs)} signs in {out}")
    if found == 0:
        sys.exit("No videos extracted.")


if __name__ == "__main__":
    main()
