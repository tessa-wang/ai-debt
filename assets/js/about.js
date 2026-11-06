// about.html: fills in live counts and the category/status definitions, so
// the methodology page always matches the code and the data.

import { CATEGORIES, STATUSES, esc, loadData, renderLastUpdated, showLoadError, swatchSVG, statusBadge, isTodo } from "./common.js";

function renderDefinitions() {
  document.getElementById("about-categories").innerHTML = Object.entries(CATEGORIES)
    .map(([key, c]) => `<dt>${swatchSVG(key, 36)} ${esc(c.label)}</dt><dd>${esc(c.desc)}</dd>`)
    .join("");
  document.getElementById("about-statuses").innerHTML = Object.entries(STATUSES)
    .map(([key, s]) => `<dt>${statusBadge(key)}</dt><dd>${esc(s.desc)}</dd>`)
    .join("");
}

async function init() {
  renderDefinitions();
  let data;
  try {
    data = await loadData();
  } catch (err) {
    showLoadError(err);
    return;
  }
  renderLastUpdated(data.meta);
  const sourced = data.deals.filter((d) => d.sources.some((s) => !isTodo(s.url))).length;
  document.getElementById("about-counts").textContent =
    `${data.companies.length} companies and ${data.deals.length} deals; ${sourced} of the deals have at least one linked source.`;
}

init();
