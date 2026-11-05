// Computes where everything goes: node positions (force simulation with
// pinned anchors), label positions (greedy, collision-free) and edge curves.
// Runs once, before drawing, so the map never jiggles and looks the same on
// every visit: d3-force uses a fixed-seed random source, and the largest
// companies are pinned by data/layout.json.

/* global d3 */

/**
 * Two fixed views. Wide screens get a landscape map; phones get a portrait
 * map in a smaller coordinate space (so text renders larger) with the
 * anchors transposed, which keeps neighbours next to each other.
 */
export const VIEWS = {
  wide: { name: "wide", width: 1000, height: 720, pad: 24, rMax: 58, linkDist: 120, charge: -240, gap: 30, transpose: false, wMax: 7 },
  compact: { name: "compact", width: 500, height: 860, pad: 14, rMax: 40, linkDist: 70, charge: -140, gap: 24, transpose: true, wMax: 5 },
};

const R_MIN = 10; // floor so tiny companies stay clickable
const R_UNVALUED = 13;
const R_CHILD = 9;

/** Radius function: area proportional to value (sqrt scale). */
export function makeRadius(companies, view) {
  const max = d3.max(companies, (c) => c.value_usd_b) || 1;
  const scale = d3.scaleSqrt().domain([0, max]).range([0, view.rMax]);
  return (c) => {
    if (c.value_usd_b === null) return c.parent_id ? R_CHILD : R_UNVALUED;
    return Math.max(R_MIN, scale(c.value_usd_b));
  };
}

/** Stable small hash so un-anchored nodes start in a repeatable place. */
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

export function computeLayout(data, radius, view) {
  const { width: W, height: H, pad } = view;
  const anchors = (data.layout && data.layout.anchors) || {};
  const nodes = data.companies.map((c) => ({ id: c.id, c, r: radius(c) }));
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const links = data.deals.map((d) => ({ source: d.from, target: d.to }));
  for (const n of nodes) {
    if (n.c.parent_id && byId.has(n.c.parent_id)) {
      links.push({ source: n.id, target: n.c.parent_id, parent: true });
    }
  }

  // Pin anchors; start everyone else near the anchored companies they deal with.
  for (const n of nodes) {
    const a = anchors[n.id];
    if (a) {
      const [ax, ay] = view.transpose ? [a.y, a.x] : [a.x, a.y];
      n.fx = n.x = ax * W;
      n.fy = n.y = ay * H;
    }
  }
  for (const n of nodes) {
    if (anchors[n.id]) continue;
    const near = links
      .filter((l) => l.source === n.id || l.target === n.id)
      .map((l) => byId.get(l.source === n.id ? l.target : l.source))
      .filter((m) => m && anchors[m.id]);
    const cx = near.length ? d3.mean(near, (m) => m.x) : W / 2;
    const cy = near.length ? d3.mean(near, (m) => m.y) : H / 2;
    const angle = hash(n.id) * Math.PI * 2;
    n.x = cx + Math.cos(angle) * 60;
    n.y = cy + Math.sin(angle) * 60;
  }

  const sim = d3
    .forceSimulation(nodes)
    .force(
      "link",
      d3
        .forceLink(links)
        .id((d) => d.id)
        .distance((l) => (l.parent ? l.source.r + l.target.r + 8 : view.linkDist + l.source.r + l.target.r))
        .strength((l) => (l.parent ? 1 : 0.03))
    )
    .force("charge", d3.forceManyBody().strength(view.charge))
    .force("collide", d3.forceCollide((n) => (n.c.parent_id ? n.r + 6 : n.r + view.gap)).strength(1).iterations(2))
    .force("x", d3.forceX(W / 2).strength(0.015))
    .force("y", d3.forceY(H / 2).strength(0.03))
    .stop();

  for (let i = 0; i < 400; i++) {
    sim.tick();
    for (const n of nodes) {
      n.x = Math.max(pad + n.r, Math.min(W - pad - n.r, n.x));
      n.y = Math.max(pad + n.r, Math.min(H - pad - n.r - 28, n.y));
    }
  }

  return { nodes, byId, labels: placeLabels(nodes, view) };
}

// ---------------------------------------------------------------- labels

const NAME_PX = 7.2; // approx. width per character at 13px sans
const VALUE_PX = 6.8; // approx. width per character at 11px mono
const LINE_GAP = 15;

function labelSize(n, valueText) {
  return {
    w: Math.max(n.c.name.length * NAME_PX, valueText.length * VALUE_PX) + 6,
    h: LINE_GAP + 14,
  };
}

function overlapArea(a, b) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}

function circleHitsBox(n, box) {
  const cx = Math.max(box.x, Math.min(n.x, box.x + box.w));
  const cy = Math.max(box.y, Math.min(n.y, box.y + box.h));
  const d = Math.hypot(n.x - cx, n.y - cy);
  return d < n.r + 2 ? (n.r + 2 - d) * 40 : 0;
}

