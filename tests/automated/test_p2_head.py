"""P2: Laser position X and Y move the head; the Move action; the measurements."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest
import yaml
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from pytest_homeassistant_custom_component.common import MockConfigEntry

from .conftest import build_coordinator
from .features import COMPONENT, requires

pytestmark = requires("p2_head_controls")


@pytest.fixture
def coordinator(hass: HomeAssistant, config_entry: MockConfigEntry):
    from custom_components.xtool.const import XtoolStatus
    from custom_components.xtool.protocols.base import XtoolDeviceState
    from custom_components.xtool.protocols.rest import XTOOL_P2

    coord = build_coordinator(hass, XTOOL_P2)
    coord.data = XtoolDeviceState(status=XtoolStatus.IDLE)
    coord.protocol.move_laser_head = AsyncMock()
    coord.protocol.read_head_position = AsyncMock(return_value=(100.0, 50.0))
    return coord


def _numbers(coordinator):
    entities = coordinator.build_numbers()
    for entity in entities:
        entity.async_write_ha_state = MagicMock()
    return {e.translation_key: e for e in entities}


def test_positions_are_numbers_not_sensors(coordinator) -> None:
    numbers = _numbers(coordinator)
    assert numbers["laser_position_x"].native_max_value == 620
    assert numbers["laser_position_y"].native_max_value == 308
    assert numbers["laser_position_x"].mode == "box"
    sensors = {e.translation_key for e in coordinator.build_sensors()}
    assert not {"laser_position_x", "laser_position_y"} & sensors
    assert {"measured_thickness", "measured_distance"} <= sensors
    exposure = numbers["exposure"]
    assert (exposure.mode, exposure.native_step, exposure.native_max_value) == ("slider", 10, 1000)


async def test_setting_x_keeps_y_where_the_head_is(coordinator) -> None:
    await _numbers(coordinator)["laser_position_x"].async_set_native_value(200.0)
    coordinator.protocol.move_laser_head.assert_awaited_once_with(200.0, 50.0)
    assert (coordinator.data.position_x, coordinator.data.position_y) == (200.0, 50.0)


async def test_steps_start_from_the_position_read_now(coordinator) -> None:
    number = _numbers(coordinator)["laser_position_y"]
    result = await number.async_move_laser_head(step_x=10.0, step_y=-5.0, steps=3)
    coordinator.protocol.read_head_position.assert_awaited_once()
    coordinator.protocol.move_laser_head.assert_awaited_once_with(130.0, 35.0)
    assert result == {"x": 130.0, "y": 35.0}


async def test_both_positions_need_no_read(coordinator) -> None:
    number = _numbers(coordinator)["laser_position_x"]
    await number.async_move_laser_head(x=10.0, y=20.0)
    coordinator.protocol.read_head_position.assert_not_awaited()
    coordinator.protocol.move_laser_head.assert_awaited_once_with(10.0, 20.0)


async def test_a_move_past_the_limit_stops_there_and_says_so(coordinator) -> None:
    number = _numbers(coordinator)["laser_position_x"]
    with pytest.raises(HomeAssistantError) as err:
        await number.async_move_laser_head(step_x=-40.0, steps=3, y=400.0)
    coordinator.protocol.move_laser_head.assert_awaited_once_with(0.0, 308.0)
    assert str(err.value) == (
        "Laser head: X moved to 0.00 mm, the lower limit. 3 steps of -40.00 mm "
        "from 100.00 mm would have gone to -20.00 mm. Y moved to 308.00 mm, the "
        "upper limit. 400.00 mm is outside 0-308 mm."
    )
    assert (coordinator.data.position_x, coordinator.data.position_y) == (0.0, 308.0)


async def test_moves_run_one_at_a_time_from_where_the_last_ended(coordinator) -> None:
    import asyncio

    position = [100.0, 50.0]
    started: list[tuple[float, float]] = []
    release = asyncio.Event()

    async def read():
        return tuple(position)

    async def move(x, y):
        started.append((x, y))
        if len(started) == 1:
            await release.wait()
        position[:] = [x, y]

    coordinator.protocol.read_head_position = AsyncMock(side_effect=read)
    coordinator.protocol.move_laser_head = AsyncMock(side_effect=move)
    number = _numbers(coordinator)["laser_position_x"]
    first = asyncio.create_task(number.async_move_laser_head(step_x=10.0))
    second = asyncio.create_task(number.async_move_laser_head(step_x=10.0))
    await asyncio.sleep(0)
    await asyncio.sleep(0)
    assert started == [(110.0, 50.0)]
    release.set()
    assert await first == {"x": 110.0, "y": 50.0}
    assert await second == {"x": 120.0, "y": 50.0}


async def test_no_move_unless_idle(coordinator) -> None:
    from custom_components.xtool.const import XtoolStatus

    coordinator.data.status = XtoolStatus.PROCESSING
    with pytest.raises(HomeAssistantError, match="not moved"):
        await _numbers(coordinator)["laser_position_x"].async_set_native_value(5.0)
    coordinator.protocol.move_laser_head.assert_not_awaited()


async def test_the_action_needs_a_value_and_a_position_entity(coordinator) -> None:
    from custom_components.xtool.services import _async_move

    number = _numbers(coordinator)["laser_position_x"]
    call = MagicMock()
    call.data = {"steps": 1}
    with pytest.raises(ServiceValidationError):
        await _async_move(number, call)
    with pytest.raises(ServiceValidationError):
        await _async_move(object(), MagicMock(data={"x": 1.0, "steps": 1}))
    call.data = {"step_y": 2.5, "steps": 2}
    assert await _async_move(number, call) == {"x": 100.0, "y": 55.0}


def test_the_action_is_described() -> None:
    services = yaml.safe_load((COMPONENT / "services.yaml").read_text(encoding="utf-8"))
    assert set(services["move"]["fields"]) == {"x", "y", "step_x", "step_y", "steps"}
    for name in ("strings.json", "translations/en.json"):
        data = json.loads((COMPONENT / name).read_text(encoding="utf-8"))
        assert set(data["services"]["move"]["fields"]) == {"x", "y", "step_x", "step_y", "steps"}
        assert data["entity"]["number"]["laser_position_x"]["name"] == "Laser position X"
        assert data["entity"]["sensor"]["measured_thickness"]["name"] == "Measured thickness"
        assert data["entity"]["sensor"]["measured_distance"]["name"] == "Measured distance"
        assert data["services"]["move"]["name"] == "Move"


def test_measure_offset_reads_the_p2_setting() -> None:
    from custom_components.xtool.protocols.base import XtoolDeviceState
    from custom_components.xtool.protocols.rest.p2 import P2Protocol

    state = XtoolDeviceState()
    proto = P2Protocol("127.0.0.1")
    assert proto.measure_offset(state) == {}
    state.device_config = {"laserMeasureOffset": "X64.3Y0.9Z136.7"}
    assert proto.measure_offset(state) == {"x": 64.3, "y": 0.9, "z": 136.7}


async def test_measure_gives_the_thickness_and_where(coordinator) -> None:
    from custom_components.xtool.protocols.rest.p2_entities import P2Measured

    coordinator.protocol.measure_material = AsyncMock(
        return_value={"distance": 130.7, "coord_x": 10.0, "coord_y": 20.0}
    )
    coordinator.protocol.measure_offset = MagicMock(return_value={"x": 64.3, "y": 0.9, "z": 136.7})
    buttons = {e.translation_key: e for e in coordinator.build_buttons()}
    await buttons["measure_distance"].async_press()
    assert coordinator.data.last_distance_mm == 130.7
    assert coordinator.data.measured_thickness_mm == 6.0
    thickness = P2Measured(coordinator, "measured_thickness")
    distance = P2Measured(coordinator, "measured_distance")
    thickness._seen_live_data = distance._seen_live_data = True
    assert thickness.native_value == 6.0
    assert distance.native_value == 19.0
    assert thickness.extra_state_attributes == {"sensor_distance": 130.7, "x": 74.3, "y": 20.9}


async def test_a_measure_without_a_reply_says_so(coordinator) -> None:
    coordinator.protocol.measure_material = AsyncMock(return_value=None)
    buttons = {e.translation_key: e for e in coordinator.build_buttons()}
    with pytest.raises(HomeAssistantError):
        await buttons["measure_distance"].async_press()


async def test_the_protocol_reads_the_position_and_the_measurement(monkeypatch) -> None:
    from custom_components.xtool.protocols.rest.p2 import P2Protocol

    proto = P2Protocol("127.0.0.1")
    replies = {
        "/peripheral/laser_head": {"x": 1.5, "y": 2, "z": 0},
        "/peripheral/ir_measure_distance": {"distance": 136.7, "coord_x": 0, "coord_y": 0},
    }

    async def post_json(path, data=None, timeout=5.0):
        return replies.get(path)

    monkeypatch.setattr(proto, "_post_json", post_json)
    assert await proto.read_head_position() == (1.5, 2.0)
    assert await proto.measure_material() == {"distance": 136.7, "coord_x": 0.0, "coord_y": 0.0}
    replies["/peripheral/laser_head"] = {"x": None}
    assert await proto.read_head_position() is None
