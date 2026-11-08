"""The P2's cameras: each its own device, straightened with the P2's calibration files."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from .conftest import SERIAL, build_coordinator
from .features import requires
from .test_camera_correction import GRID, _photo

pytestmark = requires("p2_cameras")


@pytest.fixture
def coordinator(hass: HomeAssistant, config_entry: MockConfigEntry):
    from custom_components.xtool.protocols.base import XtoolDeviceState
    from custom_components.xtool.protocols.rest import XTOOL_P2

    coord = build_coordinator(hass, XTOOL_P2)
    coord.config_entry = config_entry
    state = XtoolDeviceState()
    state.available = True
    state.fill_light_levels = {1: 0, 2: 255, 3: 255}
    coord.data = state
    return coord


def _ids(entity) -> set:
    return entity.device_info["identifiers"]


def test_each_camera_is_its_own_device(coordinator) -> None:
    from custom_components.xtool.const import DOMAIN

    cameras = {c.unique_id: c for c in coordinator.build_cameras()}
    assert set(cameras) == {f"{SERIAL}_camera_overview", f"{SERIAL}_camera_closeup"}
    for name in ("overview", "closeup"):
        camera = cameras[f"{SERIAL}_camera_{name}"]
        assert _ids(camera) == {(DOMAIN, f"{SERIAL}:camera_{name}")}
        # The camera takes its device's name
        assert camera._attr_name is None


def test_camera_settings_are_on_the_camera_devices(coordinator) -> None:
    from custom_components.xtool.const import DOMAIN

    numbers = {n.unique_id.removeprefix(f"{SERIAL}_"): n for n in coordinator.build_numbers()}
    for name in ("overview", "closeup"):
        device = {(DOMAIN, f"{SERIAL}:camera_{name}")}
        exposure = numbers[f"camera_exposure_{name}"]
        assert _ids(exposure) == device and exposure.translation_key == "exposure"
        assert _ids(numbers[f"camera_{name}_thumbnail_refresh"]) == device
        for setting in ("width", "height", "center_x", "center_y"):
            assert _ids(numbers[f"camera_{name}_view_{setting}"]) == device
    # The crop starts as the calibrated area
    assert numbers["camera_overview_view_width"].native_value == 610
    assert numbers["camera_overview_view_height"].native_value == 305
    assert numbers["camera_closeup_view_width"].native_value == 140
    assert numbers["camera_closeup_view_height"].native_value == 100


def test_close_fill_light_is_on_the_close_camera(coordinator) -> None:
    from custom_components.xtool.const import DOMAIN

    lights = {e.unique_id.removeprefix(f"{SERIAL}_"): e for e in coordinator.build_lights()}
    close = lights["fill_light_1"]
    assert _ids(close) == {(DOMAIN, f"{SERIAL}:camera_closeup")}
    assert close.translation_key == "fill_light"
    assert (DOMAIN, SERIAL) in _ids(lights["fill_light_2"])


def test_calibration_scale_sets_the_area() -> None:
    from custom_components.xtool.protocols.ws_v2.camera_correction import parse_calibration

    assert parse_calibration(GRID).area_mm == 200
    calibration = parse_calibration(GRID, 2.0)
    assert calibration.area_mm == 100
    assert calibration.area_h_mm == 100


async def test_photo_is_straightened_with_its_own_file(coordinator) -> None:
    camera = next(c for c in coordinator.build_cameras() if c._camera_name == "closeup")
    camera.hass = coordinator.hass
    coordinator.protocol.camera_snap = AsyncMock(return_value=_photo())
    coordinator.protocol.camera_calibration_file = AsyncMock(return_value=json.dumps(GRID).encode())
    image = await camera.async_camera_image()
    coordinator.protocol.camera_calibration_file.assert_awaited_with("local_calib.json")
    assert image and image != _photo()


async def test_no_photo_while_asleep(coordinator) -> None:
    from custom_components.xtool.const import XtoolStatus

    camera = next(c for c in coordinator.build_cameras() if c._camera_name == "overview")
    camera._last_snapshot = b"old"
    coordinator.data.status = XtoolStatus.SLEEPING
    coordinator.protocol.camera_snap = AsyncMock(side_effect=AssertionError("a photo wakes the P2"))
    assert await camera.async_camera_image() == b"old"


async def test_a_missing_calibration_file_is_none(monkeypatch) -> None:
    from custom_components.xtool.protocols.rest.p2 import P2Protocol

    proto = P2Protocol("192.168.0.47")
    monkeypatch.setattr(proto, "_request", AsyncMock(return_value='{"result":"failed"}'))
    assert await proto.camera_calibration_file("local_calib.json") is None
    monkeypatch.setattr(proto, "_request", AsyncMock(return_value=json.dumps(GRID)))
    assert json.loads(await proto.camera_calibration_file("global_calib.json"))["grid_num_w"] == 3
