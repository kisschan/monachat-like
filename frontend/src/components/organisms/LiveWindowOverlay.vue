<template>
  <section
    ref="liveWindowRef"
    class="live-window"
    :style="liveWindowStyle"
    @mousedown.stop
    @mousemove.stop
    @click.stop
    @dragstart.stop
    @dragover.stop
    @pointerdown.stop
    @touchstart.stop
    @touchmove.stop
  >
    <header class="live-window__header">
      <div class="live-window__header-left">
        <button
          ref="dragHandleRef"
          type="button"
          class="live-window__drag-handle"
          aria-label="ライブ窓を移動"
          @pointerdown.stop.prevent="startDrag"
          @mousedown.stop.prevent
        >
          <span class="live-window__drag-icon" aria-hidden="true"></span>
        </button>
        <div class="live-window__title">
          <span class="live-window__badge">LIVE</span>
          <span class="live-window__text">ライブ映像</span>
        </div>
      </div>

      <div class="live-window__size-controls" role="group" aria-label="ライブ窓サイズ">
        <SimpleButton
          class="live-window__size-btn"
          title="小"
          :text-size="12"
          @click="applyPreset('s')"
        />

        <SimpleButton
          class="live-window__size-btn"
          title="中"
          :text-size="12"
          @click="applyPreset('m')"
        />

        <SimpleButton
          class="live-window__size-btn"
          title="大"
          :text-size="12"
          @click="applyPreset('l')"
        />

        <SimpleButton
          class="live-window__size-btn"
          title="全"
          :text-size="12"
          @click="applyPreset('full')"
        />
      </div>
      <SimpleButton title="閉じる" class="live-window__close" :text-size="14" @click="close" />
    </header>
    <div class="live-window__body">
      <LiveVideoPane :is-audio-only="props.isAudioOnly" @video-ready="onVideoReady" />
    </div>
    <div
      ref="resizeHandleRef"
      class="live-window__resize-handle"
      @pointerdown.stop.prevent="startResize"
      @mousedown.stop.prevent
    ></div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import SimpleButton from "@/components/atoms/SimpleButton.vue";
import LiveVideoPane from "@/components/organisms/LiveVideoPane.vue";
import { useLiveWindowDrag } from "@/composables/useLiveWindowDrag";
import { useLiveVideoStore } from "@/stores/liveVideo";
import {
  clamp,
  clampPosition,
  computeBounds,
  pctToPx,
  resizeFromLeftAnchored,
} from "@/ui/liveWindowPosition";

const props = withDefaults(defineProps<{ isAudioOnly?: boolean; container?: HTMLElement | null }>(), {
  isAudioOnly: false,
  container: null,
});
const emit = defineEmits<{
  (e: "close"): void;
}>();
const CAPTURE_OPTS: EventListenerOptions = { capture: true };
const ACTIVE_OPTS: AddEventListenerOptions = { capture: true, passive: false };

const MIN_WIDTH = 320;
const MIN_HEIGHT = 180;
const VIEWPORT_PADDING_X = 32;
const VIEWPORT_PADDING_Y = 120;
const STORAGE_KEY = "live-window-size";
const POSITION_STORAGE_KEY = "live-window-position";
const DEFAULT_PADDING = 16;

const liveVideoStore = useLiveVideoStore();
const liveWindowRef = ref<HTMLElement | null>(null);
const dragHandleRef = ref<HTMLElement | null>(null);
const resizeHandleRef = ref<HTMLElement | null>(null);
const activePointerId = ref<number | null>(null);
const size = ref({ width: 520, height: 320 });
const maxSize = ref({ width: 520, height: 320 });
const resizeStart = ref({
  pointerX: 0,
  pointerY: 0,
  width: 0,
  height: 0,
  startRight: 0,
  containerLeft: 0,
  containerTop: 0,
  containerWidth: 0,
  containerHeight: 0,
});
const bounds = ref({ maxX: 0, maxY: 0 });
const positionPx = ref({ x: 0, y: 0 });
const positionPct = ref({ xPct: 0, yPct: 0 });
const resizeObserver = ref<ResizeObserver | null>(null);

const getContainerElement = () => {
  if (props.container) {
    return props.container;
  }
  return (liveWindowRef.value?.offsetParent as HTMLElement | null) ?? null;
};

const clampSize = (next: { width: number; height: number }) => {
  return {
    width: Math.min(maxSize.value.width, Math.max(MIN_WIDTH, next.width)),
    height: Math.min(maxSize.value.height, Math.max(MIN_HEIGHT, next.height)),
  };
};

