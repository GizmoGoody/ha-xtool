"""Temporary camera diagnostics: remove once the camera freeze is solved.

A dashboard's camera picture sometimes stops updating until the browser
is reloaded. These records show where a picture is held up. They are
written at WARNING, so they need no debug logging:

- a picture request (``camera_proxy``) that takes longer than
  ``SLOW_SECONDS`` or ends without a picture
- a P2 photo that is slow or fails, split into the wait for the other
  camera's photo and the transfer from the P2
- each live view opening and closing, with how many are open (a browser
  keeps a connection busy for each one, and has only 6 per server)
- every ``SUMMARY_SECONDS``, one line per camera with its counts

Every line starts with "Camera diagnostics".
"""

from __future__ import annotations

from dataclasses import dataclass
import logging
import time

_LOGGER = logging.getLogger(__name__)

SLOW_SECONDS = 5.0
SUMMARY_SECONDS = 600.0


@dataclass
class _Counts:
    requests: int = 0
    requests_cached: int = 0
    requests_empty: int = 0
    requests_slow: int = 0
    request_max: float = 0.0
    in_flight: int = 0
    in_flight_max: int = 0
    live_open: int = 0
    live_opened: int = 0
    photos: int = 0
    photos_joined: int = 0
    photos_failed: int = 0
    photos_skipped_offline: int = 0
    photo_max: float = 0.0
    lock_wait_max: float = 0.0


_counts: dict[str, _Counts] = {}
_last_summary = time.monotonic()


def _get(camera: str) -> _Counts:
    counts = _counts.get(camera)
    if counts is None:
        counts = _counts[camera] = _Counts()
    return counts


def _live_total() -> int:
    return sum(c.live_open for c in _counts.values())


def request_started(camera: str) -> float:
    """A picture request reached the camera entity; returns its start time."""
    counts = _get(camera)
    counts.in_flight += 1
    counts.in_flight_max = max(counts.in_flight_max, counts.in_flight)
    return time.monotonic()


def request_finished(camera: str, started: float, size: int | None, cached: bool) -> None:
    """A picture request ended (``size`` None: no picture)."""
    counts = _get(camera)
    counts.in_flight = max(0, counts.in_flight - 1)
    took = time.monotonic() - started
    counts.requests += 1
    counts.requests_cached += cached
    counts.request_max = max(counts.request_max, took)
    if size is None:
        counts.requests_empty += 1
    if took >= SLOW_SECONDS:
        counts.requests_slow += 1
    if size is None or took >= SLOW_SECONDS:
        _LOGGER.warning(
            "Camera diagnostics: %s picture request took %.1f s and %s "
            "(still waiting: %d; live views open on all cameras: %d)",
            camera, took, "returned no picture" if size is None else f"returned {size} bytes",
            counts.in_flight, _live_total(),
        )
    _maybe_summary()


def request_failed(camera: str, started: float, err: BaseException) -> None:
    """A picture request ended with an exception (or was cancelled)."""
    counts = _get(camera)
    counts.in_flight = max(0, counts.in_flight - 1)
    counts.requests += 1
    counts.requests_empty += 1
    _LOGGER.warning(
        "Camera diagnostics: %s picture request ended after %.1f s with %r "
        "(still waiting: %d; live views open on all cameras: %d)",
        camera, time.monotonic() - started, err, counts.in_flight, _live_total(),
    )
    _maybe_summary()


def live_view(camera: str, opened: bool, frames: int = 0, started: float = 0.0, reason: str = "") -> None:
    """A live view opened or closed."""
    counts = _get(camera)
    if opened:
        counts.live_open += 1
        counts.live_opened += 1
        _LOGGER.warning(
            "Camera diagnostics: %s live view opened (open now: this camera %d, all cameras %d)",
            camera, counts.live_open, _live_total(),
        )
        return
    counts.live_open = max(0, counts.live_open - 1)
    _LOGGER.warning(
        "Camera diagnostics: %s live view closed after %.0f s, %d frames, %s "
        "(open now: this camera %d, all cameras %d)",
        camera, time.monotonic() - started, frames, reason or "viewer left",
        counts.live_open, _live_total(),
    )


def photo(
    camera: str,
    *,
    joined: bool = False,
    skipped_offline: bool = False,
    lock_wait: float = 0.0,
    transfer: float = 0.0,
    size: int | None = None,
    error: BaseException | None = None,
    host: str = "",
) -> None:
    """A P2 photo request ended (``joined``: it shared a photo already coming)."""
    counts = _get(camera)
    if skipped_offline:
        counts.photos_skipped_offline += 1
        _maybe_summary()
        return
    counts.photos += 1
    counts.photos_joined += joined
    total = lock_wait + transfer
    counts.photo_max = max(counts.photo_max, total)
    counts.lock_wait_max = max(counts.lock_wait_max, lock_wait)
    if error is not None or size is None:
        counts.photos_failed += 1
    if error is not None or size is None or total >= SLOW_SECONDS:
        _LOGGER.warning(
            "Camera diagnostics: %s photo from %s %s: waited %.1f s for the other "
            "camera, transfer %.1f s, %s",
            camera, host, "failed" if error is not None or size is None else "was slow",
            lock_wait, transfer,
            repr(error) if error is not None else f"{size} bytes" if size else "no data",
        )
    _maybe_summary()


def _maybe_summary() -> None:
    global _last_summary
    now = time.monotonic()
    if now - _last_summary < SUMMARY_SECONDS:
        return
    minutes = (now - _last_summary) / 60
    _last_summary = now
    for camera, c in sorted(_counts.items()):
        _LOGGER.warning(
            "Camera diagnostics: summary of the last %.0f min for %s: "
            "picture requests %d (from the last photo %d, no picture %d, slow %d, "
            "slowest %.1f s, most waiting at once %d, waiting now %d); "
            "live views opened %d, open now %d; P2 photos %d (shared %d, failed %d, "
            "skipped while offline %d, slowest %.1f s, longest wait for the other camera %.1f s)",
            minutes, camera, c.requests, c.requests_cached, c.requests_empty,
            c.requests_slow, c.request_max, c.in_flight_max, c.in_flight,
            c.live_opened, c.live_open, c.photos, c.photos_joined, c.photos_failed,
            c.photos_skipped_offline, c.photo_max, c.lock_wait_max,
        )
        # Keep what is still open; count the rest again from zero
        _counts[camera] = _Counts(
            in_flight=c.in_flight, in_flight_max=c.in_flight, live_open=c.live_open,
        )
