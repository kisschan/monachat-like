<template>
  <div class="live-video-pane">
    <div class="live-video-pane__preview">
      <video
        v-if="!props.isAudioOnly"
        ref="videoRef"
        class="live-video-pane__video"
        data-testid="live-video"
        autoplay
        playsinline
        controls
      ></video>
      <slot name="overlay"></slot>
    </div>
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
  flex: 1;
  min-height: 0;
}

.live-video-pane__preview {
  position: relative;
  flex: 1;
  min-height: 0;
}

.live-video-pane__video {
  width: 100%;
  height: 100%;
  min-height: 0;
  object-fit: contain;
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
