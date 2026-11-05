// Draws the network into the <svg> and updates it when filters, the
// timeline or the selection change. Positions come from layout.js.

/* global d3 */
import { CATEGORIES, STATUSES, KINDS, fmtCompanyValue, prefersReducedMotion } from "./common.js";
import { computeLayout, edgeGeometry, makeRadius, valueText } from "./layout.js";

const W_MIN = 1.2;

export function createGraph(svgEl, data, handlers, VIEW) {
  const radius = makeRadius(data.companies, VIEW);
  const { nodes, byId, labels } = computeLayout(data, radius, VIEW);
  const geo = edgeGeometry(data.deals, byId);
  const maxAmt = d3.max(data.deals, (d) => d.amount_usd_b) || 1;
  const width = d3.scaleSqrt().domain([0, maxAmt]).range([W_MIN, VIEW.wMax]);

  const svg = d3.select(svgEl).attr("viewBox", `0 0 ${VIEW.width} ${VIEW.height}`).attr("data-view", VIEW.name);
  svg.on(".zoom", null).on("click", null);
  svg.selectAll("*").remove();

  // Arrowheads: one per category, sized in user space so thick lines
  // don't get giant arrows.
  const defs = svg.append("defs");
  for (const cat of Object.keys(CATEGORIES)) {
    defs
      .append("marker")
      .attr("id", `arrow-${cat}`)
      .attr("viewBox", "0 0 10 10")
      .attr("refX", 9)
      .attr("refY", 5)
      .attr("markerUnits", "userSpaceOnUse")
      .attr("markerWidth", 9)
      .attr("markerHeight", 9)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M1,1 L9,5 L1,9")
      .attr("class", `arrowhead cat-${cat}`);
  }
  // Soft glow for the lines: a blurred copy under the original.
  const glow = defs.append("filter").attr("id", "glow").attr("x", "-20%").attr("y", "-20%").attr("width", "140%").attr("height", "140%");
  glow.append("feGaussianBlur").attr("stdDeviation", 2.2).attr("result", "blur");
  const merge = glow.append("feMerge");
  merge.append("feMergeNode").attr("in", "blur");
  merge.append("feMergeNode").attr("in", "SourceGraphic");

  // Faint grid, like a trading-desk chart background.
  const grid = defs.append("pattern").attr("id", "grid").attr("width", 40).attr("height", 40).attr("patternUnits", "userSpaceOnUse");
  grid.append("path").attr("d", "M40 0 L0 0 0 40").attr("class", "grid-line");
  svg.append("rect").attr("class", "grid-bg").attr("width", VIEW.width).attr("height", VIEW.height).attr("fill", "url(#grid)");

  const viewport = svg.append("g").attr("class", "viewport");
  const edgeLayer = viewport.append("g").attr("class", "edges").attr("filter", "url(#glow)");
  const hitLayer = viewport.append("g").attr("class", "edge-hits");
  const nodeLayer = viewport.append("g").attr("class", "nodes");
  const labelLayer = viewport.append("g").attr("class", "labels").attr("aria-hidden", "true");

  // ---- edges (visible line) and a wider invisible hit area for pointers
  const edgeSel = edgeLayer
    .selectAll("g.edge")
    .data(data.deals, (d) => d.id)
    .join("g")
    .attr("class", (d) => `edge cat-${d.category} status-${d.status}${STATUSES[d.status]?.weak ? " is-weak" : ""}`)
    .attr("data-id", (d) => d.id);
  edgeSel
    .append("path")
    .attr("class", (d) => `edge-line cat-${d.category}`)
    .attr("d", (d) => geo.get(d.id).path)
    .attr("stroke-width", (d) => (d.amount_usd_b === null ? W_MIN : width(d.amount_usd_b)))
    .attr("stroke-dasharray", (d) => dashFor(d, width))
    .attr("marker-end", (d) => `url(#arrow-${d.category})`);

  const hitSel = hitLayer
    .selectAll("path")
    .data(data.deals, (d) => d.id)
    .join("path")
    .attr("class", "edge-hit")
    .attr("d", (d) => geo.get(d.id).path)
    .on("pointerenter", (ev, d) => handlers.edgeHover(d, ev))
    .on("pointermove", (ev, d) => handlers.edgeHover(d, ev))
    .on("pointerleave", (ev, d) => handlers.edgeLeave(d))
    .on("click", (ev, d) => {
      ev.stopPropagation();
      handlers.edgeClick(d, ev);
    });

  // ---- nodes
  const nodeSel = nodeLayer
    .selectAll("g.node")
    .data(nodes, (n) => n.id)
    .join("g")
    .attr("class", (n) => `node kind-${n.c.kind}${n.c.value_usd_b === null ? " is-unvalued" : ""}${n.c.parent_id ? " is-child" : ""}`)
    .attr("data-id", (n) => n.id)
    .attr("transform", (n) => `translate(${n.x},${n.y})`)
    .attr("tabindex", 0)
    .attr("role", "button")
    .attr("aria-label", (n) => nodeLabel(n.c, data))
    .on("click", (ev, n) => {
      ev.stopPropagation();
      handlers.select(n.id);
    })
    .on("keydown", (ev, n) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        handlers.select(n.id);
      }
    })
    .on("pointerenter", (ev, n) => handlers.nodeHover(n.id))
    .on("pointerleave", () => handlers.nodeHover(null))
    .on("focus", (ev, n) => handlers.nodeHover(n.id))
    .on("blur", () => handlers.nodeHover(null));

  nodeSel.filter((n) => n.c.kind === "ai_lab").append("circle").attr("class", "hub-ring").attr("r", (n) => n.r + 5);
  nodeSel.append("circle").attr("class", "body").attr("r", (n) => n.r);
  nodeSel.append("circle").attr("class", "focus-ring").attr("r", (n) => n.r + (n.c.kind === "ai_lab" ? 9 : 4));

  // ---- labels (separate layer so they sit above every line)
  const labelSel = labelLayer
    .selectAll("text")
    .data(nodes, (n) => n.id)
    .join("text")
    .attr("class", (n) => `label${labels.get(n.id).inside ? " is-inside" : ""}`)
    .attr("data-id", (n) => n.id)
    .attr("x", (n) => labels.get(n.id).x)
    .attr("y", (n) => labels.get(n.id).y)
    .attr("text-anchor", (n) => labels.get(n.id).anchor);
  labelSel.append("tspan").attr("class", "label-name").text((n) => n.c.name);
  labelSel
    .append("tspan")
    .attr("class", "label-value")
    .attr("x", (n) => labels.get(n.id).x)
    .attr("dy", 15)
    .text((n) => valueText(n.c));

  // ---- zoom & pan (pinch on touch; ctrl/cmd + wheel on desktop so the
  // page still scrolls normally)
  const zoom = d3
    .zoom()
    .scaleExtent([1, 5])
    .translateExtent([
      [0, 0],
      [VIEW.width, VIEW.height],
    ])
    .filter((ev) => (ev.type === "wheel" ? ev.ctrlKey || ev.metaKey : !ev.button))
    .on("zoom", (ev) => viewport.attr("transform", ev.transform));
  svg.call(zoom).on("dblclick.zoom", null);
  svg.on("click", () => handlers.background());

  function zoomBy(k) {
    const t = prefersReducedMotion() ? svg : svg.transition().duration(250);
    if (k === 0) t.call(zoom.transform, d3.zoomIdentity);
    else t.call(zoom.scaleBy, k);
  }

  /**
   * Apply view state.
   * visible: Set of deal ids that pass filters/timeline.
   * focus: { company, deal, hover } ids to emphasise (any may be null).
   */
  function update({ visible, selected, hoverCompany, focusDeal }) {
    const active = new Set();
    for (const d of data.deals) {
      if (visible.has(d.id)) {
        active.add(d.from);
        active.add(d.to);
      }
    }
    // Children (e.g. xAI in SpaceX) follow their parent.
    for (const n of nodes) if (n.c.parent_id && active.has(n.c.parent_id)) active.add(n.id);

    const focusCo = selected || hoverCompany;
    const linked = new Set();
    const hlDeals = new Set();
    if (focusCo) {
      linked.add(focusCo);
      for (const d of data.deals) {
        if (visible.has(d.id) && (d.from === focusCo || d.to === focusCo)) {
          hlDeals.add(d.id);
          linked.add(d.from);
          linked.add(d.to);
        }
      }
    }
    if (focusDeal) {
      hlDeals.add(focusDeal);
      const d = data.dealById.get(focusDeal);
      if (d) linked.add(d.from).add(d.to);
    }
    const dimming = focusCo || focusDeal;

    edgeSel
      .classed("is-hidden", (d) => !visible.has(d.id))
      .classed("is-hl", (d) => hlDeals.has(d.id))
      .classed("is-dim", (d) => dimming && !hlDeals.has(d.id));
    hitSel.classed("is-hidden", (d) => !visible.has(d.id));
    nodeSel
      .classed("is-inactive", (n) => !active.has(n.id))
      .classed("is-selected", (n) => n.id === selected)
      .classed("is-dim", (n) => dimming && !linked.has(n.id))
      .attr("aria-pressed", (n) => String(n.id === selected));
    labelSel
      .classed("is-inactive", (n) => !active.has(n.id))
      .classed("is-dim", (n) => dimming && !linked.has(n.id));
  }

  function focusNode(id) {
    const el = nodeSel.filter((n) => n.id === id).node();
    if (el) el.focus({ preventScroll: true });
  }

  return { update, zoomBy, focusNode };
}

/**
 * Dash pattern scaled to the line width so thick lines keep a readable
 * pattern. Cloud is solid by design; the dotted "chips" pattern relies on
 * round caps.
 */
function dashFor(d, width) {
  const base = CATEGORIES[d.category]?.dash;
  if (!base) return null;
  const w = d.amount_usd_b === null ? W_MIN : width(d.amount_usd_b);
  const k = Math.max(1, w / 2.5);
  return base
    .split(" ")
    .map((v) => +v * k)
    .join(" ");
}

function nodeLabel(c, data) {
  const n = data.deals.filter((d) => d.from === c.id || d.to === c.id).length;
  const parent = c.parent_id ? data.companyById.get(c.parent_id) : null;
  return [
    c.name,
    KINDS[c.kind] || c.kind,
    `value ${fmtCompanyValue(c)}`,
    parent ? `part of ${parent.name}` : null,
    `${n} deal${n === 1 ? "" : "s"}`,
    "press Enter for details",
  ]
    .filter(Boolean)
    .join(", ");
}

