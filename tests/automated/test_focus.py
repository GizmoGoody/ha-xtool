"""Tests for the F2 Ultra UV focus height and the xtool.focus action.

The value matches what xTool Studio shows (laser-head Z minus 6), moves
go the way Studio's manual focus goes, and a move is refused whenever
Studio would refuse it.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
import voluptuous as vol
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError

from custom_components.xtool.const import XtoolStatus

from .conftest import build_coordinator
from .features import requires

pytestmark = requires("focus_control")


def _protocol():
    from custom_components.xtool.protocols.ws_v2.protocol import WSV2Protocol

    proto = WSV2Protocol("192.0.2.10")
    proto.request = AsyncMock(return_value={})
    return proto


def _f2uv():
    from custom_components.xtool.protocols import DEVICE_MODELS

    return next(
        m for m in DEVICE_MODELS.values()
        if m.model_id == "F2UltraUV" and m.protocol_version == "V2"
    )


def test_thickness_is_z_minus_six_as_studio_shows() -> None:
    from custom_components.xtool.protocols.ws_v2.protocol import focus_thickness_from_z

    assert focus_thickness_from_z(42.5) == 36.5
    assert focus_thickness_from_z(54.75) == 48.8  # halves round up, as Studio
    assert focus_thickness_from_z(39.506999) == 33.5


def test_z_push_updates_the_thickness() -> None:
    proto = _protocol()
    proto._dispatch_push({
        "url": "/laser_head/value",
        "data": {"module": "LASER_HEAD", "type": "MODE_CHANGE", "info": {"z": 54.75}},
    })
    assert proto._latest["focus_thickness"] == 48.8


async def test_focus_read_only_reads() -> None:
    proto = _protocol()
    proto.request = AsyncMock(return_value={"value": 42.935})
    await proto._poll_focus()
    proto.request.assert_awaited_once_with(
        "/v1/laser-head/focus/control", "POST", data={"action": "coord"},
    )
    assert proto._latest["focus_thickness"] == 36.9


async def test_focus_to_moves_like_studio_and_clamps() -> None:
    proto = _protocol()
    assert await proto.focus_to(12.74) == 12.7
    calls = proto.request.await_args_list
    assert calls[0].args == ("/v1/device/mode", "PUT")
    assert calls[0].kwargs["data"] == {"mode": "P_AUTOFOCUS"}
    assert calls[1].args == ("/v1/laser-head/focus/control", "POST")
    assert calls[1].kwargs["data"] == {"action": "goTo", "z": pytest.approx(18.7), "stopFirst": 1}
    proto.request.reset_mock()
    assert await proto.focus_to(200) == 150.0
    assert proto.request.await_args_list[1].kwargs["data"]["z"] == pytest.approx(156.0)
    assert await proto.focus_to(-3) == 0.0


@pytest.mark.parametrize(
    ("mode", "status", "refused"),
    [
        ("P_IDLE", XtoolStatus.IDLE, False),
        ("P_AUTOFOCUS", XtoolStatus.IDLE, True),
        ("P_MEASURE", XtoolStatus.MEASURING, True),
        ("P_WORKING", XtoolStatus.PROCESSING, True),
        ("P_WORK", XtoolStatus.IDLE, True),
        ("P_IDLE", XtoolStatus.PAUSED, True),
        ("P_IDLE", XtoolStatus.FRAMING, True),
        ("P_ERROR", XtoolStatus.ERROR_LIMIT, True),
    ],
)
def test_moves_refused_when_studio_refuses(mode: str, status: XtoolStatus, refused: bool) -> None:
    proto = _protocol()
    proto._device_mode = mode
    proto._latest["status"] = status
    assert (proto.focus_refusal() is not None) is refused


def _focus_entity(hass: HomeAssistant, thickness: float | None):
    coordinator = build_coordinator(hass, _f2uv())
    entity = next(n for n in coordinator.build_numbers() if n.translation_key == "focus_height")
    coordinator.protocol.focus_refusal = lambda: None
    coordinator.protocol.focus_to = AsyncMock(side_effect=lambda t: t)
    if coordinator.data is not None:
        coordinator.data.focus_thickness = thickness
    else:
        from custom_components.xtool.protocols.base import XtoolDeviceState

        coordinator.data = XtoolDeviceState(focus_thickness=thickness)
    return entity, coordinator.protocol


def test_focus_height_is_a_millimetre_box(hass: HomeAssistant, config_entry) -> None:
    from homeassistant.components.number import NumberMode

    entity, _ = _focus_entity(hass, 36.5)
    assert entity.native_value == 36.5
    assert (entity.native_min_value, entity.native_max_value, entity.native_step) == (0.0, 150.0, 0.1)
    assert entity.mode == NumberMode.BOX
    assert entity.native_unit_of_measurement == "mm"


@pytest.mark.parametrize(
    ("current", "kwargs", "target"),
    [
        (36.5, {"step": 1.0}, 37.5),
        (36.5, {"step": -0.5, "steps": 3}, 35.0),
        (36.5, {"step": 10.0, "steps": 20}, 150.0),   # stops at the top
        (2.0, {"step": -1.0, "steps": 5}, 0.0),       # stops at the bottom
        (36.5, {"thickness": 12.7}, 12.7),
        (None, {"thickness": 12.7}, 12.7),
    ],
)
async def test_focus_action_steps_and_limits(
    hass: HomeAssistant, config_entry, current, kwargs, target
) -> None:
    entity, proto = _focus_entity(hass, current)
    await entity.async_focus(**kwargs)
    proto.focus_to.assert_awaited_once_with(pytest.approx(target))


async def test_focus_step_needs_a_known_height(hass: HomeAssistant, config_entry) -> None:
    entity, proto = _focus_entity(hass, None)
    with pytest.raises(HomeAssistantError):
        await entity.async_focus(step=1.0)
    proto.focus_to.assert_not_awaited()


async def test_focus_refused_moves_nothing(hass: HomeAssistant, config_entry) -> None:
    entity, proto = _focus_entity(hass, 36.5)
    proto.focus_refusal = lambda: "the laser is busy"
    with pytest.raises(HomeAssistantError):
        await entity.async_set_native_value(20.0)
    proto.focus_to.assert_not_awaited()


def test_action_takes_a_step_or_a_thickness_not_both() -> None:
    from custom_components.xtool.services import FOCUS_SCHEMA

    schema = vol.Schema(FOCUS_SCHEMA)
    assert schema({"step": 1.0}) == {"step": 1.0, "steps": 1}
    assert schema({"thickness": 12.7})["thickness"] == 12.7
    with pytest.raises(vol.Invalid):
        schema({"step": 1.0, "thickness": 12.7})
    with pytest.raises(vol.Invalid):
        schema({"thickness": 151})
    with pytest.raises(vol.Invalid):
        schema({"step": 1.0, "steps": 0})


async def test_action_is_registered(hass: HomeAssistant) -> None:
    from custom_components.xtool.services import async_setup_services

    async_setup_services(hass)
    assert hass.services.has_service("xtool", "focus")


def test_only_the_f2_ultra_uv_has_it(hass: HomeAssistant, config_entry) -> None:
    from custom_components.xtool.protocols import DEVICE_MODELS

    for key, model in DEVICE_MODELS.items():
        coordinator = build_coordinator(hass, model)
        has = any(n.translation_key == "focus_height" for n in coordinator.build_numbers())
        assert has is (model.model_id in ("F2UltraUV", "F2UltraUVClass1") and model.protocol_version == "V2"), key
