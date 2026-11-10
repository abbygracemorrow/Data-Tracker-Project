/* Today page: status tiles, the interactive map, biggest moves, sources and all latest values. */
(async function () {
  "use strict";
  const { money, signed, pct, dirClass, arrow, fmtDate, fmtTime, esc } = GP;
  let data, us;
  try {
    [data, us] = await Promise.all([
      GP.loadData({ locations: true }),
      fetch("assets/vendor/us-states-10m.json").then((r) => r.json()),
    ]);
  } catch (err) { GP.showError(err); return; }

  const st = data.status;
  const metros = [...data.latest.values()].filter((r) => r.level === "metro");
  document.getElementById("metro-count").textContent = metros.length;
  document.getElementById("latest-date").textContent = fmtDate(data.latestPriceDate);
  document.getElementById("prev-date").textContent = data.prevDate ? fmtDate(data.prevPriceDate) : "none yet";

  // ------------------------------------------------------------- tiles
  // new_today / gone_today from the status file, described in terms of gas-price coverage
  const listNames = (items) => {
    const names = items.map((i) => esc(i.item.replace(/ \(EIA weekly\)$/, " (EIA)")));
    return names.slice(0, 3).join(", ") + (names.length > 3 ? ` and ${names.length - 3} more` : "");
  };
  function coverageNew() {
    if (!data.prevDate) return "first run: every area is new, so nothing to compare yet";
    if (!st.new_today.length) return `no areas started reporting prices since ${fmtDate(data.prevPriceDate)}`;
    return `started reporting prices: ${listNames(st.new_today)}`;
  }
  function coverageGone() {
    if (!data.prevDate) return "first run: nothing to compare yet";
    const before = data.prev.size;
    if (!st.gone_today.length) return `all ${before} areas from ${fmtDate(data.prevPriceDate)} reported prices again`;
    const failed = st.sources.filter((x) => !x.ok).map((x) => esc(x.name));
    return `no prices today for ${listNames(st.gone_today)}` +
      (failed.length ? ` (failed source${failed.length > 1 ? "s" : ""}: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "…" : ""})` : " (dropped from the source's list)");
  }
  const shortDate = (iso) => (iso ? d3.timeFormat("%b %-d")(d3.timeParse("%Y-%m-%d")(iso)) : "–");
  const nat = data.latest.get("US") || data.latest.get("EIA-US");   // EIA is the backup if AAA failed
  const natChange = GP.change(data, "US");
  const okSources = st.sources.filter((s) => s.ok).length;
  const tiles = [
    { cls: "hero", label: "U.S. average, regular", value: money(nat && nat.regular, 3),
      sub: natChange == null ? "No previous run to compare with yet"
        : `<span>${arrow(natChange)} ${signed(natChange)} since ${fmtDate(data.prevPriceDate)}</span>` },
    { label: "Last updated", value: new Date(st.run_time).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
      sub: "your local time" },
    { label: "Prices as of", value: shortDate(data.latestPriceDate),
      sub: "the day AAA's averages are for; it moves forward with each daily run" },
    { label: "Items in latest run", value: st.items, sub: "1 national, states and metro areas" },
    { label: "Days with data", value: st.days_with_success, sub: `<span id="first-run">since ${fmtDate(st.first_run_date)} (UTC)</span>` },
    { label: "Sources OK", value: `${okSources} / ${st.sources.length}`, sub: okSources === st.sources.length ? "all sources succeeded" : `${st.sources.length - okSources} failed` },
    { label: "New on the price board", value: st.new_today.length, sub: coverageNew() },
    { label: "Missing from today's run", value: st.gone_today.length, sub: coverageGone() },
  ];
  document.getElementById("tiles").innerHTML = tiles.map((t) =>
    `<div class="tile ${t.cls || ""}"><div class="label">${t.label}</div><div class="value" ${t.small ? 'style="font-size:1.05rem"' : ""}>${t.value}</div><div class="sub">${t.sub}</div></div>`).join("");

  // The first run's time in the visitor's own time zone (history dates are UTC dates, so an
  // evening run in the Americas is already the next day in UTC). Read from data/source_log.csv.
  fetch("data/source_log.csv", { cache: "no-cache" }).then((r) => (r.ok ? r.text() : "")).then((text) => {
    const first = d3.csvParse(text).map((l) => l.run_time).filter(Boolean).sort()[0];
    if (!first) return;
    const t = new Date(first);
    document.getElementById("first-run").textContent = "since " +
      t.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) + ", your time";
    document.getElementById("first-run").title = `First run ${first} (UTC date ${st.first_run_date})`;
  }).catch(() => {});

  // ------------------------------------------------------------- sources
  document.getElementById("sources-summary").textContent =
    `${okSources} of ${st.sources.length} succeeded in the run at ${st.run_time}`;
  document.getElementById("sources").innerHTML = st.sources.map((s) =>
    `<div class="src ${s.ok ? "" : "fail"}" title="${esc(s.error || (s.ok ? "ok" : "failed"))}">
       <span><span class="ok-icon">${s.ok ? "✓" : "✗"}</span> ${esc(s.name)}</span><span class="num">${s.count}</span></div>`).join("");

  // ------------------------------------------------------------- moves
  const mv = GP.moves(data).slice(0, 15);
  const movesEl = document.getElementById("moves");
  if (!data.prevDate) {
    movesEl.innerHTML = `<p class="empty-note">Only one day of prices so far (${fmtDate(data.latestPriceDate)}). Moves appear after the next daily run.</p>`;
  } else {
    const maxAbs = d3.max(mv, (m) => Math.abs(m.change)) || 1;
    movesEl.innerHTML = `<div class="table-wrap"><table><thead><tr><th>#</th><th>Item</th><th class="num">Old (${fmtDate(data.prevPriceDate)})</th><th class="num">New (${fmtDate(data.latestPriceDate)})</th><th class="num">Change</th><th class="num">%</th><th style="width:180px"></th></tr></thead><tbody>${
      mv.map((m, i) => {
        const w = (Math.abs(m.change) / maxAbs) * 80;
        const bar = `<svg width="170" height="12" aria-hidden="true"><line x1="85" x2="85" y1="0" y2="12" stroke="#cbbfa6"/><rect x="${m.change < 0 ? 85 - w : 85}" y="2" width="${Math.max(w, 1)}" height="8" rx="2" fill="${m.change > 0 ? GP.UP : GP.DOWN}"/></svg>`;
        return `<tr class="clickable" data-id="${esc(m.item_id)}" title="Show ${esc(m.item)} on the map"><td>${i + 1}</td><td>${esc(m.item)} <span class="tag ${m.level}">${m.level}</span></td><td class="num">${money(m.old)}</td><td class="num">${money(m.new)}</td><td class="num ${dirClass(m.change)}">${arrow(m.change)} ${signed(m.change)}</td><td class="num">${pct(m.pct)}</td><td>${bar}</td></tr>`;
      }).join("")}</tbody></table></div>
      ${st.new_today.length || st.gone_today.length ? `<p class="small">Appeared: ${st.new_today.map((i) => esc(i.item)).join(", ") || "none"}. Disappeared: ${st.gone_today.map((i) => esc(i.item)).join(", ") || "none"}.</p>` : ""}`;
  }

  // ------------------------------------------------------------- all items table
  const allTable = document.getElementById("all-table");
  const levelOrder = { national: 0, state: 1, metro: 2, eia: 3 };
  function drawAll() {
    const lvl = document.getElementById("all-level").value;
    const rows = [...data.latest.values()].filter((r) => !lvl || r.level === lvl)
      .sort((a, b) => levelOrder[a.level] - levelOrder[b.level] || a.item.localeCompare(b.item));
    const cell = (r, c) => {
      const ch = GP.change(data, r.item_id, c);
      return `<td class="num">${money(r[c])}</td><td class="num small ${dirClass(ch)}">${ch == null ? "–" : signed(ch)}</td>`;
    };
    allTable.innerHTML = `<thead><tr><th>Item</th><th>Level</th>${["regular", "midgrade", "premium", "diesel"].map((c) =>
      `<th class="num">${GP.LABELS[c]}</th><th class="num">Change</th>`).join("")}</tr></thead><tbody>${
      rows.map((r) => `<tr><td>${esc(r.item)}</td><td><span class="tag ${r.level}">${r.level}</span></td>${cell(r, "regular")}${cell(r, "midgrade")}${cell(r, "premium")}${cell(r, "diesel")}</tr>`).join("")}</tbody>`;
  }
  document.getElementById("all-level").addEventListener("change", drawAll);
  drawAll();

  // ------------------------------------------------------------- map
  const W = 975, H = 610;
  const nameToCode = Object.fromEntries(Object.entries(GP.STATE_NAMES).map(([k, v]) => [v, k]));
  const features = topojson.feature(us, us.objects.states).features
    .map((f) => ({ ...f, code: nameToCode[f.properties.name] }))
    .filter((f) => f.code);
  const projection = d3.geoAlbersUsa().fitSize([W, H], { type: "FeatureCollection", features });
  const path = d3.geoPath(projection);
  const svg = d3.select("#map");
  // old wall-map touches: faint grid lines on the ocean and a title cartouche
  svg.append("defs").html(`<pattern id="ocean-grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M48 0H0V48" fill="none" stroke="#bcd6e6" stroke-width="0.8"/></pattern>`);
  svg.append("rect").attr("width", W).attr("height", H).attr("fill", "url(#ocean-grid)");
  svg.append("text").attr("class", "map-title").attr("x", 655).attr("y", H - 30).attr("text-anchor", "middle").attr("font-size", 22).text("The United States");
  svg.append("text").attr("class", "map-sub").attr("x", 655).attr("y", H - 12).attr("text-anchor", "middle").attr("font-size", 11).text("GAS PRICES · AAA");
  const root = svg.append("g");
  const gStates = root.append("g");
  const gBorders = root.append("path")
    .datum(topojson.mesh(us, us.objects.states, (a, b) => a !== b))
    .attr("fill", "none").attr("stroke", "#fffaf0").attr("stroke-width", 0.6).attr("d", path).attr("pointer-events", "none");
  const gMetros = root.append("g");
  const metroPts = metros.map((r) => {
    const loc = data.locations.get(r.item_id);
    const xy = loc && projection(loc);
    return xy ? { r, x: xy[0], y: xy[1] } : null;
  }).filter(Boolean);

  const state = { fuel: "regular", mode: "price", metros: true, selected: null, k: 1 };
  const t = GP.tooltip();

  function value(row, fuel = state.fuel, mode = state.mode) {
    if (!row) return null;
    if (mode === "price") return row[fuel];
    if (mode === "change") return GP.change(data, row.item_id, fuel);
    const ago = fuel === "regular" ? row.regular_year_ago : fuel === "diesel" ? row.diesel_year_ago : null;
    return ago && row[fuel] != null ? (100 * (row[fuel] - ago)) / ago : null;
  }
  const fmtValue = (v) => (v == null ? "no data" : state.mode === "price" ? money(v) : state.mode === "change" ? signed(v) : pct(v, 1));

  let color;
  function makeScale() {
    const vals = [...features.map((f) => value(data.latest.get(f.code))), ...metroPts.map((p) => value(p.r))]
      .filter((v) => v != null).sort(d3.ascending);
    if (!vals.length) { color = () => GP.NODATA; return []; }
    if (state.mode === "price") {
      const lo = d3.quantile(vals, 0.02), hi = d3.quantile(vals, 0.98);
      color = d3.scaleSequential(d3.interpolateRgbBasis(GP.PRICE_RAMP)).domain([lo, hi]).clamp(true);
      return [lo, hi];
    }
    const m = Math.max(d3.quantile(vals.map(Math.abs).sort(d3.ascending), 0.98) || 0, state.mode === "change" ? 0.01 : 1);
    color = d3.scaleDiverging(d3.interpolateRgbBasis(GP.DIVERGING)).domain([-m, 0, m]).clamp(true);
    return [-m, m];
  }

  function legend(domain) {
    const el = document.getElementById("map-legend");
    if (!domain.length) { el.innerHTML = '<span class="empty-note">No values to show for this choice yet.</span>'; return; }
    const w = 260, stops = d3.range(0, 1.0001, 0.1);
    const lo = domain[0], hi = domain[1];
    const id = "lg" + Math.random().toString(36).slice(2);
    const fmt = state.mode === "price" ? (v) => "$" + v.toFixed(2) : state.mode === "change" ? (v) => signed(v, 3) : (v) => pct(v, 0);
    const mid = state.mode === "price" ? (lo + hi) / 2 : 0;
    el.innerHTML = `<span>${state.mode === "price" ? GP.LABELS[state.fuel] + " price, $/gal" : state.mode === "change" ? "Change since " + fmtDate(data.prevPriceDate) + ", $/gal" : "Change vs. a year ago, %"}</span>
      <svg width="${w}" height="30"><defs><linearGradient id="${id}">${stops.map((s) => `<stop offset="${s}" stop-color="${color(lo + s * (hi - lo))}"/>`).join("")}</linearGradient></defs>
      <rect width="${w}" height="10" rx="3" fill="url(#${id})"/>
      <text x="0" y="24" font-size="11" fill="#5a554c">${fmt(lo)}</text>
      <text x="${w / 2}" y="24" font-size="11" fill="#5a554c" text-anchor="middle">${fmt(mid)}</text>
      <text x="${w}" y="24" font-size="11" fill="#5a554c" text-anchor="end">${fmt(hi)}</text></svg>
      ${state.mode !== "price" ? '<span><span style="color:#7e2d22">■</span> rose · <span style="color:#1d5a85">■</span> fell</span>' : ""}
      <span><span style="color:${GP.NODATA}">■</span> no data</span>`;
  }

  function stateTip(f) {
    const r = data.latest.get(f.code);
    if (!r) return `<div class="t-title">${esc(f.properties.name)}</div>No data`;
    const n = metros.filter((m) => m.state === f.code).length;
    return `<div class="t-title">${esc(r.item)}</div>` +
      ["regular", "midgrade", "premium", "diesel"].map((c) => {
        const ch = GP.change(data, r.item_id, c);
        return `<div class="t-row"><span>${GP.LABELS[c]}</span><span class="num">${money(r[c], 3)}${ch == null ? "" : ` <span class="${dirClass(ch)}">${signed(ch, 3)}</span>`}</span></div>`;
      }).join("") + `<div class="muted small">${n} metro area${n === 1 ? "" : "s"} · click to zoom</div>`;
  }
  function metroTip(r) {
    const yr = r.regular_year_ago;
    return `<div class="t-title">${esc(r.item)}</div>` +
      ["regular", "midgrade", "premium", "diesel"].map((c) => {
        const ch = GP.change(data, r.item_id, c);
        return `<div class="t-row"><span>${GP.LABELS[c]}</span><span class="num">${money(r[c], 3)}${ch == null ? "" : ` <span class="${dirClass(ch)}">${signed(ch, 3)}</span>`}</span></div>`;
      }).join("") +
      (yr ? `<div class="t-row muted"><span>Regular a year ago</span><span class="num">${money(yr, 3)}</span></div>` : "");
  }

  function draw() {
    const domain = makeScale();
    gStates.selectAll("path").data(features, (f) => f.code).join("path")
      .attr("class", (f) => "state" + (state.selected === f.code ? " selected" : ""))
      .attr("data-state", (f) => f.code)
      .attr("d", path)
      .attr("fill", (f) => { const v = value(data.latest.get(f.code)); return v == null ? GP.NODATA : color(v); })
      .attr("stroke-width", 0.8)
      .on("mousemove", (ev, f) => t.show(stateTip(f), ev))
      .on("mouseleave", () => t.hide())
      .on("click", (ev, f) => { ev.stopPropagation(); select(f); });
    gMetros.style("display", state.metros ? null : "none");
    gMetros.selectAll("circle").data(metroPts, (p) => p.r.item_id).join("circle")
      .attr("class", "metro").attr("data-id", (p) => p.r.item_id)
      .attr("cx", (p) => p.x).attr("cy", (p) => p.y)
      .attr("r", 5 / Math.sqrt(state.k)).attr("stroke-width", 1.5)
      .attr("fill", (p) => { const v = value(p.r); return v == null ? GP.NODATA : color(v); })
      .attr("opacity", (p) => (state.selected && p.r.state !== state.selected ? 0.35 : 1))
      .on("mousemove", (ev, p) => t.show(metroTip(p.r), ev))
      .on("mouseleave", () => t.hide());
    legend(domain);
    document.getElementById("map-caption").textContent =
      `${GP.LABELS[state.fuel]} · ${state.mode === "price" ? "prices for " + fmtDate(data.latestPriceDate) : state.mode === "change" ? "change since " + fmtDate(data.prevPriceDate) : "change vs. a year ago"}`;
    panel();
  }

  function panel() {
    const title = document.getElementById("panel-title");
    const list = document.getElementById("panel-list");
    const li = (r) => {
      const v = value(r);
      const cls = state.mode === "price" ? "" : dirClass(v);
      return `<li><span>${esc(r.item)}</span><span class="num ${cls}">${fmtValue(v)}</span></li>`;
    };
    if (state.selected) {
      const s = data.latest.get(state.selected);
      const ms = metros.filter((m) => m.state === state.selected)
        .sort((a, b) => (value(b) ?? -Infinity) - (value(a) ?? -Infinity));
      title.textContent = `${GP.STATE_NAMES[state.selected]}: ${ms.length} metro area${ms.length === 1 ? "" : "s"}`;
      list.innerHTML = (s ? `<li><strong>State average</strong><strong class="num">${fmtValue(value(s))}</strong></li>` : "") + ms.map(li).join("");
    } else {
      const rows = [...data.latest.values()].filter((r) => r.level === "state" && value(r) != null)
        .sort((a, b) => value(b) - value(a));
      if (!rows.length) {
        title.textContent = "States";
        list.innerHTML = `<li class="empty-note">${state.mode === "change" ? "Changes appear after the second daily run." : "AAA's state table has no year-ago prices; switch on metro dots to see them."}</li>`;
        return;
      }
      title.textContent = state.mode === "price" ? `Most expensive and cheapest states (${GP.LABELS[state.fuel].toLowerCase()})`
        : `States that ${state.mode === "change" ? "rose and fell the most since the previous run" : "changed most vs. a year ago"}`;
      list.innerHTML = rows.slice(0, 8).map(li).join("") + `<li class="muted small" style="justify-content:center">…</li>` + rows.slice(-8).map(li).join("");
    }
  }

  // zoom and pan
  const zoom = d3.zoom().scaleExtent([1, 12]).translateExtent([[0, 0], [W, H]])
    .on("zoom", (ev) => {
      state.k = ev.transform.k;
      root.attr("transform", ev.transform);
      gStates.selectAll("path").attr("stroke-width", 0.8);
      gBorders.attr("stroke-width", 0.6);
      gMetros.selectAll("circle").attr("r", 5 / Math.sqrt(state.k)).attr("stroke-width", 1.5);
    });
  svg.call(zoom);
  function select(f) {
    if (!f || state.selected === f.code) {
      state.selected = null;
      svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity);
    } else {
      state.selected = f.code;
      const [[x0, y0], [x1, y1]] = path.bounds(f);
      const k = Math.min(10, 0.85 / Math.max((x1 - x0) / W, (y1 - y0) / H));
      svg.transition().duration(700).call(zoom.transform,
        d3.zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
    }
    draw();
  }
  svg.on("click", () => { if (state.selected) select(null); });
  document.getElementById("map-reset").addEventListener("click", () => select(null));

  // controls
  function seg(id, key) {
    const el = document.getElementById(id);
    el.addEventListener("click", (ev) => {
      const b = ev.target.closest("button");
      if (!b || b.disabled) return;
      state[key] = b.dataset.v;
      el.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      syncDisabled();
      draw();
    });
  }
  function syncDisabled() {
    // year-ago prices exist only for regular and diesel; changes need a previous run
    const fuelBtns = document.querySelectorAll("#fuel-seg button");
    fuelBtns.forEach((b) => { b.disabled = state.mode === "year" && (b.dataset.v === "midgrade" || b.dataset.v === "premium"); });
    if (state.mode === "year" && (state.fuel === "midgrade" || state.fuel === "premium")) {
      state.fuel = "regular";
      fuelBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === "regular")));
    }
    document.querySelector('#mode-seg button[data-v="change"]').disabled = !data.prevDate;
  }
  seg("fuel-seg", "fuel");
  seg("mode-seg", "mode");
  document.getElementById("show-metros").addEventListener("change", (e) => { state.metros = e.target.checked; draw(); });
  syncDisabled();
  draw();

  // ============================================================= interactive tools
  const fmtClock = (d) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  // ----- next update: every day at 6:00 AM Central (America/Chicago) -----
  function centralOffsetHours(date) {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", timeZoneName: "shortOffset" })
      .formatToParts(date).find((p) => p.type === "timeZoneName").value;          // e.g. "GMT-6"
    const m = name.match(/GMT([+-]\d+)/);
    return m ? +m[1] : -6;
  }
  function sixAmCentral(dayOffset, now = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "numeric", day: "numeric" })
      .formatToParts(now).filter((p) => p.type !== "literal").map((p) => [p.type, +p.value]));
    const guess = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + dayOffset, 12));   // noon UTC that day
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day + dayOffset, 6 - centralOffsetHours(guess)));
  }
  const nextEl = document.getElementById("next-update");
  let polling = null;
  function tick() {
    const now = new Date();
    const today6 = sixAmCentral(0, now), next = now < today6 ? today6 : sixAmCentral(1, now);
    const last6 = now < today6 ? sixAmCentral(-1, now) : today6;
    const lastRun = new Date(st.run_time);
    const localNote = Intl.DateTimeFormat().resolvedOptions().timeZone === "America/Chicago" ? "" : ` (${fmtClock(next)} your time)`;
    const sinceSlot = (now - last6) / 36e5;
    if (!data.asOf && lastRun < last6 && sinceSlot < 12) {
      // today's 6 AM run should have happened but its data isn't here yet
      nextEl.innerHTML = `<div class="nu-label">Today's update</div><div class="nu-time">${sinceSlot < 1 ? "Running now…" : "Running late"}</div>
        <div class="nu-sub">${sinceSlot < 1 ? "New prices usually appear within a few minutes. This page checks for them every 2 minutes."
          : "GitHub started today's run late. The tracker retries every 10 minutes until it runs, and this page checks every 2 minutes."}</div>`;
      if (!polling) polling = setInterval(checkForNewData, 120000);
      return;
    }
    const ms = next - now, h = Math.floor(ms / 36e5), m = Math.floor((ms % 36e5) / 6e4), sec = Math.floor((ms % 6e4) / 1e3);
    const pctDay = Math.min(100, Math.max(0, (100 * (now - last6)) / (next - last6)));
    nextEl.innerHTML = `<div class="nu-label">Next update in</div>
      <div class="nu-time">${String(h).padStart(2, "0")}<small>h</small> ${String(m).padStart(2, "0")}<small>m</small> ${String(sec).padStart(2, "0")}<small>s</small></div>
      <div class="nu-bar" role="progressbar" aria-valuenow="${pctDay.toFixed(0)}" aria-valuemin="0" aria-valuemax="100" aria-label="Time until the next update"><span style="width:${pctDay.toFixed(2)}%"></span></div>
      <div class="nu-sub">Every day at 6:00 AM Central${localNote}. Last update ${lastRun.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}.</div>`;
  }
  async function checkForNewData() {
    try {
      const fresh = await (await fetch("data/status.json", { cache: "no-cache" })).json();
      if (fresh.run_time && fresh.run_time !== st.run_time) {
        clearInterval(polling);
        nextEl.innerHTML = `<div class="nu-label">New prices are in</div><div class="nu-time">Updated</div>
          <button class="btn nu-reload" type="button">Show today's prices</button>`;
        nextEl.querySelector(".nu-reload").addEventListener("click", () => location.reload());
        clearInterval(timer);
      }
    } catch { /* offline: try again next time */ }
  }
  tick();
  const timer = setInterval(tick, 1000);

  // ----- find your city -----
  const allItems = [...data.latest.values()].filter((r) => r.level !== "eia")
    .sort((a, b) => levelOrder[a.level] - levelOrder[b.level] || a.item.localeCompare(b.item));
  const byName = new Map(allItems.map((r) => [r.item.toLowerCase(), r]));
  document.getElementById("city-list").innerHTML = allItems.map((r) => `<option value="${esc(r.item)}">`).join("");
  const cityQ = document.getElementById("city-q"), cityCard = document.getElementById("city-card");
  let chosen = null;

  function findItem(text) {
    const q = text.trim().toLowerCase();
    if (!q) return null;
    if (byName.has(q)) return byName.get(q);
    const code = Object.keys(GP.STATE_NAMES).find((c) => c.toLowerCase() === q);
    if (code) return data.latest.get(code);
    return allItems.find((r) => r.level === "metro" && r.item.toLowerCase().startsWith(q))
      || allItems.find((r) => r.item.toLowerCase().startsWith(q))
      || allItems.find((r) => r.item.toLowerCase().includes(q)) || null;
  }
  function rankOf(r) {
    const peers = allItems.filter((x) => x.level === r.level && x.regular != null).sort((a, b) => b.regular - a.regular);
    return [peers.findIndex((x) => x.item_id === r.item_id) + 1, peers.length];
  }
  function showCity(r, how = "") {
    chosen = r;
    if (!r) { cityCard.innerHTML = ""; fillUp(); return; }
    localStorage.setItem("gas-tracker.city", r.item_id);
    const [rank, of] = rankOf(r);
    const us = data.latest.get("US");
    const vsUS = us && r.regular != null && r.item_id !== "US" ? r.regular - us.regular : null;
    const yr = r.regular_year_ago ? (100 * (r.regular - r.regular_year_ago)) / r.regular_year_ago : null;
    const grade = (c) => { const ch = GP.change(data, r.item_id, c);
      return `<div class="cc-grade"><span>${GP.LABELS[c]}</span><strong>${money(r[c], 3)}</strong><em class="${dirClass(ch)}">${ch == null ? "" : signed(ch, 3)}</em></div>`; };
    const levelWord = { metro: "metro areas", state: "states", national: "" }[r.level];
    cityCard.innerHTML = `
      ${how ? `<div class="cc-how">${how}</div>` : ""}
      <div class="cc-head"><h3>${esc(r.item)}</h3><span class="tag ${r.level}">${r.level}</span></div>
      <div class="cc-grades">${["regular", "midgrade", "premium", "diesel"].map(grade).join("")}</div>
      <ul class="cc-facts">
        ${levelWord ? (rank <= of / 2 ? `<li><strong>#${rank}</strong> most expensive of ${of} ${levelWord} for regular</li>` : `<li><strong>#${of - rank + 1}</strong> cheapest of ${of} ${levelWord} for regular</li>`) : ""}
        ${vsUS != null ? `<li><strong class="${dirClass(vsUS)}">${signed(vsUS, 3)}</strong> vs. the U.S. average (${money(us.regular, 3)})</li>` : ""}
        ${yr != null ? `<li><strong class="${dirClass(yr)}">${pct(yr, 1)}</strong> vs. a year ago (${money(r.regular_year_ago, 3)})</li>` : ""}
      </ul>
      <button class="btn cc-map" type="button">Show on the map</button>`;
    cityCard.querySelector(".cc-map").addEventListener("click", () => focusOnMap(r.item_id, true));
    focusOnMap(r.item_id, false);
    fillUp();
  }
  cityQ.addEventListener("change", () => showCity(findItem(cityQ.value)));
  cityQ.addEventListener("keydown", (e) => { if (e.key === "Enter") showCity(findItem(cityQ.value)); });

  // nearest metro area to the visitor (uses the browser's location, only when asked)
  document.getElementById("locate").addEventListener("click", () => {
    if (!navigator.geolocation) { cityCard.innerHTML = '<p class="empty-note">Your browser can\'t share a location. Type a city instead.</p>'; return; }
    cityCard.innerHTML = '<p class="empty-note">Finding the nearest metro area…</p>';
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      const rad = Math.PI / 180;
      let best = null, bestKm = Infinity;
      for (const [id, [plon, plat]] of data.locations) {
        if (!data.latest.has(id)) continue;
        const a = Math.sin(((plat - lat) * rad) / 2) ** 2 + Math.cos(lat * rad) * Math.cos(plat * rad) * Math.sin(((plon - lon) * rad) / 2) ** 2;
        const km = 12742 * Math.asin(Math.sqrt(a));
        if (km < bestKm) { bestKm = km; best = id; }
      }
      if (!best) { cityCard.innerHTML = '<p class="empty-note">No metro area found near you.</p>'; return; }
      const r = data.latest.get(best);
      cityQ.value = r.item;
      showCity(r, `Nearest metro area, about ${Math.round(bestKm * 0.621371)} miles away`);
    }, () => { cityCard.innerHTML = '<p class="empty-note">Location wasn\'t shared. Type a city or state instead.</p>'; },
    { timeout: 10000, maximumAge: 3600000 });
  });

  // ----- fill-up calculator -----
  const tank = document.getElementById("tank"), tankOut = document.getElementById("tank-out"), fillFuel = document.getElementById("fill-fuel");
  tank.value = localStorage.getItem("gas-tracker.tank") || tank.value;
  function fillUp() {
    const gal = +tank.value, fuel = fillFuel.value;
    tankOut.textContent = `${gal} gal`;
    localStorage.setItem("gas-tracker.tank", gal);
    const us = data.latest.get("US");
    const states = allItems.filter((r) => r.level === "state" && r[fuel] != null).sort((a, b) => a[fuel] - b[fuel]);
    const here = chosen && chosen[fuel] != null ? chosen : null;
    const rows = [];
    if (here) rows.push({ name: here.item, v: here[fuel], me: true });
    if (us && us[fuel] != null && (!here || here.item_id !== "US")) rows.push({ name: "U.S. average", v: us[fuel] });
    if (states.length) {
      rows.push({ name: `${states[0].item} (cheapest state)`, v: states[0][fuel] });
      rows.push({ name: `${states[states.length - 1].item} (priciest state)`, v: states[states.length - 1][fuel] });
    }
    const max = d3.max(rows, (r) => r.v * gal) || 1;
    const lead = here ? `A ${gal}-gallon fill-up of ${GP.LABELS[fuel].toLowerCase()} in <strong>${esc(here.item)}</strong> costs about
        <span class="fill-big">${money(here[fuel] * gal, 2)}</span>`
      : `Pick a city to see your cost. A ${gal}-gallon fill-up of ${GP.LABELS[fuel].toLowerCase()} costs about
        <span class="fill-big">${us && us[fuel] != null ? money(us[fuel] * gal, 2) : "–"}</span> at the U.S. average`;
    document.getElementById("fill-result").innerHTML = `<p class="fill-lead">${lead}</p>
      <div class="fill-bars">${rows.map((r) => `<div class="fill-row ${r.me ? "me" : ""}"><span class="fr-name">${esc(r.name)}</span>
        <span class="fr-bar"><span style="width:${((100 * r.v * gal) / max).toFixed(1)}%"></span></span><span class="fr-val">${money(r.v * gal, 2)}</span></div>`).join("")}</div>
      <p class="muted small">${GP.LABELS[fuel]} at ${money(here ? here[fuel] : us && us[fuel], 3)} a gallon × ${gal} gallons.${fuel !== "regular" && !states.length ? "" : ""}</p>`;
  }
  tank.addEventListener("input", fillUp);
  fillFuel.addEventListener("change", fillUp);

  // ----- map focus: zoom to the place and ring it -----
  function focusOnMap(id, scroll) {
    const r = data.latest.get(id);
    if (!r) return;
    gMetros.selectAll(".focus-ring").remove();
    if (r.level === "national") { select(null); }
    else {
      const f = features.find((x) => x.code === r.state);
      if (f && state.selected !== f.code) select(f);
      const p = metroPts.find((m) => m.r.item_id === id);
      if (p) gMetros.append("circle").attr("class", "focus-ring").attr("cx", p.x).attr("cy", p.y).attr("r", 9);
    }
    if (scroll) document.getElementById("map-section").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  movesEl.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;
    const r = data.latest.get(tr.dataset.id);
    if (r && r.level !== "eia") { cityQ.value = r.item; showCity(r); focusOnMap(r.item_id, true); }
  });

  // start with the last city this visitor picked, if any
  const saved = localStorage.getItem("gas-tracker.city");
  if (saved && data.latest.has(saved)) { cityQ.value = data.latest.get(saved).item; showCity(data.latest.get(saved)); }
  else fillUp();
})();
