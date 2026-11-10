"""Make data/locations.csv: a map position (latitude, longitude) for every metro area.

The positions are reference data for the map on the site only; data/history.csv does not
use them. They were made once with:

    npm pack cities.json && tar xzf cities.json-*.tgz
    python tools/make_locations.py package/cities.json

The script matches each metro name in the latest history against the GeoNames-based city
list in the npm package ``cities.json`` (same state). A metro name such as
"Daphne-Fairhope-Foley" is matched on its first city that is found. Names that are not cities
(e.g. "Orange County", "Metro Detroit") use the hand-picked city in OVERRIDES. Re-run it when new metros appear.
"""
from __future__ import annotations

import csv
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from tracker.build import read_history  # noqa: E402

# item_id -> city to place it at, for metro names that are not city names
OVERRIDES = {
    "AL-russell-county": "Phenix City", "AZ-east-valley": "Mesa", "AZ-phoenix-proper": "Phoenix", "AZ-pima-county": "Tucson",
    "AZ-west-valley": "Glendale", "CA-orange-county": "Santa Ana", "CA-yolo": "Woodland",
    "CT-lower-fairfield-county": "Stamford", "DC-washington-dc-only": "Washington",
    "DC-washington-entire-metro-average": "Washington", "GA-catoosa-dade-walker": "Ringgold",
    "ID-boise-city": "Boise", "ID-franklin": "Preston", "IL-alexander-county": "Cairo",
    "IL-chicago-metro": "Schaumburg", "IL-city-of-chicago": "Chicago", "IL-lake-county": "Waukegan",
    "MD-washington-md-only": "Silver Spring", "MI-metro-detroit": "Detroit",
    "MN-houston-county": "Caledonia", "MN-polk-county": "Crookston",
    "NC-norfolk-virginia-beach-newport-news": "Elizabeth City", "NJ-monmouth-ocean": "Toms River",
    "NJ-philadelphia-nj-only": "Camden", "NJ-warren-county": "Phillipsburg",
    "NY-dutchess-putnam-county": "Poughkeepsie", "NY-new-york": "New York City",
    "OH-belmont-county": "Saint Clairsville", "OH-lawerence-county": "Ironton",
    "OK-le-flore-sequoyah": "Poteau", "VA-washington-dc-va-only": "Arlington",
    "WA-clarkson": "Clarkston", "WI-pierce-st-croix-county": "Hudson",
    "WV-hampshire-county": "Romney", "WV-jefferson-county": "Charles Town",
    "WV-mineral-county": "Keyser", "WV-washington-dc-wv-only": "Martinsburg",
}


def norm(s: str) -> str:
    s = s.lower().replace("st.", "saint").replace("ft.", "fort")
    return re.sub(r"[^a-z]+", " ", s).strip()


def main(cities_path: str) -> None:
    cities = json.load(open(cities_path, encoding="utf-8"))
    lookup = {}
    for c in cities:
        if c["country"] == "US":
            lookup.setdefault((c["admin1"], norm(c["name"])), (float(c["lat"]), float(c["lng"]), c["name"]))
    rows = read_history()
    latest = max(r["date"] for r in rows)
    out, missing = [], []
    for r in rows:
        if r["date"] != latest or r["level"] != "metro":
            continue
        st = r["state"]
        name = r["item"].rsplit(", ", 1)[0]
        tries = [OVERRIDES[r["item_id"]]] if r["item_id"] in OVERRIDES else []
        base = re.sub(r"\(.*?\)", "", name)
        tries += [p for p in re.split(r"[-/]", base) if p.strip()]
        tries += [base.replace(" County", "")]
        hit = None
        for t in tries:
            hit = lookup.get((st, norm(t)))
            if hit:
                break
        if hit:
            out.append({"item_id": r["item_id"], "lat": f"{hit[0]:.4f}", "lon": f"{hit[1]:.4f}",
                        "placed_at": f"{hit[2]}, {st}"})
        else:
            missing.append(r["item_id"])
    with (ROOT / "data" / "locations.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["item_id", "lat", "lon", "placed_at"], lineterminator="\n")
        w.writeheader()
        w.writerows(sorted(out, key=lambda x: x["item_id"]))
    print(f"placed {len(out)} metros; not placed: {missing}")


if __name__ == "__main__":
    main(sys.argv[1])
