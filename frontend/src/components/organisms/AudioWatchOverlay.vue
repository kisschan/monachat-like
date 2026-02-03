<template>
  <section class="audio-watch-overlay">
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import SimpleButton from "@/components/atoms/SimpleButton.vue";
import { useLivePlaybackController } from "@/composables/useLivePlaybackController";
import { useLiveVideoStore } from "@/stores/liveVideo";
import { useUserStore } from "@/stores/user";

const liveVideoStore = useLiveVideoStore();
const userStore = useUserStore();
const { state, start, stop } = useLivePlaybackController();
const audioRef = ref<HTMLAudioElement | null>(null);
const playbackPhase = ref<"idle" | "playing" | "blocked">("idle");
const autoPlayAttempted = ref(false);
const autoPlayArmed = ref(false);
const isDisposed = ref(false);

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
});
</script>

<style scoped>
.audio-watch-overlay {
  position: absolute;
  right: var(--live-window-padding, 12px);
  bottom: var(--live-window-padding, 12px);
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
