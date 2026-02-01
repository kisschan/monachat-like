<template>
  <VideoLiveOverlayAdapter
    v-if="props.uiKind === 'video'"
    :container="props.container"
    @close="emit('close')"
  />
  <AudioWatchOverlay v-else />
</template>

<script setup lang="ts">
import AudioWatchOverlay from "@/components/organisms/AudioWatchOverlay.vue";
import VideoLiveOverlayAdapter from "@/components/organisms/VideoLiveOverlayAdapter.vue";
import type { LivePlayerUiKind } from "@/stores/liveVideo";

const props = withDefaults(
  defineProps<{
    uiKind: LivePlayerUiKind;
    container?: HTMLElement | null;
  }>(),
  {
    container: null,
  },
);

const emit = defineEmits<{
  (e: "close"): void;
}>();
</script>
