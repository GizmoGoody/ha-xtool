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
    # P2: Studio's push channel on port 8081 alongside the REST poll
    "p2_push": lambda: (COMPONENT / "protocols" / "rest" / "p2.py").exists(),
    # P2: the poll reads what Studio reads; alarms by Studio's codes; cancelled jobs
    "p2_status": lambda: (COMPONENT / "protocols" / "rest" / "p2.py").exists() and "def describe_alarm" in (COMPONENT / "protocols" / "rest" / "p2.py").read_text(encoding="utf-8"),
    # P2: settings by Studio's keys and names; three fill lights
    "p2_settings": lambda: (COMPONENT / "protocols" / "rest" / "p2_entities.py").exists(),
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
    # The IF2 2.0 fan has one Auto preset; each job sets the Auto speed
    "if2_fan_single_auto": lambda: "FANV3_PRESET_AUTO" in (COMPONENT / "protocols" / "accessories" / "duct_fan.py").read_text(encoding="utf-8"),
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
    # Access control only on the units Studio offers it on (by SKU)
    "access_control_sku": lambda: "access_control_skus" in (COMPONENT / "protocols" / "base.py").read_text(encoding="utf-8"),
    # Auto power-off: the Power switch turns off after Idle or Sleeping for a while
    "auto_power_off": lambda: "class XtoolAutoPowerOff" in (COMPONENT / "number.py").read_text(encoding="utf-8"),
    # A value written from Home Assistant shows at once and is held until the device reports it
    "written_values_held": lambda: "def async_write" in (COMPONENT / "coordinator.py").read_text(encoding="utf-8"),
    # Task ID shows None when the laser has no job
    "task_id_none": lambda: "def task_id_value" in (COMPONENT / "const.py").read_text(encoding="utf-8"),
    # WS-V2 camera: faster photo live view, Idle when nobody watches
    "camera_photo_live_view": lambda: "MAX_SNAPSHOT_AGE" in (COMPONENT / "protocols" / "ws_v2" / "entities.py").read_text(encoding="utf-8"),
    # F2 Ultra UV main camera straightened with the laser calibration
    "camera_calibration": lambda: (COMPONENT / "protocols" / "ws_v2" / "camera_correction.py").exists(),
    # Per-camera thumbnail refresh interval number
    "camera_thumbnail_refresh": lambda: "THUMBNAIL_REFRESH_DEFAULT" in (COMPONENT / "protocols" / "ws_v2" / "entities.py").read_text(encoding="utf-8"),
    # Each camera of a multi-camera laser on its own device; the main
    # camera crop numbers and the xtool.camera action
    "camera_devices": lambda: "_camera_device_info" in (COMPONENT / "protocols" / "ws_v2" / "entities.py").read_text(encoding="utf-8"),
    # F2 Ultra UV focus height control and the xtool.focus action
    "focus_control": lambda: "has_focus_control" in (COMPONENT / "protocols" / "base.py").read_text(encoding="utf-8"),
    # F2 Ultra UV Status: Focusing, Warming up, Laser overheat
    "status_details": lambda: "has_uv_laser_status" in (COMPONENT / "protocols" / "base.py").read_text(encoding="utf-8"),
    # F2 Ultra UV Engraving lens, Wi-Fi signal and Calibration sensors
    "laser_info": lambda: "has_laser_info" in (COMPONENT / "protocols" / "base.py").read_text(encoding="utf-8"),
    # Camera photo requests share one photo per camera instead of queuing
    "camera_no_queue": lambda: "_camera_pending" in (COMPONENT / "protocols" / "ws_v2" / "protocol.py").read_text(encoding="utf-8"),
    # Focus only with the surface lens (the inner engraving lens refuses it)
    "focus_lens": lambda: "the inner engraving lens is in" in (COMPONENT / "protocols" / "ws_v2" / "protocol.py").read_text(encoding="utf-8"),
    # The red dot is assumed on after a V2 laser connects
    "red_dot_assumed_on": lambda: "_assume_red_dot_on" in (COMPONENT / "protocols" / "ws_v2" / "protocol.py").read_text(encoding="utf-8"),
    # IF2 2.0 Alert event (fan stall, cleaning needed)
    "if2_alerts": lambda: '"event": _AccessoryAlertEvent' in (COMPONENT / "protocols" / "accessories" / "entities.py").read_text(encoding="utf-8"),
    # F2 Ultra UV main camera Calibration image
    "calibration_image": lambda: (COMPONENT / "image.py").exists(),
    # A WS-V2 job the laser reports as failed is a Job "failed" event
    "job_failed": lambda: '"failed" if failed else "finished"' in (COMPONENT / "protocols" / "ws_v2" / "protocol.py").read_text(encoding="utf-8"),
    # F2 Ultra UV Last job time from the job result push
    "job_result_time": lambda: "has_job_result_time" in (COMPONENT / "protocols" / "base.py").read_text(encoding="utf-8"),
    # Device registry lookups without the helpers Home Assistant 2026.11 deprecates
    "device_registry_lookup": lambda: "async_entries_for_config_entry" in (COMPONENT / "coordinator.py").read_text(encoding="utf-8"),
    # The WS-V2 poll does not read the settings of a sleeping laser (the read wakes it)
    "sleep_no_slow_reads": lambda: "slow = not asleep" in (COMPONENT / "protocols" / "ws_v2" / "protocol.py").read_text(encoding="utf-8"),
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
