"""Tests for the F2 Ultra UV Status details (Focusing, Warming up,
Interrupted, Laser overheat) and the Continue / Discard buttons.

Each comes from the same read or push xTool Studio uses.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError

from custom_components.xtool.const import XtoolStatus
from custom_components.xtool.protocols.base import XtoolDeviceState

from .conftest import build_coordinator
from .features import COMPONENT, requires

pytestmark = requires("status_details")


def _f2uv():
    from custom_components.xtool.protocols import DEVICE_MODELS

    return next(
        m for m in DEVICE_MODELS.values()
        if m.model_id == "F2UltraUV" and m.protocol_version == "V2"
    )


def _protocol():
    from custom_components.xtool.protocols.ws_v2.protocol import WSV2Protocol

    proto = WSV2Protocol("192.0.2.10")
    proto.request = AsyncMock(return_value={})
    proto._model = _f2uv()
    return proto


def _push(proto, url, module, typ, info=""):
    proto._dispatch_push({"url": url, "data": {"module": module, "type": typ, "info": info}})


def _status(proto, base=XtoolStatus.IDLE):
    proto._latest["status"] = base
    state = XtoolDeviceState()
    proto._apply_latest_to_state(state)
    return state.status


def test_autofocus_shows_focusing() -> None:
    proto = _protocol()
    _push(proto, "/device/status", "STATUS_CONTROLLER", "FOCUS_STARTED", "Z")
    assert _status(proto) == XtoolStatus.FOCUSING
    _push(proto, "/device/status", "STATUS_CONTROLLER", "FOCUS_FINISHED", "Z")
    assert _status(proto) == XtoolStatus.IDLE
    _push(proto, "/device/status", "STATUS_CONTROLLER", "FOCUS_STARTED", "Z")
    _push(proto, "/device/status", "STATUS_CONTROLLER", "FOCUS_STOPED", "Button")
    assert _status(proto) == XtoolStatus.IDLE


def test_focusing_ends_if_the_finish_push_is_missed(monkeypatch) -> None:
    from custom_components.xtool.protocols.ws_v2 import protocol as module

    proto = _protocol()
    _push(proto, "/device/status", "STATUS_CONTROLLER", "FOCUS_STARTED", "Z")
    later = proto._focusing_since + module.FOCUSING_TIMEOUT + 1
    monkeypatch.setattr(module.time, "monotonic", lambda: later)
    assert _status(proto) == XtoolStatus.IDLE


def test_uv_laser_not_ready_shows_warming_up() -> None:
    proto = _protocol()
    _push(proto, "/laser_head/status", "LASER_HEAD", "UV_PREPARE")
    assert _status(proto) == XtoolStatus.WARMING_UP
    # Only while idle: a job or an error keeps its own status.
    assert _status(proto, XtoolStatus.PROCESSING) == XtoolStatus.PROCESSING
    assert _status(proto, XtoolStatus.ERROR_LIMIT) == XtoolStatus.ERROR_LIMIT
    _push(proto, "/laser_head/status", "LASER_HEAD", "UV_READY")
    assert _status(proto) == XtoolStatus.IDLE


def test_laser_overheat_wins_until_it_recovers() -> None:
    proto = _protocol()
    _push(proto, "/laser_head/alarm", "LASER_HEAD", "TMP_HIGH")
    assert _status(proto) == XtoolStatus.LASER_OVERHEAT
    assert _status(proto, XtoolStatus.PROCESSING) == XtoolStatus.LASER_OVERHEAT
    _push(proto, "/laser_head/alarm", "LASER_HEAD", "TMP_RECOVER")
    assert _status(proto) == XtoolStatus.IDLE


def test_details_never_stick_when_no_base_status_is_known() -> None:
    proto = _protocol()
    _push(proto, "/laser_head/alarm", "LASER_HEAD", "TMP_HIGH")
    state = XtoolDeviceState()
    proto._apply_latest_to_state(state)
    assert state.status == XtoolStatus.LASER_OVERHEAT
    _push(proto, "/laser_head/alarm", "LASER_HEAD", "TMP_RECOVER")
    proto._apply_latest_to_state(state)
    assert state.status == XtoolStatus.UNKNOWN


async def test_reads_as_studio_at_connect() -> None:
    proto = _protocol()

    async def request(url, method="GET", params=None, data=None, timeout=None):
        if url == "/v1/device/uv-laser":
            return {"uv_ready": "0"}
        if url == "/v1/processing/powerResume":
            assert params == {"action": "query"}
            return {"status": True}
        return {}

    proto.request = AsyncMock(side_effect=request)
    await proto._poll_status_reads()
    assert proto._status_reads_known is True
    # An interrupted job shows before a cold UV laser.
    assert _status(proto) == XtoolStatus.INTERRUPTED
    proto._power_resume = False
    assert _status(proto) == XtoolStatus.WARMING_UP


async def test_reads_happen_until_known_then_slowly() -> None:
    proto = _protocol()
    proto._connected = True
    proto._poll_status_reads = AsyncMock()
    proto._poll_counter = 1
    await proto.poll_state(XtoolDeviceState())
    proto._poll_status_reads.assert_awaited_once()
    proto._status_reads_known = True
    proto._poll_status_reads.reset_mock()
    proto._poll_counter = 1
    await proto.poll_state(XtoolDeviceState())
    proto._poll_status_reads.assert_not_awaited()


@pytest.mark.parametrize(("action", "wire"), [("continue", "start"), ("discard", "cancel")])
async def test_power_resume_buttons(hass: HomeAssistant, action: str, wire: str) -> None:
    coordinator = build_coordinator(hass, _f2uv())
    buttons = {
        b.unique_id.rsplit("_power_resume_", 1)[-1]: b
        for b in coordinator.build_buttons()
        if "power_resume" in (b.unique_id or "")
    }
    assert set(buttons) == {"continue", "discard"}
    button = buttons[action]
    proto = _protocol()
    coordinator.protocol = proto
    proto._power_resume = False
    assert button.available is False
    with pytest.raises(HomeAssistantError):
        await button.async_press()
    proto._power_resume = True
    proto.request = AsyncMock(return_value={})
    coordinator.async_request_refresh = AsyncMock()
    await button.async_press()
    proto.request.assert_awaited_once_with(
        "/v1/processing/powerResume", "PUT", params={"action": wire}, timeout=15.0,
    )
    assert proto._power_resume is False


def test_a_job_start_clears_the_interrupted_job() -> None:
    proto = _protocol()
    proto._power_resume = True
    _push(proto, "/device/status", "STATUS_CONTROLLER", "WORK_STARTED", "")
    assert proto._power_resume is False


def test_only_the_uv_models_have_these() -> None:
    from custom_components.xtool.protocols import DEVICE_MODELS

    for key, model in DEVICE_MODELS.items():
        uv = model.model_id.startswith("F2UltraUV") and model.protocol_version == "V2"
        assert getattr(model, "has_uv_laser_status", False) is uv, key
        assert getattr(model, "has_power_resume", False) is uv, key


@pytest.mark.parametrize(
    "path", ["strings.json", "translations/en.json", "translations/de.json"],
)
def test_translated(path: str) -> None:
    data = json.loads((COMPONENT / path).read_text(encoding="utf-8"))["entity"]
    states = data["sensor"]["status"]["state"]
    assert {"focusing", "warming_up", "interrupted", "laser_overheat"} <= set(states)
    assert {"power_resume_continue", "power_resume_discard"} <= set(data["button"])
