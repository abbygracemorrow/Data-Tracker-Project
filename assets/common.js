/* Shared code for the three pages: loading the data files, number formats, the
   tooltip, a few small d3 charts, offline banner, install button and service worker. */
(function () {
  "use strict";

  const NUMERIC = ["regular", "midgrade", "premium", "diesel",
    "regular_yesterday", "regular_week_ago", "regular_month_ago", "regular_year_ago", "diesel_year_ago"];
  const LABELS = {
    regular: "Regular", midgrade: "Mid-grade", premium: "Premium", diesel: "Diesel",
    regular_yesterday: "Regular, yesterday (AAA)", regular_week_ago: "Regular, week ago",
    regular_month_ago: "Regular, month ago", regular_year_ago: "Regular, year ago",
    diesel_year_ago: "Diesel, year ago",
  };
  const STATE_NAMES = {
    AK: "Alaska", AL: "Alabama", AR: "Arkansas", AZ: "Arizona", CA: "California", CO: "Colorado",
    CT: "Connecticut", DC: "District of Columbia", DE: "Delaware", FL: "Florida", GA: "Georgia",
    HI: "Hawaii", IA: "Iowa", ID: "Idaho", IL: "Illinois", IN: "Indiana", KS: "Kansas",
    KY: "Kentucky", LA: "Louisiana", MA: "Massachusetts", MD: "Maryland", ME: "Maine",
    MI: "Michigan", MN: "Minnesota", MO: "Missouri", MS: "Mississippi", MT: "Montana",
    NC: "North Carolina", ND: "North Dakota", NE: "Nebraska", NH: "New Hampshire",
    NJ: "New Jersey", NM: "New Mexico", NV: "Nevada", NY: "New York", OH: "Ohio", OK: "Oklahoma",
    OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
    TN: "Tennessee", TX: "Texas", UT: "Utah", VA: "Virginia", VT: "Vermont", WA: "Washington",
    WI: "Wisconsin", WV: "West Virginia", WY: "Wyoming",
  };
  /* Colors: a retro road-trip palette checked with the dataviz palette validator
     (categorical slots in fixed order; a warm "old wall map" ramp for price; and a
     dusty-blue <-> cream <-> truck-red diverging ramp for change). */
  const SERIES = ["#2c7bb6", "#ad4332", "#d69a00", "#7650b8", "#1f9a5c", "#e66f9a", "#b5651d", "#13a3b0"];
  const PRICE_RAMP = ["#f7ecc9", "#f1d79a", "#ebbd6c", "#e39a4c", "#d67139", "#c24a2c", "#962e22"];
  const DIVERGING = ["#1d5a85", "#4f8fbd", "#a9cbe2", "#efe7d6", "#efb3a6", "#c0624f", "#7e2d22"];
  const UP = "#a43c2f", DOWN = "#2c7bb6", NODATA = "#e9e0cc";

  /** An original motel-style sign: cream letters in red round discs (bubbles) with cream rims.
      vertical: stacked on a pole with a starburst on top (for page banners);
      horizontal: a row of discs (for the logo). */
  function signSVG(word, vertical) {
    const letters = [...word];
    const fills = ["#a43c2f", "#a43c2f"];
    if (!vertical) {
      const r = 17, gap = 3, w = letters.length * (2 * r + gap) + 4;
      return `<svg viewBox="0 0 ${w} ${2 * r + 6}" aria-hidden="true">` + letters.map((ch, i) => {
        const cx = 2 + r + i * (2 * r + gap);
        return `<circle cx="${cx}" cy="${r + 3}" r="${r}" fill="${fills[i % 2]}" stroke="#fffaf0" stroke-width="3"/>
          <text x="${cx}" y="${r + 3}" dy="0.36em" text-anchor="middle" font-family="Righteous, sans-serif" font-size="20"
            fill="#fffaf0" stroke="#5e211a" stroke-width="0.8" paint-order="stroke">${ch}</text>`;
      }).join("") + "</svg>";
    }
    const r = 30, step = 70, top = 78, h = top + letters.length * step + 30, cx = 46, pole = 98;
    const spokes = d3.range(8).map((i) => {
      const a = (i * Math.PI) / 4;
      return `<line x1="${pole + Math.cos(a) * 10}" y1="${34 + Math.sin(a) * 10}" x2="${pole + Math.cos(a) * 30}" y2="${34 + Math.sin(a) * 30}"/>`;
    }).join("");
    return `<svg class="sign" viewBox="0 0 140 ${h}" aria-hidden="true">
      <rect x="${pole - 4}" y="40" width="8" height="${h - 40}" fill="#fffaf0" stroke="#d9cdb4"/>
      <g stroke="#fffaf0" stroke-width="2.5" stroke-linecap="round">${spokes}</g>
      <circle cx="${pole}" cy="34" r="24" fill="none" stroke="#fffaf0" stroke-width="2"/>
      <circle cx="${pole}" cy="34" r="9" fill="#efe2c4" stroke="#fffaf0" stroke-width="2"/>
      ${letters.map((ch, i) => {
        const cy = top + i * step;
        return `<g stroke="#fffaf0" stroke-width="2"><line x1="${cx + r - 2}" x2="${pole}" y1="${cy - 12}" y2="${cy - 12}"/><line x1="${cx + r - 2}" x2="${pole}" y1="${cy + 12}" y2="${cy + 12}"/></g>
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fills[i % 2]}" stroke="#fffaf0" stroke-width="5"/>
          <text x="${cx}" y="${cy}" dy="0.36em" text-anchor="middle" font-family="Righteous, sans-serif" font-size="36"
            fill="#fffaf0" stroke="#5e211a" stroke-width="1.2" paint-order="stroke">${ch}</text>`;
      }).join("")}
    </svg>`;
  }
  /** A generic highway shield on a post (original; not any real route's sign). */
  function shieldSVG() {
    return `<svg class="sign" viewBox="0 0 160 300" aria-hidden="true">
      <rect x="74" y="150" width="10" height="150" fill="#fffaf0" stroke="#d9cdb4"/>
      <path d="M18 22 Q50 34 79 14 Q108 34 140 22 Q150 70 138 110 Q118 160 79 176 Q40 160 20 110 Q8 70 18 22 Z" fill="#fffaf0" stroke="#1f3b57" stroke-width="7"/>
      <path d="M28 34 Q54 42 79 26 Q104 42 130 34 L134 62 L24 62 Z" fill="#a43c2f"/>
      <text x="79" y="49" dy="0.36em" text-anchor="middle" font-family="Righteous, sans-serif" font-size="16" fill="#fffaf0">HISTORIC</text>
      <text x="79" y="84" dy="0.36em" text-anchor="middle" font-family="Righteous, sans-serif" font-size="17" fill="#1f3b57">U.S. GAS</text>
      <text x="79" y="126" dy="0.36em" text-anchor="middle" font-family="Righteous, sans-serif" font-size="44" fill="#1f3b57">$</text>
    </svg>`;
  }

  /** The desert-sunset scene behind every page banner (original drawing). */
  function sceneSVG() {
    // sunset clouds: soft clumps lit pink-orange on top, with lavender undersides
    const cloud = (cx, cy, w, k = 1) => [[-0.42, 0.25, 0.26, 0.5], [-0.15, 0, 0.32, 0.75], [0.16, 0.12, 0.3, 0.6], [0.42, 0.3, 0.22, 0.42]]
      .map(([dx, dy, rx, ry]) => `<ellipse cx="${(cx + dx * w).toFixed(0)}" cy="${(cy + dy * 22 * k).toFixed(0)}" rx="${(rx * w).toFixed(0)}" ry="${(ry * 22 * k).toFixed(0)}"/>`).join("");
    return `<svg class="scene" viewBox="0 0 1440 440" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <radialGradient id="sun" cx="0.62" cy="0.7" r="0.42"><stop offset="0" stop-color="#ffd7a3" stop-opacity=".95"/><stop offset=".5" stop-color="#ffb489" stop-opacity=".35"/><stop offset="1" stop-color="#ffb489" stop-opacity="0"/></radialGradient>
        <linearGradient id="cloud-lit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffbb8c"/><stop offset=".55" stop-color="#f08a7a"/><stop offset="1" stop-color="#b9739a"/></linearGradient>
        <linearGradient id="cloud-far" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6a48e"/><stop offset="1" stop-color="#a77aa8"/></linearGradient>
        <linearGradient id="peak" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffd2ad"/><stop offset=".55" stop-color="#f6b394"/><stop offset="1" stop-color="#d98877"/></linearGradient>
        <linearGradient id="sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9ab86"/><stop offset="1" stop-color="#cc8a6d"/></linearGradient>
        <linearGradient id="road" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8f7f88"/><stop offset="1" stop-color="#5d5460"/></linearGradient>
        <filter id="soft"><feGaussianBlur stdDeviation="3.5"/></filter>
        <filter id="haze"><feGaussianBlur stdDeviation="8"/></filter>
      </defs>
      <rect width="1440" height="440" fill="url(#sun)"/>
      <g fill="url(#cloud-far)" opacity=".55" filter="url(#haze)">${cloud(220, 70, 260, 0.8)}${cloud(1180, 60, 300, 0.7)}${cloud(700, 150, 340, 0.6)}</g>
      <g fill="url(#cloud-lit)" opacity=".85" filter="url(#soft)">
        ${cloud(1010, 95, 230)}${cloud(1290, 140, 200, 0.9)}${cloud(420, 165, 210, 0.8)}${cloud(860, 200, 260, 0.7)}${cloud(140, 210, 180, 0.6)}
      </g>
      <path d="M0 292 L140 270 L260 284 L380 258 L500 278 L620 262 L720 280 L800 266 L1440 290 L1440 320 L0 320 Z" fill="#c487a2" opacity=".75"/>
      <path d="M700 300 L820 268 L880 236 L930 214 L962 206 L1000 210 L1040 226 L1090 250 L1150 270 L1230 286 L1300 300 Z" fill="url(#peak)"/>
      <path d="M962 206 L955 236 L938 262 L952 290 L930 300 L1000 300 L985 268 L1002 240 L1000 210 Z" fill="#c9786a" opacity=".55"/>
      <path d="M1040 226 L1052 256 L1078 280 L1100 300 L1150 300 L1110 274 L1090 250 Z" fill="#b8665a" opacity=".55"/>
      <path d="M0 312 L110 296 L220 306 L330 290 L460 304 L560 294 L700 304 L840 292 L980 302 L1100 290 L1240 300 L1340 290 L1440 298 L1440 330 L0 330 Z" fill="#a8656a" opacity=".9"/>
      <rect y="318" width="1440" height="122" fill="url(#sand)"/>
      <g fill="#8b7558" opacity=".7">
        <ellipse cx="80" cy="330" rx="22" ry="7"/><ellipse cx="230" cy="338" rx="30" ry="8"/><ellipse cx="410" cy="328" rx="18" ry="6"/>
        <ellipse cx="560" cy="342" rx="26" ry="8"/><ellipse cx="1300" cy="334" rx="24" ry="7"/><ellipse cx="1390" cy="346" rx="30" ry="9"/>
      </g>
      <path d="M1040 318 L1060 318 L1440 420 L1440 440 L700 440 Z" fill="url(#road)"/>
      <g stroke="#f4c766" stroke-width="3" stroke-linecap="round">
        <line x1="1056" y1="324" x2="1062" y2="328"/><line x1="1074" y1="336" x2="1086" y2="344"/>
        <line x1="1104" y1="356" x2="1124" y2="369"/><line x1="1150" y1="386" x2="1182" y2="406"/>
      </g>
      <path d="M1045 318 L708 440" stroke="#fff1e2" stroke-width="2" opacity=".7"/>
    </svg>`;
  }

  function drawSigns() {
    document.querySelectorAll("[data-sign]").forEach((el) => {
      el.innerHTML = el.dataset.sign === "SHIELD" ? shieldSVG()
        : signSVG(el.dataset.sign, el.dataset.vertical === "1");
    });
    document.querySelectorAll(".page-head").forEach((el) => {
      if (!el.querySelector(".scene")) el.insertAdjacentHTML("afterbegin", sceneSVG());
    });
  }

  // ------------------------------------------------------------------ data loading
  async function fetchText(url) {
    // "no-cache" asks the network (via the service worker) for a fresh copy; offline,
    // the service worker answers from its cache with the last copy it saw.
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(url + ": HTTP " + res.status);
    return res.text();
  }

  function parseHistory(text) {
    return d3.csvParse(text, (r) => {
      for (const c of NUMERIC) r[c] = r[c] === "" || r[c] == null ? null : +r[c];
      return r;
    });
  }

  /** Load data/history.csv and data/status.json and index them. */
  async function loadData(opts = {}) {
    const jobs = [fetchText("data/history.csv"), fetchText("data/status.json")];
    if (opts.locations) jobs.push(fetchText("data/locations.csv"));
    const [histText, statusText, locText] = await Promise.all(jobs);
    const rows = parseHistory(histText);
    const status = JSON.parse(statusText);
    const dates = Array.from(new Set(rows.map((r) => r.date))).sort();
    const latestDate = dates[dates.length - 1] || null;
    const prevDate = dates.length > 1 ? dates[dates.length - 2] : null;
    const byDate = d3.group(rows, (r) => r.date);
    const latest = new Map((byDate.get(latestDate) || []).map((r) => [r.item_id, r]));
    const prev = new Map((byDate.get(prevDate) || []).map((r) => [r.item_id, r]));
    const locations = new Map();
    if (locText) d3.csvParse(locText).forEach((l) => locations.set(l.item_id, [+l.lon, +l.lat]));
    return { rows, status, dates, latestDate, prevDate, byDate, latest, prev, locations };
  }

  /** Change in a column for an item between the previous and the latest date (null if unknown). */
  function change(data, itemId, col = "regular") {
    const a = data.prev.get(itemId), b = data.latest.get(itemId);
    if (!a || !b || a[col] == null || b[col] == null) return null;
    return +(b[col] - a[col]).toFixed(4);
  }

  /** The move rule (same as tracker/moves.py): change in regular price between the two latest
      dates, ranked by absolute size, ties by item_id. */
  function moves(data, col = "regular") {
    const out = [];
    for (const [id, b] of data.latest) {
      const c = change(data, id, col);
      if (c == null) continue;
      const old = data.prev.get(id)[col];
      out.push({ item_id: id, item: b.item, level: b.level, old, new: b[col], change: c,
        pct: old ? (100 * c) / old : null });
    }
    out.sort((x, y) => Math.abs(y.change) - Math.abs(x.change) || (x.item_id < y.item_id ? -1 : 1));
    return out;
  }

  // ------------------------------------------------------------------ formats
  const money = (v, d = 4) => (v == null || isNaN(v) ? "–" : "$" + (+v).toFixed(d));
  const signed = (v, d = 4) => (v == null || isNaN(v) ? "–" : (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(d));
  const pct = (v, d = 2) => (v == null || isNaN(v) ? "–" : (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(d) + "%");
  const dirClass = (v) => (v > 0 ? "up" : v < 0 ? "down" : "");
  const arrow = (v) => (v > 0 ? "▲" : v < 0 ? "▼" : "•");
  const fmtDate = (s) => (s ? d3.timeFormat("%b %-d, %Y")(d3.timeParse("%Y-%m-%d")(s)) : "–");
  const fmtTime = (iso) => {
    if (!iso) return "–";
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) + " (local)";
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ------------------------------------------------------------------ tooltip
  let tip;
  function tooltip() {
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "tooltip";
      tip.setAttribute("role", "status");
      document.body.appendChild(tip);
    }
    return {
      show(html, ev) {
        tip.innerHTML = html;
        tip.style.opacity = 1;
        this.move(ev);
      },
      move(ev) {
        const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
        let x = ev.clientX + pad, y = ev.clientY + pad;
        if (x + w > window.innerWidth - 4) x = ev.clientX - w - pad;
        if (y + h > window.innerHeight - 4) y = ev.clientY - h - pad;
        tip.style.left = x + "px";
        tip.style.top = y + "px";
      },
      hide() { tip.style.opacity = 0; },
    };
  }

  // ------------------------------------------------------------------ charts
  /** Horizontal bar chart. items: [{label, value, color?, tip?}] */
  function barChart(el, items, o = {}) {
    const t = tooltip();
    el.innerHTML = "";
    if (!items.length) { el.innerHTML = '<p class="empty-note">No data yet.</p>'; return; }
    const rowH = o.rowH || 18, m = { top: 22, right: 70, bottom: 6, left: o.left || 150 };
    const W = o.width || 760, H = m.top + m.bottom + rowH * items.length;
    const vals = items.map((d) => d.value);
    const lo = o.min != null ? o.min : Math.min(0, d3.min(vals));
    const hi = Math.max(0, d3.max(vals));
    const x = d3.scaleLinear().domain([lo, hi]).nice().range([m.left, W - m.right]);
    const y = d3.scaleBand().domain(items.map((d, i) => i)).range([m.top, H - m.bottom]).padding(0.22);
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img")
      .attr("aria-label", o.aria || "bar chart");
    svg.append("g").attr("class", "axis gridline").attr("transform", `translate(0,${m.top})`)
      .call(d3.axisTop(x).ticks(6).tickSize(-(H - m.top - m.bottom)).tickFormat(o.tickFormat || ((v) => "$" + v.toFixed(2))))
      .call((g) => g.select(".domain").remove());
    const x0 = x(Math.max(lo, 0));
    const g = svg.append("g");
    g.selectAll("rect").data(items).join("rect")
      .attr("x", (d) => Math.min(x(d.value), x0)).attr("y", (d, i) => y(i))
      .attr("width", (d) => Math.max(1, Math.abs(x(d.value) - x0))).attr("height", y.bandwidth())
      .attr("rx", 4).attr("fill", (d) => d.color || o.color || SERIES[0]);
    g.selectAll("text.lab").data(items).join("text").attr("class", "direct-label lab")
      .attr("x", m.left - 6).attr("y", (d, i) => y(i) + y.bandwidth() / 2).attr("dy", "0.35em")
      .attr("text-anchor", "end").text((d) => d.label);
    g.selectAll("text.val").data(items).join("text").attr("class", "direct-label val")
      .attr("x", (d) => (d.value >= 0 ? Math.max(x(d.value), x0) + 4 : x0 + 4))
      .attr("y", (d, i) => y(i) + y.bandwidth() / 2).attr("dy", "0.35em")
      .text((d) => (o.valueFormat || money)(d.value));
    svg.append("line").attr("x1", x0).attr("x2", x0).attr("y1", m.top).attr("y2", H - m.bottom).attr("stroke", "#cbbfa6");
    // hover rows (hit targets bigger than the bars)
    svg.append("g").selectAll("rect").data(items).join("rect")
      .attr("x", 0).attr("width", W).attr("y", (d, i) => y(i) - 2).attr("height", y.bandwidth() + 4)
      .attr("fill", "transparent")
      .on("mousemove", (ev, d) => t.show(d.tip || `<div class="t-title">${esc(d.label)}</div>${(o.valueFormat || money)(d.value)}`, ev))
      .on("mouseleave", () => t.hide());
  }

  /** Multi-series line chart over dates. series: [{name, color, points:[{date, value}]}] */
  function lineChart(el, series, o = {}) {
    const t = tooltip();
    el.innerHTML = "";
    const all = series.flatMap((s) => s.points.filter((p) => p.value != null));
    if (!all.length) { el.innerHTML = '<p class="empty-note">No data yet.</p>'; return; }
    const W = o.width || 760, H = o.height || 320, m = { top: 12, right: o.right ?? 130, bottom: 28, left: 56 };
    const parse = d3.timeParse("%Y-%m-%d");
    const dates = Array.from(new Set(all.map((p) => p.date))).sort();
    const x = dates.length > 1
      ? d3.scaleTime().domain(d3.extent(dates, parse)).range([m.left, W - m.right])
      : d3.scaleTime().domain([d3.timeDay.offset(parse(dates[0]), -1), d3.timeDay.offset(parse(dates[0]), 1)]).range([m.left, W - m.right]);
    const ext = d3.extent(all, (p) => p.value);
    const padY = (ext[1] - ext[0]) * 0.08 || 0.05;
    const y = d3.scaleLinear().domain([o.zero ? Math.min(0, ext[0]) : ext[0] - padY, ext[1] + padY]).nice().range([H - m.bottom, m.top]);
    const yFmt = o.yFormat || ((v) => "$" + v.toFixed(2));
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img").attr("aria-label", o.aria || "line chart");
    svg.append("g").attr("class", "axis gridline").attr("transform", `translate(${m.left},0)`)
      .call(d3.axisLeft(y).ticks(6).tickSize(-(W - m.left - m.right)).tickFormat(yFmt));
    const ticks = Math.min(dates.length, 8);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.bottom})`)
      .call(d3.axisBottom(x).ticks(ticks).tickFormat(d3.timeFormat("%b %-d")));
    const line = d3.line().defined((p) => p.value != null).x((p) => x(parse(p.date))).y((p) => y(p.value));
    const g = svg.append("g");
    for (const s of series) {
      g.append("path").datum(s.points).attr("fill", "none").attr("stroke", s.color).attr("stroke-width", 2)
        .attr("stroke-linejoin", "round").attr("stroke-linecap", "round").attr("d", line);
      g.selectAll(null).data(s.points.filter((p) => p.value != null)).join("circle")
        .attr("cx", (p) => x(parse(p.date))).attr("cy", (p) => y(p.value)).attr("r", dates.length > 40 ? 0 : 3.5)
        .attr("fill", s.color).attr("stroke", "#fffaf0").attr("stroke-width", 1.5);
    }
    // direct labels at the line ends (up to 8 series), nudged apart
    const ends = series.map((s) => {
      const pts = s.points.filter((p) => p.value != null);
      const last = pts[pts.length - 1];
      return last ? { s, y: y(last.value) } : null;
    }).filter(Boolean).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
    if (m.right > 40) svg.append("g").selectAll("text").data(ends).join("text").attr("class", "direct-label")
      .attr("x", W - m.right + 8).attr("y", (d) => d.y).attr("dy", "0.35em")
      .text((d) => (d.s.short || d.s.name).slice(0, 20));
    // crosshair + tooltip
    const cross = svg.append("line").attr("stroke", "#8b8478").attr("stroke-dasharray", "3 3")
      .attr("y1", m.top).attr("y2", H - m.bottom).style("opacity", 0);
    svg.append("rect").attr("x", m.left).attr("y", m.top).attr("width", W - m.left - m.right).attr("height", H - m.top - m.bottom)
      .attr("fill", "transparent")
      .on("mousemove", (ev) => {
        const [mx] = d3.pointer(ev);
        const target = x.invert(mx);
        const near = dates.reduce((a, b) => (Math.abs(parse(b) - target) < Math.abs(parse(a) - target) ? b : a));
        cross.attr("x1", x(parse(near))).attr("x2", x(parse(near))).style("opacity", 1);
        const rowsHtml = series.map((s) => {
          const p = s.points.find((q) => q.date === near);
          return p && p.value != null ? { s, v: p.value } : null;
        }).filter(Boolean).sort((a, b) => b.v - a.v)
          .map((r) => `<div class="t-row"><span><span class="swatch" style="background:${r.s.color}"></span>${esc(r.s.name)}</span><span class="num">${(o.tipFormat || money)(r.v)}</span></div>`).join("");
        t.show(`<div class="t-title">${fmtDate(near)}</div>${rowsHtml}`, ev);
      })
      .on("mouseleave", () => { cross.style("opacity", 0); t.hide(); });
  }

  /** Vertical bars by category (e.g. histogram bins or days). bars: [{label, value, color?, tip?}] */
  function columnChart(el, bars, o = {}) {
    const t = tooltip();
    el.innerHTML = "";
    if (!bars.length) { el.innerHTML = '<p class="empty-note">No data yet.</p>'; return; }
    const W = o.width || 760, H = o.height || 260, m = { top: 14, right: 12, bottom: 44, left: 56 };
    const x = d3.scaleBand().domain(bars.map((b) => b.label)).range([m.left, W - m.right]).padding(0.15);
    const vals = bars.map((b) => b.value);
    const y = d3.scaleLinear().domain([Math.min(0, d3.min(vals)), Math.max(0, d3.max(vals))]).nice().range([H - m.bottom, m.top]);
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img").attr("aria-label", o.aria || "column chart");
    svg.append("g").attr("class", "axis gridline").attr("transform", `translate(${m.left},0)`)
      .call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.left - m.right)).tickFormat(o.yFormat || d3.format("~s")));
    const every = Math.ceil(bars.length / 14);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.bottom})`)
      .call(d3.axisBottom(x).tickValues(x.domain().filter((d, i) => i % every === 0)))
      .selectAll("text").attr("transform", bars.length > 8 ? "rotate(-30)" : null).style("text-anchor", bars.length > 8 ? "end" : "middle");
    svg.append("g").selectAll("rect").data(bars).join("rect")
      .attr("x", (b) => x(b.label)).attr("width", x.bandwidth())
      .attr("y", (b) => y(Math.max(0, b.value))).attr("height", (b) => Math.max(1, Math.abs(y(b.value) - y(0))))
      .attr("rx", 3).attr("fill", (b) => b.color || o.color || SERIES[0])
      .on("mousemove", (ev, b) => t.show(b.tip || `<div class="t-title">${esc(b.label)}</div>${b.value}`, ev))
      .on("mouseleave", () => t.hide());
    svg.append("line").attr("x1", m.left).attr("x2", W - m.right).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "#cbbfa6");
  }

  // ------------------------------------------------------------------ page chrome
  function setupChrome() {
    const setOffline = () => document.body.classList.toggle("is-offline", !navigator.onLine);
    window.addEventListener("online", setOffline);
    window.addEventListener("offline", setOffline);
    setOffline();
    // Install button. Chrome and Edge fire "beforeinstallprompt", so the button installs in one
    // click. Safari has no such event: Apple only lets the visitor install from the browser's own
    // menu, so on Safari the button opens short instructions instead.
    let deferred;
    const btn = document.getElementById("install-btn");
    const ua = navigator.userAgent;
    const installed = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isSafari = /safari/i.test(ua) && !/chrome|chromium|crios|fxios|edg|opr|android/i.test(ua);
    if (btn && !installed && (isIOS || isSafari)) btn.style.display = "inline-block";
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferred = e;
      if (btn) btn.style.display = "inline-block";
    });
    window.addEventListener("appinstalled", () => { if (btn) btn.style.display = "none"; });
    if (btn) btn.addEventListener("click", async () => {
      if (deferred) {
        deferred.prompt();
        await deferred.userChoice;
        deferred = null;
        btn.style.display = "none";
        return;
      }
      installHelp(isIOS);
    });
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    }
  }

  /** Step-by-step install instructions for Safari (iPhone/iPad, or Mac). */
  function installHelp(isIOS) {
    let dlg = document.getElementById("install-help");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "install-help";
      dlg.className = "install-help";
      document.body.appendChild(dlg);
      dlg.addEventListener("click", (e) => { if (e.target === dlg || e.target.closest("[data-close]")) dlg.close(); });
    }
    const share = `<svg width="16" height="18" viewBox="0 0 16 20" aria-hidden="true" style="vertical-align:-3px"><path d="M8 1v12M4 5l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 8H1.5v10.5h13V8H13" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`;
    const steps = isIOS
      ? [`Tap the <strong>Share</strong> button ${share} in Safari's toolbar.`,
         "Scroll down and tap <strong>Add to Home Screen</strong>.",
         "Tap <strong>Add</strong>. Gas Price Tracker now opens from your home screen like an app, even offline."]
      : [`In Safari's menu bar, click <strong>File</strong> → <strong>Add to Dock…</strong> (or click the <strong>Share</strong> button ${share} → <strong>Add to Dock</strong>).`,
         "Click <strong>Add</strong>.",
         "Gas Price Tracker now opens from your Dock and Launchpad in its own window, even offline. (Needs macOS Sonoma or later.)"];
    dlg.innerHTML = `<div class="kicker">Install the app</div><h2>Add Gas Price Tracker to your ${isIOS ? "Home Screen" : "Dock"}</h2>
      <p>Safari installs web apps from its own menu, so there's no one-click button here. It takes three steps:</p>
      <ol>${steps.map((x) => `<li>${x}</li>`).join("")}</ol>
      <button type="button" class="btn" data-close>Got it</button>`;
    dlg.showModal();
  }

  function showError(err) {
    const main = document.querySelector("main");
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `<h2>Could not load the data</h2><p class="muted">${esc(err.message || err)}</p>`;
    main.prepend(div);
    console.error(err);
  }

  setupChrome();
  drawSigns();
  window.GP = { NUMERIC, LABELS, STATE_NAMES, SERIES, PRICE_RAMP, DIVERGING, UP, DOWN, NODATA, signSVG, loadData, change, moves,
    money, signed, pct, dirClass, arrow, fmtDate, fmtTime, esc, tooltip, barChart, lineChart, columnChart, showError };
})();
