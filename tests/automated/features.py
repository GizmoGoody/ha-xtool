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

FEATURES: dict[str, Callable[[], bool]] = {
    # Issue #13: switch and binary sensor icons follow the entity state
    "icon_translations": lambda: (COMPONENT / "icons.json").exists(),
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
