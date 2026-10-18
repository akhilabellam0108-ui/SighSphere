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
import threading
import time
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from remote_zip import HttpRangeFile, RangeNotSupported  # noqa: E402
from progress import finish, report  # noqa: E402

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
    have = sum(1 for p in out.rglob("*") if p.is_file() and not p.name.endswith(".part"))
    if have:
        print(f"{have} videos already here from an earlier run — only the missing ones will be downloaded")
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
    report(f"Zenodo has {len(files)} files; reading {len(chosen)}: {', '.join(f['key'] for f in chosen)}", force=True)

    def wanted(name: str) -> dict | None:
        parts = name.replace("\\", "/").split("/")
        if len(parts) < 2 or name.endswith("/"):
            return None
        sign = wanted_folders.get(norm(parts[-2]))
        # The folder name alone is ambiguous across categories, so check the category too.
        if not sign or norm(parts[-3] if len(parts) >= 3 else sign["category"]) != norm(sign["category"]):
            return None
        return sign

    def dest_for(sign: dict, name: str) -> Path:
        return out / sign["category"] / sign["folder"] / name.replace("\\", "/").split("/")[-1]

    def copy_member(z: zipfile.ZipFile, info: zipfile.ZipInfo, sign: dict) -> int:
        dest = dest_for(sign, info.filename)
        if dest.exists() and dest.stat().st_size == info.file_size:
            return 1  # already downloaded on an earlier run
        dest.parent.mkdir(parents=True, exist_ok=True)
        part = dest.with_name(dest.name + ".part")
        with z.open(info) as src, open(part, "wb") as dst:
            while chunk := src.read(1 << 20):
                dst.write(chunk)
        part.replace(dest)  # only complete files count, so a stopped run resumes cleanly
        report(f"  {sign['gloss']}: {dest.name} ({info.file_size / 1e6:.1f} MB)")
        return 1

    # Each thread keeps its own open copy of each remote zip (zipfile objects are not thread-safe).
    local = threading.local()

    def zip_for(f: dict) -> zipfile.ZipFile:
        zips = getattr(local, "zips", None)
        if zips is None:
            zips = local.zips = {}
        if f["key"] not in zips:
            zips[f["key"]] = zipfile.ZipFile(HttpRangeFile(f["url"]))
        return zips[f["key"]]

    def list_members(f: dict) -> list[tuple[dict, zipfile.ZipInfo, dict]]:
        """Reads only the zip's table of contents; returns the wanted videos still missing."""
        z = zipfile.ZipFile(HttpRangeFile(f["url"]))
        jobs = []
        for info in z.infolist():
            sign = wanted(info.filename)
            if sign:
                jobs.append((f, info, sign))
        report(f"{f['key']}: {len(jobs)} wanted videos", force=True)
        return jobs

    def fetch(job: tuple[dict, zipfile.ZipInfo, dict]) -> int:
        f, info, sign = job
        dest = dest_for(sign, info.filename)
        if dest.exists() and dest.stat().st_size == info.file_size:
            return 1
        return copy_member(zip_for(f), info, sign)

    def full_download(f: dict) -> int:
        t = time.time()
        report(f"{f['key']}: server doesn't allow partial downloads — fetching the whole file ({f['size'] / 1e9:.1f} GB)", force=True)
        zpath = Path(args.work) / f["key"]
        subprocess.run(["curl", "-fL", "--retry", "8", "--retry-delay", "15", "--retry-all-errors", "-C", "-",
                        "--speed-limit", "50000", "--speed-time", "90", "-sS", "-o", str(zpath), f["url"]], check=True)
        n = 0
        with zipfile.ZipFile(zpath) as z:
            for info in z.infolist():
                sign = wanted(info.filename)
                if sign:
                    n += copy_member(z, info, sign)
        os.remove(zpath)
        report(f"{f['key']}: {n} videos (full download) in {time.time() - t:.0f} s", force=True)
        return n

    # 1) Tables of contents (small). 2) Videos, many at once: Zenodo limits each connection
    #    (~0.2 MB/s), so parallel requests are what make this finish in time.
    jobs: list = []
    whole: list[dict] = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        for f, result in zip(chosen, pool.map(lambda f: _try(list_members, f), chosen)):
            if result is None:
                whole.append(f)
            else:
                jobs.extend(result)
    jobs.sort(key=lambda j: (j[2]["gloss"], j[1].filename))
    todo = [j for j in jobs if not (dest_for(j[2], j[1].filename).exists() and dest_for(j[2], j[1].filename).stat().st_size == j[1].file_size)]
    report(f"{len(jobs)} videos wanted, {len(jobs) - len(todo)} already here, downloading {len(todo)}", force=True)
    with ThreadPoolExecutor(max_workers=int(os.environ.get("INCLUDE_PARALLEL", "16"))) as pool:
        found = (len(jobs) - len(todo)) + sum(pool.map(fetch, todo))
    for f in whole:
        found += full_download(f)
    finish(f"download done: {found} videos for {len(wanted_dirs)} signs")
    if found == 0:
        sys.exit("No videos extracted.")


def _try(fn, f):
    try:
        return fn(f)
    except RangeNotSupported:
        return None


if __name__ == "__main__":
    main()
