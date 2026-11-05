#!/usr/bin/env python3
"""Compare two versions of the data and draft a changelog entry.

Typical weekly use (new files already copied into data/, not yet committed):

    python3 scripts/diff_deals.py                  # committed (HEAD) vs working copy
    python3 scripts/diff_deals.py --apply          # ...and add it to data/changelog.json

Other ways to choose the two versions:

    python3 scripts/diff_deals.py --old-ref origin/main
    python3 scripts/diff_deals.py --old-dir backup/data --new-dir data

The output is a single entry in the changelog.json format. The headline and
summary are drafts: edit them before committing.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

import schema as S

# Fields worth mentioning in a change note, in the order we mention them.
DEAL_FIELDS = ("status", "amount_usd_b", "amount_note", "category", "from", "to",
               "date_announced", "summary")
COMPANY_FIELDS = ("name", "kind", "value_usd_b", "value_as_of", "parent_id", "note")


def describe(field: str, old, new) -> str:
    if field == "amount_usd_b" or field == "value_usd_b":
        return f"{field.split('_')[0]} {S.fmt_usd_b(old)} -> {S.fmt_usd_b(new)}"
    if field in ("summary", "note"):
        return f"{field} rewritten"
    return f"{field} {old} -> {new}"


def diff_records(old: list[dict], new: list[dict], fields: tuple, id_key: str):
    old_by = {r["id"]: r for r in old}
    new_by = {r["id"]: r for r in new}
    changes = []
    for rid, rec in new_by.items():
        if rid not in old_by:
            changes.append({id_key: rid, "change": "added", "note": ""})
            continue
        before = old_by[rid]
        diffs = [describe(f, before.get(f), rec.get(f)) for f in fields if before.get(f) != rec.get(f)]
        old_urls = {s.get("url") for s in before.get("sources", [])}
        new_srcs = [s for s in rec.get("sources", []) if s.get("url") not in old_urls]
        if new_srcs:
            diffs.append(f"{len(new_srcs)} new source{'s' if len(new_srcs) > 1 else ''}")
        if diffs:
            changes.append({id_key: rid, "change": "updated", "note": "; ".join(diffs)})
    for rid in old_by:
        if rid not in new_by:
            changes.append({id_key: rid, "change": "removed", "note": ""})
    return changes, old_by, new_by


def deal_label(d: dict, companies: dict) -> str:
    name = lambda cid: companies.get(cid, {}).get("name", cid)  # noqa: E731
    return f"{name(d['from'])} -> {name(d['to'])} {d['category']} ({S.fmt_usd_b(d.get('amount_usd_b'))})"


def build_entry(old: dict, new: dict, on: str) -> dict:
    deal_changes, old_deals, new_deals = diff_records(old["deals"], new["deals"], DEAL_FIELDS, "deal_id")
    co_changes, old_cos, new_cos = diff_records(old["companies"], new["companies"], COMPANY_FIELDS, "company_id")
    all_cos = {**old_cos, **new_cos}

    # Fill in readable notes for added/removed records.
    for ch in deal_changes:
        if ch["change"] == "added":
            d = new_deals[ch["deal_id"]]
            ch["note"] = f"New {d['status']} deal: {deal_label(d, all_cos)}."
        elif ch["change"] == "removed":
            ch["note"] = f"Removed: {deal_label(old_deals[ch['deal_id']], all_cos)}. TODO: say why."
    for ch in co_changes:
        if ch["change"] == "added":
            ch["note"] = f"New company: {new_cos[ch['company_id']]['name']}."
        elif ch["change"] == "removed":
            ch["note"] = f"Removed: {old_cos[ch['company_id']]['name']}. TODO: say why."

    count = lambda cs, kind: sum(1 for c in cs if c["change"] == kind)  # noqa: E731
    parts = []
    for kind, word in (("added", "new"), ("updated", "updated"), ("removed", "removed")):
        n = count(deal_changes, kind)
        if n:
            parts.append(f"{n} {word} deal{'s' if n != 1 else ''}")
    n_new_cos = count(co_changes, "added")
    if n_new_cos:
        parts.append(f"{n_new_cos} new compan{'ies' if n_new_cos != 1 else 'y'}")
    n_vals = sum(1 for c in co_changes if c["change"] == "updated" and "value" in c["note"])
    if n_vals:
        parts.append(f"{n_vals} valuation{'s' if n_vals != 1 else ''} refreshed")
    headline = (", ".join(parts) if parts else "No changes") + "."
    headline = headline[0].upper() + headline[1:]

    # Draft "what changed this week" bullets from the biggest movements.
    summary = [ch["note"] for ch in deal_changes if ch["change"] == "added"]
    summary += [f"{deal_label(new_deals[ch['deal_id']], all_cos)}: {ch['note']}."
                for ch in deal_changes if ch["change"] == "updated" and "status" in ch["note"]]
    summary = summary[:5] or ["TODO: one to three sentences on what mattered this week."]

    return {
        "date": on,
        "headline": headline,
        "summary": summary,
        "changes": deal_changes + co_changes,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    old = ap.add_mutually_exclusive_group()
    old.add_argument("--old-ref", default=None, help="git ref with the old data (default: HEAD)")
    old.add_argument("--old-dir", type=Path, help="folder with the old companies.json and deals.json")
    ap.add_argument("--new-dir", type=Path, default=S.DATA_DIR, help="folder with the new data (default: data/)")
    ap.add_argument("--date", default=date.today().isoformat(), help="entry date (default: today)")
    ap.add_argument("--apply", action="store_true",
                    help="insert the entry at the top of <new-dir>/changelog.json")
    args = ap.parse_args(argv)

    if S.parse_date(args.date) is None:
        ap.error(f"--date {args.date!r} is not a valid date")
    try:
        old_data = S.load_dataset(args.old_dir) if args.old_dir else S.load_dataset_from_git(args.old_ref or "HEAD")
        new_data = S.load_dataset(args.new_dir)
    except Exception as exc:  # noqa: BLE001
        print(f"Could not load data: {exc}", file=sys.stderr)
        return 2

    entry = build_entry(old_data, new_data, args.date)
    print(json.dumps(entry, indent=2, ensure_ascii=False))

    if args.apply:
        if not entry["changes"]:
            print("\nNothing changed; changelog.json left alone.", file=sys.stderr)
            return 0
        path = args.new_dir / "changelog.json"
        log = S.load_json(path)
        log["entries"] = [e for e in log["entries"] if e.get("date") != entry["date"]]
        log["entries"].insert(0, entry)
        path.write_text(json.dumps(log, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"\nAdded entry to {path}. Edit the headline and summary before committing.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
