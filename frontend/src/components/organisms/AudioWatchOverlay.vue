<template>
  <section class="audio-watch-overlay">
    <div class="audio-watch-overlay__controls">
      <SimpleButton
        class="audio-watch-overlay__button"
        title="再生"
        :text-size="14"
        :disabled="isBusy || !canStart"
        @click="onClickPlay"
      />
      <SimpleButton
        class="audio-watch-overlay__button"
        title="停止"
        :text-size="14"
        :disabled="isBusy || !isPlaying"
        @click="onClickStop"
      />
    </div>
    <p v-if="state.error" class="audio-watch-overlay__status">
      {{ state.error }}
    </p>
    <audio ref="audioRef" class="audio-watch-overlay__audio" autoplay playsinline></audio>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import SimpleButton from "@/components/atoms/SimpleButton.vue";
import { useLivePlaybackController } from "@/composables/useLivePlaybackController";
import { useLiveVideoStore } from "@/stores/liveVideo";
import { useUserStore } from "@/stores/user";

const liveVideoStore = useLiveVideoStore();
const userStore = useUserStore();
const { state, start, stop } = useLivePlaybackController();
const audioRef = ref<HTMLAudioElement | null>(null);

const roomId = computed(() => userStore.currentRoom?.id ?? "");
const token = computed(() => userStore.myToken ?? "");
const isPlaying = computed(() => state.isPlaying);
const isBusy = computed(() => state.isBusy);
const canStart = computed(() => !!roomId.value && !!token.value && !!audioRef.value);

const onClickPlay = async () => {
  if (!canStart.value || !audioRef.value) return;
  await start({
    roomId: roomId.value,
    token: token.value,
    mediaElement: audioRef.value,
    audioOnly: true,
  });
};

const onClickStop = async () => {
  await stop();
};

onMounted(() => {
  liveVideoStore.setAudioElement(audioRef.value);
});

onBeforeUnmount(() => {
  liveVideoStore.setAudioElement(null);
  void stop();
});
</script>

<style scoped>
.audio-watch-overlay {
  position: fixed;
  right: 24px;
  bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  min-width: 140px;
  z-index: 20;
}

.audio-watch-overlay__controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.audio-watch-overlay__button {
  height: 32px;
}

.audio-watch-overlay__status {
  margin: 0;
  font-size: 0.8rem;
}

.audio-watch-overlay__audio {
  width: 0;
  height: 0;
  overflow: hidden;
}
</style>
