// Volume helpers: express a monthly search count as per-day / per-second, and map it onto a log-scale slider.
// Illustrative framing only. Segment ranges are judgement, not sourced.

/** A 30-day month, so per-day and per-second figures are easy to check by hand. */
export const DAYS_PER_MONTH = 30;
export const SECONDS_PER_MONTH = DAYS_PER_MONTH * 24 * 60 * 60;

export const searchesPerDay = (monthly: number) => monthly / DAYS_PER_MONTH;
export const searchesPerSecond = (monthly: number) => monthly / SECONDS_PER_MONTH;

/** "1,667 / day · 0.6 / sec" style text. Per-second keeps one decimal below 10, none above. */
export function formatRate(monthly: number): string {
  const day = Math.round(searchesPerDay(monthly));
  const sec = searchesPerSecond(monthly);
  const secText = sec < 10 ? sec.toFixed(sec < 1 ? 2 : 1) : Math.round(sec).toLocaleString("en-US");
  return `${day.toLocaleString("en-US")} / day · ${secText} / sec`;
}

export const SLIDER_STEPS = 1000;

/** Slider position (0..SLIDER_STEPS) -> value on a log scale between lo and hi. Rounded to 3 significant figures. */
export function sliderToLog(pos: number, lo: number, hi: number): number {
  const t = Math.min(1, Math.max(0, pos / SLIDER_STEPS));
  const v = Math.exp(Math.log(lo) + t * (Math.log(hi) - Math.log(lo)));
  const mag = 10 ** (Math.floor(Math.log10(v)) - 2);
  return Math.min(hi, Math.max(lo, Math.round(v / mag) * mag));
}

/** Inverse of sliderToLog. */
export function logToSlider(value: number, lo: number, hi: number): number {
  const v = Math.min(hi, Math.max(lo, value));
  return Math.round(((Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * SLIDER_STEPS);
}

/** Illustrative monthly search volumes by partner segment. Judgement, not sourced. */
export const SEGMENT_VOLUME_RANGE: Record<"agency" | "ota" | "bank", string> = {
  agency: "100k to 5M searches a month",
  ota: "5M to 1B+ searches a month",
  bank: "10M to 200M searches a month",
};
