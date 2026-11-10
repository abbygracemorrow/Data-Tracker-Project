"""Open (or update) today's GitHub issue and close the previous days' issues.

Uses the GitHub REST API with the workflow's GITHUB_TOKEN. Every daily issue carries the
label ``daily-moves`` and is titled with the run's UTC date (YYYY-MM-DD).
"""
from __future__ import annotations

import json
import os
import urllib.request

LABEL = "daily-moves"
API = "https://api.github.com"


def _call(method: str, path: str, token: str, body: dict | None = None):
    req = urllib.request.Request(
        API + path, method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {token}",
                 "Accept": "application/vnd.github+json",
                 "X-GitHub-Api-Version": "2022-11-28",
                 "User-Agent": "gas-price-tracker"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        text = resp.read()
        return json.loads(text) if text else None


def publish(date: str, body: str, repo: str | None = None, token: str | None = None) -> str:
    """Create or update the issue titled ``date``; close every other open daily issue."""
    repo = repo or os.environ["GITHUB_REPOSITORY"]
    token = token or os.environ["GITHUB_TOKEN"]
    try:
        _call("POST", f"/repos/{repo}/labels", token,
              {"name": LABEL, "color": "f28c28", "description": "Daily gas price moves"})
    except Exception:  # noqa: BLE001 - the label already exists
        pass
    issues = _call("GET", f"/repos/{repo}/issues?labels={LABEL}&state=all&per_page=100", token) or []
    today = next((i for i in issues if i["title"] == date and "pull_request" not in i), None)
    if today:
        _call("PATCH", f"/repos/{repo}/issues/{today['number']}", token,
              {"body": body, "state": "open"})
        number, action = today["number"], "updated"
    else:
        number = _call("POST", f"/repos/{repo}/issues", token,
                       {"title": date, "body": body, "labels": [LABEL]})["number"]
        action = "opened"
    for i in issues:
        if i["state"] == "open" and i["number"] != number and "pull_request" not in i:
            _call("PATCH", f"/repos/{repo}/issues/{i['number']}", token,
                  {"state": "closed", "state_reason": "completed"})
    return f"{action} issue #{number}"
