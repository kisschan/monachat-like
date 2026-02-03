<template>
  <VideoLiveOverlayAdapter
    v-if="props.uiKind === 'video'"
    :container="props.container"
    @close="emit('close')"
  />
  <LiveWindowOverlay
    v-else
    :container="props.container"
    is-audio-only
    @close="emit('close')"
  />
</template>

<script setup lang="ts">
import LiveWindowOverlay from "@/components/organisms/LiveWindowOverlay.vue";
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
