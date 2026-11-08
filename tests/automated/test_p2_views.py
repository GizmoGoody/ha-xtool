"""P2 camera views: crop presets, overlays, slats and the material's height."""

from __future__ import annotations

import io
import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from .conftest import build_coordinator
from .features import COMPONENT, requires
from .test_camera_correction import GRID, _photo

pytestmark = requires("p2_views")

P2_GRID = {
    "grid_num_w": 62, "grid_num_h": 32, "image_src_w": 4656, "image_src_h": 3496,
    "image_dst_w": 2440, "image_dst_h": 1220, "thick0": 3.0,
    "data0": "".join(f"[{c * 70.0 + 100},{r * 100.0 + 100}]" for r in range(32) for c in range(62)),
}


@pytest.fixture
def coordinator(hass: HomeAssistant, config_entry: MockConfigEntry):
    from custom_components.xtool.const import XtoolStatus
    from custom_components.xtool.protocols.base import XtoolDeviceState
    from custom_components.xtool.protocols.rest import XTOOL_P2

    coord = build_coordinator(hass, XTOOL_P2)
    coord.config_entry = config_entry
    coord.data = XtoolDeviceState(status=XtoolStatus.IDLE)
    coord.data.available = True
    coord.protocol.measure_offset = MagicMock(return_value={"x": 64.3, "y": 0.9, "z": 136.7})
    return coord


def _calibration():
    from custom_components.xtool.protocols.ws_v2.camera_correction import parse_calibration

    return parse_calibration(P2_GRID, 4.0)


def _view(coordinator):
    from custom_components.xtool.protocols.rest.p2_entities import _p2_view

    return _p2_view(coordinator)


def _correction(coordinator, camera="overview"):
    from custom_components.xtool.protocols.rest.p2_entities import p2_correction
    from custom_components.xtool.protocols.ws_v2.camera_correction import CameraView

    return p2_correction(coordinator, camera, _calibration(), CameraView(610, 305, 0, 0))


def test_47_slats_numbered_from_the_0_reference() -> None:
    from custom_components.xtool.protocols.rest import p2_geometry as g

    slats = g.slats()
    assert len(slats) == 47
    assert [label for _, label in slats[:2]] == ["24", "23"]
    assert [label for _, label in slats[23:25]] == ["1", "1"]
    assert slats[-1][1] == "23"
    # 0 reference 348 mm from the left wall, half a pitch to each slat 1
    assert slats[23][0] == pytest.approx(327.5 - 6.6)
    assert slats[24][0] == pytest.approx(327.5 + 6.6)
    assert g.close_camera_area(200, 100) == (255.0, 70.0, 140.0, 100.0)


def test_plane_height_comes_from_the_calibration() -> None:
    assert _calibration().plane_mm == 3.0


def test_by_default_the_picture_is_unchanged(coordinator) -> None:
    correction = _correction(coordinator)
    assert correction["view"].width_mm == 610
    assert correction["overlay"] is None
    assert correction["lift"] is None  # Studio's default 3 mm is the calibrated plane


def test_a_crop_preset_shows_that_area(coordinator) -> None:
    _view(coordinator)["crop_preset"] = "slats_removed"
    view = _correction(coordinator)["view"]
    assert (view.width_mm, view.height_mm) == (500, 250)
    assert (view.center_x_mm, view.center_y_mm) == (300 - 305, 125 - 152.5)
    coordinator.data.position_x, coordinator.data.position_y = 200.0, 100.0
    _view(coordinator)["crop_preset"] = "close_camera"
    view = _correction(coordinator)["view"]
    assert (view.width_mm, view.height_mm, view.center_x_mm, view.center_y_mm) == (
        140, 100, 325 - 305, 120 - 152.5,
    )


def test_each_mode_uses_its_own_setting(coordinator) -> None:
    view = _view(coordinator)
    view["thickness_on_slats"] = 25.0
    lift = _correction(coordinator)["lift"]
    assert lift.surface_mm == 22.0
    view["processing_mode"] = "slats_removed"
    view["distance_slats_removed"] = 75.0
    assert _correction(coordinator)["lift"].surface_mm == 25 - 75 - 3
    view["processing_mode"] = "honeycomb_panel"
    view["distance_honeycomb_panel"] = 22.0
    assert _correction(coordinator)["lift"] is None


