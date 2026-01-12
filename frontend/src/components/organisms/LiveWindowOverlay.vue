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
      <div class="live-window__title">
        <span class="live-window__badge">LIVE</span>
        <span class="live-window__text">ライブ映像</span>
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import SimpleButton from "@/components/atoms/SimpleButton.vue";
import LiveVideoPane from "@/components/organisms/LiveVideoPane.vue";
import { useLiveVideoStore } from "@/stores/liveVideo";

const props = withDefaults(defineProps<{ isAudioOnly?: boolean }>(), {
  isAudioOnly: false,
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

const liveVideoStore = useLiveVideoStore();
const liveWindowRef = ref<HTMLElement | null>(null);
const resizeHandleRef = ref<HTMLElement | null>(null);
const activePointerId = ref<number | null>(null);
const size = ref({ width: 520, height: 320 });
const maxSize = ref({ width: 520, height: 320 });
const resizeStart = ref({ x: 0, y: 0, width: 0, height: 0 });

const clampSize = (next: { width: number; height: number }) => {
  return {
    width: Math.min(maxSize.value.width, Math.max(MIN_WIDTH, next.width)),
    height: Math.min(maxSize.value.height, Math.max(MIN_HEIGHT, next.height)),
  };
};

const updateMaxSize = () => {
  if (typeof window === "undefined") {
    return;
  }
  maxSize.value = {
    width: Math.max(MIN_WIDTH, window.innerWidth - VIEWPORT_PADDING_X),
    height: Math.max(MIN_HEIGHT, window.innerHeight - VIEWPORT_PADDING_Y),
  };
  size.value = clampSize(size.value);
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

const onResizePointerMove = (event: PointerEvent) => {
  if (activePointerId.value !== event.pointerId) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const next = clampSize({
    width: resizeStart.value.width + (event.clientX - resizeStart.value.x),
    height: resizeStart.value.height + (event.clientY - resizeStart.value.y),
  });
  size.value = next;
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
  saveStoredSize(size.value);
};

const startResize = (event: PointerEvent) => {
  event.preventDefault();
  event.stopPropagation();
  if (activePointerId.value !== null) {
    return;
  }
  activePointerId.value = event.pointerId;
  resizeStart.value = {
    x: event.clientX,
    y: event.clientY,
    width: size.value.width,
    height: size.value.height,
  };
  const handle = resizeHandleRef.value ?? (event.currentTarget as HTMLElement | null);
  handle?.setPointerCapture(event.pointerId);
  document.addEventListener("pointermove", onResizePointerMove, ACTIVE_OPTS);
  document.addEventListener("pointerup", endResize, ACTIVE_OPTS);
  document.addEventListener("pointercancel", endResize, ACTIVE_OPTS);
};

const liveWindowStyle = computed(() => ({
  width: `${size.value.width}px`,
  height: `${size.value.height}px`,
  maxWidth: `${maxSize.value.width}px`,
  maxHeight: `${maxSize.value.height}px`,
}));

const onVideoReady = (element: HTMLVideoElement | null) => {
  liveVideoStore.setVideoElement(element);
};

const close = () => {
  emit("close");
};

onMounted(async () => {
  updateMaxSize();
  await nextTick();
  if (typeof window !== "undefined") {
    window.addEventListener("resize", updateMaxSize);
  }
  const stored = loadStoredSize();
  if (stored) {
    size.value = clampSize(stored);
    return;
  }
  if (liveWindowRef.value) {
    const rect = liveWindowRef.value.getBoundingClientRect();
    size.value = clampSize({ width: rect.width, height: rect.height });
  }
});

onBeforeUnmount(() => {
  if (typeof window !== "undefined") {
    window.removeEventListener("resize", updateMaxSize);
  }
  document.removeEventListener("pointermove", onResizePointerMove, CAPTURE_OPTS);
  document.removeEventListener("pointerup", endResize, CAPTURE_OPTS);
  document.removeEventListener("pointercancel", endResize, CAPTURE_OPTS);
});
</script>

<style scoped>
.live-window {
  position: absolute;
  top: 48px;
  right: 16px;
  width: min(520px, 90vw);
  min-width: 320px;
  min-height: 180px;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 12px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.15);
  z-index: 30;
  padding: 12px;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.live-window__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
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
  height: 28px;
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
  right: 6px;
  bottom: 6px;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  border-bottom: 2px solid rgba(0, 0, 0, 0.35);
  border-right: 2px solid rgba(0, 0, 0, 0.35);
  border-radius: 2px;
  touch-action: none;
}
</style>
