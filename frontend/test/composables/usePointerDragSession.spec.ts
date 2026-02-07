import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineComponent, h } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import {
  usePointerDragSession,
  type DragSession,
  type DragSessionCallbacks,
} from "@/composables/usePointerDragSession";

/* ------------------------------------------------------------------ */
/*  helpers                                                            */
/* ------------------------------------------------------------------ */

/** mount a throwaway component that exposes the composable */
function mountSession(): { wrapper: VueWrapper; session: DragSession } {
  let session!: DragSession;
  const Comp = defineComponent({
    setup() {
      session = usePointerDragSession();
      return {};
    },
    render: () => h("div"),
  });
  const wrapper = mount(Comp);
  return { wrapper, session };
}

/** Create a PointerEvent with common defaults */
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

/** Build a mock element with setPointerCapture / releasePointerCapture */
function mockElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.setPointerCapture = vi.fn();
  el.releasePointerCapture = vi.fn();
  el.hasPointerCapture = vi.fn().mockReturnValue(true);
  return el;
}

/** Start a drag session with boilerplate */
function startSession(
  session: DragSession,
  callbacks: DragSessionCallbacks,
  opts: { pointerId?: number; el?: HTMLElement } = {},
): HTMLElement {
  const el = opts.el ?? mockElement();
  const down = pe("pointerdown", { pointerId: opts.pointerId ?? 1 });
  Object.defineProperty(down, "currentTarget", { value: el });
  session.start(down, callbacks);
  return el;
}

/* ------------------------------------------------------------------ */
/*  tests                                                              */
/* ------------------------------------------------------------------ */

describe("usePointerDragSession", () => {
  let wrapper: VueWrapper;
  let session: DragSession;
  let onMove: ReturnType<typeof vi.fn>;
  let onEnd: ReturnType<typeof vi.fn>;
  let callbacks: DragSessionCallbacks;

  beforeEach(() => {
    ({ wrapper, session } = mountSession());
    onMove = vi.fn();
    onEnd = vi.fn();
    callbacks = { onMove, onEnd };
  });

  afterEach(() => {
    wrapper.unmount();
  });

  // ---- basic lifecycle ----

  it("starts in idle state", () => {
    expect.assertions(1);
    expect(session.isDragging.value).toBe(false);
  });

  it("transitions to dragging on start()", () => {
    expect.assertions(1);
    startSession(session, callbacks, { pointerId: 5 });
    expect(session.isDragging.value).toBe(true);
  });

  it("calls onMove for matching pointerId", () => {
    expect.assertions(2);
    startSession(session, callbacks, { pointerId: 7 });

    const move = pe("pointermove", { pointerId: 7, clientX: 100 });
    document.dispatchEvent(move);

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove.mock.calls[0][0].clientX).toBe(100);
  });

  it("ends session on pointerup", () => {
    expect.assertions(2);
    startSession(session, callbacks, { pointerId: 3 });

    document.dispatchEvent(pe("pointerup", { pointerId: 3 }));

    expect(session.isDragging.value).toBe(false);
    expect(onEnd).toHaveBeenCalledWith("pointerup");
  });

  // ---- pointerId mismatch ----

  it("ignores pointermove with different pointerId", () => {
    expect.assertions(1);
    startSession(session, callbacks, { pointerId: 10 });

    document.dispatchEvent(pe("pointermove", { pointerId: 999 }));

    expect(onMove).not.toHaveBeenCalled();
  });

  it("ignores pointerup with different pointerId", () => {
    expect.assertions(2);
    startSession(session, callbacks, { pointerId: 10 });

    document.dispatchEvent(pe("pointerup", { pointerId: 999 }));

    expect(session.isDragging.value).toBe(true);
    expect(onEnd).not.toHaveBeenCalled();
  });

  // ---- pointercancel ----

  it("ends session on pointercancel", () => {
    expect.assertions(2);
    startSession(session, callbacks, { pointerId: 2 });

    document.dispatchEvent(pe("pointercancel", { pointerId: 2 }));

    expect(session.isDragging.value).toBe(false);
    expect(onEnd).toHaveBeenCalledWith("pointercancel");
  });

  // ---- double start prevention ----

  it("ignores second start() while already dragging", () => {
    expect.assertions(2);
    startSession(session, callbacks, { pointerId: 1 });

    const onMove2 = vi.fn();
    const el = mockElement();
    const down2 = pe("pointerdown", { pointerId: 2 });
    Object.defineProperty(down2, "currentTarget", { value: el });
    session.start(down2, { onMove: onMove2, onEnd: vi.fn() });

    // original session still active
    document.dispatchEvent(pe("pointermove", { pointerId: 1 }));
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove2).not.toHaveBeenCalled();
  });

  // ---- cleanup ----

  it("cleanup() ends active session", () => {
    expect.assertions(3);
    startSession(session, callbacks, { pointerId: 4 });

    session.cleanup();

    expect(session.isDragging.value).toBe(false);
    expect(onEnd).toHaveBeenCalledWith("cleanup");

    // listeners removed — further events should not fire
    document.dispatchEvent(pe("pointermove", { pointerId: 4 }));
    expect(onMove).not.toHaveBeenCalled();
  });

  it("cleanup() is safe to call when idle", () => {
    expect.assertions(1);
    expect(() => session.cleanup()).not.toThrow();
  });

  it("cleans up listeners on unmount", () => {
    expect.assertions(2);
    startSession(session, callbacks, { pointerId: 6 });

    wrapper.unmount();

    expect(onEnd).toHaveBeenCalledWith("cleanup");
    // further events should not fire
    document.dispatchEvent(pe("pointermove", { pointerId: 6 }));
    expect(onMove).not.toHaveBeenCalled();
  });

  // ---- setPointerCapture JSDOM guard ----

  it("works when setPointerCapture is not available", () => {
    expect.assertions(3);
    const el = document.createElement("div");
    (el as any).setPointerCapture = undefined;
    (el as any).releasePointerCapture = undefined;

    startSession(session, callbacks, { pointerId: 8, el });

    expect(session.isDragging.value).toBe(true);

    document.dispatchEvent(pe("pointerup", { pointerId: 8 }));
    expect(session.isDragging.value).toBe(false);
    expect(onEnd).toHaveBeenCalledWith("pointerup");
  });

  // ---- consecutive sessions ----

  it("allows new session after previous one ends", () => {
    expect.assertions(3);

    // first session
    startSession(session, callbacks, { pointerId: 1 });
    document.dispatchEvent(pe("pointerup", { pointerId: 1 }));
    expect(session.isDragging.value).toBe(false);

    // second session
    const onMove2 = vi.fn();
    startSession(session, { onMove: onMove2, onEnd: vi.fn() }, { pointerId: 2 });

    document.dispatchEvent(pe("pointermove", { pointerId: 2, clientX: 50 }));
    expect(onMove2).toHaveBeenCalledTimes(1);
    // old callback should NOT fire
    expect(onMove).toHaveBeenCalledTimes(0);
  });
});
