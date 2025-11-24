<template>
  <section>
    <div v-if="isLive">配信中: {{ publisherName ?? "名無し" }}</div>
    <div v-else>配信なし</div>

    <button @click="onClickStart">配信開始</button>
    <div v-if="errorMessage" class="live-error">{{ errorMessage }}</div>
    <button @click="onClickStop">配信停止</button>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref, computed, onBeforeUnmount, watch } from "vue";
import { useUserStore } from "@/stores/user";
import { fetchLiveStatus, startLive, stopLive } from "@/api/liveAPI";
import { socketIOInstance, type LiveStatusChangePayload } from "@/socketIOInstance";
import axios from "axios";

const userStore = useUserStore();
const roomId = computed(() => userStore.currentRoom?.id ?? "");
const token = computed(() => userStore.myToken ?? "");

watch(
  () => userStore.currentRoom?.id,
  (newRoom, oldRoom) => {
    if (!newRoom || newRoom === oldRoom) return;
    // いったんリセットしてから新しい部屋の状態を取りに行く
    isLive.value = false;
    publisherName.value = null;
    loadStatus();
  },
);

const isLive = ref(false);
const publisherName = ref<string | null>(null);

const loadStatus = async () => {
  if (!roomId.value || !token.value) return;
  const res = await fetchLiveStatus(roomId.value, token.value);
  isLive.value = res.isLive;
  publisherName.value = res.publisherName;
};

const errorMessage = ref<string | null>(null);

const onClickStart = async () => {
  if (!roomId.value || !token.value) return;
  errorMessage.value = null;
  try {
    await startLive(roomId.value, token.value);
    await loadStatus();
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      if (e?.response?.status === 409) {
        errorMessage.value = "他のユーザーが配信中です。";
        return;
      } else {
        errorMessage.value = "配信開始に失敗しました。";
      }
      return;
    }
    errorMessage.value = "予期しないエラーが発生しました。";
    console.error(e);
  }
};

const onClickStop = async () => {
  if (!roomId.value || !token.value) return;
  await stopLive(roomId.value, token.value);
  await loadStatus();
};

const handleLiveStatusChange = (payload: LiveStatusChangePayload) => {
  // 自分がいる部屋じゃなければ無視
  if (!userStore.currentRoom || userStore.currentRoom.id !== payload.room) return;

  isLive.value = payload.isLive;
  publisherName.value = payload.publisherName;
};

onMounted(() => {
  socketIOInstance.on("live_status_change", handleLiveStatusChange);
  loadStatus();
});

onBeforeUnmount(() => {
  socketIOInstance.off("live_status_change", handleLiveStatusChange);
});
</script>
