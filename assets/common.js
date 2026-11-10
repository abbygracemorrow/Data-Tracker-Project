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
  /* Reference palette (dataviz skill): categorical slots in fixed order, a blue sequential
     ramp for price, and a blue <-> gray <-> red diverging pair for change. */
  const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
  const BLUE_RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
  const DIVERGING = ["#184f95", "#3987e5", "#9ec5f4", "#f0efec", "#f3a7a6", "#e34948", "#a8201f"];

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
      .attr("rx", 3).attr("fill", (d) => d.color || o.color || SERIES[0]);
    g.selectAll("text.lab").data(items).join("text").attr("class", "direct-label lab")
      .attr("x", m.left - 6).attr("y", (d, i) => y(i) + y.bandwidth() / 2).attr("dy", "0.35em")
      .attr("text-anchor", "end").text((d) => d.label);
    g.selectAll("text.val").data(items).join("text").attr("class", "direct-label val")
      .attr("x", (d) => (d.value >= 0 ? Math.max(x(d.value), x0) + 4 : x0 + 4))
      .attr("y", (d, i) => y(i) + y.bandwidth() / 2).attr("dy", "0.35em")
      .text((d) => (o.valueFormat || money)(d.value));
    svg.append("line").attr("x1", x0).attr("x2", x0).attr("y1", m.top).attr("y2", H - m.bottom).attr("stroke", "#c3c2b7");
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
        .attr("fill", s.color).attr("stroke", "#fcfcfb").attr("stroke-width", 1.5);
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
    const cross = svg.append("line").attr("stroke", "#898781").attr("stroke-dasharray", "3 3")
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
    svg.append("line").attr("x1", m.left).attr("x2", W - m.right).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "#c3c2b7");
  }

  // ------------------------------------------------------------------ page chrome
  function setupChrome() {
    const setOffline = () => document.body.classList.toggle("is-offline", !navigator.onLine);
    window.addEventListener("online", setOffline);
    window.addEventListener("offline", setOffline);
    setOffline();
    let deferred;
    const btn = document.getElementById("install-btn");
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferred = e;
      if (btn) btn.style.display = "inline-block";
    });
    if (btn) btn.addEventListener("click", async () => {
      if (!deferred) return;
      deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      btn.style.display = "none";
    });
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    }
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
  window.GP = { NUMERIC, LABELS, STATE_NAMES, SERIES, BLUE_RAMP, DIVERGING, loadData, change, moves,
    money, signed, pct, dirClass, arrow, fmtDate, fmtTime, esc, tooltip, barChart, lineChart, columnChart, showError };
})();
