"""Every source converts to the common columns, using the raw files the pipeline saved.

For each of the 52 sources this takes the most recent raw file in data/raw/ and checks that
it converts into rows with the common columns, the right source name, a unique item_id per
row, and the two main numeric values (regular and at least one other grade) filled in.
"""
import gzip

import pytest

from tracker.build import RAW, raw_files
from tracker.sources import COLUMNS, convert, source_names

LATEST = {}
for _date, _source, _path in raw_files(RAW):
    LATEST[_source] = (_date, _path)   # raw_files is in date order, so the last one wins


def test_every_saved_raw_file_belongs_to_a_known_source():
    assert set(LATEST) <= set(source_names())


@pytest.mark.parametrize("source", source_names())
def test_source_converts_to_common_columns(source):
    if source not in LATEST:
        pytest.skip(f"no raw file saved yet for {source}")
    date, path = LATEST[source]
    rows = convert(source, gzip.decompress(path.read_bytes()), date)
    assert rows, f"{path} gave no rows"
    ids = [r["item_id"] for r in rows]
    assert len(ids) == len(set(ids))
    for r in rows:
        assert list(r) == COLUMNS
        assert r["date"] == date and r["source"] == source and r["item"]
        assert float(r["regular"]) > 0
        assert any(r[c] for c in ("midgrade", "premium", "diesel")) or r["level"] == "national"
        if source != "aaa_states":
            assert r["level"] == "metro" and r["state"] == source[4:].upper()
