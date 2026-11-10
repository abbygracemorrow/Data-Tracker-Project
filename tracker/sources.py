"""The sources the tracker calls, how each one is downloaded, and how each raw file
is converted into rows with the common history columns.

There are two independent providers, so a failure at one of them does not leave a day empty:

* AAA (daily), pages on gasprices.aaa.com:
  * ``aaa_states``  - https://gasprices.aaa.com/state-gas-price-averages/
    One row per state (50 states + DC) and one row for the national average.
  * ``aaa_<st>``    - https://gasprices.aaa.com/?state=<ST>   (51 sources, one per state + DC)
    One row per metro area that AAA lists for that state.
* EIA, the U.S. Energy Information Administration (weekly, updated on Mondays):
  * ``eia_gasdiesel`` - https://www.eia.gov/petroleum/gasdiesel/
    One row per area in EIA's retail price tables: the U.S., 10 regions, 9 states and 10 cities.

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
    return ["aaa_states"] + [f"aaa_{st.lower()}" for st in sorted(STATES)] + ["eia_gasdiesel"]


def source_url(name: str) -> str:
    if name == "eia_gasdiesel":
        return "https://www.eia.gov/petroleum/gasdiesel/"
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


# EIA city -> state code (EIA's cities are the big metro areas it surveys)
EIA_CITY_STATE = {
    "Boston": "MA", "Chicago": "IL", "Cleveland": "OH", "Denver": "CO", "Houston": "TX",
    "Los Angeles": "CA", "Miami": "FL", "New York City": "NY", "San Francisco": "CA", "Seattle": "WA",
}
_STATE_CODE = {v: k for k, v in STATES.items()}


def _us_date(text: str) -> str:
    """'11/02/26' -> '2026-11-02'."""
    m = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{2,4})", text.strip())
    if not m:
        return ""
    month, day, year = (int(g) for g in m.groups())
    return dt.date(year + 2000 if year < 100 else year, month, day).isoformat()


def parse_eia(page: str, date: str, source: str = "eia_gasdiesel") -> list[dict]:
    """EIA 'Gasoline and Diesel Fuel Update' page -> one row per area.

    The page has three tables: regular gasoline by region, regular gasoline by state and city,
    and diesel by region. Each has the last three weekly prices and the change from a year ago.
    The same area in the gasoline and diesel tables (e.g. California) becomes one row.
    """
    items: dict[str, dict] = {}
    for table in re.findall(r"<table[^>]*>(.*?)</table>", page, re.S):
        cap = re.search(r"<caption>(.*?)</caption>", table, re.S)
        caption = _text(cap.group(1)).lower() if cap else ""
        if "diesel" in caption:
            fuel = "diesel"
        elif "gasoline" in caption or caption.startswith("states"):
            fuel = "regular"
        else:
            continue
        heads = [_text(h).lower() for h in re.findall(r"<th[^>]*>(.*?)</th>", table, re.S)]
        dates = [_us_date(h) for h in heads if _us_date(h)]
        if not dates or "year ago" not in heads:
            continue
        n_dates = len(dates)
        year_ago_col = n_dates + [h for h in heads if h and not _us_date(h) and "change" not in h].index("year ago")
        section = "state" if caption.startswith("states") else "region"
        for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", table.split("<tbody>", 1)[-1], re.S):
            cells = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)
            if len(cells) == 1 and _text(cells[0]).lower() == "cities":
                section = "city"
                continue
            if len(cells) < n_dates + 1:
                continue
            name = _text(re.sub(r"<br\s*/?>", " ", cells[0]))
            values = [_price(c) for c in cells[1:]]
            latest, before = values[n_dates - 1], values[n_dates - 2] if n_dates > 1 else ""
            m = re.search(r"-?\d+(?:\.\d+)?", _text(cells[1 + year_ago_col])) if len(cells) > 1 + year_ago_col else None
            year_change = float(m.group(0)) if m else None
            if name == "U.S.":
                item_id, label, level_state = "EIA-US", "United States", ""
            else:
                item_id, label = f"EIA-{slug(name)}", name
                level_state = _STATE_CODE.get(name, "") if section != "city" else EIA_CITY_STATE.get(name, "")
            row = items.get(item_id)
            if row is None:
                row = _blank_row(date, source)
                row.update({"item_id": item_id, "item": f"{label} (EIA weekly)", "level": "eia",
                            "state": level_state, "price_date": dates[-1]})
                items[item_id] = row
            if latest:
                row[fuel] = latest
                if year_change is not None:
                    row[f"{fuel}_year_ago"] = f"{float(latest) - year_change:.4f}"
                if fuel == "regular" and before:
                    row["regular_week_ago"] = before
    return sorted(items.values(), key=lambda r: r["item_id"])


def convert(source: str, raw: bytes, date: str) -> list[dict]:
    """Convert one raw file of one source into rows with the common columns."""
    page = raw.decode("utf-8", errors="replace")
    if source == "eia_gasdiesel":
        return parse_eia(page, date, source)
    if source == "aaa_states":
        return parse_states(page, date, source)
    if source.startswith("aaa_") and len(source) == 6:
        return parse_metros(page, date, source[4:].upper(), source)
    raise ValueError(f"unknown source {source!r}")
