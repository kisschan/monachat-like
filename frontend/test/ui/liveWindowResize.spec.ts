import { describe, expect, it } from "vitest";
import { resizeFromLeftAnchored } from "@/ui/liveWindowPosition";

describe("resizeFromLeftAnchored", () => {
  it("updates x alongside width so the left handle stays under the pointer", () => {
    const result = resizeFromLeftAnchored({
      pointerX: 500,
      startRight: 980,
      containerWidth: 1000,
      minWidth: 320,
      maxWidth: 900,
    });

    expect(result).toEqual({ x: 500, width: 480 });
  });

  it("does not shrink below minWidth", () => {
    const result = resizeFromLeftAnchored({
      pointerX: 800,
      startRight: 900,
      containerWidth: 1000,
      minWidth: 320,
      maxWidth: 900,
    });

    expect(result).toEqual({ x: 580, width: 320 });
  });

  it("keeps the right edge inside the container", () => {
    const result = resizeFromLeftAnchored({
      pointerX: 600,
      startRight: 1100,
      containerWidth: 1000,
      minWidth: 320,
      maxWidth: 520,
    });

    expect(result.x + result.width).toBe(1000);
    expect(result).toEqual({ x: 600, width: 400 });
  });

  it("does not allow x to go negative", () => {
    const result = resizeFromLeftAnchored({
      pointerX: -50,
      startRight: 700,
      containerWidth: 900,
      minWidth: 320,
      maxWidth: 520,
    });

    expect(result).toEqual({ x: 180, width: 520 });
    expect(result.x).toBeGreaterThanOrEqual(0);
  });

  it("handles small containers by pinning width to the available size", () => {
    const result = resizeFromLeftAnchored({
      pointerX: 40,
      startRight: 280,
      containerWidth: 280,
      minWidth: 320,
      maxWidth: 520,
    });

    expect(result).toEqual({ x: 0, width: 280 });
  });

  it("respects maxWidth when the pointer moves too far left", () => {
    const result = resizeFromLeftAnchored({
      pointerX: 0,
      startRight: 900,
      containerWidth: 1200,
      minWidth: 320,
      maxWidth: 400,
    });

    expect(result).toEqual({ x: 500, width: 400 });
  });
});
