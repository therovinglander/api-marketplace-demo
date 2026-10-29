import { describe, expect, it } from "vitest";
import { INPUT_RANGES, validateInputs } from "@/lib/pricing/calculator";
import { SECONDS_PER_MONTH, SEGMENT_VOLUME_RANGE, SLIDER_STEPS, formatRate, logToSlider, searchesPerDay, searchesPerSecond, sliderToLog } from "@/lib/pricing/volume";

describe("volume framing (U1)", () => {
  it("per-day and per-second use a 30-day month", () => {
    expect(searchesPerDay(30_000_000)).toBe(1_000_000);
    expect(SECONDS_PER_MONTH).toBe(2_592_000);
    expect(searchesPerSecond(2_592_000)).toBe(1);
    expect(searchesPerSecond(5_000_000)).toBeCloseTo(1.929, 3);
  });
  it("formatRate reads naturally at agency, OTA and bank scale", () => {
    expect(formatRate(5_000_000)).toBe("166,667 / day · 1.9 / sec");
    expect(formatRate(150_000_000)).toBe("5,000,000 / day · 58 / sec");
    expect(formatRate(100_000)).toBe("3,333 / day · 0.04 / sec");
  });
  it("the searches range now reaches 5B a month", () => {
    expect(INPUT_RANGES.S[1]).toBe(5_000_000_000);
    expect(validateInputs({ S: 5_000_000_000, r: 1000, c: 0.85, h: 0.3 })).toEqual([]);
    expect(validateInputs({ S: 5_000_000_001, r: 1000, c: 0.85, h: 0.3 })).toHaveLength(1);
    expect(validateInputs({ S: 9_999, r: 1000, c: 0.85, h: 0.3 })).toHaveLength(1);
  });
  it("log slider hits both ends and is monotonic", () => {
    const [lo, hi] = INPUT_RANGES.S;
    expect(sliderToLog(0, lo, hi)).toBe(lo);
    expect(sliderToLog(SLIDER_STEPS, lo, hi)).toBe(hi);
    let prev = 0;
    for (let p = 0; p <= SLIDER_STEPS; p += 50) {
      const v = sliderToLog(p, lo, hi);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
  it("log slider round-trips typical segment volumes to within one step", () => {
    const [lo, hi] = INPUT_RANGES.S;
    for (const v of [100_000, 5_000_000, 60_000_000, 150_000_000, 1_000_000_000]) {
      const back = sliderToLog(logToSlider(v, lo, hi), lo, hi);
      expect(Math.abs(Math.log(back) - Math.log(v))).toBeLessThan(Math.log(hi / lo) / SLIDER_STEPS);
    }
  });
  it("out-of-range slider positions clamp instead of throwing", () => {
    const [lo, hi] = INPUT_RANGES.S;
    expect(sliderToLog(-50, lo, hi)).toBe(lo);
    expect(sliderToLog(SLIDER_STEPS * 3, lo, hi)).toBe(hi);
    expect(logToSlider(1, lo, hi)).toBe(0);
    expect(logToSlider(hi * 10, lo, hi)).toBe(SLIDER_STEPS);
  });
  it("segment ranges are present for every segment", () => {
    expect(Object.keys(SEGMENT_VOLUME_RANGE).sort()).toEqual(["agency", "bank", "ota"]);
  });
});
