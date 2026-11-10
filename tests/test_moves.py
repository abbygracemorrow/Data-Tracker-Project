"""The move rule."""
from tracker.moves import TOP_N, compute_moves, issue_body


def row(date, item_id, regular, item=None):
    return {"date": date, "item_id": item_id, "item": item or item_id, "regular": regular}


def test_moves_rank_by_absolute_change_in_regular_price():
    rows = [
        row("2026-11-09", "A", "3.0000"), row("2026-11-10", "A", "3.1000"),   # +0.10
        row("2026-11-09", "B", "4.0000"), row("2026-11-10", "B", "3.7500"),   # -0.25
        row("2026-11-09", "C", "5.0000"), row("2026-11-10", "C", "5.0000"),   #  0
        row("2026-11-08", "A", "9.0000"),                                     # older day ignored
    ]
    result = compute_moves(rows)
    assert result["latest_date"] == "2026-11-10" and result["previous_date"] == "2026-11-09"
    assert [m["item_id"] for m in result["top"]] == ["B", "A", "C"]
    b = result["top"][0]
    assert (b["old"], b["new"], b["change"], b["pct"]) == (4.0, 3.75, -0.25, -6.25)
    assert (result["rose"], result["fell"], result["unchanged"]) == (1, 1, 1)


def test_ties_are_broken_by_item_id_and_list_is_capped():
    rows = []
    for i in range(TOP_N + 5):
        rows += [row("2026-11-09", f"X{i:02d}", "3.0000"), row("2026-11-10", f"X{i:02d}", "3.0500")]
    top = compute_moves(rows)["top"]
    assert len(top) == TOP_N
    assert [m["item_id"] for m in top] == sorted(m["item_id"] for m in top)


def test_appeared_and_disappeared_items():
    rows = [row("2026-11-09", "A", "3"), row("2026-11-09", "GONE", "3"),
            row("2026-11-10", "A", "3"), row("2026-11-10", "NEW", "3")]
    result = compute_moves(rows)
    assert [a["item_id"] for a in result["appeared"]] == ["NEW"]
    assert [g["item_id"] for g in result["gone"]] == ["GONE"]


def test_empty_values_are_skipped():
    rows = [row("2026-11-09", "A", ""), row("2026-11-10", "A", "3.0")]
    assert compute_moves(rows)["top"] == []


def test_first_day_has_no_moves_and_issue_still_has_a_body():
    result = compute_moves([row("2026-11-10", "A", "3")])
    assert result["previous_date"] is None and result["top"] == [] and result["appeared"] == []
    assert "First day" in issue_body(result)


def test_issue_body_lists_old_and_new_values():
    rows = [row("2026-11-09", "A", "3.0000", "Austin, TX"), row("2026-11-10", "A", "3.1000", "Austin, TX")]
    body = issue_body(compute_moves(rows))
    assert "Austin, TX" in body and "$3.0000" in body and "$3.1000" in body and "+0.1000" in body
