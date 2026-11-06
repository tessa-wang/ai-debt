// Deal tooltip. Hovering a line shows it; clicking (or tapping) pins it so
// the source links can be clicked. Escape or the close button unpins.

import { CATEGORIES, esc, fmtDate, fmtDealAmount, sourcesHTML, statusBadge, swatchSVG } from "./common.js";

export function createTooltip(el, stage, data, { onClose } = {}) {
  let pinned = null;

  el.addEventListener("click", (ev) => {
    if (ev.target.closest("[data-close]")) hide(true);
  });

  function html(d, isPinned) {
    const from = data.companyById.get(d.from);
    const to = data.companyById.get(d.to);
    const cat = CATEGORIES[d.category];
    return `
      <div class="tt-head">
        ${swatchSVG(d.category)}
        <span class="tt-route">${esc(from.name)} <span aria-hidden="true">→</span><span class="sr-only">to</span> ${esc(to.name)}</span>
        ${isPinned ? `<button type="button" class="icon-btn" data-close aria-label="Close deal details">×</button>` : ""}
      </div>
      <div class="tt-amt num">${esc(fmtDealAmount(d))}</div>
      <div class="deal-meta">${statusBadge(d.status)}<span>${esc(cat ? cat.label : d.category)}</span><span>${fmtDate(d.date_announced)}</span></div>
      <p class="tt-summary">${esc(d.summary)}</p>
      ${sourcesHTML(d)}
      ${isPinned ? "" : `<p class="tt-hint">Click the line to pin and open sources</p>`}`;
  }

  function place(ev) {
    const box = stage.getBoundingClientRect();
    const tw = el.offsetWidth;
    const th = el.offsetHeight;
    let x = ev.clientX - box.left + 14;
    let y = ev.clientY - box.top + 14;
    if (x + tw > box.width - 8) x = ev.clientX - box.left - tw - 14;
    if (y + th > box.height - 8) y = ev.clientY - box.top - th - 14;
    el.style.left = `${Math.max(8, x)}px`;
    el.style.top = `${Math.max(8, y)}px`;
  }

  function show(d, ev) {
    if (pinned) return;
    el.innerHTML = html(d, false);
    el.hidden = false;
    el.classList.remove("is-pinned");
    place(ev);
  }

  function pin(d, ev) {
    pinned = d.id;
    el.innerHTML = html(d, true);
    el.hidden = false;
    el.classList.add("is-pinned");
    el.setAttribute("aria-label", `Deal details: ${data.companyById.get(d.from).name} to ${data.companyById.get(d.to).name}`);
    place(ev);
    el.querySelector("[data-close]")?.focus({ preventScroll: true });
  }

  function hide(force = false) {
    if (pinned && !force) return;
    const wasPinned = pinned;
    pinned = null;
    el.hidden = true;
    el.classList.remove("is-pinned");
    if (wasPinned && onClose) onClose(wasPinned);
  }

  return { show, pin, hide, get pinned() { return pinned; } };
}