/**
 * Greedy label placement. Big circles get their label inside when it fits;
 * everyone else tries below, right, left, above and diagonals, taking the
 * first spot that hits no circle or earlier label (or the least-bad one).
 */
function placeLabels(nodes, view) {
  const { width: W, height: H } = view;
  const placed = [];
  const out = new Map();
  const order = [...nodes].sort((a, b) => b.r - a.r);

  for (const n of order) {
    const value = valueText(n.c);
    const { w, h } = labelSize(n, value);

    if (n.r * 2 * 0.95 >= w && n.r >= 28) {
      out.set(n.id, { inside: true, x: n.x, y: n.y - 7, anchor: "middle" });
      continue;
    }

    const g = 5;
    const candidates = [
      { x: n.x - w / 2, y: n.y + n.r + g, anchor: "middle" }, // below
      { x: n.x + n.r + g, y: n.y - h / 2, anchor: "start" }, // right
      { x: n.x - n.r - g - w, y: n.y - h / 2, anchor: "end" }, // left
      { x: n.x - w / 2, y: n.y - n.r - g - h, anchor: "middle" }, // above
      { x: n.x + n.r * 0.7, y: n.y + n.r * 0.7, anchor: "start" }, // below right
      { x: n.x - n.r * 0.7 - w, y: n.y + n.r * 0.7, anchor: "end" }, // below left
      { x: n.x + n.r * 0.7, y: n.y - n.r * 0.7 - h, anchor: "start" }, // above right
      { x: n.x - n.r * 0.7 - w, y: n.y - n.r * 0.7 - h, anchor: "end" }, // above left
    ];

    let best = null;
    for (const cand of candidates) {
      const box = { x: cand.x, y: cand.y, w, h };
      let cost = 0;
      if (box.x < 2 || box.y < 2 || box.x + w > W - 2 || box.y + h > H - 2) cost += 1e6;
      for (const p of placed) cost += overlapArea(box, p);
      for (const m of nodes) if (m !== n) cost += circleHitsBox(m, box);
      if (!best || cost < best.cost) best = { ...cand, box, cost };
      if (cost === 0) break;
    }
    placed.push(best.box);
    const tx = best.anchor === "middle" ? best.x + w / 2 : best.anchor === "start" ? best.x + 3 : best.x + w - 3;
    out.set(n.id, { inside: false, x: tx, y: best.y + 10, anchor: best.anchor });
  }
  return out;
}

export function valueText(c) {
  if (c.value_usd_b === null) return c.parent_id ? "in parent" : "n/a";
  const b = c.value_usd_b;
  if (b >= 1000) return `$${Number((b / 1000).toPrecision(3))}T`;
  return `$${b >= 100 ? Math.round(b) : Number(b.toPrecision(3))}B`;
}

// ----------------------------------------------------------------- edges

/**
 * Quadratic curves between circle edges. Deals between the same two
 * companies fan out side by side; A->B and B->A bend to opposite sides.
 */
export function edgeGeometry(deals, byId) {
  const geo = new Map();
  const groups = d3.group(deals, (d) => [d.from, d.to].sort().join("|"));
  for (const [key, list] of groups) {
    const [aId, bId] = key.split("|");
    const A = byId.get(aId);
    const B = byId.get(bId);
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const k = list.length;
    const spread = Math.min(44, len * 0.22);
    const base = k === 1 ? Math.min(len * 0.1, 36) : 0;
    [...list]
      .sort((p, q) => (p.id < q.id ? -1 : 1))
      .forEach((d, i) => {
        const off = base + (i - (k - 1) / 2) * spread;
        const s = byId.get(d.from);
        const t = byId.get(d.to);
        const cx = (A.x + B.x) / 2 + nx * off * 2;
        const cy = (A.y + B.y) / 2 + ny * off * 2;
        const p0 = towards(s, cx, cy, s.r + 3);
        const p2 = towards(t, cx, cy, t.r + 4);
        geo.set(d.id, {
          path: `M${f(p0[0])},${f(p0[1])} Q${f(cx)},${f(cy)} ${f(p2[0])},${f(p2[1])}`,
          mid: [0.25 * p0[0] + 0.5 * cx + 0.25 * p2[0], 0.25 * p0[1] + 0.5 * cy + 0.25 * p2[1]],
        });
      });
  }
  return geo;
}

function towards(n, x, y, dist) {
  const dx = x - n.x;
  const dy = y - n.y;
  const l = Math.hypot(dx, dy) || 1;
  return [n.x + (dx / l) * dist, n.y + (dy / l) * dist];
}

const f = (v) => v.toFixed(1);
