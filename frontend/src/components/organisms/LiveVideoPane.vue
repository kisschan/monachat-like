<template>
  <div class="live-video-pane">
    <video ref="videoRef" class="live-video-pane__video" autoplay playsinline controls></video>
    <p v-if="props.isAudioOnly" class="live-video-pane__hint">
      現在の配信は音声のみです。視聴は音声のみとなります。
    </p>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

const props = withDefaults(
  defineProps<{ isAudioOnly?: boolean }>(),
  {
    isAudioOnly: false,
  },
);

const emit = defineEmits<{
  (e: "video-ready", element: HTMLVideoElement | null): void;
}>();

const videoRef = ref<HTMLVideoElement | null>(null);

onMounted(() => {
  emit("video-ready", videoRef.value);
});

onBeforeUnmount(() => {
  emit("video-ready", null);
});

</script>

<style scoped>
.live-video-pane {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.live-video-pane__video {
  width: 100%;
  aspect-ratio: 16 / 9;
  height: auto;
  border-radius: 12px;
  background: #111;
  display: block;
}

.live-video-pane__hint {
  font-size: 0.8rem;
  opacity: 0.8;
  margin: 0;
}
</style>
