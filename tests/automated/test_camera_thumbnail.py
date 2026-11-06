"""Tests for the camera thumbnail refresh interval (issue #4)."""

from __future__ import annotations

from unittest.mock import AsyncMock

from homeassistant.core import HomeAssistant

from .conftest import build_coordinator
from .features import requires

pytestmark = requires("camera_thumbnail_refresh")


def _f2uv(hass: HomeAssistant):
    from custom_components.xtool.protocols import DEVICE_MODELS

    model = next(
        m for m in DEVICE_MODELS.values()
        if m.model_id == "F2UltraUV" and m.protocol_version == "V2"
    )
    coordinator = build_coordinator(hass, model)
    coordinator.protocol.camera_snap = AsyncMock(return_value=b"jpeg")
    coordinator.protocol.camera_calibration_file = AsyncMock(return_value=None)
    return coordinator


def test_one_number_per_camera(hass: HomeAssistant) -> None:
    coordinator = _f2uv(hass)
    keys = {
        n.translation_key for n in coordinator.build_numbers()
        if n.translation_key.endswith("_thumbnail_refresh")
    }
    assert keys == {"camera_main_thumbnail_refresh", "camera_deep_thumbnail_refresh"}


def test_number_range(hass: HomeAssistant) -> None:
    coordinator = _f2uv(hass)
    number = next(
        n for n in coordinator.build_numbers()
        if n.translation_key == "camera_main_thumbnail_refresh"
    )
    assert (number.native_min_value, number.native_max_value, number.native_step) == (5, 600, 5)
    assert number.native_value == 300
    assert number.available


async def test_token_changes_only_on_the_cameras_schedule(hass: HomeAssistant) -> None:
    coordinator = _f2uv(hass)
    camera = next(c for c in coordinator.build_cameras() if c._camera_name == "main")
    token = camera.access_tokens[-1]
    camera.async_update_token()  # Home Assistant's 5-minute call
    assert camera.access_tokens[-1] == token
    camera.hass = hass
    camera.entity_id = "camera.test_main"
    camera._refresh_thumbnail()
    assert camera.access_tokens[-1] != token


async def test_number_restarts_the_camera_timer(hass: HomeAssistant) -> None:
    coordinator = _f2uv(hass)
    camera = next(c for c in coordinator.build_cameras() if c._camera_name == "main")
    number = next(
        n for n in coordinator.build_numbers()
        if n.translation_key == "camera_main_thumbnail_refresh"
    )
    camera.hass = hass
    from custom_components.xtool.protocols.ws_v2.entities import _thumbnail_registry

    _thumbnail_registry(coordinator).cameras["main"] = camera
    number._apply(10)
    assert camera._thumbnail_seconds == 10
    assert camera._cancel_thumbnail_timer is not None
    camera._cancel_thumbnail_timer()


def test_translations_name_every_number() -> None:
    import json
    from pathlib import Path

    root = Path("custom_components/xtool")
    for path in (root / "translations" / "en.json", root / "translations" / "de.json", root / "strings.json"):
        numbers = json.loads(path.read_text(encoding="utf-8"))["entity"]["number"]
        for key in ("camera_main", "camera_deep", "camera"):
            assert f"{key}_thumbnail_refresh" in numbers, (path, key)