const updateMaxSize = () => {
  const container = getContainerElement();
  if (container) {
    const rect = container.getBoundingClientRect();
    maxSize.value = {
      width: Math.max(MIN_WIDTH, rect.width - VIEWPORT_PADDING_X),
      height: Math.max(MIN_HEIGHT, rect.height - VIEWPORT_PADDING_Y),
    };
  } else if (typeof window !== "undefined") {
    maxSize.value = {
      width: Math.max(MIN_WIDTH, window.innerWidth - VIEWPORT_PADDING_X),
      height: Math.max(MIN_HEIGHT, window.innerHeight - VIEWPORT_PADDING_Y),
    };
  }
  size.value = clampSize(size.value);
};

const handleLayoutChange = () => {
  updateMaxSize();
  updateBounds();
  applyPositionFromPct();
};

const loadStoredSize = () => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (typeof parsed?.width === "number" && typeof parsed?.height === "number") {
      return { width: parsed.width, height: parsed.height };
    }
  } catch {
    return null;
  }
  return null;
};

const saveStoredSize = (next: { width: number; height: number }) => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
};

const loadStoredPosition = () => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(POSITION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (typeof parsed?.xPct === "number" && typeof parsed?.yPct === "number") {
      return { xPct: parsed.xPct, yPct: parsed.yPct };
    }
  } catch {
    return null;
  }
  return null;
};

const saveStoredPosition = (next: { xPct: number; yPct: number }) => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(next));
};

const updateBounds = () => {
  const container = getContainerElement();
  const pane = liveWindowRef.value;
  if (!container || !pane) {
    return;
  }
  const containerRect = container.getBoundingClientRect();
  const paneRect = pane.getBoundingClientRect();
  bounds.value = computeBounds(
    { width: containerRect.width, height: containerRect.height },
    { width: paneRect.width, height: paneRect.height },
  );
};

const applyPositionFromPct = () => {
  positionPx.value = {
    x: pctToPx(positionPct.value.xPct, bounds.value.maxX),
    y: pctToPx(positionPct.value.yPct, bounds.value.maxY),
  };
};

const setPositionPx = (next: { x: number; y: number }) => {
  const clamped = clampPosition(next, bounds.value);
  positionPx.value = clamped.positionPx;
  positionPct.value = clamped.positionPct;
};

const onResizePointerMove = (event: PointerEvent) => {
  if (activePointerId.value !== event.pointerId) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const {
    containerLeft,
    containerTop,
    containerWidth,
    containerHeight,
    pointerY: startPointerY,
    height: startHeight,
    startRight,
  } = resizeStart.value;
  if (containerWidth <= 0 || containerHeight <= 0) {
    return;
  }
  const pointerX = event.clientX - containerLeft;
  const pointerY = event.clientY - containerTop;
  const leftResize = resizeFromLeftAnchored({
    pointerX,
    startRight,
    containerWidth,
    minWidth: MIN_WIDTH,
    maxWidth: maxSize.value.width,
  });
  const availableHeight = Math.max(0, containerHeight - positionPx.value.y);
  const maxHeight = Math.min(maxSize.value.height, availableHeight);
  const minHeight = Math.min(MIN_HEIGHT, maxHeight);
  const heightDelta = pointerY - startPointerY;
  const nextHeight = clamp(startHeight + heightDelta, minHeight, maxHeight);
  const nextSize = {
    width: leftResize.width,
    height: nextHeight,
  };
  const nextBounds = computeBounds(
    { width: containerWidth, height: containerHeight },
    { width: nextSize.width, height: nextSize.height },
  );
  bounds.value = nextBounds;
  size.value = nextSize;
  setPositionPx({
    x: leftResize.x,
    y: clamp(positionPx.value.y, 0, nextBounds.maxY),
  });
};

const endResize = (event: PointerEvent) => {
  if (activePointerId.value !== event.pointerId) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  activePointerId.value = null;
  try {
    if (resizeHandleRef.value?.hasPointerCapture(event.pointerId)) {
      resizeHandleRef.value.releasePointerCapture(event.pointerId);
    }
  } catch {
    // ignore: releasePointerCapture can throw if capture already lost
  }
  document.removeEventListener("pointermove", onResizePointerMove, CAPTURE_OPTS);
  document.removeEventListener("pointerup", endResize, CAPTURE_OPTS);
  document.removeEventListener("pointercancel", endResize, CAPTURE_OPTS);
  unlockOverscroll();
  updateBounds();
  setPositionPx(positionPx.value);
  saveStoredSize(size.value);
  saveStoredPosition(positionPct.value);
};

