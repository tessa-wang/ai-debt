// Every visible deal as a plain table: an accessible alternative to the
// diagram, and a quick way to scan amounts.

import { CATEGORIES, esc, fmtDate, fmtDealAmount, safeUrl, statusBadge, swatchSVG } from "./common.js";

export function createTable(root, data, handlers) {
  const body = root.querySelector("tbody");
  const count = root.querySelector("[data-count]");

  root.addEventListener("click", (ev) => {
    const co = ev.target.closest("[data-company]");
    if (co) handlers.select(co.dataset.company);
  });

  function render({ visible }) {
    const rows = data.deals
      .filter((d) => visible.has(d.id))
      .sort((a, b) => (b.amount_usd_b ?? -1) - (a.amount_usd_b ?? -1));
    count.textContent = rows.length;
    body.innerHTML = rows
      .map((d) => {
        const from = data.companyById.get(d.from);
        const to = data.companyById.get(d.to);
        const links = d.sources
          .map((s, i) => {
            const url = safeUrl(s.url);
            return url
              ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="${esc(s.title)}">[${i + 1}]</a>`
              : `<span class="src-missing" title="Source needed">[?]</span>`;
          })
          .join(" ");
        return `<tr>
          <td><button type="button" class="link-btn" data-company="${esc(from.id)}">${esc(from.name)}</button></td>
          <td><button type="button" class="link-btn" data-company="${esc(to.id)}">${esc(to.name)}</button></td>
          <td class="nowrap">${swatchSVG(d.category, 20)} ${esc(CATEGORIES[d.category]?.short || d.category)}</td>
          <td class="num right">${esc(fmtDealAmount(d))}</td>
          <td>${statusBadge(d.status)}</td>
          <td class="nowrap">${fmtDate(d.date_announced)}</td>
          <td>${esc(d.summary)}</td>
          <td class="nowrap">${links}</td>
        </tr>`;
      })
      .join("");
  }

  return { render };
}
