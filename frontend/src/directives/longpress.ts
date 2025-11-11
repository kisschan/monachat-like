// src/directives/longPress.ts
import type { Directive } from "vue";
type LongPressFn = (e: PointerEvent) => void;

const vLongpress: Directive<HTMLElement, LongPressFn> = {
  mounted(el, binding) {
    const delay = Number(binding.arg ?? 600);
    let t: number | null = null;
    let fired = false;

    const clear = () => {
      if (t !== null) {
        clearTimeout(t);
        t = null;
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      // ここで prevent しない。基準を壊さない
      const isPrimaryMouse = e.pointerType === "mouse" && e.button === 0;
      const isTouch = e.pointerType === "touch";
      if (!isPrimaryMouse && !isTouch) return;
      fired = false;
      clear();
      t = window.setTimeout(() => {
        fired = true;
        if (typeof binding.value === "function") binding.value(e);
        clear();
      }, delay);
    };

    const cancel = () => clear();

    // 長押し後に飛ぶ合成クリックだけ抑止
    const onClickCapture = (e: MouseEvent) => {
      if (fired) {
        e.preventDefault();
        e.stopImmediatePropagation();
        fired = false;
      }
    };

    el.addEventListener("pointerdown", onPointerDown, { passive: true });
    el.addEventListener("pointerup", cancel, { passive: true });
    el.addEventListener("pointercancel", cancel, { passive: true });
    el.addEventListener("pointerleave", cancel, { passive: true });
    el.addEventListener("dragstart", cancel);
    el.addEventListener("click", onClickCapture, true);
  },
};

export default vLongpress;
