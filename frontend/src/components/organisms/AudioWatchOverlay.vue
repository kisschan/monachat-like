<template>
  <section
    ref="overlayRef"
    class="audio-watch-overlay"
    data-testid="audio-mini"
    :style="overlayStyle"
  >
    <div class="audio-watch-overlay__header">
      <button
        ref="dragHandleRef"
        type="button"
        class="audio-watch-overlay__drag-handle"
        data-testid="audio-mini-handle"
        aria-label="Move"
        title="Move"
        @pointerdown.stop.prevent="startDrag"
        @mousedown.stop.prevent
      >
        <span class="audio-watch-overlay__drag-icon" aria-hidden="true"></span>
      </button>
    </div>
    <div class="audio-watch-overlay__controls">
      <SimpleButton
        class="audio-watch-overlay__button"
        title="▶"
        title-attr="Play"
        aria-label="Play"
        data-testid="audio-play"
        :text-size="16"
        :disabled="isBusy || !canStart"
        @click="onClickPlay"
      />
      <SimpleButton
        class="audio-watch-overlay__button"
        title="■"
        title-attr="Stop"
        aria-label="Stop"
        data-testid="audio-stop"
        :text-size="16"
        :disabled="isBusy || !isPlaying"
        @click="onClickStop"
      />
      <SimpleButton
        v-if="isBlocked"
        class="audio-watch-overlay__button audio-watch-overlay__button--manual"
        title="手動再生"
        title-attr="Manual play"
        aria-label="Manual play"
        data-testid="audio-manual-play"
        :text-size="14"
        @click="onClickManualPlay"
      />
    </div>
    <p v-if="statusMessage" class="audio-watch-overlay__status">
      {{ statusMessage }}
    </p>
    <audio
      ref="audioRef"
      class="audio-watch-overlay__audio"
      :class="{ 'audio-watch-overlay__audio--blocked': isBlocked }"
      :controls="isBlocked"
      autoplay
      playsinline
    ></audio>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import SimpleButton from "@/components/atoms/SimpleButton.vue";
import { useLivePlaybackController } from "@/composables/useLivePlaybackController";
import { useLiveVideoStore } from "@/stores/liveVideo";
import { useUserStore } from "@/stores/user";
import { clamp, clampPosition, computeBounds, pctToPx } from "@/ui/liveWindowPosition";

const liveVideoStore = useLiveVideoStore();
const userStore = useUserStore();
const { state, start, stop } = useLivePlaybackController();
const audioRef = ref<HTMLAudioElement | null>(null);
const overlayRef = ref<HTMLElement | null>(null);
const dragHandleRef = ref<HTMLElement | null>(null);
const playbackPhase = ref<"idle" | "playing" | "blocked">("idle");
const autoPlayAttempted = ref(false);
const autoPlayArmed = ref(false);
const isDisposed = ref(false);
const bounds = ref({ maxX: 0, maxY: 0 });
const positionPx = ref({ x: 0, y: 0 });
const positionPct = ref({ xPct: 0, yPct: 0 });
const dragPointerId = ref<number | null>(null);
const dragStart = ref({ x: 0, y: 0, originX: 0, originY: 0 });
const resizeObserver = ref<ResizeObserver | null>(null);

const POSITION_STORAGE_KEY = "audio-mini-position";
const DEFAULT_PADDING = 12;
const CAPTURE_OPTS: EventListenerOptions = { capture: true };
const ACTIVE_OPTS: AddEventListenerOptions = { capture: true, passive: false };

const roomId = computed(() => userStore.currentRoom?.id ?? "");
const token = computed(() => userStore.myToken ?? "");
const isPlaying = computed(() => state.isPlaying);
const isBusy = computed(() => state.isBusy);
const canStart = computed(() => !!roomId.value && !!token.value && !!audioRef.value);
const isBlocked = computed(() => playbackPhase.value === "blocked");
const statusMessage = computed(() => {
  if (state.error) {
    return state.error;
  }
  if (isBlocked.value) {
    return "自動再生がブロックされました。手動で再生してください。";
  }
  return null;
});

