"""Tests for straightening camera photos with the laser calibration (issue #4).

The laser's global_calib.json holds a grid of points in the raw photo
that spreads evenly over the straightened image.
"""

from __future__ import annotations

import io
import json
from unittest.mock import AsyncMock

import pytest
from homeassistant.core import HomeAssistant

from .conftest import build_coordinator
from .features import requires

pytestmark = requires("camera_calibration")

# A 3 x 3 grid over the rectangle (100, 75)-(300, 225) of a 400 x 300
# photo, mapped onto a 200 x 200 result.
GRID = {
    "calib_time": "2025-11-09 09:41:58",
    "grid_num_w": 3,
    "grid_num_h": 3,
    "image_src_w": 400,
    "image_src_h": 300,
    "image_dst_w": 200,
    "image_dst_h": 200,
    "thick_num": 1,
    "thick0": 0.0,
    "data0": "[100,75][200,75][300,75][100,150][200,150][300,150][100,225][200,225][300,225]",
}


def _photo() -> bytes:
    """A 400 x 300 photo: red outside the grid, green top half, blue bottom half."""
    from PIL import Image, ImageDraw

    image = Image.new("RGB", (400, 300), (255, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rectangle((100, 75, 300, 149), fill=(0, 255, 0))
    draw.rectangle((100, 150, 300, 225), fill=(0, 0, 255))
    out = io.BytesIO()
    image.save(out, "JPEG", quality=95)
    return out.getvalue()


def test_parse_calibration() -> None:
    from custom_components.xtool.protocols.ws_v2.camera_correction import parse_calibration

    calibration = parse_calibration(json.dumps(GRID).encode())
    assert calibration is not None
    assert calibration.point(0, 0) == (100.0, 75.0)
    assert calibration.point(2, 2) == (300.0, 225.0)


@pytest.mark.parametrize(
    "broken",
    [b"not json", json.dumps({**GRID, "data0": "[1,2]"}).encode(), json.dumps({**GRID, "grid_num_w": 1}).encode()],
)
def test_unusable_calibration_is_ignored(broken: bytes) -> None:
    from custom_components.xtool.protocols.ws_v2.camera_correction import parse_calibration

    assert parse_calibration(broken) is None


def test_photo_is_mapped_onto_the_grid() -> None:
    from PIL import Image

    from custom_components.xtool.protocols.ws_v2.camera_correction import (
        correct_image,
        parse_calibration,
    )

    calibration = parse_calibration(json.dumps(GRID))
    result = Image.open(io.BytesIO(correct_image(_photo(), calibration, width=200)))
    assert result.size == (200, 200)
    top = result.getpixel((100, 40))
    bottom = result.getpixel((100, 160))
    assert top[1] > 200 and top[0] < 60 and top[2] < 60
    assert bottom[2] > 200 and bottom[0] < 60 and bottom[1] < 60
    # Nothing from outside the grid (red) reaches the result.
    corner = result.getpixel((5, 5))
    assert corner[0] < 100


async def test_main_camera_serves_straightened_photos(hass: HomeAssistant) -> None:
    from PIL import Image

    from custom_components.xtool.protocols import DEVICE_MODELS

    model = next(
        m for m in DEVICE_MODELS.values()
        if m.model_id == "F2UltraUV" and m.protocol_version == "V2"
    )
    coordinator = build_coordinator(hass, model)
    coordinator.protocol.camera_snap = AsyncMock(return_value=_photo())
    coordinator.protocol.camera_calibration_file = AsyncMock(
        return_value=json.dumps(GRID).encode(),
    )
    cameras = {c._camera_name: c for c in coordinator.build_cameras()}
    for camera in cameras.values():
        camera.hass = hass
    main = Image.open(io.BytesIO(await cameras["main"].async_camera_image()))
    deep = Image.open(io.BytesIO(await cameras["deep"].async_camera_image()))
    assert main.size[0] == main.size[1]
    assert deep.size == (400, 300)
    assert coordinator.protocol.camera_calibration_file.await_count == 1


async def test_without_calibration_photos_are_raw(hass: HomeAssistant) -> None:
    from custom_components.xtool.protocols import DEVICE_MODELS

    model = next(
        m for m in DEVICE_MODELS.values()
        if m.model_id == "F2UltraUV" and m.protocol_version == "V2"
    )
    coordinator = build_coordinator(hass, model)
    photo = _photo()
    coordinator.protocol.camera_snap = AsyncMock(return_value=photo)
    coordinator.protocol.camera_calibration_file = AsyncMock(return_value=None)
    main = next(c for c in coordinator.build_cameras() if c._camera_name == "main")
    main.hass = hass
    assert await main.async_camera_image() == photo
