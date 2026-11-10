"""The daily run, called by .github/workflows/daily.yml.

    python -m tracker.run            # fetch, build, status, issue
    python -m tracker.run --no-issue # same, without touching GitHub Issues

1. Call every source and save what it returns in data/raw/<date>/<source>.<format>.gz.
   A second run on the same day first deletes that day's raw files, so they are replaced.
   A failed source writes no raw file; every result is recorded in data/source_log.csv.
2. Rebuild data/history.csv from all the raw files.
3. Write data/status.json.
4. Open (or update) the GitHub issue for the date and close the previous one.
The workflow then commits the data files.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import gzip
import os
import pathlib
import shutil
import time

from . import build as build_mod
from .issue import publish
from .moves import compute_moves, issue_body
from .sources import convert, download, source_format, source_names, source_url
from .status import make_status, write_status

SOURCE_LOG = build_mod.DATA / "source_log.csv"
LOG_COLUMNS = ["date", "run_time", "source", "ok", "count", "bytes", "error"]


# Seconds to wait between two requests to the same site, so the run does not look like a flood.
PAUSE = 2.0


def fetch_all(date: str, raw_dir: pathlib.Path = build_mod.RAW, downloader=download,
              names: list[str] | None = None, pause: float | None = None) -> list[dict]:
    """Download every source into raw_dir/<date>/. One failure never stops the others."""
    if pause is None:
        pause = PAUSE if downloader is download else 0.0
    day = raw_dir / date
    if day.exists():  # a second run on the same day replaces that day's raw files
        shutil.rmtree(day)
    day.mkdir(parents=True)
    results = []
    for i, name in enumerate(names or source_names()):
        if i and pause:
            time.sleep(pause)
        result = {"name": name, "ok": False, "count": 0, "bytes": 0, "error": ""}
        try:
            body = downloader(source_url(name))
            rows = convert(name, body, date)
            if not rows:
                raise ValueError("page downloaded but no prices were found in it")
            (day / f"{name}.{source_format(name)}.gz").write_bytes(gzip.compress(body, mtime=0))
            result.update(ok=True, count=len(rows), bytes=len(body))
        except Exception as exc:  # noqa: BLE001 - record the failure and move on
            result["error"] = str(exc)[:300]
        results.append(result)
        print(f"{name:12s} {'ok ' if result['ok'] else 'FAIL'} {result['count']:4d} {result['error']}")
    if not any(day.iterdir()):
        day.rmdir()
    return results


def log_sources(date: str, run_time: str, results: list[dict], path: pathlib.Path = SOURCE_LOG):
    """Append every source result to data/source_log.csv (replacing earlier runs of the same date)."""
    rows = []
    if path.exists():
        with path.open(newline="", encoding="utf-8") as fh:
            rows = [r for r in csv.DictReader(fh) if r["date"] != date]
    rows += [{"date": date, "run_time": run_time, "source": r["name"], "ok": str(r["ok"]).lower(),
              "count": r["count"], "bytes": r["bytes"], "error": r["error"]} for r in results]
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=LOG_COLUMNS, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-issue", action="store_true", help="do not open a GitHub issue")
    args = ap.parse_args(argv)

    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    date, run_time = now.date().isoformat(), now.isoformat().replace("+00:00", "Z")
    print(f"run {run_time} (UTC date {date})")

    results = fetch_all(date)
    log_sources(date, run_time, results)
    rows = build_mod.build()
    status = make_status(run_time, rows, results)
    write_status(status)
    print(f"history: {len(rows)} rows; status: {status['items']} items today, "
          f"{status['days_with_success']} days with data")

    if not args.no_issue:
        try:
            site = os.environ.get("SITE_URL")
            body = issue_body(compute_moves(rows), status, site)
            print(publish(date, body))
        except Exception as exc:  # noqa: BLE001 - the data must still be committed
            print(f"warning: could not publish the issue: {exc}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
