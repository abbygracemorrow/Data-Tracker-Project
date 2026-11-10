# Gas Price Tracker

[![Tests](https://github.com/abbygracemorrow/Data-Tracker-Project/actions/workflows/tests.yml/badge.svg)](https://github.com/abbygracemorrow/Data-Tracker-Project/actions/workflows/tests.yml)
[![Daily gas prices](https://github.com/abbygracemorrow/Data-Tracker-Project/actions/workflows/daily.yml/badge.svg)](https://github.com/abbygracemorrow/Data-Tracker-Project/actions/workflows/daily.yml)

**Live site:** <https://abbygracemorrow.github.io/Data-Tracker-Project/>  
**Author:** Abby Morrow

Every day, on its own, this tool downloads AAA's average gas prices for the **national average,
all 50 states plus DC, and about 474 metro areas** (526 items on the first run), plus the U.S.
Energy Information Administration's (EIA's) weekly prices for **29 regions, states and cities** as a
second, independent source. It adds them to a
history with one row per item per day, opens a GitHub Issue listing what moved, and publishes
everything to a website with an interactive map of the United States.

## How it works

`.github/workflows/daily.yml` runs `python -m tracker.run` every day at 13:23 UTC (with a backup
run at 20:47 UTC). Each run:

1. **Calls every source** (53 pages from two providers, listed below) and saves exactly what each one returns,
   gzip-compressed, in `data/raw/<date>/<source>.html.gz`. One source failing does not stop the
   run: a failed source writes no raw file that day, and every result (ok or failed, item count,
   bytes, error) is recorded in `data/source_log.csv` and `data/status.json`. A page that downloads
   but contains no prices counts as a failure.
2. **Builds `data/history.csv` from the raw files alone** (every day, every source), so running the
   build again gives the same file and a change to a parsing rule applies to the whole history.
3. **Writes `data/status.json`.**
4. **Opens a GitHub Issue** titled with the date (for example `2026-11-10`, label `daily-moves`)
   listing the biggest moves with old and new values, plus every item that appeared or disappeared,
   and closes the previous day's issue. The issue is opened every day, even with no changes.
5. **Commits** the raw files, the history file, the status file and the source log.

The date of a run is the UTC date of the moment it runs. A second run on the same UTC day deletes
that day's raw files before downloading again, rebuilds the history and updates that day's issue,
so each day counts once.

### Rebuild the history from the raw files

```bash
python -m tracker.build
```

This reads every `data/raw/<date>/<source>.html.gz` and rewrites `data/history.csv`.
It needs only Python 3.10+ (standard library only).

### Run the tests

```bash
pip install -r requirements-dev.txt
python -m pytest -v
```

`.github/workflows/tests.yml` runs the tests on every push and pull request (badge above), and
also after every daily run, because GitHub does not start workflows for the pushes the daily run
makes with its own token. The tests use real AAA pages saved in `tests/fixtures/`, and
`tests/test_every_source.py` converts the latest saved raw file of every one of the 53 sources.

## Sources

There are two independent providers, so the pipeline survives a failed source at two levels: any one
of the 53 pages can fail without stopping the run, and even if all of AAA is down, the EIA source
still gives the day a raw file and rows (and the other way round). Both are public web pages that a
GitHub runner downloads with no login and **no API key**, so the repository holds no secrets
(the workflow only uses the `GITHUB_TOKEN` that GitHub creates for each run, to open the issue).
Every source returns **HTML**.

| Source name | URL | Format | What is kept |
|---|---|---|---|
| `aaa_states` | `https://gasprices.aaa.com/state-gas-price-averages/` | HTML | The state price table (regular, mid-grade, premium and diesel for the 50 states and DC), the "Today's AAA National Average" figure, and the "Price as of" date. |
| `aaa_ak`, `aaa_al`, … `aaa_wy` (51 sources, one per state and DC) | `https://gasprices.aaa.com/?state=XX` | HTML | The metro-area price tables only: current, yesterday, week-ago, month-ago and year-ago averages for each grade, plus the "Price as of" date. Everything else on the page (navigation, ads, record highs, the state's own summary) is ignored. |
| `eia_gasdiesel` | `https://www.eia.gov/petroleum/gasdiesel/` | HTML | The three retail price tables: regular gasoline for the U.S. and 10 regions, regular gasoline for 9 states and 10 cities, and on-highway diesel for the U.S., the regions and California. For each area it keeps the latest weekly price, the price a week earlier, and the price a year earlier (latest price minus EIA's "change from year ago"). The EIA publishes these weekly (on Mondays), so the rows repeat until the next release. |

The raw file keeps the whole page, as the assignment asks. The build keeps only the parts above.

## Data files

### `data/history.csv`: one row per item per day

Rows are sorted by `date`, then `item_id`. A value the source does not report for an item on a day
is left empty. All prices are **U.S. dollars per gallon**, written with 4 decimals (AAA reports 4, EIA reports 3).

| Column | Meaning | Unit / format |
|---|---|---|
| `date` | UTC date of the run that downloaded the row | `YYYY-MM-DD` |
| `item_id` | Key that identifies the item from day to day. For AAA's national average it is `US`. For a state it is the two-letter code (`CA`). For a metro area it is the state code plus a slug of AAA's metro name (`CA-los-angeles-long-beach`). For an EIA area it is `EIA-` plus a slug of EIA's name (`EIA-US`, `EIA-midwest-padd2`, `EIA-california`, `EIA-boston`). | text |
| `item` | Item name: `United States (national average)`, the state name, `<metro name>, <ST>`, or `<EIA area> (EIA weekly)` | text |
| `source` | Source the row came from (`aaa_states`, `aaa_<st>` or `eia_gasdiesel`) | text |
| `level` | `national`, `state` or `metro` for AAA rows; `eia` for EIA rows | text |
| `state` | Two-letter state code (empty for national and regional rows) | text |
| `regular` | Average price of regular unleaded today | USD/gal |
| `midgrade` | Average price of mid-grade today | USD/gal |
| `premium` | Average price of premium today | USD/gal |
| `diesel` | Average price of diesel today | USD/gal |
| `regular_yesterday` | AAA's "Yesterday Avg." for regular (metro areas only) | USD/gal |
| `regular_week_ago` | AAA's "Week Ago Avg." for regular (metro areas), or EIA's price for the previous week (EIA rows) | USD/gal |
| `regular_month_ago` | AAA's "Month Ago Avg." for regular (metro areas only) | USD/gal |
| `regular_year_ago` | AAA's "Year Ago Avg." for regular (metro areas), or EIA's latest price minus its change from a year ago (EIA rows) | USD/gal |
| `diesel_year_ago` | AAA's "Year Ago Avg." for diesel (metro areas), or the same calculation as above for EIA diesel (EIA rows) | USD/gal |
| `price_date` | The date the source gives for the prices: AAA's "Price as of" date (usually the day before the UTC run date), or the week of EIA's latest survey | `YYYY-MM-DD` |

### `data/status.json`: the latest run

| Key | Meaning |
|---|---|
| `run_time` | UTC time of the run (ISO 8601) |
| `first_run_date` | Date of the earliest raw file |
| `days_with_success` | Number of different dates that have at least one raw file |
| `latest_date`, `previous_date` | The two most recent dates in the history (used for moves) |
| `items` | Number of items in the latest run |
| `new_today` | Items (`item_id`, `item`) that appeared since the previous run |
| `gone_today` | Items that disappeared since the previous run |
| `sources` | One entry per source: `name`, `ok` (true/false), `count` (items parsed), and `error` if it failed |

### Other data files

| File | What it is |
|---|---|
| `data/raw/<date>/<source>.html.gz` | The page each source returned that day, gzip-compressed, unchanged |
| `data/source_log.csv` | Every source result of every day: `date, run_time, source, ok, count, bytes, error` (a rerun replaces that day's entries) |
| `data/locations.csv` | Map position (`lat`, `lon`) of each metro area, used only by the map on the site (not by the history). Made once by `tools/make_locations.py`. |

## The move rule

A **move** is the change in an item's **regular gasoline price** between the two most recent dates
in the history: `change = new price − old price` (USD per gallon). Items are ranked by the
**absolute size** of the change, largest first, with ties broken by `item_id`. The daily issue and
the Today page list the **top 15** with old value, new value, change and percent change.
AAA's states, metro areas and national average and the EIA's areas are ranked together. An item that has a row on the
latest date but none on the previous date **appeared**; one with a row on the previous date but
none on the latest date **disappeared**. On the first day there is no previous run, so the issue
says so and lists no moves. The rule is in `tracker/moves.py` and repeated in `assets/common.js`.

## The site

GitHub Pages serves the repository root. All three pages load `data/history.csv` and
`data/status.json` in the browser and do every calculation there.

* **Today** (`index.html`): last run time, the counts from the status file, the status of every
  source, an **interactive U.S. map**, the biggest moves, and the latest value of every item with
  its change since the previous run. On the map you can pick the fuel grade and show the price, the
  change since the previous run, or the change vs. a year ago. You can hover over states and metro
  dots, click a state to zoom in and list its metro areas, and scroll or drag to zoom and pan.
* **Browse** (`browse.html`): latest values for every item, with a name search; filters for level,
  state, direction of change, maximum regular price and "starred only"; sorting by every numeric
  column up and down (click a header or use the Sort control); and a ☆ star on every row that saves
  the item to a shortlist kept in `localStorage`, so it is still there after a reload.
* **Trends** (`trends.html`): a chart of any numeric column over the days, with a picker for which
  items are shown (up to 8). Below it are eight findings, each with a heading that states the
  finding, a paragraph with the numbers, a "How it's computed" note, and a chart. The findings are:
  most vs. least expensive state, the national average over time, the biggest risers and fallers
  since the first run, the day with the biggest move, diesel's premium over regular, the change vs.
  a year ago, the spread between states over time, and how closely the two sources (AAA and EIA)
  agree for the states both track.
* **Installable and offline:** `manifest.webmanifest` and `sw.js` make the site installable as an
  app. The service worker fetches from the network first (so online visitors get fresh data) and
  falls back to the last cached copy offline. An "offline" banner appears when there is no
  connection.

## Files

| File | What it does |
|---|---|
| `README.md` | This file |
| `requirements-dev.txt` | Test dependency (pytest). The pipeline itself uses only the Python standard library. |
| `.gitignore` | Files git ignores (Python caches) |
| `.nojekyll` | Tells GitHub Pages to serve the files as they are, without Jekyll |
| `.github/workflows/daily.yml` | Scheduled daily pipeline: fetch, build, status, issue, commit |
| `.github/workflows/tests.yml` | Runs the pytest suite on every push and pull request, and after every daily run |
| `tracker/__init__.py` | Marks `tracker` as a Python package |
| `tracker/sources.py` | The source list and URLs (AAA and EIA), the download function, and the converters from each raw page to the common columns (`COLUMNS`) |
| `tracker/build.py` | Builds `data/history.csv` from `data/raw/` (`python -m tracker.build`) |
| `tracker/moves.py` | The move rule, appeared/disappeared items, and the issue text |
| `tracker/status.py` | Writes `data/status.json` |
| `tracker/issue.py` | Opens or updates today's GitHub issue and closes the previous one (GitHub REST API, `GITHUB_TOKEN`) |
| `tracker/run.py` | The daily run: fetch all sources into `data/raw/<date>/`, log results, build, status, issue |
| `tests/conftest.py` | Test setup and fixture loader |
| `tests/test_sources.py` | Conversion of each source (AAA states page, AAA state pages, EIA page) to the common columns |
| `tests/test_moves.py` | The move rule and the issue text |
| `tests/test_every_source.py` | Conversion of every source, using the latest raw file saved for each one |
| `tests/test_history.py` | History logic: build from raw files, reproducibility, failed sources (including a whole-AAA outage and an EIA outage), second run on the same day, status file, source log |
| `tests/fixtures/*.html.gz` | Real pages saved on 2026-11-10 for the tests: AAA state averages, DC and Rhode Island, and the EIA page |
| `tools/make_locations.py` | One-off script that made `data/locations.csv` from the `cities.json` npm package |
| `data/history.csv` | The history (see above) |
| `data/status.json` | Status of the latest run (see above) |
| `data/source_log.csv` | Result of every source on every day |
| `data/locations.csv` | Map positions of metro areas |
| `data/raw/<date>/*.html.gz` | Raw pages, one per source per day |
| `index.html` | Today page |
| `browse.html` | Browse page |
| `trends.html` | Trends page |
| `manifest.webmanifest` | Web app manifest (name, colors, icons) |
| `sw.js` | Service worker (offline support) |
| `assets/style.css` | The one stylesheet shared by all pages (fonts, colors, nav bar). The look is a vintage American road trip: motel-sign pastels, cream paper, pickup-truck red, old wall-map colors and light blue stripes. |
| `assets/fonts/*.woff2` | The three fonts, stored locally so they work offline: Righteous (headings), Special Elite (typewriter labels), Work Sans (text) |
| `assets/fonts/LICENSE-*.txt` | The font licenses (SIL Open Font License 1.1 for Righteous and Work Sans, Apache 2.0 for Special Elite) |
| `assets/common.js` | Shared code: the motel-sign logo and banner drawing, loading the data files, number formats, tooltip, bar/line/column charts, offline banner, install button, service worker registration |
| `assets/today.js` | Today page: tiles, map, moves, sources, all-items table |
| `assets/browse.js` | Browse page: filters, search, sort, shortlist |
| `assets/trends.js` | Trends page: explorer chart and the findings |
| `assets/icons/icon.svg`, `icon-192.png`, `icon-512.png` | App icons |
| `assets/vendor/d3.min.js` | d3 v7.9 (charts and map), stored locally so the site works offline |
| `assets/vendor/topojson-client.min.js` | topojson-client v3.1 (reads the map file) |
| `assets/vendor/us-states-10m.json` | U.S. state shapes from the `us-atlas` v3 package |

## Setup notes (one time)

* **Settings → Pages:** Source "Deploy from a branch", branch `main`, folder `/ (root)`.
* **Settings → Actions → General → Workflow permissions:** "Read and write permissions" (the daily
  workflow also asks for `contents: write` and `issues: write` itself).
