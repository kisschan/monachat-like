import { onBeforeUnmount, ref, type Ref } from "vue";

type Point = { x: number; y: number };

type LiveWindowDragOptions = {
  dragHandleRef: Ref<HTMLElement | null>;
  getPositionPx: () => Point;
  setPositionPx: (next: Point) => void;
  onDragEnd?: () => void;
  isDragBlocked?: () => boolean;
};

const CAPTURE_OPTS: EventListenerOptions = { capture: true };
const ACTIVE_OPTS: AddEventListenerOptions = { capture: true, passive: false };

export const useLiveWindowDrag = (options: LiveWindowDragOptions) => {
  const dragPointerId = ref<number | null>(null);
  const dragStart = ref({ x: 0, y: 0, originX: 0, originY: 0 });

  const onDragPointerMove = (event: PointerEvent) => {
    if (dragPointerId.value !== event.pointerId) {
      return;
    }
    event.preventDefault();
    const next = {
      x: dragStart.value.originX + (event.clientX - dragStart.value.x),
      y: dragStart.value.originY + (event.clientY - dragStart.value.y),
    };
    options.setPositionPx(next);
  };

  const endDrag = (event: PointerEvent) => {
    if (dragPointerId.value !== event.pointerId) {
      return;
    }
    event.preventDefault();
    dragPointerId.value = null;
    try {
      if (options.dragHandleRef.value?.hasPointerCapture(event.pointerId)) {
        options.dragHandleRef.value.releasePointerCapture(event.pointerId);
      }
    } catch {
      // ignore: releasePointerCapture can throw if capture already lost
    }
    document.removeEventListener("pointermove", onDragPointerMove, CAPTURE_OPTS);
    document.removeEventListener("pointerup", endDrag, CAPTURE_OPTS);
    document.removeEventListener("pointercancel", endDrag, CAPTURE_OPTS);
    options.onDragEnd?.();
  };

  const startDrag = (event: PointerEvent) => {
    if (dragPointerId.value !== null) {
      return;
    }
    if (options.isDragBlocked?.() === true) {
      return;
    }
    dragPointerId.value = event.pointerId;
    const position = options.getPositionPx();
    dragStart.value = {
      x: event.clientX,
      y: event.clientY,
      originX: position.x,
      originY: position.y,
    };
    const handle = options.dragHandleRef.value ?? (event.currentTarget as HTMLElement | null);
    handle?.setPointerCapture(event.pointerId);
    document.addEventListener("pointermove", onDragPointerMove, ACTIVE_OPTS);
    document.addEventListener("pointerup", endDrag, ACTIVE_OPTS);
    document.addEventListener("pointercancel", endDrag, ACTIVE_OPTS);
  };

  onBeforeUnmount(() => {
    document.removeEventListener("pointermove", onDragPointerMove, CAPTURE_OPTS);
    document.removeEventListener("pointerup", endDrag, CAPTURE_OPTS);
    document.removeEventListener("pointercancel", endDrag, CAPTURE_OPTS);
  });

  return { startDrag };
};
