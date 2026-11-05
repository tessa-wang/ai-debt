#!/usr/bin/env python3
"""Validate the site's data files.

Usage:
    python3 scripts/validate.py                    # validate ./data
    python3 scripts/validate.py --data-dir path/   # validate another folder
    python3 scripts/validate.py --previous-ref origin/main
                                                   # also compare with a git ref
    python3 scripts/validate.py --strict           # warnings fail too
    python3 scripts/validate.py --no-todo          # TODO placeholders fail too

Three levels of finding:
    ERROR    breaks the site or the schema. Always fails (exit 1).
    WARNING  suspicious but possibly right (huge amount, status went backwards).
             Fails only with --strict.
    TODO     a placeholder still waiting for real data. Fails only with --no-todo.

Exit codes: 0 = pass, 1 = validation failed, 2 = could not read the files.
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

import schema as S


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.todos: list[str] = []

    def error(self, where: str, msg: str) -> None:
        self.errors.append(f"{where}: {msg}")

    def warn(self, where: str, msg: str) -> None:
        self.warnings.append(f"{where}: {msg}")

    def todo(self, where: str, field: str) -> None:
        self.todos.append(f"{where}: {field}")


def check_fields(rec: dict, spec: dict, where: str, r: Report) -> bool:
    """Check required keys and types. Returns False if the record is unusable."""
    if not isinstance(rec, dict):
        r.error(where, "record is not an object")
        return False
    ok = True
    for key, typ in spec.items():
        if key not in rec:
            r.error(where, f"missing field '{key}'")
            ok = False
        elif not isinstance(rec[key], typ) or isinstance(rec[key], bool):
            r.error(where, f"field '{key}' has wrong type ({type(rec[key]).__name__})")
            ok = False
    for key in rec:
        if key not in spec:
            r.warn(where, f"unknown field '{key}' (typo? it will be ignored by the site)")
    return ok


def check_date(value, where: str, field: str, r: Report, allow_todo: bool = True) -> date | None:
    if allow_todo and S.is_todo(value):
        r.todo(where, field)
        return None
    d = S.parse_date(value)
    if d is None:
        r.error(where, f"'{field}' is not a valid YYYY-MM-DD or YYYY-MM date: {value!r}")
        return None
    if d > date.today() + timedelta(days=1):
        r.warn(where, f"'{field}' is in the future: {value}")
    return d


def check_id(value: str, where: str, r: Report) -> None:
    if not S.ID_RE.match(value):
        r.error(where, f"id {value!r} must be lowercase letters, digits and single hyphens")


def check_companies(companies, r: Report) -> dict:
    if not isinstance(companies, list):
        r.error("companies.json", "'companies' must be a list")
        return {}
    by_id: dict[str, dict] = {}
    for i, c in enumerate(companies):
        where = f"companies[{i}]" + (f" ({c.get('id')})" if isinstance(c, dict) else "")
        if not check_fields(c, S.COMPANY_FIELDS, where, r):
            continue
        check_id(c["id"], where, r)
        if c["id"] in by_id:
            r.error(where, f"duplicate company id '{c['id']}'")
        by_id[c["id"]] = c
        if c["kind"] not in S.COMPANY_KINDS:
            r.error(where, f"kind must be one of {S.COMPANY_KINDS}, got {c['kind']!r}")
        v = c["value_usd_b"]
        if v is not None:
            if v < 0:
                r.error(where, "value_usd_b cannot be negative")
            elif v > 20000:
                r.warn(where, f"value_usd_b {S.fmt_usd_b(v)} looks too large (units?)")
        elif not c["value_note"]:
            r.warn(where, "value_usd_b is null; add a value_note explaining why")
        d = check_date(c["value_as_of"], where, "value_as_of", r)
        if d and d < date.today() - timedelta(days=365):
            r.warn(where, f"valuation is more than a year old ({c['value_as_of']})")
        if not c["name"].strip():
            r.error(where, "name is empty")
        if not c["note"].strip():
            r.warn(where, "note is empty")

    # parent_id must exist, and parents must not form a loop.
    for cid, c in by_id.items():
        parent = c.get("parent_id")
        if parent is None:
            continue
        if parent not in by_id:
            r.error(f"company {cid}", f"parent_id '{parent}' is not a known company id")
            continue
        seen = {cid}
        while parent is not None:
            if parent in seen:
                r.error(f"company {cid}", "parent_id chain forms a loop")
                break
            seen.add(parent)
            parent = by_id.get(parent, {}).get("parent_id")
    return by_id


def check_deals(deals, companies: dict, r: Report) -> dict:
    if not isinstance(deals, list):
        r.error("deals.json", "'deals' must be a list")
        return {}
    by_id: dict[str, dict] = {}
    for i, d in enumerate(deals):
        where = f"deals[{i}]" + (f" ({d.get('id')})" if isinstance(d, dict) else "")
        if not check_fields(d, S.DEAL_FIELDS, where, r):
            continue
        check_id(d["id"], where, r)
        if d["id"] in by_id:
            r.error(where, f"duplicate deal id '{d['id']}'")
        by_id[d["id"]] = d

        for end in ("from", "to"):
            if d[end] not in companies:
                r.error(where, f"'{end}' references unknown company id '{d[end]}'")
        if d["from"] == d["to"]:
            r.error(where, "'from' and 'to' are the same company")
        if d["category"] not in S.CATEGORIES:
            r.error(where, f"category must be one of {S.CATEGORIES}, got {d['category']!r}")
        if d["status"] not in S.STATUSES:
            r.error(where, f"status must be one of {S.STATUSES}, got {d['status']!r}")

        amt = d["amount_usd_b"]
        if amt is not None:
            if amt < 0:
                r.error(where, "amount_usd_b cannot be negative")
            elif amt > S.SUSPICIOUS_AMOUNT_USD_B:
                r.warn(where, f"amount {S.fmt_usd_b(amt)} is over $1T; check the units")
        elif not d["amount_note"]:
            r.warn(where, "amount_usd_b is null; set amount_note (e.g. 'undisclosed')")

        announced = check_date(d["date_announced"], where, "date_announced", r)
        updated = check_date(d["date_updated"], where, "date_updated", r)
        if announced and updated and updated < announced:
            r.error(where, "date_updated is earlier than date_announced")

        summary = d["summary"].strip()
        if not summary:
            r.error(where, "summary is empty")
        elif len(summary) > 280:
            r.warn(where, f"summary is {len(summary)} characters; keep it to one short sentence")

        if not d["sources"]:
            r.error(where, "at least one source is required")
        for j, src in enumerate(d["sources"]):
            sw = f"{where} sources[{j}]"
            if not isinstance(src, dict):
                r.error(sw, "source must be an object")
                continue
            for key in S.SOURCE_FIELDS:
                if key not in src or not isinstance(src[key], str) or not src[key].strip():
                    r.error(sw, f"missing or empty '{key}'")
                elif S.is_todo(src[key]):
                    r.todo(sw, key)
            url = src.get("url", "")
            if isinstance(url, str) and not S.is_todo(url) and not url.startswith(("https://", "http://")):
                r.error(sw, f"url must start with https:// or http://, got {url!r}")
            if isinstance(src.get("date"), str) and not S.is_todo(src["date"]):
                check_date(src["date"], sw, "date", r, allow_todo=False)

    # The same pair and category twice is often an accidental duplicate.
    triples = Counter((d["from"], d["to"], d["category"]) for d in by_id.values())
    for (f, t, cat), n in triples.items():
        if n > 1:
            r.warn("deals.json", f"{n} '{cat}' deals from {f} to {t}; check they are not duplicates")
    return by_id


def check_changelog(log, companies: dict, deals: dict, r: Report) -> None:
    entries = log.get("entries") if isinstance(log, dict) else None
    if not isinstance(entries, list):
        r.error("changelog.json", "top level must be {\"entries\": [...]}")
        return
    seen_dates = set()
    for i, e in enumerate(entries):
        where = f"changelog[{i}]"
        if not isinstance(e, dict):
            r.error(where, "entry must be an object")
            continue
        if check_date(e.get("date"), where, "date", r, allow_todo=False) and e["date"] in seen_dates:
            r.warn(where, f"two changelog entries share the date {e['date']}")
        seen_dates.add(e.get("date"))
        if not isinstance(e.get("headline"), str) or not e["headline"].strip():
            r.error(where, "headline is required")
        if "summary" in e and not (isinstance(e["summary"], list) and all(isinstance(s, str) for s in e["summary"])):
            r.error(where, "summary, if present, must be a list of strings")
        changes = e.get("changes")
        if not isinstance(changes, list):
            r.error(where, "changes must be a list")
            continue
        for j, ch in enumerate(changes):
            cw = f"{where} changes[{j}]"
            if not isinstance(ch, dict):
                r.error(cw, "change must be an object")
                continue
            keys = [k for k in ("deal_id", "company_id") if k in ch]
            if len(keys) != 1:
                r.error(cw, "needs exactly one of 'deal_id' or 'company_id'")
                continue
            if ch.get("change") not in S.CHANGE_TYPES:
                r.error(cw, f"change must be one of {S.CHANGE_TYPES}")
            if not isinstance(ch.get("note", ""), str):
                r.error(cw, "note must be a string")
            # Removed records are gone, so only check ids for added/updated.
            known = deals if keys[0] == "deal_id" else companies
            if ch.get("change") != "removed" and ch[keys[0]] not in known:
                r.warn(cw, f"{keys[0]} '{ch[keys[0]]}' is not in the current data")


def check_meta(meta, r: Report) -> None:
    if not isinstance(meta, dict):
        r.error("meta.json", "must be an object")
        return
    check_date(meta.get("last_updated"), "meta.json", "last_updated", r, allow_todo=False)
    if meta.get("schema_version") != S.SCHEMA_VERSION:
        r.error("meta.json", f"schema_version must be {S.SCHEMA_VERSION}")


def check_layout(layout, companies: dict, r: Report) -> None:
    anchors = layout.get("anchors") if isinstance(layout, dict) else None
    if not isinstance(anchors, dict):
        r.error("layout.json", "must contain an 'anchors' object")
        return
    for cid, pos in anchors.items():
        if cid not in companies:
            r.warn("layout.json", f"anchor for unknown company '{cid}' (will be ignored)")
        if not (isinstance(pos, dict) and all(isinstance(pos.get(k), (int, float)) and 0 <= pos[k] <= 1 for k in ("x", "y"))):
            r.error("layout.json", f"anchor '{cid}' needs x and y between 0 and 1")


def check_against_previous(prev: dict, deals: dict, r: Report) -> None:
    """Flag status changes that go backwards, and deals that vanished."""
    prev_deals = {d["id"]: d for d in prev["deals"] if isinstance(d, dict) and "id" in d}
    for did, old in prev_deals.items():
        new = deals.get(did)
        if new is None:
            r.warn(f"deal {did}", "was removed; record it in the changelog as 'removed'")
            continue
        a, b = old.get("status"), new.get("status")
        if a == "cancelled" and b != "cancelled":
            r.warn(f"deal {did}", f"status went from cancelled back to {b}")
        elif a in S.STATUS_RANK and b in S.STATUS_RANK and S.STATUS_RANK[b] < S.STATUS_RANK[a]:
            r.warn(f"deal {did}", f"status went backwards: {a} -> {b}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data-dir", type=Path, default=S.DATA_DIR)
    prev = ap.add_mutually_exclusive_group()
    prev.add_argument("--previous-dir", type=Path, help="folder with the previous companies/deals.json")
    prev.add_argument("--previous-ref", help="git ref with the previous data, e.g. origin/main")
    ap.add_argument("--strict", action="store_true", help="treat warnings as failures")
    ap.add_argument("--no-todo", action="store_true", help="treat TODO placeholders as failures")
    ap.add_argument("-q", "--quiet", action="store_true", help="don't list each TODO")
    args = ap.parse_args(argv)

    r = Report()
    files = {}
    for name in ("companies", "deals", "changelog", "meta", "layout"):
        path = args.data_dir / f"{name}.json"
        try:
            files[name] = S.load_json(path)
        except FileNotFoundError:
            print(f"FAIL  cannot find {path}")
            return 2
        except ValueError as exc:
            print(f"FAIL  {path} is not valid JSON: {exc}")
            return 2

    companies = check_companies(files["companies"].get("companies"), r)
    deals = check_deals(files["deals"].get("deals"), companies, r)
    check_changelog(files["changelog"], companies, deals, r)
    check_meta(files["meta"], r)
    check_layout(files["layout"], companies, r)

    if args.previous_dir or args.previous_ref:
        try:
            previous = (S.load_dataset(args.previous_dir) if args.previous_dir
                        else S.load_dataset_from_git(args.previous_ref))
            check_against_previous(previous, deals, r)
        except Exception as exc:  # noqa: BLE001 - report and carry on
            r.warn("previous data", f"could not load it for comparison ({exc})")

    print(f"Checked {len(companies)} companies and {len(deals)} deals in {args.data_dir}\n")
    for e in r.errors:
        print(f"ERROR    {e}")
    for w in r.warnings:
        print(f"WARNING  {w}")
    if r.todos:
        if args.quiet:
            print(f"TODO     {len(r.todos)} placeholder fields (run without -q to list them)")
        else:
            for t in r.todos:
                print(f"TODO     {t}")

    failed = bool(r.errors) or (args.strict and r.warnings) or (args.no_todo and r.todos)
    print(f"\n{len(r.errors)} errors, {len(r.warnings)} warnings, {len(r.todos)} TODOs")
    print("FAIL" if failed else "PASS")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
