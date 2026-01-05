import axios from "axios";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { LiveRoomsChangedPayload } from "@/socketIOInstance";
import { useUserStore } from "./user";

export type LiveRoomListItem = {
  room: string;
  isLive: boolean;
  publisherName: string | null;
  audioOnly: boolean;
};

export type LiveRoomsStatus = "idle" | "loading" | "ready" | "error";

type SafeErr = { name?: string; message?: string; status?: number; code?: string };

const isProd = import.meta.env.PROD;
const API_HOST = ((import.meta.env.VITE_APP_API_HOST as string | undefined) ?? "").replace(
  /\/$/,
  "",
);
const apiUrl = (path: string) => (API_HOST ? `${API_HOST}${path}` : path);

const toSafeErr = (e: unknown): SafeErr => {
  if (axios.isAxiosError(e)) {
    return {
      name: e.name,
      message: e.message,
      status: e.response?.status,
      code: e.response?.data?.error,
    };
  }
  if (e instanceof Error) return { name: e.name, message: e.message };
  return { message: String(e) };
};

const logErrorSafe = (label: string, e: unknown) => {
  const safe = toSafeErr(e);
  if (isProd) {
    console.error(label, safe);
  } else {
    console.error(label, e);
  }
};

export const useLiveRoomsStore = defineStore("liveRooms", () => {
  const rooms = ref<LiveRoomListItem[]>([]);
  const status = ref<LiveRoomsStatus>("idle");
  const hasLoadedOnce = ref(false);
  const errorMessage = ref<string | null>(null);
  const seq = ref(0);
  const unauthorizedCount = ref(0);

  const visibleLiveRooms = computed(() => rooms.value.filter((room) => room.isLive));
  const liveCount = computed(() => visibleLiveRooms.value.length);

  const reset = (reason: string): void => {
    console.debug("liveRoomsStore.reset", reason);
    seq.value += 1;
    rooms.value = [];
    status.value = "idle";
    hasLoadedOnce.value = false;
    errorMessage.value = null;
    unauthorizedCount.value = 0;
  };

  const applyLiveRoomsChanged = (payload: LiveRoomsChangedPayload): void => {
    // isLive が boolean でない（invalidate payload など）なら pull で更新
    if (typeof payload.isLive !== "boolean") {
      void load("socket-invalidate").catch((e) =>
        logErrorSafe("failed to reload live rooms after invalidate", e),
      );
      return;
    }

    const idx = rooms.value.findIndex((room) => room.room === payload.room);

    if (payload.isLive) {
      if (
        typeof payload.publisherName === "undefined" ||
        typeof payload.audioOnly === "undefined"
      ) {
        void load("socket-invalidate-missing-fields").catch((e) =>
          logErrorSafe("failed to reload live rooms after missing fields", e),
        );
        return;
      }

      const next: LiveRoomListItem = {
        room: payload.room,
        isLive: true,
        // publisherName は string|null に narrowing 済み。念のため null coalesce
        publisherName: payload.publisherName ?? null,
        // audioOnly は boolean に narrowing 済み
        audioOnly: payload.audioOnly,
      };

      if (idx >= 0) rooms.value[idx] = next;
      else rooms.value.push(next);
    } else if (idx >= 0) {
      rooms.value.splice(idx, 1);
    }

    rooms.value.sort((a, b) => a.room.localeCompare(b.room));
  };

  const load = async (reason: string): Promise<boolean> => {
    console.debug("liveRoomsStore.load", reason);
    const userStore = useUserStore();
    const token = userStore.myToken ?? "";
    const roomId = userStore.currentRoom?.id ?? "";
    if (!token || !roomId) {
      status.value = "idle";
      return false;
    }

    const requestSeq = seq.value + 1;
    seq.value = requestSeq;
    status.value = "loading";
    errorMessage.value = null;

    try {
      const res = await axios.get<LiveRoomListItem[]>(apiUrl("/api/live/rooms"), {
        headers: { "X-Monachat-Token": token },
      });
      if (seq.value !== requestSeq) return false;
      unauthorizedCount.value = 0;
      const list = Array.isArray(res.data) ? res.data : [];
      rooms.value = list.slice().sort((a, b) => a.room.localeCompare(b.room));
      hasLoadedOnce.value = true;
      status.value = "ready";
      return true;
    } catch (e) {
      logErrorSafe("failed to load live rooms", e);
      if (seq.value !== requestSeq) return false;
      const safe = toSafeErr(e);
      if (safe.status === 401) {
        unauthorizedCount.value += 1;
        if (unauthorizedCount.value <= 3) {
          status.value = "idle";
          errorMessage.value = null;
          return false;
        }
        errorMessage.value =
          "配信一覧の取得に失敗しました（認証未確立）。再接続または再読み込みしてください。";
        status.value = "error";
        return false;
      }
      errorMessage.value = "配信一覧の取得に失敗しました。";
      status.value = "error";
      return false;
    } finally {
      if (seq.value === requestSeq && status.value === "loading") {
        status.value = hasLoadedOnce.value ? "ready" : "idle";
      }
    }
  };

  return {
    rooms,
    status,
    hasLoadedOnce,
    errorMessage,
    seq,
    unauthorizedCount,
    visibleLiveRooms,
    liveCount,
    load,
    reset,
    applyLiveRoomsChanged,
  };
});
