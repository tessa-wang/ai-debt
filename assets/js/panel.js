// Side panel: an overview when nothing is selected, otherwise one company's
// deals in and out, with amounts, status and sources.

import {
  CATEGORIES,
  KINDS,
  esc,
  fmtCompanyValue,
  fmtDate,
  fmtDealAmount,
  fmtUSD,
  sourcesHTML,
  statusBadge,
  swatchSVG,
  isTodo,
} from "./common.js";

export function createPanel(el, data, handlers) {
  el.addEventListener("click", (ev) => {
    const co = ev.target.closest("[data-company]");
    if (co) {
      ev.preventDefault();
      handlers.select(co.dataset.company);
      return;
    }
    if (ev.target.closest("[data-close]")) handlers.select(null);
  });
  // Hovering or tabbing through a deal highlights its line on the map.
  const dealFrom = (ev) => ev.target.closest?.("[data-deal]")?.dataset.deal || null;
  el.addEventListener("pointerover", (ev) => handlers.dealHover(dealFrom(ev)));
  el.addEventListener("pointerleave", () => handlers.dealHover(null));
  el.addEventListener("focusin", (ev) => handlers.dealHover(dealFrom(ev)));
  el.addEventListener("focusout", () => handlers.dealHover(null));

  function render({ selected, visible, focusDeal }) {
    el.innerHTML = selected ? companyHTML(selected, visible, focusDeal) : overviewHTML(visible);
  }

  function overviewHTML(visible) {
    const counts = new Map();
    for (const d of data.deals) {
      if (!visible.has(d.id)) continue;
      for (const id of [d.from, d.to]) counts.set(id, (counts.get(id) || 0) + 1);
    }
    const hubs = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8);
    const latest = data.changelog[0];
    return `
      <h2 class="panel-title">Overview</h2>
      <p>Each circle is a company, sized by market value or latest private valuation. Arrows point the way money or a commitment flows: from the buyer or investor to the seller or company receiving it.</p>
      <p class="muted">Select a company to see its deals. Click a line to pin its details and sources.</p>
      <h3 class="panel-h3">Most connected</h3>
      <ul class="hub-list">
        ${hubs
          .map(([id, n]) => {
            const c = data.companyById.get(id);
            return `<li><button type="button" class="link-btn" data-company="${esc(id)}">${esc(c.name)}</button><span class="num muted">${n} deal${n === 1 ? "" : "s"}</span></li>`;
          })
          .join("")}
      </ul>
      ${
        latest
          ? `<h3 class="panel-h3">Latest update · <time datetime="${esc(latest.date)}">${fmtDate(latest.date)}</time></h3>
             <p>${esc(latest.headline)} <a href="changelog.html">See the changelog</a>.</p>`
          : ""
      }`;
  }

  function companyHTML(id, visible, focusDeal) {
    const c = data.companyById.get(id);
    if (!c) return overviewHTML(visible);
    const parent = c.parent_id ? data.companyById.get(c.parent_id) : null;
    const children = data.companies.filter((x) => x.parent_id === id);
    const mine = data.deals.filter((d) => d.from === id || d.to === id);
    const shown = mine.filter((d) => visible.has(d.id));
    const out = shown.filter((d) => d.from === id).sort(byAmount);
    const inn = shown.filter((d) => d.to === id).sort(byAmount);
    const hidden = mine.length - shown.length;

    return `
      <div class="panel-head">
        <div>
          <p class="eyebrow">${esc(KINDS[c.kind] || c.kind)}</p>
          <h2 class="panel-title" id="panel-title" tabindex="-1">${esc(c.name)}</h2>
        </div>
        <button type="button" class="icon-btn" data-close aria-label="Close ${esc(c.name)} and show overview">×</button>
      </div>
      <dl class="kv">
        <div><dt>Value</dt><dd class="num">${esc(fmtCompanyValue(c))}</dd></div>
        <div><dt>As of</dt><dd>${isTodo(c.value_as_of) ? "unknown" : fmtDate(c.value_as_of)}</dd></div>
      </dl>
      ${c.value_note ? `<p class="muted small">${esc(c.value_note)}</p>` : ""}
      <p>${esc(c.note)}</p>
      ${parent ? `<p class="small">Part of <button type="button" class="link-btn" data-company="${esc(parent.id)}">${esc(parent.name)}</button>.</p>` : ""}
      ${
        children.length
          ? `<p class="small">Includes ${children
              .map((k) => `<button type="button" class="link-btn" data-company="${esc(k.id)}">${esc(k.name)}</button>`)
              .join(", ")}.</p>`
          : ""
      }
      ${listHTML("Money or commitments going out", out, "to", focusDeal)}
      ${listHTML("Money or commitments coming in", inn, "from", focusDeal)}
      ${!out.length && !inn.length ? `<p class="muted">No deals shown${hidden ? "" : " for this company yet"}.</p>` : ""}
      ${hidden ? `<p class="muted small">${hidden} more deal${hidden === 1 ? " is" : "s are"} hidden by the filters or timeline.</p>` : ""}`;
  }

  function listHTML(title, deals, side, focusDeal) {
    if (!deals.length) return "";
    const total = deals.reduce((s, d) => s + (d.amount_usd_b || 0), 0);
    return `
      <h3 class="panel-h3">${title} <span class="num muted">${deals.length} · ${fmtUSD(total)}</span></h3>
      <ul class="deal-list">${deals.map((d) => dealHTML(d, side, d.id === focusDeal)).join("")}</ul>`;
  }

  function dealHTML(d, side, focused) {
    const other = data.companyById.get(side === "to" ? d.to : d.from);
    const cat = CATEGORIES[d.category];
    return `
      <li class="deal${focused ? " is-focused" : ""}" data-deal="${esc(d.id)}" id="deal-${esc(d.id)}">
        <div class="deal-top">
          ${swatchSVG(d.category)}
          <span class="deal-dir">${side === "to" ? "To" : "From"}</span>
          <button type="button" class="link-btn" data-company="${esc(other.id)}">${esc(other.name)}</button>
          <span class="deal-amt num">${esc(fmtDealAmount(d))}</span>
        </div>
        <div class="deal-meta">${statusBadge(d.status)}<span>${esc(cat ? cat.short : d.category)}</span><span>${fmtDate(d.date_announced)}</span></div>
        <p class="deal-summary">${esc(d.summary)}</p>
        ${sourcesHTML(d)}
      </li>`;
  }

  return { render, focusTitle: () => el.querySelector("#panel-title")?.focus({ preventScroll: true }) };
}

const byAmount = (a, b) => (b.amount_usd_b ?? -1) - (a.amount_usd_b ?? -1);
