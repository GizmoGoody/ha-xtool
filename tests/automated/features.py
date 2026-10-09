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
