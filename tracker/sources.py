"""The sources the tracker calls, how each one is downloaded, and how each raw file
is converted into rows with the common history columns.

Every source is a page on gasprices.aaa.com:

* ``aaa_states``  - https://gasprices.aaa.com/state-gas-price-averages/
  One row per state (50 states + DC) and one row for the national average.
* ``aaa_<st>``    - https://gasprices.aaa.com/?state=<ST>   (51 sources, one per state + DC)
  One row per metro area that AAA lists for that state.

Only the price tables are kept from each page; everything else on the page is ignored.
"""
from __future__ import annotations

import datetime as dt
import html
import re
import time
import urllib.request

STATES = {
    "AK": "Alaska", "AL": "Alabama", "AR": "Arkansas", "AZ": "Arizona", "CA": "California",
    "CO": "Colorado", "CT": "Connecticut", "DC": "District of Columbia", "DE": "Delaware",
    "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "IA": "Iowa", "ID": "Idaho",
    "IL": "Illinois", "IN": "Indiana", "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana",
    "MA": "Massachusetts", "MD": "Maryland", "ME": "Maine", "MI": "Michigan", "MN": "Minnesota",
    "MO": "Missouri", "MS": "Mississippi", "MT": "Montana", "NC": "North Carolina",
    "ND": "North Dakota", "NE": "Nebraska", "NH": "New Hampshire", "NJ": "New Jersey",
    "NM": "New Mexico", "NV": "Nevada", "NY": "New York", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VA": "Virginia",
    "VT": "Vermont", "WA": "Washington", "WI": "Wisconsin", "WV": "West Virginia", "WY": "Wyoming",
}

# The common columns of data/history.csv, in order. The first four are fixed by the assignment.
COLUMNS = [
    "date", "item_id", "item", "source",
    "level", "state",
    "regular", "midgrade", "premium", "diesel",
    "regular_yesterday", "regular_week_ago", "regular_month_ago", "regular_year_ago",
    "diesel_year_ago",
    "price_date",
]
NUMERIC = [
    "regular", "midgrade", "premium", "diesel",
    "regular_yesterday", "regular_week_ago", "regular_month_ago", "regular_year_ago",
    "diesel_year_ago",
]

USER_AGENT = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")


def source_names() -> list[str]:
    """Every source, in the order it is called."""
    return ["aaa_states"] + [f"aaa_{st.lower()}" for st in sorted(STATES)]


def source_url(name: str) -> str:
    if name == "aaa_states":
        return "https://gasprices.aaa.com/state-gas-price-averages/"
    return f"https://gasprices.aaa.com/?state={name[4:].upper()}"


def source_format(name: str) -> str:
    """The format each source returns (used as the raw file extension)."""
    return "html"


def download(url: str, timeout: int = 30, tries: int = 3) -> bytes:
    """Download a URL, retrying a couple of times on network errors."""
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": USER_AGENT,
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "en-US,en;q=0.9",
            })
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except Exception as exc:  # noqa: BLE001 - any failure is retried, then reported
            last = exc
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"download failed: {last!r}")


# ---------------------------------------------------------------- parsing helpers

def _text(fragment: str) -> str:
    """Strip tags and entities and collapse whitespace."""
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", fragment)).split())


def _price(fragment: str) -> str:
    """'$3.6137 ' -> '3.6137'. Returns '' when the cell holds no price."""
    m = re.search(r"\$?\s*(\d+(?:\.\d+)?)", _text(fragment))
    return f"{float(m.group(1)):.4f}" if m else ""


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def price_date(page: str) -> str:
    """'Price as of 11/9/26' -> '2026-11-09' (the date AAA says the prices are for)."""
    m = re.search(r"Price as of\s*(\d{1,2})/(\d{1,2})/(\d{2,4})", page)
    if not m:
        return ""
    month, day, year = (int(g) for g in m.groups())
    if year < 100:
        year += 2000
    return dt.date(year, month, day).isoformat()


def _blank_row(date: str, source: str) -> dict:
    row = {c: "" for c in COLUMNS}
    row["date"] = date
    row["source"] = source
    return row


# ---------------------------------------------------------------- converters

