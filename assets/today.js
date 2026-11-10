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
  document.getElementById("latest-date").textContent = fmtDate(data.latestDate);
  document.getElementById("prev-date").textContent = data.prevDate ? fmtDate(data.prevDate) : "none yet";

  // ------------------------------------------------------------- tiles
  const nat = data.latest.get("US");
  const natChange = GP.change(data, "US");
  const okSources = st.sources.filter((s) => s.ok).length;
  const tiles = [
    { cls: "hero", label: "U.S. average, regular", value: money(nat && nat.regular, 3),
      sub: natChange == null ? "No previous run to compare with yet"
        : `<span>${arrow(natChange)} ${signed(natChange)} since ${fmtDate(data.prevDate)}</span>` },
    { label: "Last run", value: fmtTime(st.run_time).replace(" (local)", ""), sub: st.run_time + " UTC", small: true },
    { label: "Data date (UTC)", value: fmtDate(st.latest_date || data.latestDate), sub: "AAA price date " + fmtDate((nat || {}).price_date) },
    { label: "Items in latest run", value: st.items, sub: "1 national, states and metro areas" },
    { label: "Days with data", value: st.days_with_success, sub: "since " + fmtDate(st.first_run_date) },
    { label: "Sources OK", value: `${okSources} / ${st.sources.length}`, sub: okSources === st.sources.length ? "all sources succeeded" : `${st.sources.length - okSources} failed` },
    { label: "New today", value: st.new_today.length, sub: st.new_today.slice(0, 3).map((i) => esc(i.item)).join(", ") || "no items appeared" },
    { label: "Gone today", value: st.gone_today.length, sub: st.gone_today.slice(0, 3).map((i) => esc(i.item)).join(", ") || "no items disappeared" },
  ];
  document.getElementById("tiles").innerHTML = tiles.map((t) =>
    `<div class="tile ${t.cls || ""}"><div class="label">${t.label}</div><div class="value" ${t.small ? 'style="font-size:1.05rem"' : ""}>${t.value}</div><div class="sub">${t.sub}</div></div>`).join("");

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
    movesEl.innerHTML = `<p class="empty-note">Only one run so far (${fmtDate(data.latestDate)}). Moves appear after the next daily run.</p>`;
  } else {
    const maxAbs = d3.max(mv, (m) => Math.abs(m.change)) || 1;
    movesEl.innerHTML = `<div class="table-wrap"><table><thead><tr><th>#</th><th>Item</th><th class="num">Old (${fmtDate(data.prevDate)})</th><th class="num">New (${fmtDate(data.latestDate)})</th><th class="num">Change</th><th class="num">%</th><th style="width:180px"></th></tr></thead><tbody>${
      mv.map((m, i) => {
        const w = (Math.abs(m.change) / maxAbs) * 80;
        const bar = `<svg width="170" height="12" aria-hidden="true"><line x1="85" x2="85" y1="0" y2="12" stroke="#cbbfa6"/><rect x="${m.change < 0 ? 85 - w : 85}" y="2" width="${Math.max(w, 1)}" height="8" rx="2" fill="${m.change > 0 ? GP.UP : GP.DOWN}"/></svg>`;
        return `<tr><td>${i + 1}</td><td>${esc(m.item)} <span class="tag ${m.level}">${m.level}</span></td><td class="num">${money(m.old)}</td><td class="num">${money(m.new)}</td><td class="num ${dirClass(m.change)}">${arrow(m.change)} ${signed(m.change)}</td><td class="num">${pct(m.pct)}</td><td>${bar}</td></tr>`;
      }).join("")}</tbody></table></div>
      ${st.new_today.length || st.gone_today.length ? `<p class="small">Appeared: ${st.new_today.map((i) => esc(i.item)).join(", ") || "none"}. Disappeared: ${st.gone_today.map((i) => esc(i.item)).join(", ") || "none"}.</p>` : ""}`;
  }

  // ------------------------------------------------------------- all items table
  const allTable = document.getElementById("all-table");
  const levelOrder = { national: 0, state: 1, metro: 2 };
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
    el.innerHTML = `<span>${state.mode === "price" ? GP.LABELS[state.fuel] + " price, $/gal" : state.mode === "change" ? "Change since " + fmtDate(data.prevDate) + ", $/gal" : "Change vs. a year ago, %"}</span>
      <svg width="${w}" height="30"><defs><linearGradient id="${id}">${stops.map((s) => `<stop offset="${s}" stop-color="${color(lo + s * (hi - lo))}"/>`).join("")}</linearGradient></defs>
      <rect width="${w}" height="10" rx="3" fill="url(#${id})"/>
      <text x="0" y="24" font-size="11" fill="#5a554c">${fmt(lo)}</text>
      <text x="${w / 2}" y="24" font-size="11" fill="#5a554c" text-anchor="middle">${fmt(mid)}</text>
      <text x="${w}" y="24" font-size="11" fill="#5a554c" text-anchor="end">${fmt(hi)}</text></svg>
      ${state.mode !== "price" ? '<span><span style="color:#9c2420">■</span> rose · <span style="color:#1d5a85">■</span> fell</span>' : ""}
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
      `${GP.LABELS[state.fuel]} · ${state.mode === "price" ? "price on " + fmtDate(data.latestDate) : state.mode === "change" ? "change since " + fmtDate(data.prevDate) : "change vs. a year ago"}`;
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
})();
