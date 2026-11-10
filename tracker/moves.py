"""The move rule.

A move is the change in an item's **regular gasoline price** (U.S. dollars per gallon)
between the two most recent dates in the history: ``change = new - old``. Items are
ranked by the size of the change, ``abs(change)``, largest first (ties broken by
item_id), and the daily issue lists the top ``TOP_N`` (15). Items that have a regular
price on the latest date but not on the previous date "appeared"; items with a row on the
previous date but none on the latest date "disappeared".
"""
from __future__ import annotations

TOP_N = 15
MEASURE = "regular"


def _num(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def latest_two_dates(rows: list[dict]) -> tuple[str | None, str | None]:
    dates = sorted({r["date"] for r in rows})
    if not dates:
        return None, None
    return dates[-1], (dates[-2] if len(dates) > 1 else None)


def by_item(rows: list[dict], date: str | None) -> dict[str, dict]:
    return {r["item_id"]: r for r in rows if r["date"] == date}


def compute_moves(rows: list[dict], top_n: int = TOP_N, measure: str = MEASURE) -> dict:
    """Compare the latest date with the previous date in the history."""
    latest, previous = latest_two_dates(rows)
    new = by_item(rows, latest)
    old = by_item(rows, previous)
    moves = []
    for item_id, row in new.items():
        if item_id not in old:
            continue
        a, b = _num(old[item_id].get(measure)), _num(row.get(measure))
        if a is None or b is None:
            continue
        change = round(b - a, 4)
        moves.append({
            "item_id": item_id,
            "item": row["item"],
            "old": a,
            "new": b,
            "change": change,
            "pct": round(100 * change / a, 2) if a else None,
        })
    moves.sort(key=lambda m: (-abs(m["change"]), m["item_id"]))
    appeared = sorted(set(new) - set(old)) if previous else []
    gone = sorted(set(old) - set(new)) if previous else []
    return {
        "latest_date": latest,
        "previous_date": previous,
        "measure": measure,
        "top": moves[:top_n],
        "compared": len(moves),
        "rose": sum(1 for m in moves if m["change"] > 0),
        "fell": sum(1 for m in moves if m["change"] < 0),
        "unchanged": sum(1 for m in moves if m["change"] == 0),
        "appeared": [{"item_id": i, "item": new[i]["item"]} for i in appeared],
        "gone": [{"item_id": i, "item": old[i]["item"]} for i in gone],
    }


def issue_body(result: dict, status: dict | None = None, site_url: str | None = None) -> str:
    """Markdown body for the daily GitHub issue."""
    lines = []
    if result["previous_date"] is None:
        lines.append(f"First day of data ({result['latest_date']}). There is no previous run to "
                     "compare with yet, so no moves are listed.")
    else:
        lines.append(f"Moves in the **regular gas price** (USD per gallon) from "
                     f"**{result['previous_date']}** to **{result['latest_date']}**. "
                     f"{result['compared']} items compared: {result['rose']} rose, "
                     f"{result['fell']} fell, {result['unchanged']} unchanged.")
        lines.append("")
        lines.append(f"Rule: change = new price - old price; the {TOP_N} largest changes by "
                     "absolute size are listed.")
        lines.append("")
        if result["top"]:
            lines.append("| # | Item | Old | New | Change | % |")
            lines.append("|---|---|---:|---:|---:|---:|")
            for i, m in enumerate(result["top"], 1):
                pct = "" if m["pct"] is None else f"{m['pct']:+.2f}%"
                lines.append(f"| {i} | {m['item']} (`{m['item_id']}`) | ${m['old']:.4f} | "
                             f"${m['new']:.4f} | {m['change']:+.4f} | {pct} |")
        else:
            lines.append("No item had a regular price on both days, so there are no moves.")
    lines.append("")
    lines.append(f"**Appeared ({len(result['appeared'])}):** " +
                 (", ".join(f"{a['item']} (`{a['item_id']}`)" for a in result["appeared"]) or "none"))
    lines.append("")
    lines.append(f"**Disappeared ({len(result['gone'])}):** " +
                 (", ".join(f"{g['item']} (`{g['item_id']}`)" for g in result["gone"]) or "none"))
    if status:
        failed = [s["name"] for s in status.get("sources", []) if not s["ok"]]
        lines.append("")
        lines.append(f"Sources: {len(status.get('sources', [])) - len(failed)} ok, {len(failed)} failed"
                     + (f" ({', '.join(failed)})" if failed else "") + ".")
    if site_url:
        lines.append("")
        lines.append(f"Site: {site_url}")
    return "\n".join(lines) + "\n"