def parse_states(page: str, date: str, source: str = "aaa_states") -> list[dict]:
    """State averages page -> one row per state, plus one row for the national average."""
    rows = []
    as_of = price_date(page)
    m = re.search(r'<table[^>]*id="sortable"[^>]*>(.*?)</table>', page, re.S)
    if m:
        for tr in re.findall(r"<tr>(.*?)</tr>", m.group(1), re.S):
            link = re.search(r"state=([A-Z]{2})", tr)
            if not link:
                continue
            st = link.group(1)
            cells = dict(re.findall(r'<td class="(regular|mid_grade|premium|diesel)"[^>]*>(.*?)</td>', tr, re.S))
            row = _blank_row(date, source)
            row.update({
                "item_id": st,
                "item": STATES.get(st, _text(re.search(r"<a[^>]*>(.*?)</a>", tr, re.S).group(1))),
                "level": "state",
                "state": st,
                "regular": _price(cells.get("regular", "")),
                "midgrade": _price(cells.get("mid_grade", "")),
                "premium": _price(cells.get("premium", "")),
                "diesel": _price(cells.get("diesel", "")),
                "price_date": as_of,
            })
            rows.append(row)
    nat = re.search(r"National Average\s*(?:</p>\s*<p[^>]*>)?\s*\$(\d+\.\d+)", page)
    if nat and rows:
        row = _blank_row(date, source)
        row.update({
            "item_id": "US",
            "item": "United States (national average)",
            "level": "national",
            "regular": f"{float(nat.group(1)):.4f}",
            "price_date": as_of,
        })
        rows.append(row)
    return rows


_HEADER_TO_COLUMN = {"regular": "regular", "mid": "midgrade", "mid-grade": "midgrade",
                     "premium": "premium", "diesel": "diesel"}


def _price_table(table: str) -> dict:
    """A metro 'table-mob' table -> {(row label, column): price}."""
    headers = [_text(h).lower() for h in re.findall(r"<th[^>]*>(.*?)</th>", table, re.S)]
    out = {}
    for tr in re.findall(r"<tr>(.*?)</tr>", table, re.S):
        cells = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)
        if not cells:
            continue
        label = _text(cells[0]).lower().rstrip(".")
        for header, cell in zip(headers[1:], cells[1:]):
            col = _HEADER_TO_COLUMN.get(header)
            if col:
                out[(label, col)] = _price(cell)
    return out


def parse_metros(page: str, date: str, state: str, source: str | None = None) -> list[dict]:
    """A state page -> one row per metro area in that state."""
    source = source or f"aaa_{state.lower()}"
    as_of = price_date(page)
    start = page.find("accordion-prices")
    if start < 0:
        return []
    rows, seen = [], {}
    for chunk in page[start:].split("<h3 ")[1:]:
        name_m = re.search(r"data-title[^>]*>(.*?)</h3>", chunk, re.S)
        table_m = re.search(r'<table class="table-mob">(.*?)</table>', chunk, re.S)
        if not name_m or not table_m:
            continue
        name = _text(name_m.group(1))
        prices = _price_table(table_m.group(1))
        item_id = f"{state}-{slug(name)}"
        if item_id in seen:  # keep ids unique if a page ever repeats a name
            seen[item_id] += 1
            item_id = f"{item_id}-{seen[item_id]}"
        else:
            seen[item_id] = 1
        row = _blank_row(date, source)
        row.update({
            "item_id": item_id,
            "item": f"{name}, {state}",
            "level": "metro",
            "state": state,
            "regular": prices.get(("current avg", "regular"), ""),
            "midgrade": prices.get(("current avg", "midgrade"), ""),
            "premium": prices.get(("current avg", "premium"), ""),
            "diesel": prices.get(("current avg", "diesel"), ""),
            "regular_yesterday": prices.get(("yesterday avg", "regular"), ""),
            "regular_week_ago": prices.get(("week ago avg", "regular"), ""),
            "regular_month_ago": prices.get(("month ago avg", "regular"), ""),
            "regular_year_ago": prices.get(("year ago avg", "regular"), ""),
            "diesel_year_ago": prices.get(("year ago avg", "diesel"), ""),
            "price_date": as_of,
        })
        rows.append(row)
    return rows


def convert(source: str, raw: bytes, date: str) -> list[dict]:
    """Convert one raw file of one source into rows with the common columns."""
    page = raw.decode("utf-8", errors="replace")
    if source == "aaa_states":
        return parse_states(page, date, source)
    if source.startswith("aaa_") and len(source) == 6:
        return parse_metros(page, date, source[4:].upper(), source)
    raise ValueError(f"unknown source {source!r}")
