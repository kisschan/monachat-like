/**
 * usePointerDragSession
 *
 * 汎用の Pointer Events ドラッグセッション管理。
 * - pointerdown で session 開始
 * - pointermove (pointerId 一致のみ) で onMove コールバック
 * - pointerup / pointercancel で session 終了 + onEnd コールバック
 * - setPointerCapture を JSDOM 互換でガード
 */
import { ref, onUnmounted, type Ref } from "vue";

export interface DragSessionCallbacks {
  /** pointermove ごとに呼ばれる (pointerId 一致時のみ) */
  onMove: (e: PointerEvent) => void;
  /** pointerup / pointercancel / 手動 cleanup で呼ばれる */
  onEnd: (reason: "pointerup" | "pointercancel" | "cleanup") => void;
}

export interface DragSession {
  /** 現在ドラッグ中かどうか */
  isDragging: Ref<boolean>;
  /** セッション開始（pointerdown ハンドラから呼ぶ） */
  start: (e: PointerEvent, callbacks: DragSessionCallbacks) => void;
  /** 手動でセッションを終了する（unmount 等） */
  cleanup: () => void;
}

const LISTENER_OPTS: AddEventListenerOptions = { capture: true };

export function usePointerDragSession(): DragSession {
  const isDragging = ref(false);

  let activePointerId: number | null = null;
  let capturedEl: HTMLElement | null = null;
  let callbacks: DragSessionCallbacks | null = null;

  // --- internal handlers ---
  function handleMove(e: PointerEvent) {
    if (e.pointerId !== activePointerId) return;
    callbacks?.onMove(e);
  }

  function handleUp(e: PointerEvent) {
    if (e.pointerId !== activePointerId) return;
    const reason = e.type === "pointercancel" ? "pointercancel" : "pointerup";
    endSession(reason);
  }

  function endSession(reason: "pointerup" | "pointercancel" | "cleanup") {
    const savedCallbacks = callbacks;

    // release pointer capture
    if (capturedEl && activePointerId !== null) {
      if (typeof capturedEl.releasePointerCapture === "function") {
        try {
          if (capturedEl.hasPointerCapture(activePointerId)) {
            capturedEl.releasePointerCapture(activePointerId);
          }
        } catch {
          /* already released or element removed */
        }
      }
    }

    // remove global listeners
    document.removeEventListener("pointermove", handleMove, LISTENER_OPTS);
    document.removeEventListener("pointerup", handleUp, LISTENER_OPTS);
    document.removeEventListener("pointercancel", handleUp, LISTENER_OPTS);

    // reset state
    activePointerId = null;
    capturedEl = null;
    callbacks = null;
    isDragging.value = false;

    // notify caller
    savedCallbacks?.onEnd(reason);
  }

  // --- public API ---
  function start(e: PointerEvent, cbs: DragSessionCallbacks) {
    // 既にドラッグ中なら無視
    if (activePointerId !== null) return;

    activePointerId = e.pointerId;
    callbacks = cbs;
    isDragging.value = true;

    // setPointerCapture (JSDOM 互換ガード)
    const el = e.currentTarget as HTMLElement | null;
    if (el && typeof el.setPointerCapture === "function") {
      el.setPointerCapture(e.pointerId);
      capturedEl = el;
    }

    // global listeners (capture phase で安定受信)
    document.addEventListener("pointermove", handleMove, LISTENER_OPTS);
    document.addEventListener("pointerup", handleUp, LISTENER_OPTS);
    document.addEventListener("pointercancel", handleUp, LISTENER_OPTS);
  }

  function cleanup() {
    if (activePointerId !== null) {
      endSession("cleanup");
    }
  }

  onUnmounted(cleanup);

  return { isDragging, start, cleanup };
}
