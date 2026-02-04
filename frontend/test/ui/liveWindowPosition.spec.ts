import { describe, it, expect } from "vitest";
import {
  clamp,
  computeBounds,
  computeDefaultPosition,
  pctToPx,
  pxToPct,
} from "@/ui/liveWindowPosition";

describe("liveWindowPosition helpers", () => {
  it("clamps values within range", () => {
    expect.hasAssertions();
    expect(clamp(12, 0, 10)).toBe(10);
    expect(clamp(-4, 0, 10)).toBe(0);
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("computes bounds from container and pane sizes", () => {
    expect.hasAssertions();
    expect(computeBounds({ width: 800, height: 600 }, { width: 320, height: 200 })).toStrictEqual({
      maxX: 480,
      maxY: 400,
    });
    expect(computeBounds({ width: 200, height: 100 }, { width: 320, height: 200 })).toStrictEqual({
      maxX: 0,
      maxY: 0,
    });
  });

  it("converts between px and pct within bounds", () => {
    expect.hasAssertions();
    expect(pxToPct(50, 200)).toBeCloseTo(0.25, 5);
    expect(pxToPct(300, 200)).toBe(1);
    expect(pxToPct(-10, 200)).toBe(0);
    expect(pctToPx(0.5, 200)).toBe(100);
    expect(pctToPx(1.5, 200)).toBe(200);
    expect(pctToPx(-0.2, 200)).toBe(0);
  });

  it("handles zero bounds safely", () => {
    expect.hasAssertions();
    expect(pxToPct(10, 0)).toBe(0);
    expect(pctToPx(0.5, 0)).toBe(0);
  });

  it("computes default position with padding and inset", () => {
    expect.hasAssertions();
    expect(computeDefaultPosition({ maxX: 200, maxY: 140 }, 12)).toStrictEqual({
      x: 188,
      y: 128,
    });
    expect(
      computeDefaultPosition({ maxX: 200, maxY: 140 }, 12, { bottom: 20, right: 8 }),
    ).toStrictEqual({
      x: 180,
      y: 108,
    });
  });
});
