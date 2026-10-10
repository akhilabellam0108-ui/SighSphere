"""
Read a zip file on a web server without downloading it: HTTP Range requests fetch only the
table of contents (at the end of the zip) and then only the members you ask for.

INCLUDE's zips are several GB each; the videos for a handful of signs are a few hundred MB.
"""

from __future__ import annotations

import io
import time
import urllib.request


class RangeNotSupported(Exception):
    pass


class HttpRangeFile(io.RawIOBase):
    """A read-only, seekable file over HTTP, with a small read-ahead buffer."""

    def __init__(self, url: str, block: int = 1 << 20, retries: int = 6):
        self.url, self.block, self.retries = url, block, retries
        self.pos = 0
        self.fetched = 0
        self._buf_start, self._buf = -1, b""
        head = self._request("bytes=0-0")
        rng = head.headers.get("Content-Range", "")
        if head.status != 206 or "/" not in rng:
            raise RangeNotSupported(url)
        self.url = head.geturl()  # follow redirects once (e.g. to storage)
        self.size = int(rng.rsplit("/", 1)[1])

    def _request(self, rng: str):
        for attempt in range(self.retries):
            try:
                req = urllib.request.Request(self.url, headers={"Range": rng, "User-Agent": "SignSphere-INCLUDE-import"})
                return urllib.request.urlopen(req, timeout=120)
            except Exception:  # noqa: BLE001 — network hiccup: back off and retry
                if attempt == self.retries - 1:
                    raise
                time.sleep(5 * (attempt + 1))
        raise RuntimeError("unreachable")

    def _get(self, start: int, end: int) -> bytes:
        for attempt in range(self.retries):
            try:
                with self._request(f"bytes={start}-{end}") as r:
                    data = r.read()
                if len(data) == end - start + 1:
                    self.fetched += len(data)
                    return data
            except Exception:  # noqa: BLE001
                pass
            time.sleep(5 * (attempt + 1))
        raise IOError(f"could not read bytes {start}-{end} of {self.url}")

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def tell(self) -> int:
        return self.pos

    def seek(self, offset: int, whence: int = io.SEEK_SET) -> int:
        self.pos = offset if whence == io.SEEK_SET else self.pos + offset if whence == io.SEEK_CUR else self.size + offset
        return self.pos

    def read(self, n: int = -1) -> bytes:
        if self.pos >= self.size:
            return b""
        if n is None or n < 0:
            n = self.size - self.pos
        n = min(n, self.size - self.pos)
        # Serve from the buffer when we can; otherwise fetch at least one block.
        if not (self._buf_start <= self.pos and self.pos + n <= self._buf_start + len(self._buf)):
            end = min(self.size, self.pos + max(n, self.block)) - 1
            self._buf_start, self._buf = self.pos, self._get(self.pos, end)
        off = self.pos - self._buf_start
        data = self._buf[off:off + n]
        self.pos += len(data)
        return data

    def readinto(self, b) -> int:  # type: ignore[override]
        data = self.read(len(b))
        b[: len(data)] = data
        return len(data)
