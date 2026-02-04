import { ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLiveWindowDrag } from "@/composables/useLiveWindowDrag";

const createHandle = () => {
  const handle = document.createElement("button");
  Object.defineProperty(handle, "setPointerCapture", {
    value: vi.fn(),
  });
  Object.defineProperty(handle, "releasePointerCapture", {
    value: vi.fn(),
  });
  Object.defineProperty(handle, "hasPointerCapture", {
    value: vi.fn(() => true),
  });
  return handle as HTMLElement;
};

const createPointerEvent = (type: string, options: PointerEventInit) => {
  return new PointerEvent(type, options);
};

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("useLiveWindowDrag", () => {
  it("tracks pointer movement and updates position", () => {
    expect.hasAssertions();
    const handle = createHandle();
    const dragHandleRef = ref<HTMLElement | null>(handle);
    const setPositionPx = vi.fn();
    const { startDrag } = useLiveWindowDrag({
      dragHandleRef,
      getPositionPx: () => ({ x: 30, y: 40 }),
      setPositionPx,
    });

    const startEvent = createPointerEvent("pointerdown", {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    Object.defineProperty(startEvent, "currentTarget", { value: handle });
    startDrag(startEvent);

    document.dispatchEvent(
      createPointerEvent("pointermove", {
        pointerId: 1,
        clientX: 110,
        clientY: 120,
      }),
    );

    expect(setPositionPx).toHaveBeenCalledTimes(1);
    expect(setPositionPx).toHaveBeenCalledWith({ x: 40, y: 60 });
  });

  it("ignores move events from other pointers", () => {
    expect.hasAssertions();
    const handle = createHandle();
    const dragHandleRef = ref<HTMLElement | null>(handle);
    const setPositionPx = vi.fn();
    const { startDrag } = useLiveWindowDrag({
      dragHandleRef,
      getPositionPx: () => ({ x: 10, y: 20 }),
      setPositionPx,
    });

    const startEvent = createPointerEvent("pointerdown", {
      pointerId: 1,
      clientX: 40,
      clientY: 60,
    });
    Object.defineProperty(startEvent, "currentTarget", { value: handle });
    startDrag(startEvent);

    document.dispatchEvent(
      createPointerEvent("pointermove", {
        pointerId: 2,
        clientX: 80,
        clientY: 90,
      }),
    );

    expect(setPositionPx).not.toHaveBeenCalled();

    document.dispatchEvent(
      createPointerEvent("pointermove", {
        pointerId: 1,
        clientX: 50,
        clientY: 70,
      }),
    );

    expect(setPositionPx).toHaveBeenCalledTimes(1);
  });

  it("does not start dragging when blocked", () => {
    expect.hasAssertions();
    const handle = createHandle();
    const dragHandleRef = ref<HTMLElement | null>(handle);
    const setPositionPx = vi.fn();
    const { startDrag } = useLiveWindowDrag({
      dragHandleRef,
      getPositionPx: () => ({ x: 0, y: 0 }),
      setPositionPx,
      isDragBlocked: () => true,
    });

    const startEvent = createPointerEvent("pointerdown", {
      pointerId: 3,
      clientX: 10,
      clientY: 10,
    });
    Object.defineProperty(startEvent, "currentTarget", { value: handle });
    startDrag(startEvent);

    document.dispatchEvent(
      createPointerEvent("pointermove", {
        pointerId: 3,
        clientX: 20,
        clientY: 20,
      }),
    );

    expect(setPositionPx).not.toHaveBeenCalled();
  });

  it("removes listeners after ending a drag", () => {
    expect.hasAssertions();
    const handle = createHandle();
    const dragHandleRef = ref<HTMLElement | null>(handle);
    const setPositionPx = vi.fn();
    const { startDrag } = useLiveWindowDrag({
      dragHandleRef,
      getPositionPx: () => ({ x: 5, y: 5 }),
      setPositionPx,
    });

    const startEvent = createPointerEvent("pointerdown", {
      pointerId: 4,
      clientX: 20,
      clientY: 20,
    });
    Object.defineProperty(startEvent, "currentTarget", { value: handle });
    startDrag(startEvent);

    document.dispatchEvent(
      createPointerEvent("pointermove", {
        pointerId: 4,
        clientX: 30,
        clientY: 40,
      }),
    );
    document.dispatchEvent(
      createPointerEvent("pointerup", {
        pointerId: 4,
        clientX: 30,
        clientY: 40,
      }),
    );
    document.dispatchEvent(
      createPointerEvent("pointermove", {
        pointerId: 4,
        clientX: 50,
        clientY: 60,
      }),
    );

    expect(setPositionPx).toHaveBeenCalledTimes(1);
  });

  it("handles null drag handles without throwing", () => {
    expect.hasAssertions();
    const dragHandleRef = ref<HTMLElement | null>(null);
    const setPositionPx = vi.fn();
    const { startDrag } = useLiveWindowDrag({
      dragHandleRef,
      getPositionPx: () => ({ x: 0, y: 0 }),
      setPositionPx,
    });

    const startEvent = createPointerEvent("pointerdown", {
      pointerId: 5,
      clientX: 5,
      clientY: 5,
    });
    Object.defineProperty(startEvent, "currentTarget", { value: null });

    expect(() => startDrag(startEvent)).not.toThrow();

    document.dispatchEvent(
      createPointerEvent("pointerup", {
        pointerId: 5,
        clientX: 5,
        clientY: 5,
      }),
    );

    expect(setPositionPx).not.toHaveBeenCalled();
  });
});
