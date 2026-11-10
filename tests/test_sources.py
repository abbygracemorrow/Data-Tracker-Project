"""Conversion of each source to the common columns."""
from tracker.sources import (COLUMNS, NUMERIC, convert, parse_metros, price_date, slug,
                             source_names, source_url)

from conftest import load


def test_columns_start_with_the_four_fixed_columns():
    assert COLUMNS[:4] == ["date", "item_id", "item", "source"]
    assert len(NUMERIC) >= 2 and all(c in COLUMNS for c in NUMERIC)


def test_states_page_gives_every_state_and_the_national_average():
    rows = convert("aaa_states", load("aaa_states"), "2026-11-10")
    ids = {r["item_id"] for r in rows}
    assert len(rows) == 52 and "US" in ids and "DC" in ids and "CA" in ids
    for r in rows:
        assert list(r) == COLUMNS
        assert r["date"] == "2026-11-10" and r["source"] == "aaa_states"
        assert r["price_date"] == "2026-11-09"
    al = next(r for r in rows if r["item_id"] == "AL")
    assert al["item"] == "Alabama" and al["level"] == "state" and al["state"] == "AL"
    assert (al["regular"], al["midgrade"], al["premium"], al["diesel"]) == \
        ("3.6137", "4.0703", "4.4780", "5.7596")
    us = next(r for r in rows if r["item_id"] == "US")
    assert us["level"] == "national" and us["regular"] == "4.0093" and us["diesel"] == ""


def test_state_page_gives_one_row_per_metro():
    rows = convert("aaa_dc", load("aaa_dc"), "2026-11-10")
    assert [r["item_id"] for r in rows] == ["DC-washington-dc-only", "DC-washington-entire-metro-average"]
    dc = rows[0]
    assert list(dc) == COLUMNS
    assert dc["item"] == "Washington (DC only), DC"
    assert dc["source"] == "aaa_dc" and dc["level"] == "metro" and dc["state"] == "DC"
    assert (dc["regular"], dc["midgrade"], dc["premium"], dc["diesel"]) == \
        ("4.2843", "4.9208", "5.3521", "6.4290")
    assert (dc["regular_yesterday"], dc["regular_week_ago"], dc["regular_month_ago"],
            dc["regular_year_ago"], dc["diesel_year_ago"]) == \
        ("4.2571", "4.2911", "4.4394", "3.2044", "3.7848")


def test_single_metro_state():
    rows = convert("aaa_ri", load("aaa_ri"), "2026-11-10")
    assert len(rows) == 1 and rows[0]["state"] == "RI" and float(rows[0]["regular"]) > 0


def test_page_without_prices_gives_no_rows():
    assert convert("aaa_ca", b"<html><body>Access denied</body></html>", "2026-11-10") == []
    assert convert("aaa_states", b"<html></html>", "2026-11-10") == []


def test_missing_cell_is_left_empty():
    page = """Price as of 1/2/26 <div class="accordion-prices metros-js">
      <h3 data-cost="3" data-title>Test City</h3><div><table class="table-mob">
      <thead><tr><th></th><th>Regular</th><th>Mid</th><th>Premium</th><th>Diesel</th></tr></thead>
      <tbody><tr><td>Current Avg.</td><td>$3.1000</td><td>N/A</td><td>$3.9</td><td></td></tr></tbody>
      </table></div>"""
    [row] = parse_metros(page, "2026-01-02", "TX")
    assert row["item_id"] == "TX-test-city" and row["price_date"] == "2026-01-02"
    assert (row["regular"], row["midgrade"], row["premium"], row["diesel"]) == ("3.1000", "", "3.9000", "")
    assert row["regular_year_ago"] == ""


def test_helpers():
    assert price_date("Price as of 11/9/26") == "2026-11-09"
    assert price_date("nothing") == ""
    assert slug("Washington (DC only)") == "washington-dc-only"
    names = source_names()
    assert names[0] == "aaa_states" and len(names) == 53 and len(set(names)) == 53
    assert names[-1] == "eia_gasdiesel" and source_url("eia_gasdiesel").startswith("https://www.eia.gov/")
    assert source_url("aaa_tx").endswith("?state=TX")


def test_eia_page_gives_regions_states_and_cities():
    rows = convert("eia_gasdiesel", load("eia_gasdiesel"), "2026-11-10")
    by_id = {r["item_id"]: r for r in rows}
    assert len(rows) == 29 and len(by_id) == 29
    for r in rows:
        assert list(r) == COLUMNS
        assert r["source"] == "eia_gasdiesel" and r["level"] == "eia" and r["date"] == "2026-11-10"
        assert r["price_date"] == "2026-11-02" and r["item"].endswith("(EIA weekly)")
        assert float(r["regular"]) > 0
    us = by_id["EIA-US"]
    # regular: latest week 4.153, week before 4.269, change from a year ago +1.134 -> 3.019
    assert (us["regular"], us["regular_week_ago"], us["regular_year_ago"]) == ("4.1530", "4.2690", "3.0190")
    # diesel: 6.292, change from a year ago +2.539 -> 3.753
    assert (us["diesel"], us["diesel_year_ago"]) == ("6.2920", "3.7530")
    # California is in both the gasoline (States) table and the diesel table: one row, both fuels
    ca = by_id["EIA-california"]
    assert ca["state"] == "CA" and ca["regular"] == "5.7480" and ca["diesel"] == "8.0760"
    # cities get their state; regions have none
    assert by_id["EIA-boston"]["state"] == "MA" and by_id["EIA-boston"]["diesel"] == ""
    assert by_id["EIA-midwest-padd2"]["state"] == "" and by_id["EIA-midwest-padd2"]["diesel"] == "6.4020"
