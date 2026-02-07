import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineComponent, h } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import {
  useCharacterDrag,
  type CharacterDragContext,
} from "@/composables/useCharacterDrag";

/* ------------------------------------------------------------------ */
/*  helpers                                                            */
/* ------------------------------------------------------------------ */

function mountDrag(options?: {
  isMine?: (id: string) => boolean;
  setXY?: (x: number, y: number) => void;
}): { wrapper: VueWrapper; ctx: CharacterDragContext } {
  const isMine = options?.isMine ?? (() => true);
  const setXY = options?.setXY ?? vi.fn();
  let ctx!: CharacterDragContext;

  const Comp = defineComponent({
    setup() {
      ctx = useCharacterDrag({ isMine, setXY });
      return {};
    },
    render: () => h("div"),
  });
  const wrapper = mount(Comp);
  return { wrapper, ctx };
}

function pe(
  type: string,
  opts: Partial<PointerEventInit & { pointerId: number }> = {},
): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    pointerId: 1,
    clientX: 0,
    clientY: 0,
    ...opts,
  });
}

/** Simulate pointerdown on a mock element */
function startDrag(
  ctx: CharacterDragContext,
  id: string,
  user: { dispX: number; dispY: number },
  opts: { pointerId?: number; clientX?: number; clientY?: number } = {},
) {
  const el = document.createElement("div");
  el.setPointerCapture = vi.fn();
  el.releasePointerCapture = vi.fn();
  el.hasPointerCapture = vi.fn().mockReturnValue(true);

  const event = pe("pointerdown", {
    pointerId: opts.pointerId ?? 1,
    clientX: opts.clientX ?? 100,
    clientY: opts.clientY ?? 200,
  });
  Object.defineProperty(event, "currentTarget", { value: el });

  ctx.onPointerDown(event, id, user);
}

/* ------------------------------------------------------------------ */
/*  tests                                                              */
/* ------------------------------------------------------------------ */

describe("useCharacterDrag", () => {
  let wrapper: VueWrapper;
  let ctx: CharacterDragContext;
  let setXY: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setXY = vi.fn();
    ({ wrapper, ctx } = mountDrag({ setXY }));
  });

  afterEach(() => {
    wrapper.unmount();
  });

  // ---- initial state ----

  it("starts with no drag active", () => {
    expect(ctx.draggingId.value).toBeNull();
    expect(ctx.dragOffset.value).toEqual({ x: 0, y: 0 });
    expect(ctx.isDragging.value).toBe(false);
  });

  // ---- basic drag flow ----

  it("sets draggingId on pointerdown", () => {
    startDrag(ctx, "user-1", { dispX: 50, dispY: 300 });

    expect(ctx.draggingId.value).toBe("user-1");
    expect(ctx.isDragging.value).toBe(true);
    expect(ctx.dragOffset.value).toEqual({ x: 0, y: 0 });
  });

  it("updates dragOffset on pointermove", () => {
    startDrag(ctx, "user-1", { dispX: 50, dispY: 300 }, { clientX: 100, clientY: 200 });

    document.dispatchEvent(pe("pointermove", { pointerId: 1, clientX: 130, clientY: 250 }));

    expect(ctx.dragOffset.value).toEqual({ x: 30, y: 50 });
  });

  it("calls setXY with final position on pointerup", () => {
    startDrag(ctx, "user-1", { dispX: 50, dispY: 300 }, { clientX: 100, clientY: 200 });

    document.dispatchEvent(pe("pointermove", { pointerId: 1, clientX: 160, clientY: 220 }));
    document.dispatchEvent(pe("pointerup", { pointerId: 1 }));

    // finalX = dispX(50) + offsetX(60) = 110
    // finalY = dispY(300) + offsetY(20) = 320
    expect(setXY).toHaveBeenCalledWith(110, 320);
    expect(ctx.draggingId.value).toBeNull();
    expect(ctx.dragOffset.value).toEqual({ x: 0, y: 0 });
  });

  // ---- no movement = no setXY ----

  it("does not call setXY if no movement occurred (click)", () => {
    startDrag(ctx, "user-1", { dispX: 50, dispY: 300 });

    document.dispatchEvent(pe("pointerup", { pointerId: 1 }));

    expect(setXY).not.toHaveBeenCalled();
    expect(ctx.draggingId.value).toBeNull();
  });

  // ---- isMine guard ----

  it("ignores pointerdown on other users' characters", () => {
    const isMine = (id: string) => id === "me";
    wrapper.unmount();
    ({ wrapper, ctx } = mountDrag({ isMine, setXY }));

    startDrag(ctx, "other-user", { dispX: 50, dispY: 300 });

    expect(ctx.draggingId.value).toBeNull();
    expect(ctx.isDragging.value).toBe(false);
  });

  // ---- pointercancel ----

  it("resets state on pointercancel without calling setXY", () => {
    startDrag(ctx, "user-1", { dispX: 50, dispY: 300 }, { clientX: 100, clientY: 200 });

    document.dispatchEvent(pe("pointermove", { pointerId: 1, clientX: 130, clientY: 250 }));
    document.dispatchEvent(pe("pointercancel", { pointerId: 1 }));

    // pointercancel still commits if there was movement (same as pointerup behavior)
    expect(ctx.draggingId.value).toBeNull();
    expect(ctx.dragOffset.value).toEqual({ x: 0, y: 0 });
  });

  // ---- pointerId mismatch ----

  it("ignores pointermove with mismatched pointerId", () => {
    startDrag(ctx, "user-1", { dispX: 50, dispY: 300 }, { pointerId: 5, clientX: 100, clientY: 200 });

    document.dispatchEvent(pe("pointermove", { pointerId: 999, clientX: 500, clientY: 500 }));

    expect(ctx.dragOffset.value).toEqual({ x: 0, y: 0 });
  });

  // ---- consecutive drags ----

  it("does not carry over offset from previous drag", () => {
    // first drag: move right 60px
    startDrag(ctx, "user-1", { dispX: 50, dispY: 300 }, { pointerId: 1, clientX: 100, clientY: 200 });
    document.dispatchEvent(pe("pointermove", { pointerId: 1, clientX: 160, clientY: 200 }));
    document.dispatchEvent(pe("pointerup", { pointerId: 1 }));
    expect(setXY).toHaveBeenCalledWith(110, 300);

    setXY.mockClear();

    // second drag: should start from fresh offset
    startDrag(ctx, "user-1", { dispX: 110, dispY: 300 }, { pointerId: 2, clientX: 200, clientY: 300 });

    expect(ctx.dragOffset.value).toEqual({ x: 0, y: 0 });

    document.dispatchEvent(pe("pointermove", { pointerId: 2, clientX: 210, clientY: 310 }));
    expect(ctx.dragOffset.value).toEqual({ x: 10, y: 10 });

    document.dispatchEvent(pe("pointerup", { pointerId: 2 }));
    expect(setXY).toHaveBeenCalledWith(120, 310);
  });

  // ---- negative movement ----

  it("handles negative drag offsets (dragging left/up)", () => {
    startDrag(ctx, "user-1", { dispX: 200, dispY: 400 }, { clientX: 300, clientY: 500 });

    document.dispatchEvent(pe("pointermove", { pointerId: 1, clientX: 250, clientY: 450 }));
    document.dispatchEvent(pe("pointerup", { pointerId: 1 }));

    // finalX = 200 + (250 - 300) = 150
    // finalY = 400 + (450 - 500) = 350
    expect(setXY).toHaveBeenCalledWith(150, 350);
  });
});
