"""The P2's cameras: each its own device, straightened with the P2's calibration files."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from .conftest import SERIAL, build_coordinator
from .features import has, requires
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
    # Fill light (close), also on the Close camera's device
    assert close.translation_key == ("fill_light_1" if has("p2_overlays_v2") else "fill_light")
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


@requires("p2_square_cells")
def test_p2_grid_cells_are_square() -> None:
    """62 x 32 points over a 2440 x 1220 image at 4 px/mm: 10 mm cells both ways."""
    from custom_components.xtool.protocols.ws_v2.camera_correction import parse_calibration

    points = "".join(f"[{c * 40.0},{r * 40.0}]" for r in range(32) for c in range(62))
    raw = {"grid_num_w": 62, "grid_num_h": 32, "image_src_w": 4656, "image_src_h": 3496,
           "image_dst_w": 2440, "image_dst_h": 1220, "data0": points}
    cal = parse_calibration(raw, 4.0)
    assert cal.cell_mm == (10.0, 10.0)
    assert cal.area_h_mm == 305.0
    # Without a scale (the F2 Ultra UV) the grid still fills the image
    assert parse_calibration(raw).cell_mm[1] == pytest.approx(200 * 1220 / 2440 / 31)


@requires("p2_exposure_1000")
async def test_exposure_change_takes_a_new_photo(hass, config_entry, monkeypatch) -> None:
    from unittest.mock import AsyncMock, MagicMock

    from custom_components.xtool.protocols.rest import XTOOL_P2
    from custom_components.xtool.protocols.rest import p2_entities
    from custom_components.xtool.protocols.ws_v2.entities import _thumbnail_registry

    from .conftest import build_coordinator

    coord = build_coordinator(hass, XTOOL_P2)
    coord.protocol.set_camera_exposure = AsyncMock()
    monkeypatch.setattr(p2_entities, "P2_EXPOSURE_SETTLE_SECONDS", 0)
    camera = MagicMock(refresh_picture=AsyncMock())
    _thumbnail_registry(coord).cameras["overview"] = camera
    number = p2_entities.P2CameraExposure(coord, "overview")
    number.async_write_ha_state = MagicMock()
    assert number.native_max_value == 1000
    await number.async_set_native_value(1000)
    coord.protocol.set_camera_exposure.assert_awaited_once_with(0, 1000)
    camera.refresh_picture.assert_awaited_once()


async def test_camera_action_takes_p2_sized_crops(coordinator) -> None:
    from custom_components.xtool.protocols.ws_v2.entities import _camera_view_values
    from custom_components.xtool.services import _async_camera

    camera = next(c for c in coordinator.build_cameras() if c._camera_name == "overview")
    camera.refresh_picture = AsyncMock()
    call = MagicMock()
    # The largest crop presets: wider than the F2 Ultra UV limits
    call.data = {
        "crop_width": 684.0, "crop_height": 376.0,
        "crop_center_x": 321.5, "crop_center_y": 147.5,
    }
    await _async_camera(camera, call)
    values = _camera_view_values(coordinator, "overview")
    assert values["width"] == 684
    assert values["height"] == 376
    assert values["center_x"] == 321.5
    assert values["center_y"] == 147.5
    camera.refresh_picture.assert_awaited_once()


async def test_camera_action_refuses_values_outside_the_p2_limits(coordinator) -> None:
    from homeassistant.exceptions import ServiceValidationError

    from custom_components.xtool.services import _async_camera

    camera = next(c for c in coordinator.build_cameras() if c._camera_name == "overview")
    camera.refresh_picture = AsyncMock()
    maximum = camera.crop_limits["width"][1]
    call = MagicMock()
    call.data = {"crop_width": maximum + 1}
    with pytest.raises(ServiceValidationError) as error:
        await _async_camera(camera, call)
    assert error.value.translation_key == "camera_value_out_of_range"
    assert error.value.translation_placeholders["maximum"] == f"{maximum:g}"
    camera.refresh_picture.assert_not_awaited()



def _p2_protocol():
    from custom_components.xtool.protocols.rest.p2 import P2Protocol

    return P2Protocol("192.0.2.10")


@requires("p2_overlays_v2")
async def test_exposure_is_read_back(monkeypatch) -> None:
    """Each camera's exposure comes from the P2, except while it sleeps."""
    from custom_components.xtool.const import XtoolStatus
    from custom_components.xtool.protocols.base import XtoolDeviceState

    protocol = _p2_protocol()
    asked = []

    async def get_json(path, timeout=5.0):
        if "/camera/exposure" in path:
            asked.append(path)
            return {"mode": "manual", "value": 760 if path.endswith("stream=0") else 150}
        return None

    monkeypatch.setattr(protocol, "_get_json", get_json)
    state = XtoolDeviceState()
    state.status = XtoolStatus.IDLE
    await protocol._read_slow(state)
    assert (state.camera_exposure_overview, state.camera_exposure_closeup) == (760, 150)
    assert asked == [
        "http://192.0.2.10:8329/camera/exposure?stream=0",
        "http://192.0.2.10:8329/camera/exposure?stream=1",
    ]
    asked.clear()
    state.status = XtoolStatus.SLEEPING
    await protocol._read_slow(state)
    assert asked == []  # the cameras' port would wake it


@requires("p2_overlays_v2")
async def test_exposure_reply_is_parsed(monkeypatch) -> None:
    protocol = _p2_protocol()
    for reply, value in (
        ({"mode": "auto", "value": 760}, 760),
        ({"mode": "manual", "value": "150"}, 150),
        ("camera disabled", None),
        (None, None),
    ):
        monkeypatch.setattr(protocol, "_get_json", AsyncMock(return_value=reply))
        assert await protocol.read_camera_exposure("closeup") == value


@requires("p2_overlays_v2")
async def test_exposure_refuses_no_number(coordinator) -> None:
    from homeassistant.exceptions import HomeAssistantError

    from custom_components.xtool.protocols.rest import p2_entities

    coordinator.protocol.set_camera_exposure = AsyncMock()
    number = p2_entities.P2CameraExposure(coordinator, "closeup")
    with pytest.raises(HomeAssistantError):
        await number.async_set_native_value(float("nan"))
    coordinator.protocol.set_camera_exposure.assert_not_awaited()


@requires("p2_overlays_v2")
async def test_wake_takes_one_photo(coordinator) -> None:
    from homeassistant.exceptions import HomeAssistantError

    buttons = {b.translation_key: b for b in coordinator.build_buttons()}
    wake = buttons["wake"]
    coordinator.protocol.camera_snap = AsyncMock(return_value=b"jpeg")
    coordinator.async_request_refresh = AsyncMock()
    await wake.async_press()
    coordinator.protocol.camera_snap.assert_awaited_once_with("overview")
    coordinator.async_request_refresh.assert_awaited_once()
    coordinator.protocol.camera_snap = AsyncMock(side_effect=ConnectionError("off"))
    with pytest.raises(HomeAssistantError):
        await wake.async_press()
