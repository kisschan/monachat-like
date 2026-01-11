<template>
  <section
    class="live-window"
    @mousedown.stop
    @mousemove.stop
    @click.stop
    @dragstart.stop
    @dragover.stop
    @pointerdown.stop
    @pointerup.stop
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
  </section>
</template>

<script setup lang="ts">
import SimpleButton from "@/components/atoms/SimpleButton.vue";
import LiveVideoPane from "@/components/organisms/LiveVideoPane.vue";
import { useLiveVideoStore } from "@/stores/liveVideo";

const props = withDefaults(
  defineProps<{ isAudioOnly?: boolean }>(),
  {
    isAudioOnly: false,
  },
);

const emit = defineEmits<{
  (e: "close"): void;
}>();

const liveVideoStore = useLiveVideoStore();

const onVideoReady = (element: HTMLVideoElement | null) => {
  liveVideoStore.setVideoElement(element);
};

const close = () => {
  emit("close");
};

</script>

<style scoped>
.live-window {
  position: absolute;
  top: 48px;
  right: 16px;
  width: min(520px, 90vw);
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 12px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.15);
  z-index: 30;
  padding: 12px;
  pointer-events: auto;
}

.live-window__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
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
}
</style>
