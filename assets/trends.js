/* Trends page. Every number here is computed in the browser from data/history.csv. */
(async function () {
  "use strict";
  const { money, signed, pct, fmtDate, esc, SERIES } = GP;
  let data;
  try { data = await GP.loadData(); } catch (err) { GP.showError(err); return; }
  const { rows, dates, byDate } = data;
  const first = dates[0], last = dates[dates.length - 1];
  const nDays = dates.length;
  document.getElementById("span-days").textContent = nDays
    ? `${nDays} day${nDays === 1 ? "" : "s"} (${fmtDate(first)} to ${fmtDate(last)}), ${rows.length.toLocaleString()} rows`
    : "no rows yet";
  const cents = (v) => (Math.abs(v) >= 1 ? money(Math.abs(v), 2) : `${(Math.abs(v) * 100).toFixed(1)}¢`);
  const { UP, DOWN } = GP;

  // ------------------------------------------------------------------ explorer
  const KEY = "gas-tracker.trends-selection";
  const names = new Map();
  for (const r of rows) names.set(r.item_id, r.item);       // latest name wins (rows are sorted by date)
  const allIds = [...names.keys()].sort((a, b) => {
    const rank = (id) => (id === "US" ? 0 : id.length === 2 ? 1 : 2);
    return rank(a) - rank(b) || names.get(a).localeCompare(names.get(b));
  });
  const series = new Map(); // item_id -> rows by date
  for (const r of rows) { if (!series.has(r.item_id)) series.set(r.item_id, []); series.get(r.item_id).push(r); }

  let selected;
  try { selected = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { selected = null; }
  if (!Array.isArray(selected)) selected = ["US", "CA", "TX", "NY", "FL"];
  selected = selected.filter((s) => s && names.has(s.id || s)).slice(0, 8)
    .map((s) => (typeof s === "string" ? { id: s } : { id: s.id, color: SERIES.includes(s.color) ? s.color : undefined }));
  for (const s of selected) if (!s.color) s.color = SERIES.find((c) => !selected.some((t) => t.color === c));
  const colSel = document.getElementById("ex-col");
  colSel.innerHTML = GP.NUMERIC.map((c) => `<option value="${c}">${esc(GP.LABELS[c])}</option>`).join("");
  const q = document.getElementById("ex-q");
  const picker = document.getElementById("ex-picker");

  function freeColor() { // color follows the item: a new item takes the first unused slot
    const used = new Set(selected.map((s) => s.color));
    return SERIES.find((c) => !used.has(c));
  }
  function drawPicker() {
    const term = q.value.trim().toLowerCase();
    const ids = allIds.filter((id) => !term || names.get(id).toLowerCase().includes(term)).slice(0, 200);
    const sel = new Set(selected.map((s) => s.id));
    picker.innerHTML = ids.map((id) => `<label><input type="checkbox" value="${esc(id)}" ${sel.has(id) ? "checked" : ""}
      ${!sel.has(id) && selected.length >= 8 ? "disabled" : ""}> ${esc(names.get(id))}</label>`).join("") ||
      '<span class="empty-note">No match.</span>';
  }
  function drawExplorer() {
    localStorage.setItem(KEY, JSON.stringify(selected));
    const col = colSel.value;
    document.getElementById("ex-chips").innerHTML = selected.map((s) =>
      `<span class="chip"><span class="swatch" style="background:${s.color}"></span>${esc(names.get(s.id))}<button type="button" data-rm="${esc(s.id)}" aria-label="Remove">×</button></span>`).join("") ||
      '<span class="empty-note">Pick items on the left.</span>';
    GP.lineChart(document.getElementById("ex-chart"), selected.map((s) => ({
      name: names.get(s.id), short: names.get(s.id).replace(/ \(national average\)/, ""), color: s.color,
      points: (series.get(s.id) || []).map((r) => ({ date: r.date, value: r[col] })),
    })), { aria: `${GP.LABELS[col]} over time`, height: 360 });
  }
  picker.addEventListener("change", (e) => {
    const id = e.target.value;
    if (e.target.checked) { if (selected.length < 8) selected.push({ id, color: freeColor() }); }
    else selected = selected.filter((s) => s.id !== id);
    drawPicker(); drawExplorer();
  });
  document.getElementById("ex-chips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-rm]");
    if (!b) return;
    selected = selected.filter((s) => s.id !== b.dataset.rm);
    drawPicker(); drawExplorer();
  });
  document.getElementById("ex-clear").addEventListener("click", () => { selected = []; drawPicker(); drawExplorer(); });
  q.addEventListener("input", drawPicker);
  colSel.addEventListener("change", drawExplorer);
  drawPicker(); drawExplorer();

  // ------------------------------------------------------------------ findings
  const out = document.getElementById("findings");
  function finding(title, bodyHtml, howHtml, draw) {
    const sec = document.createElement("section");
    sec.className = "card finding";
    sec.innerHTML = `<h2>${title}</h2><p>${bodyHtml}</p><p class="how"><strong>How it's computed:</strong> ${howHtml}</p><div class="chart"></div>`;
    out.appendChild(sec);
    draw(sec.querySelector(".chart"));
  }
  const at = (date, level) => (byDate.get(date) || []).filter((r) => !level || r.level === level);
  const mean = (a) => d3.mean(a);

  // 1. Where regular gas costs the most and least (latest day, states)
  {
    const st = at(last, "state").filter((r) => r.regular != null).sort((a, b) => b.regular - a.regular);
    const nat = (byDate.get(last) || []).find((r) => r.item_id === "US");
    if (st.length) {
      const hi = st[0], lo = st[st.length - 1], med = d3.median(st, (r) => r.regular);
      const above = nat ? st.filter((r) => r.regular > nat.regular).length : 0;
      finding(
        `${esc(hi.item)} has the most expensive regular gas at ${money(hi.regular)}, ${cents(hi.regular - lo.regular)} a gallon more than ${esc(lo.item)}`,
        `On ${fmtDate(last)}, regular gas averaged ${money(hi.regular)} a gallon in ${esc(hi.item)} and ${money(lo.regular)} in ${esc(lo.item)}, a gap of ${money(hi.regular - lo.regular)}.
         The median state paid ${money(med)}${nat ? `, and ${above} of ${st.length} states paid more than the national average of ${money(nat.regular)}` : ""}.`,
        `take the rows of history.csv with <code>date = ${last}</code> and <code>level = state</code> (${st.length} rows), sort them by <code>regular</code>, and compare the first and last.
         The median is the middle value of those ${st.length} prices${nat ? `; the national average is the <code>regular</code> value of item <code>US</code> on the same date` : ""}.`,
        (el) => GP.barChart(el, st.map((r) => ({ label: r.item, value: r.regular,
          color: r === hi ? UP : r === lo ? DOWN : SERIES[0],
          tip: `<div class="t-title">${esc(r.item)}</div>Regular ${money(r.regular)}<br>Diesel ${money(r.diesel)}` })),
        { rowH: 15, left: 140, min: Math.floor(lo.regular * 2) / 2 - 0.5, aria: "Regular price by state" }));
    }
  }

  // 2. The national average over time
  {
    const us = (series.get("US") || []).filter((r) => r.regular != null);
    if (us.length) {
      const a = us[0], b = us[us.length - 1], d = b.regular - a.regular;
      const hiDay = us.reduce((m, r) => (r.regular > m.regular ? r : m)), loDay = us.reduce((m, r) => (r.regular < m.regular ? r : m));
      const title = us.length < 2
        ? `The national average for regular gas was ${money(a.regular)} on the first day of tracking`
        : `The national average has ${d > 0 ? "risen" : d < 0 ? "fallen" : "held steady"} ${d ? cents(d) + " " : ""}since the first run, from ${money(a.regular)} to ${money(b.regular)}`;
      finding(title,
        us.length < 2
          ? `So far the history holds one day (${fmtDate(a.date)}). This section will show how the national average moves as the daily runs add more days.`
          : `Between ${fmtDate(a.date)} and ${fmtDate(b.date)} (${us.length} days with a national value) the U.S. average for regular moved ${signed(d)} dollars (${pct((100 * d) / a.regular)}).
             Its highest value was ${money(hiDay.regular)} on ${fmtDate(hiDay.date)} and its lowest ${money(loDay.regular)} on ${fmtDate(loDay.date)}.`,
        `take every row of history.csv with <code>item_id = US</code> and plot <code>regular</code> by <code>date</code>. The change is the last value minus the first; the percent is that change divided by the first value.`,
        (el) => GP.lineChart(el, [{ name: "U.S. average, regular", color: SERIES[0], points: us.map((r) => ({ date: r.date, value: r.regular })) }],
          { height: 260, right: 20, aria: "National average regular price over time" }));
    }
  }

  // 3. Biggest risers and fallers since the first run (metro areas)
  {
    const firstBy = new Map(at(first, "metro").map((r) => [r.item_id, r]));
    const ch = at(last, "metro").filter((r) => firstBy.has(r.item_id) && r.regular != null && firstBy.get(r.item_id).regular != null)
      .map((r) => ({ r, old: firstBy.get(r.item_id).regular, d: +(r.regular - firstBy.get(r.item_id).regular).toFixed(4) }))
      .sort((a, b) => b.d - a.d || a.r.item_id.localeCompare(b.r.item_id));
    if (nDays < 2 || !ch.length) {
      finding("Which metro areas rose or fell the most will show after a second day of data",
        `The history has one day so far (${fmtDate(first)}), so there is no change to measure yet.`,
        `for each metro area in both the first date and the latest date of history.csv, subtract its first <code>regular</code> price from its latest one, then rank.`,
        (el) => { el.innerHTML = '<p class="empty-note">Waiting for more days of history.</p>'; });
    } else {
      const top = ch[0], bot = ch[ch.length - 1];
      const rose = ch.filter((c) => c.d > 0).length, fell = ch.filter((c) => c.d < 0).length;
      const pick = ch.length > 16 ? [...ch.slice(0, 8), ...ch.slice(-8)] : ch;
      finding(
        `Since the first run, ${esc(top.r.item)} ${top.d >= 0 ? "rose" : "fell"} the most (${signed(top.d)}) and ${esc(bot.r.item)} ${bot.d < 0 ? "fell" : "rose"} the most (${signed(bot.d)})`,
        `From ${fmtDate(first)} to ${fmtDate(last)}, ${rose} of ${ch.length} metro areas got more expensive and ${fell} got cheaper.
         ${esc(top.r.item)} went from ${money(top.old)} to ${money(top.r.regular)}; ${esc(bot.r.item)} went from ${money(bot.old)} to ${money(bot.r.regular)}.
         The average metro moved ${signed(mean(ch.map((c) => c.d)))}. The chart shows the 8 biggest rises and 8 biggest falls.`,
        `for each metro area (<code>level = metro</code>) with a <code>regular</code> price on both ${first} and ${last}, change = price on ${last} − price on ${first}; sort by change.`,
        (el) => GP.barChart(el, pick.map((c) => ({ label: c.r.item, value: c.d, color: c.d > 0 ? UP : DOWN,
          tip: `<div class="t-title">${esc(c.r.item)}</div>${money(c.old)} → ${money(c.r.regular)} (${signed(c.d)})` })),
          { left: 230, valueFormat: (v) => signed(v, 3), tickFormat: (v) => signed(v, 2), aria: "Change since first run" }));
    }
  }

  // 4. The day with the biggest move
  {
    const days = [];
    for (let i = 1; i < dates.length; i++) {
      const daily = (d) => at(d).filter((r) => r.level !== "eia");   // EIA is weekly, so only AAA's daily items count here
      const prev = new Map(daily(dates[i - 1]).map((r) => [r.item_id, r.regular]));
      const diffs = daily(dates[i]).filter((r) => r.regular != null && prev.get(r.item_id) != null).map((r) => r.regular - prev.get(r.item_id));
      if (diffs.length) days.push({ date: dates[i], from: dates[i - 1], avg: mean(diffs), n: diffs.length,
        up: diffs.filter((d) => d > 0).length, down: diffs.filter((d) => d < 0).length });
    }
    if (!days.length) {
      finding("The day with the biggest move will show after a second day of data",
        `A move needs two days; the history has ${nDays} so far.`,
        `for each pair of consecutive dates in history.csv, average the change in <code>regular</code> over the AAA items present on both dates.`,
        (el) => { el.innerHTML = '<p class="empty-note">Waiting for more days of history.</p>'; });
    } else {
      const big = days.reduce((m, d) => (Math.abs(d.avg) > Math.abs(m.avg) ? d : m));
      finding(
        `${fmtDate(big.date)} saw the biggest day-to-day move: prices ${big.avg > 0 ? "rose" : "fell"} ${cents(big.avg)} on average`,
        `Comparing each run with the one before it, the largest average change in the regular price came on ${fmtDate(big.date)} (vs. ${fmtDate(big.from)}):
         ${signed(big.avg)} per gallon averaged over ${big.n} items, with ${big.up} rising and ${big.down} falling.
         Across all ${days.length} day-to-day comparisons, the average daily move was ${signed(mean(days.map((d) => d.avg)))}.`,
        `for each pair of consecutive dates, take every AAA item_id (<code>level</code> is not <code>eia</code>, because EIA only updates weekly) with a <code>regular</code> price on both dates, compute new − old, and average those changes. The heading names the date whose average has the largest absolute value.`,
        (el) => GP.columnChart(el, days.map((d) => ({ label: d3.timeFormat("%b %-d")(d3.timeParse("%Y-%m-%d")(d.date)), value: +d.avg.toFixed(4),
          color: d.avg > 0 ? UP : DOWN, tip: `<div class="t-title">${fmtDate(d.date)}</div>Average change ${signed(d.avg)}<br>${d.up} up · ${d.down} down · ${d.n} items` })),
          { yFormat: (v) => signed(v, 3), aria: "Average daily change" }));
    }
  }

  // 5. Diesel's premium over regular (latest day, states)
  {
    const st = at(last, "state").filter((r) => r.diesel != null && r.regular != null)
      .map((r) => ({ r, gap: +(r.diesel - r.regular).toFixed(4) })).sort((a, b) => b.gap - a.gap);
    if (st.length) {
      const avg = mean(st.map((s) => s.gap)), hi = st[0], lo = st[st.length - 1];
      finding(
        `Diesel costs ${cents(avg)} a gallon more than regular in the average state, and the gap is widest in ${esc(hi.r.item)} (${money(hi.gap, 3)})`,
        `On ${fmtDate(last)}, diesel was more expensive than regular in ${st.filter((s) => s.gap > 0).length} of ${st.length} states.
         The gap was largest in ${esc(hi.r.item)} (diesel ${money(hi.r.diesel)} vs. regular ${money(hi.r.regular)}) and smallest in ${esc(lo.r.item)}
         (diesel ${money(lo.r.diesel)} vs. regular ${money(lo.r.regular)}, a gap of ${signed(lo.gap)}).`,
        `for each row with <code>date = ${last}</code> and <code>level = state</code>, gap = <code>diesel</code> − <code>regular</code>; the average is the plain mean of the ${st.length} state gaps.`,
        (el) => GP.barChart(el, st.map((s) => ({ label: s.r.item, value: s.gap, color: SERIES[2],
          tip: `<div class="t-title">${esc(s.r.item)}</div>Diesel ${money(s.r.diesel)}<br>Regular ${money(s.r.regular)}<br>Gap ${signed(s.gap)}` })),
          { rowH: 15, left: 140, valueFormat: (v) => signed(v, 3), aria: "Diesel minus regular by state" }));
    }
  }

  // 6. Compared with a year ago (latest day, metro areas, AAA's year-ago column)
  {
    const ms = at(last, "metro").filter((r) => r.regular != null && r.regular_year_ago)
      .map((r) => ({ r, p: (100 * (r.regular - r.regular_year_ago)) / r.regular_year_ago }));
    if (ms.length) {
      const med = d3.median(ms, (m) => m.p), up = ms.filter((m) => m.p > 0).length;
      const top = ms.reduce((a, b) => (b.p > a.p ? b : a)), bot = ms.reduce((a, b) => (b.p < a.p ? b : a));
      const lo5 = Math.floor(d3.min(ms, (m) => m.p) / 5) * 5, hi5 = Math.floor(d3.max(ms, (m) => m.p) / 5) * 5 + 5;
      const bins = d3.bin().domain([lo5, hi5]).thresholds(d3.range(lo5, hi5 + 0.001, 5))(ms.map((m) => m.p));
      finding(
        `Regular gas costs ${Math.abs(med).toFixed(1)}% ${med >= 0 ? "more" : "less"} than a year ago in the median metro area`,
        `On ${fmtDate(last)}, ${up} of ${ms.length} metro areas (${((100 * up) / ms.length).toFixed(0)}%) paid more for regular than they did a year earlier.
         The biggest increase was in ${esc(top.r.item)} (${money(top.r.regular_year_ago)} → ${money(top.r.regular)}, ${pct(top.p, 1)})
         and the ${bot.p < 0 ? "biggest decrease" : "smallest increase"} in ${esc(bot.r.item)} (${money(bot.r.regular_year_ago)} → ${money(bot.r.regular)}, ${pct(bot.p, 1)}).`,
        `AAA reports a year-ago price for each metro area, kept in the <code>regular_year_ago</code> column. For each metro row with <code>date = ${last}</code>,
         percent change = 100 × (<code>regular</code> − <code>regular_year_ago</code>) / <code>regular_year_ago</code>. The chart counts metro areas in 5-point bins.`,
        (el) => GP.columnChart(el, bins.map((b) => ({ label: `${b.x0}% to ${b.x1}%`, value: b.length,
          color: b.x1 <= 0 ? DOWN : b.x0 >= 0 ? UP : "#b8ad98",
          tip: `<div class="t-title">${b.x0}% to ${b.x1}%</div>${b.length} metro areas` })),
          { yFormat: d3.format("d"), aria: "Metro areas by percent change vs a year ago" }));
    }
  }

  // 7. How far apart the states are, day by day
  {
    const spread = dates.map((d) => {
      const st = at(d, "state").filter((r) => r.regular != null);
      if (st.length < 2) return null;
      const hi = st.reduce((a, b) => (b.regular > a.regular ? b : a)), lo = st.reduce((a, b) => (b.regular < a.regular ? b : a));
      return { date: d, gap: hi.regular - lo.regular, hi, lo, sd: d3.deviation(st, (r) => r.regular) };
    }).filter(Boolean);
    if (spread.length) {
      const a = spread[0], b = spread[spread.length - 1];
      finding(
        spread.length < 2
          ? `The most and least expensive states are ${money(b.gap)} a gallon apart`
          : `The gap between the most and least expensive state ${b.gap > a.gap ? "widened" : b.gap < a.gap ? "narrowed" : "held"} from ${money(a.gap)} to ${money(b.gap)} since the first run`,
        `On ${fmtDate(b.date)} the priciest state for regular was ${esc(b.hi.item)} (${money(b.hi.regular)}) and the cheapest was ${esc(b.lo.item)} (${money(b.lo.regular)}).
         The standard deviation across states was ${money(b.sd)}${spread.length > 1 ? ` (it was ${money(a.sd)} on ${fmtDate(a.date)})` : ""}.`,
        `for each date, take the state rows (<code>level = state</code>) and compute max(<code>regular</code>) − min(<code>regular</code>) and the sample standard deviation of <code>regular</code>.`,
        (el) => GP.lineChart(el, [
          { name: "Max − min", short: "Max − min", color: SERIES[0], points: spread.map((s) => ({ date: s.date, value: s.gap })) },
          { name: "Standard deviation", short: "Std. deviation", color: SERIES[1], points: spread.map((s) => ({ date: s.date, value: s.sd })) },
        ], { height: 260, zero: true, aria: "Spread between states over time" }));
    }
  }

  // 8. The two sources side by side: AAA (daily) vs. EIA (weekly) for the same states
  {
    const day = [...dates].reverse().find((d) => at(d, "eia").length && at(d, "state").length);
    const pairs = day ? at(day, "eia").filter((e) => e.state && /^EIA-[a-z-]+$/.test(e.item_id) && GP.STATE_NAMES[e.state] === e.item.replace(" (EIA weekly)", "") && e.regular != null)
      .map((e) => ({ e, a: at(day, "state").find((r) => r.item_id === e.state) })).filter((p) => p.a && p.a.regular != null)
      .map((p) => ({ ...p, d: +(p.a.regular - p.e.regular).toFixed(4) })).sort((x, y) => y.d - x.d) : [];
    const usA = day && (byDate.get(day) || []).find((r) => r.item_id === "US");
    const usE = day && (byDate.get(day) || []).find((r) => r.item_id === "EIA-US");
    if (pairs.length) {
      const avgAbs = mean(pairs.map((p) => Math.abs(p.d)));
      const far = pairs.reduce((m, p) => (Math.abs(p.d) > Math.abs(m.d) ? p : m));
      finding(
        `AAA and the EIA agree to within ${cents(avgAbs)} a gallon on average for the states both track`,
        `The tracker has two independent sources: AAA's daily averages and the EIA's weekly survey (prices for the week of ${fmtDate(pairs[0].e.price_date)}).
         On ${fmtDate(day)}, for the ${pairs.length} states that both report, AAA's regular price was on average ${cents(avgAbs)} away from the EIA's.
         The widest gap was in ${esc(GP.STATE_NAMES[far.e.state])}: AAA ${money(far.a.regular)} vs. EIA ${money(far.e.regular)}.
         ${usA && usE && usA.regular != null && usE.regular != null ? `For the whole U.S., AAA said ${money(usA.regular)} and the EIA said ${money(usE.regular)}.` : ""}`,
        `on ${day}, match each EIA state row (<code>level = eia</code>, e.g. <code>EIA-california</code>) with the AAA state row for the same state (<code>CA</code>);
         difference = AAA <code>regular</code> − EIA <code>regular</code>. The average uses the absolute differences.`,
        (el) => GP.barChart(el, pairs.map((p) => ({ label: GP.STATE_NAMES[p.e.state], value: p.d, color: p.d > 0 ? UP : DOWN,
          tip: `<div class="t-title">${esc(GP.STATE_NAMES[p.e.state])}</div>AAA ${money(p.a.regular)}<br>EIA ${money(p.e.regular)} (week of ${fmtDate(p.e.price_date)})` })),
          { left: 130, valueFormat: (v) => signed(v, 3), tickFormat: (v) => signed(v, 2), aria: "AAA minus EIA by state" }));
    }
  }
})();
