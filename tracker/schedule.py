"""When the daily run happens: every day at 6:00 AM Central time (Dallas), without fail.

GitHub's scheduler is best effort: a scheduled run can start late or, at busy times such as
the top of the hour, not at all. So the workflow does not rely on one trigger. It wakes up
every 10 minutes from 6:00 to 9:00 AM Central and every 30 minutes after that until 6:00 PM,
and each wake-up asks this module whether today's update has already happened. The first
wake-up GitHub actually starts does the update; every later one stops in a few seconds.

Rules for a scheduled wake-up (all times Central, America/Chicago, so daylight time is handled):
* before 6:00 AM: wait (yesterday's update is still the latest);
* from 6:00 AM to 5:59 PM: run, unless a run already happened at or after 6:00 AM today;
* from 6:00 PM: wait for tomorrow (keeps the run's UTC date equal to the Central date).
Manual runs (workflow_dispatch) always run.

    python -m tracker.schedule   # prints run=true/false for the workflow (GITHUB_OUTPUT)
"""
from __future__ import annotations

import datetime as dt
import json
import os
import pathlib
from zoneinfo import ZoneInfo

CENTRAL = ZoneInfo("America/Chicago")
RUN_HOUR = 6          # the daily update is due at 6:00 AM Central
LAST_HOUR = 18        # catch-up attempts stop at 6:00 PM Central

ROOT = pathlib.Path(__file__).resolve().parent.parent
STATUS = ROOT / "data" / "status.json"


def due_time(now_utc: dt.datetime) -> dt.datetime:
    """6:00 AM Central on the current Central date, as a UTC time."""
    local = now_utc.astimezone(CENTRAL)
    return local.replace(hour=RUN_HOUR, minute=0, second=0, microsecond=0).astimezone(dt.timezone.utc)


def should_run(event: str, now_utc: dt.datetime, last_run: dt.datetime | None) -> tuple[bool, str]:
    """Decide whether this workflow run should fetch data."""
    if event != "schedule":
        return True, f"started by {event}"
    local = now_utc.astimezone(CENTRAL)
    if local.hour < RUN_HOUR:
        return False, "before 6:00 AM Central"
    if local.hour >= LAST_HOUR:
        return False, "after 6:00 PM Central; the next update is tomorrow at 6:00 AM"
    if last_run is not None and last_run >= due_time(now_utc):
        return False, f"today's update already ran at {last_run.astimezone(CENTRAL):%H:%M} Central"
    late = (now_utc - due_time(now_utc)).total_seconds() / 60
    return True, "6:00 AM Central update" + (f" ({late:.0f} min after 6:00)" if late >= 1 else "")


def last_run_time(path: pathlib.Path = STATUS) -> dt.datetime | None:
    try:
        text = json.loads(path.read_text())["run_time"]
        return dt.datetime.fromisoformat(text.replace("Z", "+00:00"))
    except Exception:  # noqa: BLE001 - no status yet means no run yet
        return None


def main() -> None:
    run, why = should_run(os.environ.get("GITHUB_EVENT_NAME", "workflow_dispatch"),
                          dt.datetime.now(dt.timezone.utc), last_run_time())
    print(f"run={str(run).lower()} ({why})")
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a") as fh:
            fh.write(f"run={str(run).lower()}\n")


if __name__ == "__main__":
    main()
