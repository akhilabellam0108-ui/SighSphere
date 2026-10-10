"""
Live progress for long workflow steps: keeps one GitHub check run ("INCLUDE progress") up to
date, so progress is visible on the commit/PR while the job is still running. Does nothing
outside GitHub Actions or without a token.
"""

from __future__ import annotations

import json
import os
import threading
import time
import urllib.request

_lock = threading.Lock()
_lines: list[str] = []
_check_id: int | None = None
_last = 0.0


def _api(method: str, path: str, body: dict) -> dict | None:
    token, repo = os.environ.get("GITHUB_TOKEN"), os.environ.get("GITHUB_REPOSITORY")
    if not token or not repo:
        return None
    req = urllib.request.Request(f"https://api.github.com/repos/{repo}{path}", data=json.dumps(body).encode(), method=method,
                                 headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.load(r)
    except Exception as e:  # noqa: BLE001 — progress is best effort
        print(f"(progress update failed: {e})", flush=True)
        return None


def report(line: str, force: bool = False) -> None:
    """Adds a line; pushes to GitHub at most every 20 s (or now if force)."""
    global _check_id, _last
    print(line, flush=True)
    with _lock:
        _lines.append(f"{time.strftime('%H:%M:%S')}  {line}")
        if not force and time.time() - _last < 20:
            return
        _last = time.time()
        output = {"title": line[:200], "summary": "```\n" + "\n".join(_lines[-60:]) + "\n```"}
        if _check_id is None:
            r = _api("POST", "/check-runs", {"name": "INCLUDE progress", "head_sha": os.environ.get("GITHUB_SHA", ""), "status": "in_progress", "output": output})
            _check_id = r and r.get("id")
        else:
            _api("PATCH", f"/check-runs/{_check_id}", {"output": output})


def finish(line: str, ok: bool = True) -> None:
    report(line, force=True)
    if _check_id:
        _api("PATCH", f"/check-runs/{_check_id}", {"status": "completed", "conclusion": "success" if ok else "failure"})
