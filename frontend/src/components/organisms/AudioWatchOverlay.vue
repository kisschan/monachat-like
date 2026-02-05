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
      <div class="audio-watch-overlay__title">
        <span class="audio-watch-overlay__badge">LIVE</span>
        <span class="audio-watch-overlay__text">ライブ映像</span>
      </div>
      <div class="audio-watch-overlay__controls">
        <SimpleButton
          class="audio-watch-overlay__button"
          title="▶"
          title-attr="Play"
          aria-label="play"
          data-testid="live-audio-play"
          :text-size="16"
          :disabled="isBusy || !canStart"
          @click="onClickPlay"
        />
        <SimpleButton
          class="audio-watch-overlay__button"
          title="■"
          title-attr="Stop"
          aria-label="stop"
          data-testid="live-audio-stop"
          :text-size="16"
          :disabled="isBusy || !isPlaying"
          @click="onClickStop"
        />
        <SimpleButton
          class="audio-watch-overlay__button audio-watch-overlay__button--close"
          title="×"
          title-attr="閉じる"
          aria-label="close"
          data-testid="live-audio-close"
          :text-size="16"
          :disabled="isBusy"
          @click="onClickClose"
        />
      </div>
    </div>
    <p class="audio-watch-overlay__status">
      {{ statusMessage }}
    </p>
    <audio
      ref="audioRef"
      class="audio-watch-overlay__audio"
      autoplay
      playsinline
    ></audio>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import SimpleButton from "@/components/atoms/SimpleButton.vue";
import { useLiveWindowDrag } from "@/composables/useLiveWindowDrag";
import { useLivePlaybackController } from "@/composables/useLivePlaybackController";
import { useLiveVideoStore } from "@/stores/liveVideo";
import { useUIStore } from "@/stores/ui";
import { useUserStore } from "@/stores/user";
import {
  clampPosition,
  computeBounds,
  computeDefaultPosition,
  pctToPx,
} from "@/ui/liveWindowPosition";

const props = withDefaults(defineProps<{ container?: HTMLElement | null }>(), {
  container: null,
});
const emit = defineEmits<{
  (e: "close"): void;
}>();

const liveVideoStore = useLiveVideoStore();
const uiStore = useUIStore();
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
const resizeObserver = ref<ResizeObserver | null>(null);

const POSITION_STORAGE_KEY = "audio-mini-position";
const DEFAULT_PADDING = 16;

const roomId = computed(() => userStore.currentRoom?.id ?? "");
const token = computed(() => userStore.myToken ?? "");
const isPlaying = computed(() => state.isPlaying);
const isBusy = computed(() => state.isBusy);
const canStart = computed(
  () => roomId.value !== "" && token.value !== "" && audioRef.value !== null,
);
const isBlocked = computed(() => playbackPhase.value === "blocked");
const statusMessage = computed(() => {
  if (state.error) {
    return state.error;
  }
  if (isBlocked.value) {
    return "再生がブロックされました。▶をもう一度押してください";
  }
  return "現在の配信は音声のみです。視聴は音声のみとなります。";
});

const getContainerElement = () => {
  if (props.container) {
    return props.container;
  }
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

const setPositionPx = (next: { x: number; y: number }) => {
  const clamped = clampPosition(next, bounds.value);
  positionPx.value = clamped.positionPx;
  positionPct.value = clamped.positionPct;
};

const applyPositionFromPct = () => {
  setPositionPx({
    x: pctToPx(positionPct.value.xPct, bounds.value.maxX),
    y: pctToPx(positionPct.value.yPct, bounds.value.maxY),
  });
};
const { startDrag } = useLiveWindowDrag({
  dragHandleRef,
  getPositionPx: () => positionPx.value,
  setPositionPx,
  onDragEnd: () => {
    saveStoredPosition(positionPct.value);
  },
});

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

const attemptPlay = async () => {
  const audio = audioRef.value;
  if (!audio || isDisposed.value) return;
  try {
    await audio.play();
    playbackPhase.value = "playing";
    state.isPlaying = true;
  } catch {
    playbackPhase.value = "blocked";
    state.isPlaying = false;
  }
};

const attemptAutoPlay = async () => {
  if (isDisposed.value || autoPlayAttempted.value || !autoPlayArmed.value) return;
  const audio = audioRef.value;
  if (!audio) return;

  autoPlayAttempted.value = true;
  await attemptPlay();
};

const onClickPlay = async () => {
  const audio = audioRef.value;
  if (!canStart.value || !audio) return;
  state.isPlaying = true;
  if (audio.srcObject !== null) {
    await attemptPlay();
    return;
  }
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

const stopPlayback = async () => {
  state.isPlaying = false;
  resetAutoPlay();
  const audio = audioRef.value;
  if (audio !== null) {
    audio.pause();
    audio.srcObject = null;
  }
  await stop();
};

const onClickStop = async () => {
  await stopPlayback();
};

const onClickClose = async () => {
  await stopPlayback();
  emit("close");
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
      setPositionPx(
        computeDefaultPosition(bounds.value, DEFAULT_PADDING, {
          bottom: uiStore.bottomBarHeight,
        }),
      );
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
    if (!playing && playbackPhase.value !== "blocked") {
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
  void stopPlayback();
  resizeObserver.value?.disconnect();
  if (typeof window !== "undefined") {
    window.removeEventListener("resize", handleLayoutChange);
  }
});
</script>

<style scoped>
.audio-watch-overlay {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--live-window-padding, 12px);
  border-radius: var(--live-window-radius, 12px);
  background: var(--live-window-surface-muted, #f4f4f4);
  border: var(--live-window-border, 1px solid rgba(0, 0, 0, 0.12));
  box-shadow: var(--live-window-shadow, 0 12px 28px rgba(0, 0, 0, 0.15));
  color: rgba(0, 0, 0, 0.75);
  min-width: 240px;
  z-index: 2;
  user-select: none;
  will-change: transform;
}

.audio-watch-overlay__header {
  display: flex;
  align-items: center;
  gap: 8px;
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

.audio-watch-overlay__title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  flex: 1;
  min-width: 0;
}

.audio-watch-overlay__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: #d64545;
  color: #fff;
  font-size: 11px;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

.audio-watch-overlay__text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.audio-watch-overlay__controls {
  display: inline-flex;
  align-items: center;
  gap: var(--live-window-control-gap, 6px);
}

.audio-watch-overlay__button {
  width: 32px;
  height: var(--live-window-control-height, 28px);
  border-radius: var(--live-window-control-radius, 8px);
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
</style>
