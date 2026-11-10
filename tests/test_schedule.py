"""The 6 AM Central schedule: exactly one morning slot runs each day, in both seasons."""
import datetime as dt

from tracker.schedule import BACKUP_CRON, DAYLIGHT_CRON, STANDARD_CRON, should_run

UTC = dt.timezone.utc


def test_winter_runs_the_12_utc_slot_only(tmp_path):
    jan = dt.datetime(2027, 1, 15, 12, 0, tzinfo=UTC)          # 6:00 AM CST
    assert should_run("schedule", STANDARD_CRON, jan, tmp_path)[0] is True
    assert should_run("schedule", DAYLIGHT_CRON, jan.replace(hour=11), tmp_path)[0] is False


def test_summer_runs_the_11_utc_slot_only(tmp_path):
    jul = dt.datetime(2027, 7, 15, 11, 0, tzinfo=UTC)          # 6:00 AM CDT
    assert should_run("schedule", DAYLIGHT_CRON, jul, tmp_path)[0] is True
    assert should_run("schedule", STANDARD_CRON, jul.replace(hour=12), tmp_path)[0] is False


def test_backup_only_runs_when_the_morning_left_no_data(tmp_path):
    now = dt.datetime(2026, 11, 10, 20, 47, tzinfo=UTC)
    assert should_run("schedule", BACKUP_CRON, now, tmp_path)[0] is True
    day = tmp_path / "2026-11-10"
    day.mkdir()
    (day / "aaa_states.html.gz").write_bytes(b"x")
    assert should_run("schedule", BACKUP_CRON, now, tmp_path)[0] is False


def test_manual_runs_always_run(tmp_path):
    assert should_run("workflow_dispatch", "", dt.datetime.now(UTC), tmp_path)[0] is True