const startResize = (event: PointerEvent) => {
  event.preventDefault();
  event.stopPropagation();
  if (activePointerId.value !== null) {
    return;
  }
  const container = getContainerElement();
  if (!container) {
    return;
  }
  const containerRect = container.getBoundingClientRect();
  lockOverscroll();
  activePointerId.value = event.pointerId;
  const pointerX = event.clientX - containerRect.left;
  const pointerY = event.clientY - containerRect.top;
  resizeStart.value = {
    pointerX,
    pointerY,
    width: size.value.width,
    height: size.value.height,
    startRight: clamp(positionPx.value.x + size.value.width, 0, containerRect.width),
    containerLeft: containerRect.left,
    containerTop: containerRect.top,
    containerWidth: containerRect.width,
    containerHeight: containerRect.height,
  };
  const handle = resizeHandleRef.value ?? (event.currentTarget as HTMLElement | null);
  handle?.setPointerCapture(event.pointerId);
  document.addEventListener("pointermove", onResizePointerMove, ACTIVE_OPTS);
  document.addEventListener("pointerup", endResize, ACTIVE_OPTS);
  document.addEventListener("pointercancel", endResize, ACTIVE_OPTS);
};

const { startDrag } = useLiveWindowDrag({
  dragHandleRef,
  getPositionPx: () => positionPx.value,
  setPositionPx,
  isDragBlocked: () => activePointerId.value !== null,
  onDragEnd: () => {
    saveStoredPosition(positionPct.value);
  },
});

const liveWindowStyle = computed(() => ({
  width: `${size.value.width}px`,
  height: `${size.value.height}px`,
  maxWidth: `${maxSize.value.width}px`,
  maxHeight: `${maxSize.value.height}px`,
  transform: `translate3d(${positionPx.value.x}px, ${positionPx.value.y}px, 0)`,
}));

const onVideoReady = (element: HTMLVideoElement | null) => {
  liveVideoStore.setVideoElement(element);
};

const close = () => {
  emit("close");
};

const prevBodyTouchAction = ref<string | null>(null);
const prevBodyOverscrollY = ref<string | null>(null);

const preventTouchMove = (e: TouchEvent) => {
  // リサイズ中だけブラウザ更新/スクロールを抑止
  e.preventDefault();
};

const lockOverscroll = () => {
  if (typeof document === "undefined") return;
  const body = document.body;

  prevBodyTouchAction.value = body.style.touchAction;
  // overscrollBehaviorY はブラウザにより効きが違うが、効くところでは効く
  prevBodyOverscrollY.value = (body.style as CSSStyleDeclaration).overscrollBehaviorY;

  body.style.touchAction = "none";
  (body.style as CSSStyleDeclaration).overscrollBehaviorY = "contain";

  // iOS/一部環境向けに touchmove を明示抑止（リサイズ中のみ）
  document.addEventListener("touchmove", preventTouchMove, { passive: false, capture: true });
};

const unlockOverscroll = () => {
  if (typeof document === "undefined") return;
  const body = document.body;

  body.style.touchAction = prevBodyTouchAction.value ?? "";
  (body.style as CSSStyleDeclaration).overscrollBehaviorY = prevBodyOverscrollY.value ?? "";

  document.removeEventListener("touchmove", preventTouchMove, {
    capture: true,
  } as EventListenerOptions);
};

//モバイル用ボタン

type Preset = "s" | "m" | "l" | "full";

const applyPreset = (preset: Preset) => {
  // maxSize は updateMaxSize() で更新されている前提
  // 画面比率を崩し過ぎないため、16:9を基準にする（audio-onlyでも問題なし）
  const maxW = maxSize.value.width;
  const maxH = maxSize.value.height;

  const pick = (() => {
    switch (preset) {
      case "s": {
        // 片手で押しやすく、邪魔になりにくいサイズ
        const w = Math.min(maxW, 360);
        const h = Math.round((w * 9) / 16);
        return { width: w, height: h };
      }
      case "m": {
        const w = Math.min(maxW, 440);
        const h = Math.round((w * 9) / 16);
        return { width: w, height: h };
      }
      case "l": {
        // 大：画面の多くを使う（ただし全画面ではない）
        const w = Math.min(maxW, Math.round(maxW * 0.92));
        const h = Math.min(maxH, Math.round((w * 9) / 16));
        return { width: w, height: h };
      }
      case "full":
      default:
        return { width: maxW, height: maxH };
    }
  })();

  size.value = clampSize(pick);
  saveStoredSize(size.value);
  nextTick(() => {
    updateBounds();
    applyPositionFromPct();
  });
};