const getContainerElement = () => {
  return (overlayRef.value?.offsetParent as HTMLElement | null) ?? null;
};

const updateBounds = () => {
  const container = getContainerElement();
  const pane = overlayRef.value;
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

const handleLayoutChange = () => {
  updateBounds();
  applyPositionFromPct();
};

const onDragPointerMove = (event: PointerEvent) => {
  if (dragPointerId.value !== event.pointerId) {
    return;
  }
  event.preventDefault();
  const next = {
    x: dragStart.value.originX + (event.clientX - dragStart.value.x),
    y: dragStart.value.originY + (event.clientY - dragStart.value.y),
  };
  setPositionPx(next);
};

const endDrag = (event: PointerEvent) => {
  if (dragPointerId.value !== event.pointerId) {
    return;
  }
  event.preventDefault();
  dragPointerId.value = null;
  try {
    if (typeof dragHandleRef.value?.hasPointerCapture === "function") {
      if (dragHandleRef.value.hasPointerCapture(event.pointerId)) {
        dragHandleRef.value.releasePointerCapture(event.pointerId);
      }
    }
  } catch {
    // ignore: releasePointerCapture can throw if capture already lost
  }
  document.removeEventListener("pointermove", onDragPointerMove, CAPTURE_OPTS);
  document.removeEventListener("pointerup", endDrag, CAPTURE_OPTS);
  document.removeEventListener("pointercancel", endDrag, CAPTURE_OPTS);
  saveStoredPosition(positionPct.value);
};

const startDrag = (event: PointerEvent) => {
  if (dragPointerId.value !== null) {
    return;
  }
  dragPointerId.value = event.pointerId;
  dragStart.value = {
    x: event.clientX,
    y: event.clientY,
    originX: positionPx.value.x,
    originY: positionPx.value.y,
  };
  const handle = dragHandleRef.value ?? (event.currentTarget as HTMLElement | null);
  if (typeof handle?.setPointerCapture === "function") {
    handle.setPointerCapture(event.pointerId);
  }
  document.addEventListener("pointermove", onDragPointerMove, ACTIVE_OPTS);
  document.addEventListener("pointerup", endDrag, ACTIVE_OPTS);
  document.addEventListener("pointercancel", endDrag, ACTIVE_OPTS);
};

const overlayStyle = computed(() => ({
  transform: `translate3d(${positionPx.value.x}px, ${positionPx.value.y}px, 0)`,
}));

const handlePlayable = () => {
  void attemptAutoPlay();
};

const resetAutoPlay = () => {
  autoPlayAttempted.value = false;
  autoPlayArmed.value = false;
  playbackPhase.value = "idle";
};

const attemptAutoPlay = async () => {
  if (isDisposed.value || autoPlayAttempted.value || !autoPlayArmed.value) return;
  const audio = audioRef.value;
  if (!audio) return;

  autoPlayAttempted.value = true;
  try {
    await audio.play();
    playbackPhase.value = "playing";
  } catch {
    playbackPhase.value = "blocked";
  }
};

const onClickManualPlay = () => {
  const audio = audioRef.value;
  if (!audio || isDisposed.value) return;

  const playPromise = audio.play();
  if (!playPromise) return;

  playPromise
    .then(() => {
      playbackPhase.value = "playing";
    })
    .catch(() => {
      playbackPhase.value = "blocked";
    });
};

const onClickPlay = async () => {
  if (!canStart.value || !audioRef.value) return;
  playbackPhase.value = "idle";
  autoPlayAttempted.value = false;
  autoPlayArmed.value = true;
  await start({
    roomId: roomId.value,
    token: token.value,
    mediaElement: audioRef.value,
    audioOnly: true,
  });
};

const onClickStop = async () => {
  resetAutoPlay();
  await stop();
};

onMounted(() => {
  liveVideoStore.setAudioElement(audioRef.value);

  const audio = audioRef.value;
  if (!audio) return;

  audio.addEventListener("loadedmetadata", handlePlayable);
  audio.addEventListener("canplay", handlePlayable);

  void nextTick().then(() => {
    updateBounds();
    const storedPosition = loadStoredPosition();
    if (storedPosition) {
      positionPct.value = storedPosition;
      applyPositionFromPct();
    } else {
      const defaultX = clamp(bounds.value.maxX - DEFAULT_PADDING, 0, bounds.value.maxX);
      const defaultY = clamp(bounds.value.maxY - DEFAULT_PADDING, 0, bounds.value.maxY);
      setPositionPx({ x: defaultX, y: defaultY });
    }
  });

  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(() => {
      handleLayoutChange();
    });
    const container = getContainerElement();
    if (container) {
      observer.observe(container);
    }
    if (overlayRef.value) {
      observer.observe(overlayRef.value);
    }
    resizeObserver.value = observer;
  }
  if (typeof window !== "undefined") {
    window.addEventListener("resize", handleLayoutChange);
  }
});

