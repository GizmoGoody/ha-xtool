"""Tests for the WS-V2 device configuration: the poll and the push agree."""

from __future__ import annotations

import pytest

from .features import requires


def protocol():
    from custom_components.xtool.protocols.ws_v2.protocol import WSV2Protocol

    return WSV2Protocol("192.0.2.10")


def push(proto, info: dict) -> None:
    proto._dispatch_push({"url": "/device/config", "data": {"module": "DEVICE_CONFIG", "type": "INFO", "info": info}})


@requires("stops_when_moved_poll")
@pytest.mark.parametrize(("mode", "on"), [("NORMAL", True), ("HANDLE", False)])
def test_stops_when_moved_poll_and_push_agree(mode: str, on: bool) -> None:
    """workingMode NORMAL is on (what the switch writes), from the poll and from a push."""
    proto = protocol()
    proto._apply_configs({"kv": {"workingMode": mode}})
    assert proto._latest["stops_when_moved"] is on
    proto = protocol()
    push(proto, {"workingMode": mode})
    assert proto._latest["stops_when_moved"] is on


def test_flame_alarm_follows_its_own_key() -> None:
    """The flame alarm changes only with flameAlarm, from the poll and from a push."""
    proto = protocol()
    proto._apply_configs({"kv": {"flameAlarm": False, "workingMode": "NORMAL"}})
    assert proto._latest["flame_alarm_v2_enabled"] is False
    push(proto, {"workingMode": "HANDLE"})
    assert proto._latest["flame_alarm_v2_enabled"] is False
    push(proto, {"flameAlarm": True})
    assert proto._latest["flame_alarm_v2_enabled"] is True
