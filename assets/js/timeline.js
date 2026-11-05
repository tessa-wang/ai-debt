// Month slider with play/pause. Shows deals announced up to the chosen
// month. Deals without a known date are always shown (and counted).

import { fmtMonthKey, monthKey, parseDate, prefersReducedMotion } from "./common.js";

export function createTimeline(root, data, onChange) {
  const slider = root.querySelector("#tl-range");
  const output = root.querySelector("#tl-value");
  const play = root.querySelector("#tl-play");
  const note = root.querySelector("#tl-note");

  const dated = data.deals.map((d) => parseDate(d.date_announced)).filter(Boolean);
  const undated = data.deals.length - dated.length;
  const updated = parseDate(data.meta.last_updated);
  const keys = dated.map(monthKey);
  const min = keys.length ? Math.min(...keys) : null;
  const max = keys.length ? Math.max(...keys, updated ? monthKey(updated) : 0) : null;
  let timer = null;

  note.textContent = undated
    ? `${undated} deal${undated === 1 ? " has" : "s have"} no confirmed date yet and ${undated === 1 ? "is" : "are"} always shown.`
    : "";

  if (min === null || min === max) {
    // Nothing to scrub through yet.
    root.classList.add("is-disabled");
    slider.disabled = true;
    play.disabled = true;
    output.textContent = "All dates";
    return { cutoff: () => null, stop() {} };
  }

  slider.min = 0;
  slider.max = max - min;
  slider.step = 1;
  slider.value = max - min;

  const cutoff = () => min + Number(slider.value);
  const sync = () => {
    const label = fmtMonthKey(cutoff());
    output.textContent = label;
    slider.setAttribute("aria-valuetext", label);
  };

  function stop() {
    clearInterval(timer);
    timer = null;
    play.setAttribute("aria-pressed", "false");
    play.setAttribute("aria-label", "Play timeline");
    play.querySelector(".play-icon").textContent = "▶";
  }

  function start() {
    if (Number(slider.value) >= Number(slider.max)) slider.value = 0;
    sync();
    onChange();
    play.setAttribute("aria-pressed", "true");
    play.setAttribute("aria-label", "Pause timeline");
    play.querySelector(".play-icon").textContent = "❚❚";
    // Slower steps when the visitor prefers reduced motion.
    timer = setInterval(() => {
      if (Number(slider.value) >= Number(slider.max)) return stop();
      slider.value = Number(slider.value) + 1;
      sync();
      onChange();
    }, prefersReducedMotion() ? 1400 : 700);
  }

  slider.addEventListener("input", () => {
    stop();
    sync();
    onChange();
  });
  play.addEventListener("click", () => (timer ? stop() : start()));
  sync();

  return { cutoff, stop };
}

/** Does a deal pass the timeline cutoff? Undated deals always pass. */
export function inTimeline(deal, cutoff) {
  if (cutoff === null) return true;
  const d = parseDate(deal.date_announced);
  return !d || monthKey(d) <= cutoff;
}