def test_overlays_and_the_measuring_spot(coordinator) -> None:
    view = _view(coordinator)
    coordinator.data.position_x, coordinator.data.position_y = 100.0, 50.0
    view["overlay"] = "process_on_slats"
    overlay = _correction(coordinator)["overlay"]
    assert overlay.rects == ((0.0, 0.0, 600.0, 305.0),)
    assert overlay.markers == ((164.3, 50.9),)
    assert overlay.lines == ()
    view["overlay"] = "none"
    view["slat_overlay"] = True
    overlay = _correction(coordinator)["overlay"]
    assert len(overlay.lines) == 47 and overlay.rects == ()
    view["overlay"] = "custom"
    rect = _correction(coordinator)["overlay"].rects[0]
    assert rect == (0.0, 0.0, 610.0, 305.0)


def test_close_camera_overlay_moves_with_the_head(coordinator) -> None:
    assert "overlay" not in _correction(coordinator, "closeup")
    _view(coordinator)["overlay_closeup"] = True
    coordinator.data.position_x, coordinator.data.position_y = 200.0, 100.0
    overlay = _correction(coordinator, "closeup")["overlay"]
    assert overlay.markers[0] == pytest.approx((9.3, 30.9))
    # The picture starts at X 255: slats 1-5 on each side of the 0 reference
    assert len(overlay.lines) == 10
    assert {line[4] for line in overlay.lines} == {"1", "2", "3", "4", "5"}
    assert all(0 <= line[0] <= 140 and line[1:4:2] == (0.0, 100.0) for line in overlay.lines)


def test_correct_image_draws_and_lifts() -> None:
    from PIL import Image

    from custom_components.xtool.protocols.ws_v2.camera_correction import (
        CameraView, Overlay, SurfaceLift, correct_image, parse_calibration,
    )

    calibration = parse_calibration(GRID)
    plain = correct_image(_photo(), calibration, CameraView(200, 200, 0, 0))
    drawn = correct_image(
        _photo(), calibration, CameraView(200, 200, 0, 0),
        overlay=Overlay(rects=((50, 50, 100, 100),), lines=((10, 0, 10, 200, "1"),),
                        markers=((100, 100),)),
    )
    lifted = correct_image(
        _photo(), calibration, CameraView(200, 200, 0, 0), lift=SurfaceLift(100, 100, 200, 50),
    )
    assert Image.open(io.BytesIO(drawn)).size == Image.open(io.BytesIO(plain)).size
    assert drawn != plain and lifted != plain
    # A raised surface seen from above looks larger: away from the point below
    lift = SurfaceLift(100, 100, 200, 50)
    assert lift.seen_at(150, 100) == pytest.approx((100 + 50 * 200 / 150, 100))


def test_view_entities_are_on_the_camera_devices(coordinator) -> None:
    switches = {e.translation_key for e in coordinator.build_switches()}
    numbers = {e.translation_key for e in coordinator.build_numbers()}
    keys = {e.translation_key for e in coordinator.build_selects()}
    assert {"crop_preset", "overlay", "processing_mode"} <= keys
    assert {"slat_overlay", "overlay"} <= switches
    assert {"thickness_on_slats", "distance_honeycomb_panel", "distance_slats_removed"} <= numbers
    crop = next(e for e in coordinator.build_selects() if e.translation_key == "crop_preset")
    assert crop.unique_id.endswith("camera_overview_crop_preset")
    assert crop.device_info != coordinator.build_selects()[0].device_info


async def test_a_setting_change_refreshes_the_picture(coordinator) -> None:
    from custom_components.xtool.protocols.ws_v2.entities import _thumbnail_registry

    camera = MagicMock()
    camera.refresh_picture = AsyncMock()
    _thumbnail_registry(coordinator).cameras["overview"] = camera
    select = next(e for e in coordinator.build_selects() if e.translation_key == "overlay")
    select.async_write_ha_state = MagicMock()
    await select.async_select_option("slats_removed")
    assert _view(coordinator)["overlay"] == "slats_removed"
    camera.refresh_picture.assert_awaited_once()


def test_names_and_states() -> None:
    for name in ("strings.json", "translations/en.json"):
        data = json.loads((COMPONENT / name).read_text(encoding="utf-8"))["entity"]
        assert data["select"]["crop_preset"]["name"] == "Crop"
        assert data["select"]["overlay"]["state"]["close_camera"] == "Close camera image"
        assert data["select"]["processing_mode"]["state"]["slats_removed"] == "Slats removed"
        assert data["switch"]["slat_overlay"]["name"] == "Slat overlay"
        assert data["number"]["distance_slats_removed"]["name"] == "Distance with slats removed"
