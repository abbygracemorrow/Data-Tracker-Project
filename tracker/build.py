"""Build data/history.csv from the raw files alone.

    python -m tracker.build

Reads every data/raw/<date>/<source>.<format>.gz, converts each one with the rules in
tracker/sources.py, and writes the rows sorted by date, then item_id. Running it twice
produces the same file, and a change to a rule is applied to every day of the history.
"""
from __future__ import annotations

import csv
import gzip
import io
import pathlib
import re

from .sources import COLUMNS, convert

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
RAW = DATA / "raw"
HISTORY = DATA / "history.csv"

_DATE_DIR = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def raw_files(raw_dir: pathlib.Path = RAW) -> list[tuple[str, str, pathlib.Path]]:
    """[(date, source, path)] for every raw file, in date then source order."""
    out = []
    if not raw_dir.exists():
        return out
    for day in sorted(p for p in raw_dir.iterdir() if p.is_dir() and _DATE_DIR.match(p.name)):
        for f in sorted(day.glob("*.gz")):
            source = f.name.split(".")[0]
            out.append((day.name, source, f))
    return out


def raw_dates(raw_dir: pathlib.Path = RAW) -> list[str]:
    """Dates that have at least one raw file."""
    return sorted({d for d, _, _ in raw_files(raw_dir)})


def build_rows(raw_dir: pathlib.Path = RAW) -> list[dict]:
    """Convert every raw file, day by day, into history rows."""
    rows = []
    for date, source, path in raw_files(raw_dir):
        try:
            rows.extend(convert(source, gzip.decompress(path.read_bytes()), date))
        except Exception as exc:  # noqa: BLE001 - one bad file must not stop the build
            print(f"warning: could not convert {path}: {exc}")
    rows.sort(key=lambda r: (r["date"], r["item_id"]))
    return rows


def to_csv(rows: list[dict]) -> str:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=COLUMNS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue()


def build(raw_dir: pathlib.Path = RAW, history: pathlib.Path = HISTORY) -> list[dict]:
    rows = build_rows(raw_dir)
    history.parent.mkdir(parents=True, exist_ok=True)
    history.write_text(to_csv(rows), encoding="utf-8")
    return rows


def read_history(history: pathlib.Path = HISTORY) -> list[dict]:
    if not history.exists():
        return []
    with history.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


if __name__ == "__main__":
    built = build()
    print(f"wrote {HISTORY.relative_to(ROOT)}: {len(built)} rows, "
          f"{len({r['date'] for r in built})} days")
