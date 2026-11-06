"""Detect which features the branch under test contains.

The tests live on the ci branch and run against any branch's integration
code. Each test module is marked with the features it needs and is skipped
on branches that do not have them.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

import pytest

COMPONENT = Path("custom_components/xtool")


def _imports_protocols_first() -> bool:
    text = (COMPONENT / "__init__.py").read_text(encoding="utf-8")
    protocols = text.find("from .protocols import")
    coordinator = text.find("from .coordinator import")
    return -1 < protocols < coordinator


FEATURES: dict[str, Callable[[], bool]] = {
    # The first import of the package succeeds (no circular import)
    "clean_first_import": _imports_protocols_first,
    # Issue #13: switch and binary sensor icons follow the entity state
    "icon_translations": lambda: (COMPONENT / "icons.json").exists(),
    # The config poll reads Stops when moved the same way as the push
    "stops_when_moved_poll": lambda: 'self._latest["stops_when_moved"] = wm == "HANDLE"'
    not in (COMPONENT / "protocols" / "ws_v2" / "protocol.py").read_text(encoding="utf-8"),
    # The config read lists the keys it wants (F-series firmware needs that)
    "config_read_key_list": lambda: "CONFIG_READ_KEYS" in (COMPONENT / "protocols" / "ws_v2" / "protocol.py").read_text(encoding="utf-8"),
    # Issue #4: the IF2 2.0 fan is one fan entity using Studio's setFanGearV3 commands
    "if2_fan_v3": lambda: "def fan_v3_manual_mcode" in (COMPONENT / "protocols" / "accessories" / "duct_fan.py").read_text(encoding="utf-8"),
    # Issue #4: IF2 device page shows its firmware (and the post-run sensor has a name)
    "accessory_firmware_on_device": lambda: "def _firmware_version" in (COMPONENT / "protocols" / "accessories" / "entities.py").read_text(encoding="utf-8"),
    # Issue #4: fill-light brightness converts through Studio's 1-100 percentage
    "fill_light_studio_percent": lambda: "def _js_round" in (COMPONENT / "protocols" / "ws_v2" / "entities.py").read_text(encoding="utf-8"),
    # Issue #4: the update entity compares normalized versions; the device page follows the firmware
    "firmware_version_normalized": lambda: "parse_firmware_version" in (COMPONENT / "update.py").read_text(encoding="utf-8"),
    # Issue #4: the laser identity is read again after a reconnect and an empty machineInfo is retried
    "device_info_refetch": lambda: "self._device_info_fetched = False" in (COMPONENT / "protocols" / "ws_v2" / "coordinator.py").read_text(encoding="utf-8"),
    # Issue #4: after a restart the firmware version starts from the device page
    "firmware_from_device_page": lambda: "def _last_firmware_version" in (COMPONENT / "__init__.py").read_text(encoding="utf-8"),
    # Issue #4: F2 Ultra UV exhaust fan install state, and the fan assumed off on connect
    "exhaust_fan_install_state": lambda: "has_smoking_fan_install_state" in (COMPONENT / "protocols" / "base.py").read_text(encoding="utf-8"),
    # Issue #4: working time from machineInfo when statistics has none
    "working_time_from_machine_info": lambda: "def _latch_worktime" in (COMPONENT / "protocols" / "ws_v2" / "protocol.py").read_text(encoding="utf-8"),
    # Issue #4: F2 Ultra UV shows no MAC instead of machineInfo's wrong one
    "no_wrong_mac": lambda: "has_wrong_machine_info_mac" in (COMPONENT / "protocols" / "base.py").read_text(encoding="utf-8"),
    # Task ID shows None when the laser has no job
    "task_id_none": lambda: "def task_id_value" in (COMPONENT / "const.py").read_text(encoding="utf-8"),
    # WS-V2 camera: faster photo live view, Idle when nobody watches
    "camera_photo_live_view": lambda: "MAX_SNAPSHOT_AGE" in (COMPONENT / "protocols" / "ws_v2" / "entities.py").read_text(encoding="utf-8"),
    # F2 Ultra UV main camera straightened with the laser calibration
    "camera_calibration": lambda: (COMPONENT / "protocols" / "ws_v2" / "camera_correction.py").exists(),
    # Per-camera thumbnail refresh interval number
    "camera_thumbnail_refresh": lambda: "THUMBNAIL_REFRESH_DEFAULT" in (COMPONENT / "protocols" / "ws_v2" / "entities.py").read_text(encoding="utf-8"),
    # The dashboard card and its tile features
    "dashboard_card": lambda: (COMPONENT / "frontend" / "xtool-card.js").exists(),
}


def has(name: str) -> bool:
    """Return True if the branch under test has the feature."""
    return FEATURES[name]()


def requires(*names: str) -> pytest.MarkDecorator:
    """Skip unless the branch under test has every named feature."""
    missing = [name for name in names if not has(name)]
    return pytest.mark.skipif(
        bool(missing), reason=f"branch lacks {', '.join(missing)}"
    )
