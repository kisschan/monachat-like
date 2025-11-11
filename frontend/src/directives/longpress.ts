// src/directives/longPress.ts
import type { Directive } from "vue";

type LongPressFn = (e: PointerEvent) => void;

type Handlers = {
  onPointerDown: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  onPointerCancel: (e: PointerEvent) => void;
  onPointerLeave: (e: PointerEvent) => void;
  onDragStart: (e: DragEvent) => void;
  onClickCapture: (e: MouseEvent) => void;
};

const registry = new WeakMap<HTMLElement, Handlers>();

const vLongpress: Directive<HTMLElement, LongPressFn> = {
  mounted(el, binding) {
    const delayMs = Number(binding.arg ?? 600);
    let timer: number | null = null;
    let fired = false;

    const clear = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      // 左クリック or タッチのみ。ここでは prevent しない
      const isPrimaryMouse = e.pointerType === "mouse" && e.button === 0;
      const isTouch = e.pointerType === "touch";
      if (!isPrimaryMouse && !isTouch) return;

      fired = false;
      clear();
      timer = window.setTimeout(() => {
        fired = true;
        const fn = binding.value;
        if (typeof fn === "function") fn(e);
        clear();
      }, delayMs);
    };

    const onPointerUp = () => clear();
    const onPointerCancel = () => clear();
    const onPointerLeave = () => clear();
    const onDragStart = () => clear();

    // 合成クリックを長押し後のみ抑止（captureで先取り）
    const onClickCapture = (e: MouseEvent) => {
      if (fired) {
        e.preventDefault();
        e.stopImmediatePropagation();
        fired = false;
      }
    };

    el.addEventListener("pointerdown", onPointerDown, { passive: true });
    el.addEventListener("pointerup", onPointerUp, { passive: true });
    el.addEventListener("pointercancel", onPointerCancel, { passive: true });
    el.addEventListener("pointerleave", onPointerLeave, { passive: true });
    el.addEventListener("dragstart", onDragStart);
    el.addEventListener("click", onClickCapture, true);

    registry.set(el, {
      onPointerDown,
      onPointerUp,
      onPointerCancel,
      onPointerLeave,
      onDragStart,
      onClickCapture,
    });
  },

  beforeUnmount(el) {
    const h = registry.get(el);
    if (!h) return;
    el.removeEventListener("pointerdown", h.onPointerDown);
    el.removeEventListener("pointerup", h.onPointerUp);
    el.removeEventListener("pointercancel", h.onPointerCancel);
    el.removeEventListener("pointerleave", h.onPointerLeave);
    el.removeEventListener("dragstart", h.onDragStart);
    el.removeEventListener("click", h.onClickCapture, true);
    registry.delete(el);
  },
};

export default vLongpress;
