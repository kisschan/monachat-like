export type RectSize = {
  width: number;
  height: number;
};

export type Bounds = {
  maxX: number;
  maxY: number;
};

export const clamp = (value: number, min: number, max: number) => {
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
};

export const computeBounds = (container: RectSize, pane: RectSize): Bounds => {
  return {
    maxX: Math.max(0, container.width - pane.width),
    maxY: Math.max(0, container.height - pane.height),
  };
};

export const pxToPct = (value: number, max: number) => {
  if (max <= 0) {
    return 0;
  }
  return clamp(value / max, 0, 1);
};

export const pctToPx = (pct: number, max: number) => {
  return clamp(pct * max, 0, max);
};
