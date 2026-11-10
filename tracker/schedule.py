"""When the daily run happens: every day at 6:00 AM Central time (Dallas).

GitHub's scheduler only understands UTC, and 6:00 AM Central is 11:00 UTC in daylight
time (CDT) but 12:00 UTC in standard time (CST). So the workflow is scheduled at both, and
this module decides which of the two slots is really 6 AM in Central time that day. A third,
afternoon slot is a backup: it only runs if the morning run left no data for the day.

    python -m tracker.schedule   # prints run=true/false for the workflow (GITHUB_OUTPUT)
"""
from __future__ import annotations

import datetime as dt
import os
import pathlib
from zoneinfo import ZoneInfo

CENTRAL = ZoneInfo("America/Chicago")
RUN_HOUR = 6                       # 6:00 AM Central
DAYLIGHT_CRON = "0 11 * * *"       # 6 AM CDT (UTC-5)
STANDARD_CRON = "0 12 * * *"       # 6 AM CST (UTC-6)
BACKUP_CRON = "47 20 * * *"        # 2:47 PM CST / 3:47 PM CDT, only if the morning run is missing

ROOT = pathlib.Path(__file__).resolve().parent.parent


def should_run(event: str, cron: str, now_utc: dt.datetime, raw_dir: pathlib.Path) -> tuple[bool, str]:
    """Decide whether this workflow run should fetch data."""
    if event != "schedule":
        return True, f"started by {event}"
    offset_hours = now_utc.astimezone(CENTRAL).utcoffset().total_seconds() / 3600
    if cron == DAYLIGHT_CRON:
        return (offset_hours == -5, "6 AM Central (daylight time)" if offset_hours == -5 else "not 6 AM Central today (standard time)")
    if cron == STANDARD_CRON:
        return (offset_hours == -6, "6 AM Central (standard time)" if offset_hours == -6 else "not 6 AM Central today (daylight time)")
    if cron == BACKUP_CRON:
        day = raw_dir / now_utc.date().isoformat()
        if day.is_dir() and any(day.glob("*.gz")):
            return False, "the morning run already saved today's data"
        return True, "backup: no data saved yet today"
    return True, f"unknown schedule {cron!r}"


def main() -> None:
    run, why = should_run(os.environ.get("GITHUB_EVENT_NAME", "workflow_dispatch"),
                          os.environ.get("SCHEDULE", ""),
                          dt.datetime.now(dt.timezone.utc), ROOT / "data" / "raw")
    print(f"run={str(run).lower()} ({why})")
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a") as fh:
            fh.write(f"run={str(run).lower()}\n")


if __name__ == "__main__":
    main()
