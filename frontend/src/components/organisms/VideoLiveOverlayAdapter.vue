<template>
  <LiveWindowOverlay :container="props.container" @close="emit('close')" />
</template>

<script setup lang="ts">
import { onBeforeUnmount } from "vue";
import LiveWindowOverlay from "@/components/organisms/LiveWindowOverlay.vue";
import { useLivePlaybackController } from "@/composables/useLivePlaybackController";

const props = withDefaults(
  defineProps<{
    container?: HTMLElement | null;
  }>(),
  {
    container: null,
  },
);

const emit = defineEmits<{
  (e: "close"): void;
}>();

const { stop } = useLivePlaybackController();

onBeforeUnmount(() => {
  void stop();
});
</script>
