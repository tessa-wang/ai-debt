// changelog.html: renders data/changelog.json newest first, with the most
// recent entry summarised at the top.

import { CATEGORIES, esc, fmtDate, loadData, parseDate, renderLastUpdated, showLoadError } from "./common.js";

const COLLAPSE_AFTER = 8; // longer change lists start folded

async function init() {
  let data;
  try {
    data = await loadData();
  } catch (err) {
    showLoadError(err);
    return;
  }
  renderLastUpdated(data.meta);

  const entries = [...data.changelog].sort((a, b) => (parseDate(b.date) || 0) - (parseDate(a.date) || 0));
  const week = document.getElementById("this-week");
  const list = document.getElementById("entries");

  if (!entries.length) {
    week.innerHTML = `<p class="muted">No changes recorded yet.</p>`;
    return;
  }

  const [latest, ...older] = entries;
  week.innerHTML = `
    <p class="entry-date"><time datetime="${esc(latest.date)}">${fmtDate(latest.date)}</time></p>
    <h2>What changed this week</h2>
    <p>${esc(latest.headline)}</p>
    ${countsHTML(latest)}
    ${latest.summary?.length ? `<ul>${latest.summary.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}
    ${changesHTML(latest, data)}`;

  list.innerHTML = older.length
    ? older.map((e) => entryHTML(e, data)).join("")
    : `<p class="muted">This is the first entry. Earlier weeks will appear here.</p>`;
}

function countsHTML(entry) {
  const n = (kind) => entry.changes.filter((c) => c.change === kind).length;
  return `<p class="counts"><span><b>${n("added")}</b> added</span><span><b>${n("updated")}</b> updated</span><span><b>${n("removed")}</b> removed</span></p>`;
}

function entryHTML(entry, data) {
  return `
    <article class="entry">
      <p class="entry-date"><time datetime="${esc(entry.date)}">${fmtDate(entry.date)}</time></p>
      <h3>${esc(entry.headline)}</h3>
      ${countsHTML(entry)}
      ${entry.summary?.length ? `<ul>${entry.summary.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}
      ${changesHTML(entry, data)}
    </article>`;
}

function changesHTML(entry, data) {
  if (!entry.changes.length) return "";
  const order = { added: 0, updated: 1, removed: 2 };
  const items = [...entry.changes]
    .sort((a, b) => order[a.change] - order[b.change])
    .map((c) => `<li><span class="change-tag change-${esc(c.change)}">${esc(c.change)}</span><span>${targetHTML(c, data)}${c.note ? ` <span class="muted">${esc(c.note)}</span>` : ""}</span></li>`)
    .join("");
  const listHTML = `<ul class="change-list">${items}</ul>`;
  if (entry.changes.length <= COLLAPSE_AFTER) return listHTML;
  return `<details><summary>All ${entry.changes.length} changes</summary>${listHTML}</details>`;
}

/** Link a change to the map. Removed items no longer exist, so show the id. */
function targetHTML(change, data) {
  if (change.deal_id) {
    const d = data.dealById.get(change.deal_id);
    if (!d) return `<code>${esc(change.deal_id)}</code>`;
    const from = data.companyById.get(d.from)?.name || d.from;
    const to = data.companyById.get(d.to)?.name || d.to;
    const cat = CATEGORIES[d.category]?.short || d.category;
    return `<a href="./#deal=${encodeURIComponent(d.id)}">${esc(from)} → ${esc(to)}</a> <span class="muted">${esc(cat)}</span>`;
  }
  const c = data.companyById.get(change.company_id);
  if (!c) return `<code>${esc(change.company_id)}</code>`;
  return `<a href="./#company=${encodeURIComponent(c.id)}">${esc(c.name)}</a>`;
}

init();
