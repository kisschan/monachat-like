export type RectSize = {
  width: number;
  height: number;
};

export type Bounds = {
  maxX: number;
  maxY: number;
};

export type LeftResizeAnchoredInput = {
  pointerX: number;
  startRight: number;
  containerWidth: number;
  minWidth: number;
  maxWidth: number;
};

export type LeftResizeAnchoredResult = {
  x: number;
  width: number;
};

export type PositionPx = {
  x: number;
  y: number;
};

export type PositionPct = {
  xPct: number;
  yPct: number;
};

export type PositionInset = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type ClampedPosition = {
  positionPx: PositionPx;
  positionPct: PositionPct;
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

export const resizeFromLeftAnchored = ({
  pointerX,
  startRight,
  containerWidth,
  minWidth,
  maxWidth,
}: LeftResizeAnchoredInput): LeftResizeAnchoredResult => {
  const effectiveMaxWidth = Math.min(Math.max(0, maxWidth), Math.max(0, containerWidth));
  const effectiveMinWidth = Math.min(Math.max(0, minWidth), effectiveMaxWidth);
  const rightEdge = clamp(startRight, effectiveMinWidth, Math.max(0, containerWidth));
  const minX = Math.max(0, rightEdge - effectiveMaxWidth);
  const maxX = Math.max(minX, rightEdge - effectiveMinWidth);
  const x = clamp(pointerX, minX, maxX);
  return {
    x,
    width: rightEdge - x,
  };
};

export const clampPosition = (next: PositionPx, bounds: Bounds): ClampedPosition => {
  const clamped = {
    x: clamp(next.x, 0, bounds.maxX),
    y: clamp(next.y, 0, bounds.maxY),
  };
  return {
    positionPx: clamped,
    positionPct: {
      xPct: pxToPct(clamped.x, bounds.maxX),
      yPct: pxToPct(clamped.y, bounds.maxY),
    },
  };
};

export const computeDefaultPosition = (
  bounds: Bounds,
  padding: number,
  inset: Partial<PositionInset> = {},
): PositionPx => {
  const normalized = {
    top: inset.top ?? 0,
    right: inset.right ?? 0,
    bottom: inset.bottom ?? 0,
    left: inset.left ?? 0,
  };
  return {
    x: clamp(bounds.maxX - padding - normalized.right, normalized.left, bounds.maxX),
    y: clamp(bounds.maxY - padding - normalized.bottom, normalized.top, bounds.maxY),
  };
};
