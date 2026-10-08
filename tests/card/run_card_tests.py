"""Run the xTool card's test pages in a headless browser.

Each page in this folder loads the card with stand-ins for the Home Assistant
frontend (stand-ins.js), checks it, and writes the results into
<pre id="report" data-result="pass|fail">. This opens every page in headless
Chrome (or Chromium or Edge), prints the results and exits with 1 on any
failure.

Usage: python tests/card/run_card_tests.py
Set CHROME to the browser's path if it is not found.
"""
from __future__ import annotations

import html
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
BROWSERS = (
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
)


def find_browser() -> str:
    """Return the path of a Chromium-based browser."""
    for name in (os.environ.get("CHROME"), *BROWSERS):
        if name and (path := shutil.which(name) or (name if Path(name).is_file() else None)):
            return path
    sys.exit("No Chrome, Chromium or Edge found; set CHROME to its path")


def run_page(browser: str, page: Path) -> tuple[str, str]:
    """Open a page and return its result and report."""
    out = subprocess.run(
        [
            browser,
            "--headless",
            "--disable-gpu",
            "--no-sandbox",
            "--allow-file-access-from-files",
            "--virtual-time-budget=10000",
            "--dump-dom",
            page.resolve().as_uri(),
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=180,
        check=False,
    ).stdout
    match = re.search(r'<pre id="report" data-result="(\w+)">(.*?)</pre>', out, re.S)
    if not match:
        return "fail", "The page did not produce a report"
    return match.group(1), html.unescape(match.group(2))


def main() -> int:
    browser = find_browser()
    failed = False
    for page in sorted(HERE.glob("*.html")):
        result, report = run_page(browser, page)
        print(f"== {page.name}: {result}")
        for line in report.splitlines():
            if result != "pass" or line.startswith("FAIL"):
                print(f"   {line}")
        if result != "pass":
            failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
