<template>
  <section>
    <div v-if="isLive">配信中: {{ publisherName ?? "名無し" }}</div>
    <div v-else>配信なし</div>

    <button @click="onClickStart">配信開始</button>
    <button @click="onClickStop">配信停止</button>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import { useUserStore } from "@/stores/user";
import { fetchLiveStatus, startLive, stopLive } from "@/api/liveAPI"; // さっきのやつ

const userStore = useUserStore();
const roomId = computed(() => userStore.currentRoom?.id ?? "");
const token = computed(() => userStore.myToken ?? "");

const isLive = ref(false);
const publisherName = ref<string | null>(null);

async function loadStatus() {
  if (!roomId.value || !token.value) return;
  const res = await fetchLiveStatus(roomId.value, token.value);
  isLive.value = res.isLive;
  publisherName.value = res.publisherName;
}

async function onClickStart() {
  if (!roomId.value || !token.value) return;
  await startLive(roomId.value, token.value);
  await loadStatus();
}

async function onClickStop() {
  if (!roomId.value || !token.value) return;
  await stopLive(roomId.value, token.value);
  await loadStatus();
}

onMounted(loadStatus);
</script>
