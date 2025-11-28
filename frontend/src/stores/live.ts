import { defineStore } from "pinia";
import { useUserStore } from "@/stores/user";

export const useLogStore = defineStore("live", async () => {
  const userStore = useUserStore();
  const token = userStore?.myToken;
  const room = userStore.currentRoom;

  if (token == null || !room) {
    throw new Error("not in room or not authenticated");
  }

  const roomId = encodeURIComponent(room.id); // "/MONA8094" みたいなID前提なら必須

  const res = await fetch(`/api/live/${roomId}/status`, {
    headers: {
      "X-Monachat-Token": token,
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return await res.json(); // { isLive: boolean, publisherName: string|null } を想定
});
