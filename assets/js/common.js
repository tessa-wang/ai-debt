// Shared helpers for every page: data loading, formatting, and the visual
// vocabulary (categories and statuses). Pages import what they need.

/** Fixed vocabularies. Colours live in style.css as CSS variables. */
export const CATEGORIES = {
  chips: {
    label: "Chips & hardware",
    short: "Chips",
    dash: "1 5",
    desc: "Purchases or leases of GPUs, TPUs and custom accelerators.",
  },
  investment: {
    label: "Equity investment",
    short: "Investment",
    dash: "8 5",
    desc: "Stakes, funding rounds, warrants and capacity backstops.",
  },
  cloud: {
    label: "Cloud & compute",
    short: "Cloud",
    dash: "",
    desc: "Commitments to buy cloud capacity or data-centre compute.",
  },
  financing: {
    label: "Debt, guarantees & leases",
    short: "Financing",
    dash: "12 4 2 4",
    desc: "Loans, bonds, lease guarantees and financed GPU leases.",
  },
};

export const STATUSES = {
  reported: { label: "Reported", weak: true, desc: "Covered by the press but not confirmed by the companies." },
  announced: { label: "Announced", weak: false, desc: "Publicly announced by at least one party; terms may not be final." },
  signed: { label: "Signed", weak: false, desc: "A binding agreement is in place (often seen in filings)." },
  closed: { label: "Closed", weak: false, desc: "Completed: money has moved or shares have been issued." },
  cancellable: { label: "Cancellable", weak: true, desc: "Signed, but most of it can be cancelled on short notice." },
  cancelled: { label: "Cancelled", weak: true, desc: "Called off. Hidden from the map unless you choose to show it." },
};

export const KINDS = {
  ai_lab: "AI lab",
  public: "Public company",
  private: "Private company",
};

/** Fetch one JSON file relative to the current page. */
export async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

/** Load every data file the site uses, plus quick lookup maps. */
export async function loadData(base = "data/") {
  const [companies, deals, changelog, meta, layout] = await Promise.all(
    ["companies", "deals", "changelog", "meta", "layout"].map((n) => loadJSON(`${base}${n}.json`))
  );
  const data = {
    companies: companies.companies,
    deals: deals.deals,
    changelog: changelog.entries,
    meta,
    layout,
  };
  data.companyById = new Map(data.companies.map((c) => [c.id, c]));
  data.dealById = new Map(data.deals.map((d) => [d.id, d]));
  // Drop deals pointing at unknown companies rather than crash; validate.py
  // stops these from being committed, so this is only a safety net.
  data.deals = data.deals.filter((d) => data.companyById.has(d.from) && data.companyById.has(d.to));
  return data;
}

export const isTodo = (v) => typeof v === "string" && v.trim().toUpperCase().startsWith("TODO");

/** "2026-03" or "2026-03-05" -> Date (UTC). Null for TODO or invalid. */
export function parseDate(v) {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(v);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +(m[3] || 1)));
}

/** Month index (year*12 + month) for timeline comparisons. */
export const monthKey = (date) => date.getUTCFullYear() * 12 + date.getUTCMonth();

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtMonthKey(k) {
  return `${MONTHS[k % 12]} ${Math.floor(k / 12)}`;
}

/** Human date: "Mar 2026" for a month, "Mar 5, 2026" for a day. */
export function fmtDate(v) {
  const d = parseDate(v);
  if (!d) return "date unknown";
  const day = v.length > 7 ? ` ${d.getUTCDate()},` : "";
  return `${MONTHS[d.getUTCMonth()]}${day} ${d.getUTCFullYear()}`;
}

/** Billions -> "$5.2T", "$852B", "$22.4B", "$500M". */
export function fmtUSD(b) {
  if (b === null || b === undefined || Number.isNaN(b)) return "—";
  if (b >= 1000) return `$${trim(b / 1000)}T`;
  if (b >= 1) return `$${trim(b)}B`;
  return `$${Math.round(b * 1000)}M`;
}

function trim(n) {
  return n >= 100 ? Math.round(n).toString() : Number(n.toPrecision(3)).toString();
}

/** Deal amount with its qualifier: "up to $105B", "~$22.4B", "undisclosed". */
export function fmtDealAmount(d) {
  const note = (d.amount_note || "").trim();
  if (d.amount_usd_b === null) return note || "undisclosed";
  const amt = fmtUSD(d.amount_usd_b);
  if (!note) return amt;
  if (/^(about|approx\.?|~)$/i.test(note)) return `~${amt}`;
  if (/^est\.?$/i.test(note)) return `${amt} est.`;
  return `${note} ${amt}`;
}

/** Company value with qualifier. */
export function fmtCompanyValue(c) {
  if (c.value_usd_b === null) return c.parent_id ? "inside parent" : "not valued";
  return fmtUSD(c.value_usd_b);
}

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** Escape text for safe insertion into HTML. */
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ESC[ch]);

/** Only allow http(s) links from data files. */
export const safeUrl = (u) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : null);

/** HTML for a deal's source links. TODO sources render as a visible gap. */
export function sourcesHTML(deal) {
  const items = (deal.sources || []).map((s) => {
    const url = safeUrl(s.url);
    const label = isTodo(s.title) ? "Source needed" : esc(s.title);
    const pub = isTodo(s.publisher) ? "" : `<span class="src-pub">${esc(s.publisher)}</span>`;
    const date = parseDate(s.date) ? `<span class="src-date">${fmtDate(s.date)}</span>` : "";
    if (!url) return `<li class="src-missing">${label}</li>`;
    return `<li><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>${pub}${date}</li>`;
  });
  return `<ul class="sources">${items.join("")}</ul>`;
}

/** Small inline SVG showing a category's colour and dash pattern. */
export function swatchSVG(cat, width = 28) {
  const c = CATEGORIES[cat];
  return `<svg class="swatch" width="${width}" height="10" aria-hidden="true" focusable="false"><line x1="2" y1="5" x2="${width - 2}" y2="5" class="cat-${cat}" stroke-width="2.5" stroke-dasharray="${c ? c.dash : ""}" stroke-linecap="round"/></svg>`;
}

export function statusBadge(status) {
  const s = STATUSES[status] || { label: status, desc: "" };
  return `<span class="badge status-${esc(status)}" title="${esc(s.desc)}">${esc(s.label)}</span>`;
}

/** Fill every [data-last-updated] element with meta.last_updated. */
export function renderLastUpdated(meta) {
  for (const el of document.querySelectorAll("[data-last-updated]")) {
    el.textContent = fmtDate(meta.last_updated);
    el.setAttribute("datetime", meta.last_updated);
  }
}

/** Visible error, with a hint for the most common cause (file:// URLs). */
export function showLoadError(err, target = document.querySelector("main")) {
  console.error(err);
  const local = location.protocol === "file:";
  const box = document.createElement("div");
  box.className = "load-error";
  box.setAttribute("role", "alert");
  box.innerHTML = local
    ? `<strong>The data could not load.</strong> Browsers block <code>fetch()</code> on <code>file://</code> pages. From the repository folder, run <code>python3 -m http.server 8000</code> and open <a href="http://localhost:8000/">http://localhost:8000/</a>.`
    : `<strong>The data could not load.</strong> ${esc(err.message)}`;
  target.prepend(box);
}

export const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
