// Entry point for index.html: owns the view state and wires the pieces
// together. Everything visible is derived from data/*.json.

import { CATEGORIES, STATUSES, esc, fmtUSD, loadData, renderLastUpdated, showLoadError, swatchSVG } from "./common.js";
import { createGraph } from "./graph.js";
import { VIEWS } from "./layout.js";
import { createPanel } from "./panel.js";
import { createTooltip } from "./tooltip.js";
import { createTimeline, inTimeline } from "./timeline.js";
import { createTable } from "./table.js";

const state = {
  categories: new Set(Object.keys(CATEGORIES)),
  showCancelled: false,
  selected: null, // company id
  hoverCompany: null,
  focusDeal: null, // deal highlighted from the panel or a pinned tooltip
};

async function init() {
  let data;
  try {
    data = await loadData();
  } catch (err) {
    showLoadError(err, document.querySelector(".map-stage"));
    return;
  }
  renderLastUpdated(data.meta);

  const stage = document.querySelector(".map-stage");
  const tooltip = createTooltip(document.getElementById("tooltip"), stage, data, {
    onClose: () => {
      state.focusDeal = null;
      refresh();
    },
  });

  const graphHandlers = {
    select,
    background: () => {
      if (tooltip.pinned) tooltip.hide(true);
      else if (state.selected) select(null);
    },
    nodeHover: (id) => {
      state.hoverCompany = id;
      refreshMap();
    },
    edgeHover: (d, ev) => tooltip.show(d, ev),
    edgeLeave: () => tooltip.hide(),
    edgeClick: (d, ev) => {
      tooltip.pin(d, ev);
      state.focusDeal = d.id;
      refreshMap();
    },
  };

  // Pick the landscape or portrait layout, and rebuild when the window
  // crosses the breakpoint (e.g. rotating a tablet).
  const compactQuery = window.matchMedia("(max-width: 640px)");
  const pickView = () => (compactQuery.matches ? VIEWS.compact : VIEWS.wide);
  let graph = createGraph(document.getElementById("map"), data, graphHandlers, pickView());
  compactQuery.addEventListener("change", () => {
    tooltip.hide(true);
    graph = createGraph(document.getElementById("map"), data, graphHandlers, pickView());
    refreshMap();
  });

  const panel = createPanel(document.getElementById("panel"), data, {
    select: (id) => select(id, { focusPanel: true }),
    dealHover: (id) => {
      if (tooltip.pinned) return;
      state.focusDeal = id;
      refreshMap();
    },
  });
  const table = createTable(document.getElementById("deal-table"), data, { select: (id) => select(id, { focusPanel: true }) });
  const timeline = createTimeline(document.getElementById("timeline"), data, refresh);

  buildFilters();
  wireZoom();

  function visibleDeals() {
    const cutoff = timeline.cutoff();
    return new Set(
      data.deals
        .filter(
          (d) =>
            state.categories.has(d.category) &&
            (state.showCancelled || d.status !== "cancelled") &&
            inTimeline(d, cutoff)
        )
        .map((d) => d.id)
    );
  }

  let visible = visibleDeals();

  function refreshMap() {
    graph.update({ visible, ...state });
  }

  function refresh() {
    visible = visibleDeals();
    refreshMap();
    panel.render({ visible, ...state });
    table.render({ visible });
    renderStats(data, visible);
  }

  function select(id, { focusPanel = false } = {}) {
    state.selected = id && data.companyById.has(id) ? id : null;
    state.focusDeal = null;
    tooltip.hide(true);
    writeHash();
    refresh();
    if (focusPanel && state.selected) {
      panel.focusTitle();
      document.getElementById("panel").scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function buildFilters() {
    const wrap = document.getElementById("filters");
    wrap.innerHTML = Object.entries(CATEGORIES)
      .map(
        ([key, c]) =>
          `<button type="button" class="chip" data-cat="${key}" aria-pressed="true" title="${esc(c.desc)}">${swatchSVG(key)}<span>${esc(c.label)}</span></button>`
      )
      .join("");
    wrap.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-cat]");
      if (!btn) return;
      const k = btn.dataset.cat;
      if (state.categories.has(k)) state.categories.delete(k);
      else state.categories.add(k);
      btn.setAttribute("aria-pressed", String(state.categories.has(k)));
      refresh();
    });
    document.getElementById("legend-cats").innerHTML = Object.entries(CATEGORIES)
      .map(([key, c]) => `<li>${swatchSVG(key, 44)}${esc(c.label)}</li>`)
      .join("");
    const cancelled = document.getElementById("show-cancelled");
    const nCancelled = data.deals.filter((d) => d.status === "cancelled").length;
    cancelled.closest("label").querySelector("[data-count]").textContent = nCancelled;
    cancelled.addEventListener("change", () => {
      state.showCancelled = cancelled.checked;
      refresh();
    });
  }

  function wireZoom() {
    document.getElementById("zoom-in").addEventListener("click", () => graph.zoomBy(1.5));
    document.getElementById("zoom-out").addEventListener("click", () => graph.zoomBy(1 / 1.5));
    document.getElementById("zoom-reset").addEventListener("click", () => graph.zoomBy(0));
  }

  // Shareable URLs: index.html#company=openai or #deal=<id>.
  function writeHash() {
    const url = state.selected ? `#company=${encodeURIComponent(state.selected)}` : location.pathname + location.search;
    history.replaceState(null, "", url);
  }

  function readHash() {
    const params = new URLSearchParams(location.hash.slice(1));
    const deal = data.dealById.get(params.get("deal"));
    if (deal) {
      select(deal.from);
      state.focusDeal = deal.id;
      refresh();
      document.getElementById(`deal-${deal.id}`)?.scrollIntoView({ block: "nearest" });
    } else {
      select(params.get("company"));
    }
  }

  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    if (tooltip.pinned) tooltip.hide(true);
    else if (state.selected) {
      const id = state.selected;
      select(null);
      graph.focusNode(id);
    }
  });
  window.addEventListener("hashchange", readHash);

  readHash();
  document.body.classList.add("is-ready");
}

function renderStats(data, visible) {
  const deals = data.deals.filter((d) => visible.has(d.id));
  const cos = new Set(deals.flatMap((d) => [d.from, d.to]));
  const total = deals.reduce((s, d) => s + (d.amount_usd_b || 0), 0);
  const weak = deals.filter((d) => STATUSES[d.status]?.weak).length;
  document.getElementById("stat-companies").textContent = cos.size;
  document.getElementById("stat-deals").textContent = deals.length;
  document.getElementById("stat-total").textContent = fmtUSD(total);
  document.getElementById("stat-weak").textContent = weak;
}

init();
