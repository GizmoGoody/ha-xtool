"""Tests for serving the xTool dashboard card."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from .features import COMPONENT, has, requires

pytestmark = requires("dashboard_card")

if has("dashboard_card"):
    from custom_components.xtool import async_remove_entry
    from custom_components.xtool.card import (
        CARD_FILE,
        CARD_URL,
        async_register_card,
        async_remove_card_resource,
    )
    from custom_components.xtool.const import DOMAIN

OTHER = {"id": "other", "type": "module", "url": "/hacsfiles/other-card.js"}


class FakeResources:
    """Behaves like the dashboards' resource collection (storage mode)."""

    def __init__(self, items: list[dict] | None = None) -> None:
        self.loaded = False
        self.items = {item["id"]: dict(item) for item in items or []}
        self.writes = 0

    async def async_load(self) -> None:
        pass

    def async_items(self) -> list[dict]:
        assert self.loaded, "the collection must be loaded first"
        return list(self.items.values())

    async def async_create_item(self, data: dict) -> dict:
        item = {"id": f"id{len(self.items)}", "type": data["res_type"], "url": data["url"]}
        self.items[item["id"]] = item
        self.writes += 1
        return item

    async def async_update_item(self, item_id: str, updates: dict) -> dict:
        self.items[item_id].update(type=updates["res_type"], url=updates["url"])
        self.writes += 1
        return self.items[item_id]

    async def async_delete_item(self, item_id: str) -> None:
        del self.items[item_id]
        self.writes += 1


@pytest.fixture
def frontend(hass: HomeAssistant):
    """Dashboards are set up: the card can be served."""
    hass.config.components.add("frontend")
    hass.http = MagicMock(async_register_static_paths=AsyncMock())
    with patch("homeassistant.components.frontend.add_extra_js_url") as add_url:
        yield add_url


def card_resources(resources: FakeResources) -> list[dict]:
    return [item for item in resources.items.values() if item["url"].startswith(CARD_URL)]


def test_manifest_loads_after_the_frontend() -> None:
    """The card needs the frontend, but the integration also works without it."""
    manifest = json.loads((COMPONENT / "manifest.json").read_text(encoding="utf-8"))
    assert {"frontend", "http", "lovelace"} <= set(manifest.get("after_dependencies", []))


async def test_card_added_to_dashboard_resources(hass: HomeAssistant, frontend: MagicMock) -> None:
    """The file is served and added to the dashboard resources with a content hash."""
    resources = FakeResources([OTHER])
    hass.data["lovelace"] = SimpleNamespace(resources=resources)
    await async_register_card(hass)

    (path,) = hass.http.async_register_static_paths.call_args.args[0]
    assert path.url_path == CARD_URL
    assert Path(path.path) == CARD_FILE and CARD_FILE.is_file()
    (ours,) = card_resources(resources)
    assert ours["type"] == "module" and ours["url"].startswith(f"{CARD_URL}?v=")
    assert resources.items["other"] == OTHER  # other resources untouched
    frontend.assert_not_called()  # not also loaded on every page


async def test_card_resource_updated_and_kept_single(hass: HomeAssistant, frontend: MagicMock) -> None:
    """An older version is updated, extra copies removed; the same version is left alone."""
    resources = FakeResources([
        {"id": "a", "type": "js", "url": f"{CARD_URL}?v=old"},
        {"id": "b", "type": "module", "url": f"{CARD_URL}?v=older"},
        OTHER,
    ])
    hass.data["lovelace"] = SimpleNamespace(resources=resources)
    await async_register_card(hass)
    (ours,) = card_resources(resources)
    assert ours["id"] == "a" and ours["type"] == "module" and ours["url"] != f"{CARD_URL}?v=old"

    writes = resources.writes
    await async_register_card(hass)
    assert resources.writes == writes  # nothing to change


async def test_card_resource_in_older_home_assistant(hass: HomeAssistant, frontend: MagicMock) -> None:
    """Older Home Assistant versions keep the collection in a dict."""
    resources = FakeResources()
    hass.data["lovelace"] = {"resources": resources}
    await async_register_card(hass)
    assert len(card_resources(resources)) == 1
    frontend.assert_not_called()


async def test_card_on_every_page_when_resources_are_yaml(hass: HomeAssistant, frontend: MagicMock) -> None:
    """Resources defined in YAML cannot be edited: the card is loaded on every page."""
    hass.data["lovelace"] = SimpleNamespace(resources=SimpleNamespace(loaded=True, async_items=list))
    await async_register_card(hass)
    url = frontend.call_args.args[1]
    assert url.startswith(f"{CARD_URL}?v=") and len(url) > len(CARD_URL) + 3


async def test_card_on_every_page_when_resources_fail(
    hass: HomeAssistant, frontend: MagicMock, caplog: pytest.LogCaptureFixture
) -> None:
    """If the resource collection fails, setup goes on and the card is loaded on every page."""
    resources = FakeResources()
    resources.async_create_item = AsyncMock(side_effect=RuntimeError("changed"))
    hass.data["lovelace"] = SimpleNamespace(resources=resources)
    await async_register_card(hass)
    frontend.assert_called_once()
    assert "Could not update the xTool card's dashboard resource" in caplog.text


async def test_card_skipped_without_frontend(hass: HomeAssistant) -> None:
    """Without dashboards there is nothing to serve, and setup still works."""
    assert "frontend" not in hass.config.components
    with patch("homeassistant.components.frontend.add_extra_js_url") as add_url:
        await async_register_card(hass)
    add_url.assert_not_called()


async def test_card_resource_removed_with_last_laser(hass: HomeAssistant) -> None:
    """Removing the last laser removes the card's resource, and only it."""
    resources = FakeResources([{"id": "a", "type": "module", "url": f"{CARD_URL}?v=1"}, OTHER])
    hass.data["lovelace"] = SimpleNamespace(resources=resources)
    first = MockConfigEntry(domain=DOMAIN, unique_id="first")
    second = MockConfigEntry(domain=DOMAIN, unique_id="second")
    first.add_to_hass(hass)
    second.add_to_hass(hass)

    await async_remove_entry(hass, first)
    assert len(card_resources(resources)) == 1  # another laser still uses it

    await hass.config_entries.async_remove(first.entry_id)
    await async_remove_entry(hass, second)
    assert card_resources(resources) == []
    assert resources.items["other"] == OTHER

    await async_remove_card_resource(hass)  # nothing left to remove: no error
