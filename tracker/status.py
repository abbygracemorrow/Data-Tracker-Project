"""Write data/status.json, which describes the latest run."""
from __future__ import annotations

import json
import pathlib

from .build import DATA, RAW, raw_dates
from .moves import compute_moves

STATUS = DATA / "status.json"


def make_status(run_time: str, rows: list[dict], sources: list[dict],
                raw_dir: pathlib.Path = RAW) -> dict:
    dates = raw_dates(raw_dir)
    moves = compute_moves(rows)
    latest = moves["latest_date"]
    return {
        "run_time": run_time,
        "first_run_date": dates[0] if dates else None,
        "days_with_success": len(dates),
        "latest_date": latest,
        "previous_date": moves["previous_date"],
        "items": sum(1 for r in rows if r["date"] == latest),
        "new_today": moves["appeared"],
        "gone_today": moves["gone"],
        "sources": [{"name": s["name"], "ok": s["ok"], "count": s["count"],
                     **({"error": s["error"]} if s.get("error") else {})} for s in sources],
    }


def write_status(status: dict, path: pathlib.Path = STATUS) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(status, indent=2) + "\n", encoding="utf-8")