watch(
  () => state.isPlaying,
  (playing) => {
    if (!playing) {
      resetAutoPlay();
    }
  },
);

onBeforeUnmount(() => {
  isDisposed.value = true;
  resetAutoPlay();
  const audio = audioRef.value;
  if (audio) {
    audio.removeEventListener("loadedmetadata", handlePlayable);
    audio.removeEventListener("canplay", handlePlayable);
  }
  liveVideoStore.setAudioElement(null);
  void stop();
  resizeObserver.value?.disconnect();
  if (typeof window !== "undefined") {
    window.removeEventListener("resize", handleLayoutChange);
  }
  document.removeEventListener("pointermove", onDragPointerMove, CAPTURE_OPTS);
  document.removeEventListener("pointerup", endDrag, CAPTURE_OPTS);
  document.removeEventListener("pointercancel", endDrag, CAPTURE_OPTS);
});
</script>

<style scoped>
.audio-watch-overlay {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: var(--live-window-padding, 12px);
  border-radius: var(--live-window-radius, 12px);
  background: var(--live-window-surface-muted, #f4f4f4);
  border: var(--live-window-border, 1px solid rgba(0, 0, 0, 0.12));
  box-shadow: var(--live-window-shadow, 0 12px 28px rgba(0, 0, 0, 0.15));
  color: rgba(0, 0, 0, 0.75);
  min-width: 128px;
  z-index: 2;
  user-select: none;
  will-change: transform;
}

.audio-watch-overlay__header {
  display: flex;
  justify-content: flex-end;
}

.audio-watch-overlay__drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--live-window-control-height, 28px);
  height: var(--live-window-control-height, 28px);
  border-radius: var(--live-window-control-radius, 8px);
  border: var(--live-window-control-border, 1px solid rgba(0, 0, 0, 0.2));
  background: var(--live-window-control-bg, #f8f8f8);
  cursor: grab;
  touch-action: none;
}

.audio-watch-overlay__drag-handle:active {
  cursor: grabbing;
}

.audio-watch-overlay__drag-icon {
  width: 12px;
  height: 12px;
  border-top: 2px solid rgba(0, 0, 0, 0.45);
  border-bottom: 2px solid rgba(0, 0, 0, 0.45);
  box-shadow: 0 4px 0 rgba(0, 0, 0, 0.45);
}

.audio-watch-overlay__controls {
  display: grid;
  grid-template-columns: repeat(2, auto);
  justify-content: end;
  gap: var(--live-window-control-gap, 6px);
}

.audio-watch-overlay__button {
  width: 32px;
  height: var(--live-window-control-height, 28px);
  border-radius: var(--live-window-control-radius, 8px);
}

.audio-watch-overlay__button--manual {
  grid-column: 1 / -1;
  width: 100%;
}

.audio-watch-overlay__status {
  margin: 0;
  font-size: 0.78rem;
  color: rgba(0, 0, 0, 0.6);
}

.audio-watch-overlay__audio {
  width: 0;
  height: 0;
  overflow: hidden;
}

.audio-watch-overlay__audio--blocked {
  width: 100%;
  height: var(--live-window-control-height, 28px);
}
</style>
