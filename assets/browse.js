/* Browse page: filters, search, sort by every numeric column, and a starred shortlist
   stored in localStorage. */
(async function () {
  "use strict";
  const { money, signed, dirClass, arrow, esc } = GP;
  const KEY = "gas-tracker.shortlist";
  let data;
  try { data = await GP.loadData(); } catch (err) { GP.showError(err); return; }

  const items = [...data.latest.values()].map((r) => ({ ...r, change: GP.change(data, r.item_id) }));
  const SORTABLE = [...GP.NUMERIC, "change"];
  const LABEL = { ...GP.LABELS, change: "Change in regular since previous run" };
  const SHORT = { regular: "Regular", midgrade: "Mid", premium: "Premium", diesel: "Diesel", change: "Change",
    regular_yesterday: "Reg. yesterday", regular_week_ago: "Reg. week ago", regular_month_ago: "Reg. month ago",
    regular_year_ago: "Reg. year ago", diesel_year_ago: "Diesel year ago" };

  const $ = (id) => document.getElementById(id);
  const ui = { q: $("q"), level: $("f-level"), state: $("f-state"), dir: $("f-dir"), max: $("f-max"),
    starred: $("f-starred"), sortCol: $("sort-col"), sortDir: $("sort-dir") };

  // star list kept in the browser
  const loadStars = () => { try { return new Set(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch { return new Set(); } };
  let stars = loadStars();
  const saveStars = () => localStorage.setItem(KEY, JSON.stringify([...stars].sort()));

  // fill selects
  const states = [...new Set(items.map((r) => r.state).filter(Boolean))].sort();
  ui.state.innerHTML += states.map((s) => `<option value="${s}">${esc(GP.STATE_NAMES[s] || s)}</option>`).join("");
  ui.sortCol.innerHTML = `<option value="item">Name</option>` + SORTABLE.map((c) => `<option value="${c}">${esc(LABEL[c])}</option>`).join("");
  ui.sortCol.value = "regular";

  // remember the view in the URL hash so a filtered view can be shared or reloaded
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    for (const k of ["q", "level", "state", "dir", "max"]) if (p.has(k)) ui[k].value = p.get(k);
    if (p.has("sort")) ui.sortCol.value = p.get("sort");
    if (p.has("order")) ui.sortDir.value = p.get("order");
    ui.starred.checked = p.get("starred") === "1";
  }
  function writeHash() {
    const p = new URLSearchParams();
    for (const k of ["q", "level", "state", "dir", "max"]) if (ui[k].value) p.set(k, ui[k].value);
    if (ui.sortCol.value !== "regular") p.set("sort", ui.sortCol.value);
    if (ui.sortDir.value !== "desc") p.set("order", ui.sortDir.value);
    if (ui.starred.checked) p.set("starred", "1");
    history.replaceState(null, "", p.toString() ? "#" + p : location.pathname);
  }

  function filtered() {
    const q = ui.q.value.trim().toLowerCase();
    const max = parseFloat(ui.max.value);
    return items.filter((r) =>
      (!q || r.item.toLowerCase().includes(q) || (GP.STATE_NAMES[r.state] || "").toLowerCase().includes(q)) &&
      (!ui.level.value || r.level === ui.level.value) &&
      (!ui.state.value || r.state === ui.state.value) &&
      (!ui.dir.value ||
        (ui.dir.value === "up" && r.change > 0) || (ui.dir.value === "down" && r.change < 0) ||
        (ui.dir.value === "flat" && r.change === 0) || (ui.dir.value === "none" && r.change == null)) &&
      (isNaN(max) || (r.regular != null && r.regular <= max)) &&
      (!ui.starred.checked || stars.has(r.item_id)));
  }

  function sorted(rows) {
    const col = ui.sortCol.value, dir = ui.sortDir.value === "asc" ? 1 : -1;
    return rows.sort((a, b) => {
      if (col === "item") return dir * a.item.localeCompare(b.item);
      const x = a[col], y = b[col];
      if (x == null && y == null) return a.item.localeCompare(b.item);
      if (x == null) return 1;   // empty values always go last
      if (y == null) return -1;
      return dir * (x - y) || a.item.localeCompare(b.item);
    });
  }

  const table = $("table");
  function render() {
    writeHash();
    const rows = sorted(filtered());
    $("count").textContent = `${rows.length} of ${items.length} items · prices for ${GP.fmtDate(data.latestPriceDate)}` +
      (data.prevDate ? ` · changes vs. ${GP.fmtDate(data.prevPriceDate)}` : " · no earlier day yet");
    const col = ui.sortCol.value, dir = ui.sortDir.value;
    const th = (c, label, num = true) => `<th class="sortable ${num ? "num" : ""}" data-col="${c}" title="Sort by ${esc(LABEL[c] || "name")}"
      aria-sort="${col === c ? (dir === "asc" ? "ascending" : "descending") : "none"}">${label}${col === c ? ` <span class="arrow">${dir === "asc" ? "▲" : "▼"}</span>` : ""}</th>`;
    table.innerHTML = `<thead><tr><th>★</th>${th("item", "Item", false)}<th>Level</th><th>State</th>${
      ["regular", "change", "midgrade", "premium", "diesel", "regular_yesterday", "regular_week_ago", "regular_month_ago", "regular_year_ago", "diesel_year_ago"]
        .map((c) => th(c, SHORT[c])).join("")}</tr></thead><tbody>${
      rows.map((r) => `<tr>
        <td><button class="star" type="button" data-id="${esc(r.item_id)}" aria-pressed="${stars.has(r.item_id)}" aria-label="Star ${esc(r.item)}">${stars.has(r.item_id) ? "★" : "☆"}</button></td>
        <td>${esc(r.item)}</td><td><span class="tag ${r.level}">${r.level}</span></td><td>${r.state || ""}</td>
        <td class="num"><strong>${money(r.regular)}</strong></td>
        <td class="num ${dirClass(r.change)}">${r.change == null ? "–" : arrow(r.change) + " " + signed(r.change)}</td>
        ${["midgrade", "premium", "diesel", "regular_yesterday", "regular_week_ago", "regular_month_ago", "regular_year_ago", "diesel_year_ago"]
          .map((c) => `<td class="num">${money(r[c])}</td>`).join("")}
      </tr>`).join("") || `<tr><td colspan="14" class="empty-note">No items match these filters.</td></tr>`}</tbody>`;
    renderShortlist();
  }

  function renderShortlist() {
    const list = [...stars].map((id) => data.latest.get(id)).filter(Boolean).sort((a, b) => a.item.localeCompare(b.item));
    const missing = [...stars].filter((id) => !data.latest.has(id));
    $("short-count").textContent = `${stars.size} starred`;
    $("shortlist").innerHTML = list.length || missing.length
      ? list.map((r) => {
        const ch = GP.change(data, r.item_id);
        return `<span class="chip">${esc(r.item)} · <strong>${money(r.regular, 3)}</strong>${ch == null ? "" : ` <span class="${dirClass(ch)}">${signed(ch, 3)}</span>`}
          <button type="button" data-unstar="${esc(r.item_id)}" aria-label="Remove ${esc(r.item)}">×</button></span>`;
      }).join("") + missing.map((id) => `<span class="chip muted">${esc(id)} (not in latest run) <button type="button" data-unstar="${esc(id)}">×</button></span>`).join("")
      : `<span class="empty-note">Click ☆ next to any item to add it here. Your shortlist stays after you reload the page.</span>`;
  }

  // events
  table.addEventListener("click", (ev) => {
    const star = ev.target.closest(".star");
    if (star) {
      const id = star.dataset.id;
      stars.has(id) ? stars.delete(id) : stars.add(id);
      saveStars();
      render();
      return;
    }
    const head = ev.target.closest("th.sortable");
    if (head) {
      const c = head.dataset.col;
      if (ui.sortCol.value === c) ui.sortDir.value = ui.sortDir.value === "asc" ? "desc" : "asc";
      else { ui.sortCol.value = c; ui.sortDir.value = c === "item" ? "asc" : "desc"; }
      render();
    }
  });
  $("shortlist").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-unstar]");
    if (!b) return;
    stars.delete(b.dataset.unstar);
    saveStars();
    render();
  });
  for (const el of Object.values(ui)) el.addEventListener(el.type === "search" || el.type === "text" ? "input" : "change", render);
  $("reset").addEventListener("click", () => {
    ui.q.value = ui.level.value = ui.state.value = ui.dir.value = ui.max.value = "";
    ui.starred.checked = false; ui.sortCol.value = "regular"; ui.sortDir.value = "desc";
    render();
  });
  window.addEventListener("storage", (e) => { if (e.key === KEY) { stars = loadStars(); render(); } });
  readHash();
  render();
})();
