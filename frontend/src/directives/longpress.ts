import type { Directive } from "vue";

type LongPressFn = (e: PointerEvent) => void;

type Handlers = {
  onPointerDown: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  onPointerCancel: (e: PointerEvent) => void;
  onPointerLeave: (e: PointerEvent) => void;
  onDragStart: (e: DragEvent) => void;
  onClickCapture: (e: MouseEvent) => void;
  onContextMenu: (e: MouseEvent) => void; // 追加
};
const registry = new WeakMap<HTMLElement, Handlers>();

const vLongpress: Directive<HTMLElement, LongPressFn> = {
  mounted(el, binding) {
    const delayMs = Number(binding.arg ?? 600);
    const blockCtx = Boolean(binding.modifiers.blockctx);
    let timer: number | null = null;
    let fired = false;

    const clear = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const onPointerDown = (e: PointerEvent) => {
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

    // 長押し成立後の合成クリックだけ抑止
    const onClickCapture = (e: MouseEvent) => {
      if (fired) {
        e.preventDefault();
        e.stopImmediatePropagation();
        fired = false;
      }
    };

    // 長押し成立後のみコンテキストメニューを抑止（要求時だけ）
    const onContextMenu = (e: MouseEvent) => {
      if (blockCtx && fired) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    el.addEventListener("pointerdown", onPointerDown, { passive: true });
    el.addEventListener("pointerup", onPointerUp, { passive: true });
    el.addEventListener("pointercancel", onPointerCancel, { passive: true });
    el.addEventListener("pointerleave", onPointerLeave, { passive: true });
    el.addEventListener("dragstart", onDragStart);
    el.addEventListener("click", onClickCapture, true);
    el.addEventListener("contextmenu", onContextMenu); // 追加

    registry.set(el, {
      onPointerDown,
      onPointerUp,
      onPointerCancel,
      onPointerLeave,
      onDragStart,
      onClickCapture,
      onContextMenu, // 追加
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
    el.removeEventListener("contextmenu", h.onContextMenu); // 追加
    registry.delete(el);
  },
};

export default vLongpress;