onMounted(async () => {
  updateMaxSize();
  await nextTick();
  updateBounds();
  const stored = loadStoredSize();
  if (stored) {
    size.value = clampSize(stored);
  }
  if (!stored && liveWindowRef.value) {
    const rect = liveWindowRef.value.getBoundingClientRect();
    size.value = clampSize({ width: rect.width, height: rect.height });
  }
  await nextTick();
  updateBounds();
  const storedPosition = loadStoredPosition();
  if (storedPosition) {
    positionPct.value = storedPosition;
    applyPositionFromPct();
  } else {
    setPositionPx(
      computeDefaultPosition(bounds.value, DEFAULT_PADDING, {
        bottom: uiStore.bottomBarHeight,
      }),
    );
  }

  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(() => {
      handleLayoutChange();
    });
    const container = getContainerElement();
    if (container) {
      observer.observe(container);
    }
    if (liveWindowRef.value) {
      observer.observe(liveWindowRef.value);
    }
    resizeObserver.value = observer;
  }
  if (typeof window !== "undefined") {
    window.addEventListener("resize", handleLayoutChange);
  }
});

onBeforeUnmount(() => {
  resizeObserver.value?.disconnect();
  if (typeof window !== "undefined") {
    window.removeEventListener("resize", handleLayoutChange);
  }
  document.removeEventListener("pointermove", onResizePointerMove, CAPTURE_OPTS);
  document.removeEventListener("pointerup", endResize, CAPTURE_OPTS);
  document.removeEventListener("pointercancel", endResize, CAPTURE_OPTS);
  unlockOverscroll();
});

watch(
  () => props.container,
  async () => {
    await nextTick();
    handleLayoutChange();
    resizeObserver.value?.disconnect();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        handleLayoutChange();
      });
      const container = getContainerElement();
      if (container) {
        observer.observe(container);
      }
      if (liveWindowRef.value) {
        observer.observe(liveWindowRef.value);
      }
      resizeObserver.value = observer;
    }
  },
);
</script>

<style scoped>
.live-window {
  --live-window-width: min(520px, 90vw);
  --live-window-min-width: 320px;
  --live-window-min-height: 180px;
  --live-window-padding: 12px;
  --live-window-radius: 12px;
  --live-window-border: 1px solid rgba(0, 0, 0, 0.12);
  --live-window-shadow: 0 12px 28px rgba(0, 0, 0, 0.15);
  --live-window-bg: #fff;
  --live-window-surface-muted: #f4f4f4;
  --live-window-control-height: 28px;
  --live-window-control-radius: 8px;
  --live-window-control-border: 1px solid rgba(0, 0, 0, 0.2);
  --live-window-control-bg: #f8f8f8;
  --live-window-control-gap: 6px;

  position: absolute;
  top: 0;
  left: 0;
  width: var(--live-window-width);
  min-width: var(--live-window-min-width);
  min-height: var(--live-window-min-height);
  background: var(--live-window-bg);
  border: var(--live-window-border);
  border-radius: var(--live-window-radius);
  box-shadow: var(--live-window-shadow);
  z-index: 30;
  padding: var(--live-window-padding);
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  will-change: transform;
}

.live-window__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.live-window__header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.live-window__drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--live-window-control-height);
  height: var(--live-window-control-height);
  border-radius: var(--live-window-control-radius);
  border: var(--live-window-control-border);
  background: var(--live-window-control-bg);
  cursor: grab;
  touch-action: none;
}

.live-window__drag-handle:active {
  cursor: grabbing;
}

.live-window__drag-icon {
  width: 14px;
  height: 14px;
  border-top: 2px solid rgba(0, 0, 0, 0.45);
  border-bottom: 2px solid rgba(0, 0, 0, 0.45);
  box-shadow: 0 4px 0 rgba(0, 0, 0, 0.45);
}

.live-window__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
}

.live-window__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: #d64545;
  color: #fff;
  font-size: 11px;
  letter-spacing: 0.04em;
}

.live-window__close {
  width: 70px;
  height: var(--live-window-control-height);
  border-radius: var(--live-window-control-radius);
}

.live-window__body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-height: 0;
}

.live-window__resize-handle {
  position: absolute;
  left: 6px;
  bottom: 6px;

  width: 28px;
  height: 28px;
  cursor: nesw-resize;
  border-bottom: 2px solid rgba(0, 0, 0, 0.35);
  border-left: 2px solid rgba(0, 0, 0, 0.35);
  border-radius: 2px;
  touch-action: none;
}

/* サイズ切替ボタン（デフォルトは非表示） */
.live-window__size-controls {
  display: none;
  gap: var(--live-window-control-gap);
  align-items: center;
}
.live-window__size-btn {
  width: 32px;
  height: var(--live-window-control-height);
  border-radius: var(--live-window-control-radius);
}

/* タッチ端末はさらに押しやすく */
@media (pointer: coarse) {
  .live-window__size-controls {
    display: flex;
  }

  .live-window__resize-handle {
    width: 44px;
    height: 44px;
    left: 8px;
    bottom: 8px;
    border-bottom-width: 3px;
    border-left-width: 3px;
  }

  .live-window__drag-handle {
    width: 40px;
    height: 40px;
  }
}
</style>
