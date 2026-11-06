"""Shared constants and helpers for the data scripts.

Kept in one place so validate.py, diff_deals.py and docs/DATA_SCHEMA.md
agree on what a valid record looks like. Standard library only.
"""

from __future__ import annotations

import json
import re
import subprocess
from datetime import date
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"

SCHEMA_VERSION = 1

TODO = "TODO"

COMPANY_KINDS = ("public", "private", "ai_lab")
CATEGORIES = ("chips", "investment", "cloud", "financing")
STATUSES = ("reported", "announced", "signed", "closed", "cancellable", "cancelled")
CHANGE_TYPES = ("added", "updated", "removed")

# How far along a deal is. Used to spot a deal that moves backwards
# (e.g. closed -> announced), which is usually a data-entry mistake.
# "cancellable" and "cancelled" are outside this ladder on purpose.
STATUS_RANK = {"reported": 0, "announced": 1, "signed": 2, "closed": 3}

ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
DATE_RE = re.compile(r"^(\d{4})-(\d{2})(?:-(\d{2}))?$")

# Amounts are in billions of US dollars; anything above this is almost
# certainly a units mistake (e.g. millions typed as billions).
SUSPICIOUS_AMOUNT_USD_B = 1000

COMPANY_FIELDS = {
    "id": str,
    "name": str,
    "kind": str,
    "value_usd_b": (int, float, type(None)),
    "value_as_of": str,
    "value_note": (str, type(None)),
    "parent_id": (str, type(None)),
    "note": str,
}

DEAL_FIELDS = {
    "id": str,
    "from": str,
    "to": str,
    "category": str,
    "amount_usd_b": (int, float, type(None)),
    "amount_note": (str, type(None)),
    "status": str,
    "date_announced": str,
    "date_updated": str,
    "summary": str,
    "sources": list,
}

SOURCE_FIELDS = ("title", "publisher", "url", "date")


def parse_date(value: str) -> date | None:
    """Parse YYYY-MM-DD or YYYY-MM (treated as the 1st). None if invalid."""
    if not isinstance(value, str):
        return None
    m = DATE_RE.match(value)
    if not m:
        return None
    year, month, day = int(m[1]), int(m[2]), int(m[3] or 1)
    try:
        return date(year, month, day)
    except ValueError:
        return None


def is_todo(value) -> bool:
    return isinstance(value, str) and value.strip().upper().startswith(TODO)


def load_json(path: Path):
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def load_dataset(data_dir: Path) -> dict:
    """Load companies/deals from a directory. Missing files raise."""
    return {
        "companies": load_json(data_dir / "companies.json")["companies"],
        "deals": load_json(data_dir / "deals.json")["deals"],
    }


def load_dataset_from_git(ref: str) -> dict:
    """Load companies/deals as they were at a git ref (e.g. HEAD, origin/main)."""

    def show(name: str):
        out = subprocess.run(
            ["git", "show", f"{ref}:data/{name}.json"],
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
            text=True,
        ).stdout
        return json.loads(out)

    return {
        "companies": show("companies")["companies"],
        "deals": show("deals")["deals"],
    }


def fmt_usd_b(value) -> str:
    """Format a billions figure the same way the site does: $850B, $1.25T."""
    if value is None:
        return "undisclosed"
    if value >= 1000:
        return f"${value / 1000:.3g}T"
    return f"${value:g}B"
