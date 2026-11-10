"""The history logic: building from raw files, reproducibility, failures, same-day reruns."""
import csv
import gzip
import json

from tracker import build, run, status
from tracker.sources import COLUMNS, source_url

from conftest import load

SOURCES = ["aaa_states", "aaa_dc", "aaa_ri"]


def fake_downloader(pages, fail=()):
    by_url = {source_url(name): body for name, body in pages.items()}

    def download(url):
        for name in fail:
            if source_url(name) == url:
                raise RuntimeError("HTTP Error 503")
        return by_url[url]
    return download


def run_day(tmp_path, pages, date, fail=()):
    raw = tmp_path / "raw"
    results = run.fetch_all(date, raw, fake_downloader(pages, fail), names=SOURCES)
    rows = build.build(raw, tmp_path / "history.csv")
    return results, rows


def test_build_writes_sorted_rows_with_common_columns(tmp_path, pages):
    _, rows = run_day(tmp_path, pages, "2026-11-10")
    with (tmp_path / "history.csv").open() as fh:
        reader = csv.DictReader(fh)
        assert reader.fieldnames == COLUMNS
        written = list(reader)
    assert len(written) == 52 + 2 + 1
    keys = [(r["date"], r["item_id"]) for r in written]
    assert keys == sorted(keys) and len(set(keys)) == len(keys)


def test_raw_files_are_saved_compressed_in_their_format(tmp_path, pages):
    run_day(tmp_path, pages, "2026-11-10")
    saved = sorted(p.name for p in (tmp_path / "raw" / "2026-11-10").iterdir())
    assert saved == ["aaa_dc.html.gz", "aaa_ri.html.gz", "aaa_states.html.gz"]
    assert gzip.decompress((tmp_path / "raw" / "2026-11-10" / "aaa_dc.html.gz").read_bytes()) == pages["aaa_dc"]


def test_build_is_reproducible_from_raw_files_alone(tmp_path, pages):
    run_day(tmp_path, pages, "2026-11-09")
    run_day(tmp_path, pages, "2026-11-10")
    first = (tmp_path / "history.csv").read_bytes()
    (tmp_path / "history.csv").unlink()
    build.build(tmp_path / "raw", tmp_path / "history.csv")
    assert (tmp_path / "history.csv").read_bytes() == first
    rows = build.read_history(tmp_path / "history.csv")
    assert sorted({r["date"] for r in rows}) == ["2026-11-09", "2026-11-10"]


def test_failed_source_writes_no_raw_file_and_does_not_stop_the_run(tmp_path, pages):
    results, rows = run_day(tmp_path, pages, "2026-11-10", fail=["aaa_dc"])
    ok = {r["name"]: r["ok"] for r in results}
    assert ok == {"aaa_states": True, "aaa_dc": False, "aaa_ri": True}
    assert "503" in next(r for r in results if r["name"] == "aaa_dc")["error"]
    assert not (tmp_path / "raw" / "2026-11-10" / "aaa_dc.html.gz").exists()
    assert not any(r["source"] == "aaa_dc" for r in rows)
    assert any(r["source"] == "aaa_ri" for r in rows)


def test_second_run_on_the_same_day_replaces_that_day(tmp_path, pages):
    run_day(tmp_path, pages, "2026-11-09")
    run_day(tmp_path, pages, "2026-11-10", fail=["aaa_ri"])
    results, rows = run_day(tmp_path, pages, "2026-11-10")   # rerun, now RI works
    assert all(r["ok"] for r in results)
    assert build.raw_dates(tmp_path / "raw") == ["2026-11-09", "2026-11-10"]
    per_day = {}
    for r in rows:
        per_day.setdefault(r["date"], []).append(r["item_id"])
    assert len(per_day["2026-11-10"]) == len(set(per_day["2026-11-10"])) == 55   # no duplicates
    assert per_day["2026-11-09"] == per_day["2026-11-10"]
    # and a rerun where a source fails removes that source's earlier raw file for the day
    run_day(tmp_path, pages, "2026-11-10", fail=["aaa_ri"])
    assert not (tmp_path / "raw" / "2026-11-10" / "aaa_ri.html.gz").exists()


def test_day_with_every_source_failing_has_no_raw_folder(tmp_path, pages):
    run_day(tmp_path, pages, "2026-11-10", fail=SOURCES)
    assert build.raw_dates(tmp_path / "raw") == []


def test_status_file(tmp_path, pages):
    run_day(tmp_path, pages, "2026-11-09", fail=["aaa_ri"])
    results, rows = run_day(tmp_path, pages, "2026-11-10", fail=["aaa_dc"])
    st = status.make_status("2026-11-10T13:23:00Z", rows, results, tmp_path / "raw")
    status.write_status(st, tmp_path / "status.json")
    st = json.loads((tmp_path / "status.json").read_text())
    for key in ["run_time", "first_run_date", "days_with_success", "items",
                "new_today", "gone_today", "sources"]:
        assert key in st
    assert st["first_run_date"] == "2026-11-09" and st["days_with_success"] == 2
    assert st["items"] == 53
    assert [i["item_id"] for i in st["new_today"]] == ["RI-providence-fall-river-warwick-ri-only"]
    assert sorted(i["item_id"] for i in st["gone_today"]) == ["DC-washington-dc-only",
                                                             "DC-washington-entire-metro-average"]
    assert {s["name"]: (s["ok"], s["count"]) for s in st["sources"]} == \
        {"aaa_states": (True, 52), "aaa_dc": (False, 0), "aaa_ri": (True, 1)}


def test_source_log_keeps_one_entry_per_source_per_day(tmp_path, pages):
    log = tmp_path / "source_log.csv"
    res, _ = run_day(tmp_path, pages, "2026-11-10", fail=["aaa_dc"])
    run.log_sources("2026-11-10", "t1", res, log)
    res, _ = run_day(tmp_path, pages, "2026-11-10")
    run.log_sources("2026-11-10", "t2", res, log)
    with log.open() as fh:
        entries = list(csv.DictReader(fh))
    assert len(entries) == 3 and {e["run_time"] for e in entries} == {"t2"}
    assert all(e["ok"] == "true" for e in entries)
