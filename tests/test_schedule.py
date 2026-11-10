"""The 6 AM Central schedule: the first wake-up at or after 6 AM runs, later ones skip,
in both standard (winter) and daylight (summer) time."""
import datetime as dt

from tracker.schedule import due_time, should_run

UTC = dt.timezone.utc


def test_winter_6am_central_is_12_utc():
    now = dt.datetime(2027, 1, 15, 12, 0, tzinfo=UTC)
    assert due_time(now) == now
    assert should_run("schedule", now, dt.datetime(2027, 1, 14, 12, 3, tzinfo=UTC))[0] is True
    assert should_run("schedule", now.replace(hour=11, minute=50), None)[0] is False   # 5:50 AM CST


def test_summer_6am_central_is_11_utc():
    now = dt.datetime(2027, 7, 15, 11, 0, tzinfo=UTC)
    assert due_time(now) == now
    assert should_run("schedule", now, dt.datetime(2027, 7, 14, 11, 4, tzinfo=UTC))[0] is True


def test_only_the_first_wake_up_after_6am_runs():
    first = dt.datetime(2026, 11, 10, 14, 40, tzinfo=UTC)          # 8:40 AM CST, GitHub ran late
    yesterday = dt.datetime(2026, 11, 10, 5, 9, tzinfo=UTC)        # 11:09 PM CST the day before
    run, why = should_run("schedule", first, yesterday)
    assert run is True and "after 6:00" in why
    ran_at = dt.datetime(2026, 11, 10, 14, 42, tzinfo=UTC)
    assert should_run("schedule", first.replace(minute=50), ran_at)[0] is False
    assert should_run("schedule", dt.datetime(2026, 11, 10, 21, 30, tzinfo=UTC), ran_at)[0] is False


def test_no_catch_up_after_6pm_central():
    evening = dt.datetime(2026, 11, 11, 0, 30, tzinfo=UTC)         # 6:30 PM CST on Nov 10
    assert should_run("schedule", evening, None)[0] is False


def test_manual_runs_always_run():
    assert should_run("workflow_dispatch", dt.datetime.now(UTC), dt.datetime.now(UTC))[0] is True
